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
import { EmailDriverFactory } from '../drivers/driver.factory';
import { DriverCredentials } from '../drivers/interfaces/email-driver.interface';
import { ProviderTokenService } from '../services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { SyncAuthService } from '../services/sync-auth.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';
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
 * - Unified execution via IEmailDriver
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

  // Worker configuration
  // Performance fix: Increased lockDuration from 1min to 10min for operations on large folders
  private readonly WORKER_CONFIG = {
    concurrency: 5, // Process 5 folder operations simultaneously
    lockDuration: 600000, // 10 minute lock (increased from 1 min)
    stalledInterval: 120000, // Check for stalled jobs every 2 min (increased from 30s)
  };

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private driverFactory: EmailDriverFactory,
    private providerTokenService: ProviderTokenService,
    @Inject(forwardRef(() => RealtimeEventsService))
    private realtimeEvents: RealtimeEventsService,
    private syncAuth: SyncAuthService,
  ) { }

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

      // Create connected driver using factory
      const credentials = await this.getDriverCredentials(providerId, providerType);
      const driver = await this.driverFactory.createConnectedDriver(
        providerType === 'generic' ? 'imap' : providerType,
        credentials
      );

      try {
        switch (operation) {
          case 'create':
            result = await this.processCreateFolder(job.data, driver);
            break;
          case 'rename':
            result = await this.processRenameFolder(job.data, driver);
            break;
          case 'delete':
            result = await this.processDeleteFolder(job.data, driver);
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      } finally {
        // Always disconnect driver after use
        await driver.disconnect();
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
   * Get credentials for driver
   */
  private async getDriverCredentials(providerId: string, providerType: string): Promise<DriverCredentials> {
    // Basic credential object
    const _creds: DriverCredentials = {
      type: 'oauth2'
    };

    if (providerType === 'generic' || providerType === 'imap') {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });
      if (!provider) throw new Error(`Provider ${providerId} not found`);

      const imapCreds = this.providerTokenService.getImapCredentials(provider);
      return {
        type: 'basic',
        username: imapCreds.username,
        password: imapCreds.password,
        imapHost: imapCreds.host,
        imapPort: imapCreds.port,
        imapTls: imapCreds.useTls
      };
    }

    // For OAuth (Google/Microsoft), get token
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
    return {
      type: 'oauth2',
      accessToken
    };
  }

  /**
   * Process folder create operation
   */
  private async processCreateFolder(
    data: FolderJobData,
    driver: any // Using any here to access IEmailDriver methods easily, verified by interface
  ): Promise<FolderJobResult> {
    const { tenantId, providerId, email, folderName, parentPath } = data;

    if (!folderName) {
      throw new Error('Folder name is required for create operation');
    }

    this.logger.log(`Creating folder "${folderName}" for provider ${providerId}`);

    // Driver handles provider-specific logic
    const createdFolder = await driver.createFolder(folderName, parentPath);

    this.logger.log(`Driver created folder "${createdFolder.name}" with external ID ${createdFolder.id}`);

    // If driver returns a full CanonicalFolder, we can use it directly
    // But we need to save it to our DB.
    // NOTE: Driver creation usually includes fetching the new folder to confirm existence.

    // Save to database
    // We try to find if it already exists to avoid unique constraint errors
    const existing = await this.prisma.folder.findFirst({
      where: {
        providerId,
        path: createdFolder.path
      }
    });

    let dbFolder;
    if (existing) {
      dbFolder = await this.prisma.folder.update({
        where: { id: existing.id },
        data: {
          externalId: createdFolder.id,
          name: createdFolder.name,
          level: (createdFolder.path.match(/\//g) || []).length
        }
      });
    } else {
      dbFolder = await this.prisma.folder.create({
        data: {
          tenantId,
          providerId,
          externalId: createdFolder.id,
          path: createdFolder.path,
          name: createdFolder.name,
          delimiter: '/', // Driver ensures / delimiter
          isSelectable: createdFolder.attributes?.selectable ?? true,
          level: (createdFolder.path.match(/\//g) || []).length,
          specialUse: createdFolder.type !== 'Custom' ? createdFolder.type : null
        },
      });
    }

    this.logger.log(`Saved folder "${dbFolder.name}" with id ${dbFolder.id}`);

    return {
      success: true,
      providerId,
      email,
      operation: 'create',
      folderId: dbFolder.id,
      folderPath: createdFolder.path,
      folderName: createdFolder.name,
      duration: 0,
      shouldRefreshFolders: true,
    };
  }

  /**
   * Process folder rename operation
   */
  private async processRenameFolder(
    data: FolderJobData,
    driver: any
  ): Promise<FolderJobResult> {
    const { providerId, email, oldPath, newName } = data;

    if (!oldPath || !newName) {
      throw new Error('Old path and new name are required for rename operation');
    }

    // Get folder from database to find external ID
    const folder = await this.prisma.folder.findUnique({
      where: { providerId_path: { providerId, path: oldPath } },
    });

    if (!folder) {
      throw new Error(`Folder not found: ${oldPath}`);
    }

    this.logger.log(`Renaming folder "${folder.name}" to "${newName}" for provider ${providerId}`);

    // Driver rename takes (id, newName)
    // IMAP driver uses path as ID usually, others use opaque ID.
    // The driver interface expects `folderId`. 
    // For IMAP, `folder.path` is the ID. For others, `folder.externalId`.
    // The drivers should handle `externalId` or fallback to `path` if needed, 
    // but typically `externalId` is safe if populated.

    const idToUse = folder.externalId || folder.path;
    await driver.renameFolder(idToUse, newName);

    // Calculate new path (best effort, or trigger full sync)
    // Build new path
    const parts = oldPath.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

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
  private async processDeleteFolder(
    data: FolderJobData,
    driver: any
  ): Promise<FolderJobResult> {
    const { providerId, email, folderPath } = data;

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

    const idToUse = folder.externalId || folder.path;
    await driver.deleteFolder(idToUse);

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

    this.logger.log('Stopping folder operations worker (graceful drain)...');

    try {
      if (this.worker) {
        // Graceful shutdown: close with drain (waits for active jobs)
        // BullMQ worker.close() already waits for running jobs by default
        this.logger.log('Folder worker closing, waiting for in-flight jobs...');
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
