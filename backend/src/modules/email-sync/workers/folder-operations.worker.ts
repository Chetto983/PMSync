import {
  Injectable,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { FolderJobData, FolderJobResult } from '../interfaces/folder-job.interface';
import { EmailDriverFactory } from '../drivers/driver.factory';
import { DriverCredentials } from '../drivers/interfaces/email-driver.interface';
import { ProviderTokenService } from '../services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { SyncAuthService } from '../services/sync-auth.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { QUEUE_NAMES, scaleForReplicas } from '../../../common/config';
import { BaseWorker, BaseWorkerConfig } from '../../../common/workers/base.worker';
import { isSystemFolder } from '../drivers/interfaces/canonical.types';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

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
 *
 * PHASE 4 CONSOLIDATION: Now extends BaseWorker for shared lifecycle management.
 */
@Injectable()
export class FolderOperationsWorker extends BaseWorker<FolderJobData, FolderJobResult> {
  protected readonly logger = new Logger(FolderOperationsWorker.name);
  protected readonly workerName = 'folder-operations';
  protected readonly envToggle = 'EMAIL_SYNC_WORKERS_ENABLED';

  /** D-12: Module-level toggle — EMAIL_WORKERS_ENABLED=false disables all email workers. */
  protected getModuleToggle(): string | null {
    return 'EMAIL_WORKERS_ENABLED';
  }

  // Lock TTL for folder operations (10 minutes - same as lockDuration)
  private readonly FOLDER_LOCK_TTL = 600000;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly driverFactory: EmailDriverFactory,
    private readonly providerTokenService: ProviderTokenService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly syncAuth: SyncAuthService,
    private readonly redisLock: RedisLockService,
  ) {
    super(configService);
  }

  protected getWorkerConfig(): BaseWorkerConfig {
    return {
      queueName: QUEUE_NAMES.FOLDER_OPERATIONS,
      concurrency: scaleForReplicas(5), // 5 base, scaled for replicas
      lockDuration: 600000, // 10 minute lock for operations on large folders
      stalledInterval: 120000, // Check for stalled jobs every 2 min
    };
  }

  protected formatCompletedLog(job: Job<FolderJobData>, result: FolderJobResult): string {
    return `Folder ${result.operation} ${result.success ? 'succeeded' : 'failed'} for ${job.data.email}`;
  }

  /**
   * Process a folder operation job
   *
   * RACE CONDITION FIX: Uses distributed locking to prevent concurrent
   * operations on the same folder/provider combination.
   */
  protected async processJob(job: Job<FolderJobData>): Promise<FolderJobResult> {
    return withoutTenantScopingAsync(() => this.executeFolderOperation(job));
  }

  private async executeFolderOperation(job: Job<FolderJobData>): Promise<FolderJobResult> {
    const { tenantId, providerId, providerType, email, operation, authToken } = job.data;
    const startTime = Date.now();

    // Validate auth token if configured
    if (authToken) {
      this.syncAuth.validateJobToken(authToken);
    }

    // Generate lock key based on operation type
    // - For create: lock on parent path (or root)
    // - For rename/delete: lock on the specific folder path
    const lockTarget = this.getLockTarget(job.data);
    const lockKey = this.generateLockKey('folder', `${providerId}:${lockTarget}`);

    this.logger.log(
      `Processing folder ${operation} job for ${email} (${providerType}) [jobId=${job.id}]`,
    );

    try {
      // Acquire distributed lock to prevent concurrent folder operations
      return await this.redisLock.withLock(
        lockKey,
        this.FOLDER_LOCK_TTL,
        async () => {
          let result: FolderJobResult;

          // Create connected driver using factory
          // P0-5 FIX: Pass tenantId for tenant isolation
          const credentials = await this.getDriverCredentials(providerId, providerType, tenantId);
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
        },
        { maxRetries: 10, baseDelayMs: 100, maxDelayMs: 2000 }
      );
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
  private async getDriverCredentials(providerId: string, providerType: string, tenantId?: string): Promise<DriverCredentials> {
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
    // P0-5 FIX: Pass tenantId to enforce tenant isolation
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId, tenantId);
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
        where: { id_tenantId: { id: existing.id, tenantId: existing.tenantId } },
        data: {
          externalId: createdFolder.id,
          name: createdFolder.name,
          level: (createdFolder.path.match(/\//g) || []).length
        }
      });
    } else {
      // Determine specialUse and isSystem - only set if it's actually a system folder
      const folderType = createdFolder.type && createdFolder.type !== 'Custom' ? createdFolder.type : null;
      const specialUse = folderType && isSystemFolder(folderType) ? folderType : null;
      const isSystem = !!specialUse;

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
          specialUse,
          isSystem,
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
      where: { id_tenantId: { id: folder.id, tenantId: folder.tenantId } },
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
    await this.prisma.folder.delete({ where: { id_tenantId: { id: folder.id, tenantId: folder.tenantId } } });

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

  /**
   * Get lock target based on folder operation type
   * - create: lock on parent path to prevent concurrent creates in same parent
   * - rename/delete: lock on the specific folder path
   */
  private getLockTarget(data: FolderJobData): string {
    switch (data.operation) {
      case 'create':
        // Lock on parent path (or 'root' for top-level folders)
        return data.parentPath || 'root';
      case 'rename':
        // Lock on old path to prevent concurrent renames
        return data.oldPath || data.folderPath || 'unknown';
      case 'delete':
        // Lock on folder path to prevent concurrent deletes
        return data.folderPath || 'unknown';
      default:
        return 'unknown';
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

}
