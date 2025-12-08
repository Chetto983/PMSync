import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { FolderJobData, FolderJobResult } from '../interfaces/folder-job.interface';
import { ImapService } from '../../providers/services/imap.service';
import { ProviderTokenService } from '../services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { SyncAuthService } from '../services/sync-auth.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';
import { google } from 'googleapis';
import axios from 'axios';
import { ConflictException } from '@nestjs/common';

/**
 * FolderOperationsWorker
 *
 * Processes folder operation jobs from the BullMQ queue.
 * Handles create, rename, and delete operations for all provider types:
 * - IMAP (generic)
 * - Gmail
 * - Microsoft 365
 *
 * Key features:
 * - Automatic retry with exponential backoff
 * - Realtime event emission on success
 * - Database sync after provider operations
 * - Detailed logging for debugging
 */
@Injectable()
export class FolderOperationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FolderOperationsWorker.name);
  private redisConnection: Redis;
  private worker: Worker<FolderJobData, FolderJobResult>;

  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  // Worker configuration
  private readonly WORKER_CONFIG = {
    concurrency: 5, // Process 5 folder operations simultaneously
    lockDuration: 60000, // 1 minute lock
    stalledInterval: 30000, // Check for stalled jobs every 30s
  };

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private imapService: ImapService,
    private providerTokenService: ProviderTokenService,
    @Inject(forwardRef(() => RealtimeEventsService))
    private realtimeEvents: RealtimeEventsService,
    private syncAuth: SyncAuthService,
  ) {}

  async onModuleInit() {
    const workersEnabled =
      (this.configService.get<string>('EMAIL_SYNC_WORKERS_ENABLED') || 'true').toLowerCase() !==
      'false';

    if (!workersEnabled) {
      this.logger.warn('Folder operations worker is disabled via EMAIL_SYNC_WORKERS_ENABLED=false');
      return;
    }

    // Initialize Redis connection
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    // Start the worker using centralized queue name
    this.worker = new Worker<FolderJobData, FolderJobResult>(
      QUEUE_NAMES.FOLDER_OPERATIONS,
      async (job: Job<FolderJobData>) => {
        return this.processJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency: this.WORKER_CONFIG.concurrency,
        lockDuration: this.WORKER_CONFIG.lockDuration,
        stalledInterval: this.WORKER_CONFIG.stalledInterval,
      },
    );

    // Setup event handlers
    this.worker.on('completed', (job, result) => {
      this.logger.log(
        `Folder job ${job.id} completed: ${result.operation} ${result.success ? 'succeeded' : 'failed'}`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Folder job ${job?.id} failed for ${job?.data?.email}: ${error.message}`,
      );
    });

    this.worker.on('error', (error) => {
      this.logger.error(`Folder worker error: ${error.message}`);
    });

    this.logger.log(
      `Folder operations worker started with concurrency ${this.WORKER_CONFIG.concurrency}`,
    );
  }

  /**
   * Process a folder operation job
   */
  private async processJob(job: Job<FolderJobData>): Promise<FolderJobResult> {
    const { tenantId, providerId, providerType, email, operation, authToken } = job.data;
    const startTime = Date.now();

    // Validate auth token if configured
    if (authToken) {
      this.syncAuth.validateJobToken(authToken);
    }

    this.logger.log(
      `Processing folder ${operation} job for ${email} (${providerType}) [jobId=${job.id}]`,
    );

    try {
      let result: FolderJobResult;

      switch (operation) {
        case 'create':
          result = await this.processCreateFolder(job.data);
          break;
        case 'rename':
          result = await this.processRenameFolder(job.data);
          break;
        case 'delete':
          result = await this.processDeleteFolder(job.data);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      result.duration = Date.now() - startTime;

      // Emit realtime event on success
      if (result.success && result.shouldRefreshFolders) {
        this.emitFolderEvent(tenantId, providerId, operation, result);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Folder ${operation} failed for ${email}: ${errorMessage}`);

      return {
        success: false,
        providerId,
        email,
        operation,
        error: errorMessage,
        errorCode: this.getErrorCode(error),
        duration: Date.now() - startTime,
        shouldRefreshFolders: false,
      };
    }
  }

  /**
   * Process folder create operation
   */
  private async processCreateFolder(data: FolderJobData): Promise<FolderJobResult> {
    const { tenantId, providerId, providerType, email, folderName, parentPath } = data;

    if (!folderName) {
      throw new Error('Folder name is required for create operation');
    }

    this.logger.log(`Creating folder "${folderName}" for provider ${providerId}`);

    let externalResult: { externalId: string; path: string };

    // Execute provider-specific create operation
    switch (providerType) {
      case 'generic':
        externalResult = await this.createImapFolder(providerId, folderName, parentPath);
        break;
      case 'google':
        externalResult = await this.createGmailLabel(providerId, folderName);
        break;
      case 'microsoft':
        externalResult = await this.createMicrosoftFolder(providerId, folderName, parentPath);
        break;
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }

    // Save to database
    const folder = await this.prisma.folder.create({
      data: {
        tenantId,
        providerId,
        externalId: externalResult.externalId,
        path: externalResult.path,
        name: folderName,
        delimiter: '/',
        isSelectable: true,
        level: parentPath ? 1 : 0,
      },
    });

    this.logger.log(`Created folder "${folderName}" with id ${folder.id}`);

    return {
      success: true,
      providerId,
      email,
      operation: 'create',
      folderId: folder.id,
      folderPath: externalResult.path,
      folderName,
      duration: 0,
      shouldRefreshFolders: true,
    };
  }

  /**
   * Process folder rename operation
   */
  private async processRenameFolder(data: FolderJobData): Promise<FolderJobResult> {
    const { providerId, providerType, email, oldPath, newName } = data;

    if (!oldPath || !newName) {
      throw new Error('Old path and new name are required for rename operation');
    }

    // Get folder from database
    const folder = await this.prisma.folder.findUnique({
      where: { providerId_path: { providerId, path: oldPath } },
    });

    if (!folder) {
      throw new Error(`Folder not found: ${oldPath}`);
    }

    this.logger.log(`Renaming folder "${folder.name}" to "${newName}" for provider ${providerId}`);

    let newPath: string;

    // Execute provider-specific rename operation
    switch (providerType) {
      case 'generic':
        newPath = await this.renameImapFolder(providerId, oldPath, newName);
        break;
      case 'google':
        await this.renameGmailLabel(providerId, folder.externalId || oldPath, newName);
        newPath = folder.path; // Gmail label IDs don't change on rename
        break;
      case 'microsoft':
        await this.renameMicrosoftFolder(providerId, folder.externalId || oldPath, newName);
        newPath = folder.path; // Microsoft folder IDs don't change on rename
        break;
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }

    // Update database
    const updatedFolder = await this.prisma.folder.update({
      where: { id: folder.id },
      data: {
        name: newName,
        path: newPath,
      },
    });

    this.logger.log(`Renamed folder to "${newName}" with path ${newPath}`);

    return {
      success: true,
      providerId,
      email,
      operation: 'rename',
      folderId: updatedFolder.id,
      folderPath: newPath,
      folderName: newName,
      duration: 0,
      shouldRefreshFolders: true,
    };
  }

  /**
   * Process folder delete operation
   */
  private async processDeleteFolder(data: FolderJobData): Promise<FolderJobResult> {
    const { providerId, providerType, email, folderPath } = data;

    if (!folderPath) {
      throw new Error('Folder path is required for delete operation');
    }

    // Get folder from database
    const folder = await this.prisma.folder.findUnique({
      where: { providerId_path: { providerId, path: folderPath } },
    });

    if (!folder) {
      throw new Error(`Folder not found: ${folderPath}`);
    }

    // Prevent deletion of system folders
    const systemFolders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK', 'ARCHIVE'];
    if (folder.specialUse && systemFolders.includes(folder.specialUse)) {
      throw new Error(`Cannot delete system folder: ${folder.specialUse}`);
    }

    this.logger.log(`Deleting folder "${folder.name}" for provider ${providerId}`);

    // Execute provider-specific delete operation
    switch (providerType) {
      case 'generic':
        await this.deleteImapFolder(providerId, folderPath);
        break;
      case 'google':
        await this.deleteGmailLabel(providerId, folder.externalId || folderPath);
        break;
      case 'microsoft':
        await this.deleteMicrosoftFolder(providerId, folder.externalId || folderPath);
        break;
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }

    // Delete from database
    await this.prisma.folder.delete({ where: { id: folder.id } });

    this.logger.log(`Deleted folder "${folder.name}"`);

    return {
      success: true,
      providerId,
      email,
      operation: 'delete',
      folderId: folder.id,
      folderPath,
      folderName: folder.name,
      duration: 0,
      shouldRefreshFolders: true,
    };
  }

  // ========== IMAP OPERATIONS ==========

  private async createImapFolder(
    providerId: string,
    name: string,
    parentPath?: string,
  ): Promise<{ externalId: string; path: string }> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const imapCreds = this.providerTokenService.getImapCredentials(provider);
    const client = this.imapService.createClient({
      host: imapCreds.host,
      port: imapCreds.port,
      username: imapCreds.username,
      password: imapCreds.password,
      useTls: imapCreds.useTls,
    });

    const fullPath = parentPath ? `${parentPath}/${name}` : name;

    try {
      await client.connect();
      this.logger.log(`IMAP connected for create operation`);
      this.logger.log(`IMAP mailboxCreate: "${fullPath}"`);
      const result = await client.mailboxCreate(fullPath);
      this.logger.log(`IMAP mailboxCreate result: ${JSON.stringify(result)}`);
      return { externalId: result.path, path: result.path };
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      this.logger.error(`IMAP create failed for "${fullPath}": ${error?.message || error}`);
      if (message.includes('exists') || message.includes('already')) {
        throw new ConflictException('A folder with this name already exists on the mail server');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  private async renameImapFolder(
    providerId: string,
    oldPath: string,
    newName: string,
  ): Promise<string> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const imapCreds = this.providerTokenService.getImapCredentials(provider);
    const client = this.imapService.createClient({
      host: imapCreds.host,
      port: imapCreds.port,
      username: imapCreds.username,
      password: imapCreds.password,
      useTls: imapCreds.useTls,
    });

    try {
      await client.connect();
      this.logger.log(`IMAP connected for rename operation`);

      // Build new path
      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');

      this.logger.log(`IMAP mailboxRename: "${oldPath}" -> "${newPath}"`);
      const result = await client.mailboxRename(oldPath, newPath);
      this.logger.log(`IMAP mailboxRename result: ${JSON.stringify(result)}`);
      return result.newPath || newPath;
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      this.logger.error(`IMAP rename failed for "${oldPath}": ${error?.message || error}`);

      if (message.includes('not exist') || message.includes('no such')) {
        // Folder doesn't exist on server, create it with new name
        this.logger.log(`Folder "${oldPath}" not found, creating "${newName}"`);
        const parts = oldPath.split('/');
        parts[parts.length - 1] = newName;
        const newPath = parts.join('/');
        await client.mailboxCreate(newPath);
        return newPath;
      }

      if (message.includes('already exist')) {
        throw new ConflictException('A folder with this name already exists');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  private async deleteImapFolder(providerId: string, path: string): Promise<void> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const imapCreds = this.providerTokenService.getImapCredentials(provider);
    const client = this.imapService.createClient({
      host: imapCreds.host,
      port: imapCreds.port,
      username: imapCreds.username,
      password: imapCreds.password,
      useTls: imapCreds.useTls,
    });

    try {
      await client.connect();
      this.logger.log(`IMAP connected for delete operation`);
      this.logger.log(`IMAP mailboxDelete: "${path}"`);
      await client.mailboxDelete(path);
      this.logger.log(`IMAP mailboxDelete completed successfully for "${path}"`);
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      this.logger.warn(`IMAP delete error for "${path}": ${error?.message || error}`);

      // If folder doesn't exist, allow DB deletion to proceed
      if (message.includes('not exist') || message.includes('no such')) {
        this.logger.log(`Folder "${path}" not found on server, proceeding with DB deletion`);
        return;
      }

      if (message.includes('not empty') || message.includes('has children')) {
        throw new Error('Folder is not empty. Please delete or move all emails first.');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  // ========== GMAIL OPERATIONS ==========

  private async createGmailLabel(
    providerId: string,
    name: string,
  ): Promise<{ externalId: string; path: string }> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      const response = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });

      const labelId = response.data.id!;
      this.logger.log(`Gmail label created: ${labelId}`);
      return { externalId: labelId, path: labelId };
    } catch (error: any) {
      if (error?.code === 409 || error?.response?.status === 409) {
        throw new ConflictException('A label with this name already exists on Gmail');
      }
      throw error;
    }
  }

  private async renameGmailLabel(
    providerId: string,
    labelId: string,
    newName: string,
  ): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    await gmail.users.labels.update({
      userId: 'me',
      id: labelId,
      requestBody: { name: newName },
    });

    this.logger.log(`Gmail label renamed to: ${newName}`);
  }

  private async deleteGmailLabel(providerId: string, labelId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    await gmail.users.labels.delete({
      userId: 'me',
      id: labelId,
    });

    this.logger.log(`Gmail label deleted: ${labelId}`);
  }

  // ========== MICROSOFT OPERATIONS ==========

  private async createMicrosoftFolder(
    providerId: string,
    name: string,
    parentFolderId?: string,
  ): Promise<{ externalId: string; path: string }> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const url = parentFolderId
      ? `${this.GRAPH_API_BASE}/me/mailFolders/${parentFolderId}/childFolders`
      : `${this.GRAPH_API_BASE}/me/mailFolders`;

    try {
      const response = await axios.post(
        url,
        { displayName: name },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );

      const folderId = response.data.id;
      this.logger.log(`Microsoft folder created: ${folderId}`);
      return { externalId: folderId, path: folderId };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        throw new ConflictException('A folder with this name already exists on Microsoft 365');
      }
      throw error;
    }
  }

  private async renameMicrosoftFolder(
    providerId: string,
    folderId: string,
    newName: string,
  ): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    await axios.patch(
      `${this.GRAPH_API_BASE}/me/mailFolders/${folderId}`,
      { displayName: newName },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
    );

    this.logger.log(`Microsoft folder renamed to: ${newName}`);
  }

  private async deleteMicrosoftFolder(providerId: string, folderId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    await axios.delete(`${this.GRAPH_API_BASE}/me/mailFolders/${folderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    this.logger.log(`Microsoft folder deleted: ${folderId}`);
  }

  // ========== HELPERS ==========

  private emitFolderEvent(
    tenantId: string,
    providerId: string,
    operation: string,
    result: FolderJobResult,
  ): void {
    const eventData = {
      providerId,
      folderId: result.folderId || '',
      folderName: result.folderName || '',
      folderPath: result.folderPath || '',
      timestamp: new Date().toISOString(),
    };

    switch (operation) {
      case 'create':
        this.realtimeEvents.emitFolderCreated(tenantId, eventData);
        break;
      case 'rename':
        this.realtimeEvents.emitFolderRenamed(tenantId, eventData);
        break;
      case 'delete':
        this.realtimeEvents.emitFolderDeleted(tenantId, eventData);
        break;
    }
  }

  private getErrorCode(error: unknown): string | undefined {
    if (error instanceof ConflictException) {
      return 'CONFLICT';
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('permission') || message.includes('denied')) {
        return 'PERMISSION_DENIED';
      }
      if (message.includes('not found') || message.includes('no such')) {
        return 'NOT_FOUND';
      }
      if (message.includes('not empty')) {
        return 'NOT_EMPTY';
      }
    }
    return undefined;
  }

  async onModuleDestroy() {
    const workersEnabled =
      (this.configService.get<string>('EMAIL_SYNC_WORKERS_ENABLED') || 'true').toLowerCase() !==
      'false';

    if (!workersEnabled) {
      return;
    }

    this.logger.log('Stopping folder operations worker...');

    try {
      if (this.worker) {
        await this.worker.close();
      }

      if (
        this.redisConnection &&
        this.redisConnection.status !== 'end' &&
        this.redisConnection.status !== 'close'
      ) {
        await this.redisConnection.quit();
      }
    } catch (error) {
      this.logger.warn(
        `Folder worker shutdown error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.logger.log('Folder operations worker stopped');
    }
  }
}
