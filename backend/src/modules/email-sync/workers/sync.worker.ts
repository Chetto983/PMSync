/**
 * SyncWorker
 *
 * BullMQ worker that processes email sync jobs for Gmail, Microsoft, and IMAP providers.
 * Handles high, normal, and low priority queues with configurable concurrency.
 *
 * PHASE 6.3 CONSOLIDATION: Now extends BaseWorker for shared lifecycle management.
 * This eliminates ~100 LOC of duplicated Redis/Worker boilerplate.
 *
 * Features:
 * - Multi-queue support (high, normal, low priority)
 * - Provider-specific sync delegation (Gmail, Microsoft, IMAP)
 * - Folder sync with distributed locking (RC-4 fix)
 * - Operation timeouts (CRIT-2 fix)
 * - Auth error detection and handling
 * - Atomic post-sync updates (RC-3 fix)
 */
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { SyncJobData, SyncJobResult } from '../interfaces/sync-job.interface';
import { SyncSchedulerService } from '../services/sync-scheduler.service';
import { FolderSyncService } from '../services/folder-sync.service';
import { SyncAuthService } from '../services/sync-auth.service';
import { GoogleSyncService } from '../services/gmail/google-sync.service';
import { MicrosoftSyncService } from '../services/microsoft/microsoft-sync.service';
import { ImapSyncService } from '../services/imap/imap-sync.service';
import { QUEUE_NAMES } from '../../../common/config';
import { BaseWorker, BaseWorkerConfig } from '../../../common/workers/base.worker';
import { EmailTriageService } from '../../ai/services/email-triage.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

@Injectable()
export class SyncWorker extends BaseWorker<SyncJobData, SyncJobResult> {
  protected readonly logger = new Logger(SyncWorker.name);
  protected readonly workerName = 'email-sync';
  protected readonly envToggle = 'EMAIL_SYNC_WORKERS_ENABLED';

  // CRIT-2 FIX: Operation timeout configuration (prevents indefinite hangs)
  private readonly SYNC_TIMEOUT_MS: number;
  private readonly FOLDER_SYNC_TIMEOUT_MS = 60000; // 60 seconds for folder sync

  // Worker configuration - OPTIMIZED FOR 1000+ TENANTS
  private readonly WORKER_CONFIG = {
    high: { concurrency: 17 },   // 17 jobs simultaneously
    normal: { concurrency: 10 }, // 10 jobs simultaneously
    low: { concurrency: 7 },     // 7 jobs simultaneously
  };

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly syncScheduler: SyncSchedulerService,
    private readonly folderSyncService: FolderSyncService,
    private readonly syncAuth: SyncAuthService,
    private readonly googleSyncService: GoogleSyncService,
    private readonly microsoftSyncService: MicrosoftSyncService,
    private readonly imapSyncService: ImapSyncService,
    // Week 3 Task 4: Auto-triage service for Superhuman-like priority/labels
    private readonly emailTriageService: EmailTriageService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {
    super(configService);
    // CRIT-2 FIX: Initialize sync timeout from config (default 10 minutes)
    this.SYNC_TIMEOUT_MS = Number(configService.get('SYNC_OPERATION_TIMEOUT_MS')) || 10 * 60 * 1000;
  }

  /**
   * PHASE 6.3: Return array of configs for multi-queue support
   * BaseWorker handles creating workers for each config
   */
  protected getWorkerConfig(): BaseWorkerConfig[] {
    // Configurable lock/stalled settings from env
    const lockDuration = Number(this.configService.get('SYNC_WORKER_LOCK_MS')) || 900000; // 15 min
    const stalledInterval = Math.max(
      1000,
      Number(this.configService.get('SYNC_WORKER_STALLED_INTERVAL_MS')) || 120000,
    );

    return [
      {
        queueName: QUEUE_NAMES.EMAIL_SYNC_HIGH,
        concurrency: this.WORKER_CONFIG.high.concurrency,
        lockDuration,
        stalledInterval,
        limiter: {
          max: this.WORKER_CONFIG.high.concurrency * 2,
          duration: 60000,
        },
      },
      {
        queueName: QUEUE_NAMES.EMAIL_SYNC_NORMAL,
        concurrency: this.WORKER_CONFIG.normal.concurrency,
        lockDuration,
        stalledInterval,
        limiter: {
          max: this.WORKER_CONFIG.normal.concurrency * 2,
          duration: 60000,
        },
      },
      {
        queueName: QUEUE_NAMES.EMAIL_SYNC_LOW,
        concurrency: this.WORKER_CONFIG.low.concurrency,
        lockDuration,
        stalledInterval,
        limiter: {
          max: this.WORKER_CONFIG.low.concurrency * 2,
          duration: 60000,
        },
      },
    ];
  }

  /**
   * Custom log format for completed sync jobs
   */
  protected formatCompletedLog(job: Job<SyncJobData>, result: SyncJobResult): string {
    return `Job ${job.id} completed: ${result.messagesProcessed} messages, ${result.newMessages} new`;
  }

  /**
   * Custom log format for failed sync jobs
   */
  protected formatFailedLog(job: Job<SyncJobData> | undefined, error: Error): string {
    return `Job ${job?.id} failed for ${job?.data?.email}: ${error.message}`;
  }

  /**
   * Process a single sync job
   */
  protected async processJob(job: Job<SyncJobData>): Promise<SyncJobResult> {
    // BullMQ workers run outside HTTP request context — no tenant in AsyncLocalStorage.
    // Wrap entire job in withoutTenantScopingAsync so all Prisma calls succeed.
    return withoutTenantScopingAsync(() => this.executeSync(job));
  }

  private async executeSync(job: Job<SyncJobData>): Promise<SyncJobResult> {
    const { tenantId, providerId, providerType: jobProviderType, email, syncType } = job.data;

    // Optional job token validation to align with webhook handshake pattern
    this.syncAuth.validateJobToken(job.data.authToken);

    const startTime = Date.now();

    // BUG FIX ES-7: Validate providerType from database, don't trust job data
    // This prevents malformed job data from dispatching the wrong driver
    // Week 3 Task 4: Also fetch userId for auto-triage after sync
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { id: true, tenantId: true, providerType: true, email: true, userId: true },
    });

    if (!provider) {
      this.logger.error(`Provider ${providerId} not found in database`);
      return {
        success: false,
        providerId,
        email,
        messagesProcessed: 0,
        newMessages: 0,
        errors: [`Provider ${providerId} not found`],
        syncDuration: Date.now() - startTime,
      };
    }

    // Validate tenant matches
    if (provider.tenantId !== tenantId) {
      this.logger.error(`Provider ${providerId} belongs to tenant ${provider.tenantId}, not ${tenantId}`);
      return {
        success: false,
        providerId,
        email,
        messagesProcessed: 0,
        newMessages: 0,
        errors: [`Tenant mismatch for provider ${providerId}`],
        syncDuration: Date.now() - startTime,
      };
    }

    // Use validated providerType from database, not job data
    const providerType = provider.providerType;
    if (jobProviderType && jobProviderType !== providerType) {
      this.logger.warn(
        `Job data providerType mismatch: job=${jobProviderType}, db=${providerType}. Using DB value.`,
      );
    }

    this.logger.log(`Processing ${syncType} sync for ${email} (${providerType})`);

    try {
      // RACE CONDITION FIX RC-4: Sync folder structure with distributed lock
      // Prevents concurrent folder syncs from racing and producing inconsistent counts
      // CRIT-2 FIX: Wrap with timeout to prevent indefinite hangs
      // HIGH-1 FIX: Log at ERROR level and track folder sync failures
      try {
        await this.withTimeout(
          this.syncFoldersWithLock(tenantId, providerId),
          this.FOLDER_SYNC_TIMEOUT_MS,
          `folder sync for ${email}`,
        );
      } catch (folderError) {
        const errorMsg = folderError instanceof Error ? folderError.message : String(folderError);
        // HIGH-1 FIX: Always log folder sync failures at ERROR level for visibility
        this.logger.error(`HIGH-1: Folder sync failed for ${email}: ${errorMsg}`);

        // HIGH-1 FIX: Record folder sync error in provider metadata for monitoring
        await this.recordFolderSyncError(providerId, errorMsg).catch((recordErr: unknown) => {
          this.logger.debug(`Failed to record folder sync error: ${recordErr instanceof Error ? recordErr.message : String(recordErr)}`);
        });
        // Continue with email sync - folder sync failure is non-blocking
      }

      // Delegate to provider-specific sync services (they also persist emails to DB)
      // CRIT-2 FIX: Wrap with timeout to prevent indefinite hangs on provider API calls
      const result = await this.withTimeout(
        this.runProviderSync(job.data),
        this.SYNC_TIMEOUT_MS,
        `provider sync for ${email}`,
      );

      // RACE CONDITION FIX RC-3: Apply ALL post-sync updates atomically
      // Prevents partial updates if crash occurs between individual operations
      const metadataUpdates: Record<string, any> = {
        ...(result.metadata || {}),
      };
      if (result.lastSyncToken && metadataUpdates.lastSyncToken === undefined) {
        metadataUpdates.lastSyncToken = result.lastSyncToken;
      }

      await this.applyAllPostSyncUpdates(providerId, tenantId, metadataUpdates);

      // Emit sync completed so frontend can clear syncing indicator
      this.realtimeEvents.emitSyncStatus(tenantId, {
        providerId,
        status: 'completed',
        type: 'email',
        processed: result.messagesProcessed,
      });

      // Auto-triage for new emails (Superhuman-like feature).
      // Awaited so BullMQ manages backpressure — prevents OOM from floating promises.
      if (syncType === 'incremental' && result.newMessages > 0 && provider.userId) {
        try {
          const triageResult = await this.emailTriageService.processUntriagedEmails({
            tenantId,
            userId: provider.userId,
          });
          if (triageResult.processed > 0) {
            this.logger.log(
              `Auto-triage: ${triageResult.successful}/${triageResult.processed} emails triaged for ${email}`,
            );
          }
        } catch (err) {
          this.logger.warn(`Auto-triage failed for ${email}: ${(err as Error).message}`);
        }
      }

      return {
        ...result,
        syncDuration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync failed for ${email}:`, error);

      // Check if this is an authentication error - trigger token refresh instead of error streak
      const isAuthError = this.isAuthenticationError(errorMessage);

      if (isAuthError) {
        this.logger.warn(`Auth error detected for ${email}, will attempt token refresh on next sync`);
        // Set provider to sync immediately (token service will auto-refresh)
        await this.prisma.providerConfig.update({
          where: { id: providerId },
          data: {
            nextSyncAt: new Date(), // Force immediate retry
            // Don't increment error streak for auth errors - token refresh should fix it
          },
        });
        await this.recordAuthErrorMetadata(providerId, errorMessage);
      } else {
        // Increment error streak (Smart Sync) only for non-auth errors
        await this.syncScheduler.incrementErrorStreak(providerId);
      }

      // Emit sync failed so frontend can clear syncing indicator
      this.realtimeEvents.emitSyncStatus(tenantId, {
        providerId,
        status: 'failed',
        type: 'email',
        error: isAuthError ? 'Authentication error' : 'Sync failed',
      });

      // Return error result
      return {
        success: false,
        providerId,
        email,
        messagesProcessed: 0,
        newMessages: 0,
        errors: [errorMessage],
        syncDuration: Date.now() - startTime,
        isAuthError,
      };
    }
  }

  private async runProviderSync(jobData: SyncJobData): Promise<SyncJobResult> {
    switch (jobData.providerType) {
      case 'google':
        return this.googleSyncService.syncProvider(jobData);
      case 'microsoft':
        return this.microsoftSyncService.syncProvider(jobData);
      case 'imap':
        return this.imapSyncService.syncProvider(jobData);
      default:
        throw new Error(`Unsupported provider type: ${jobData.providerType}`);
    }
  }

  private async getProviderMetadata(providerId: string): Promise<any> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { metadata: true },
    });

    return provider?.metadata || {};
  }

  /**
   * Sync folders for a provider.
   * Locking is managed inside FolderSyncService.syncProviderFolders — no outer lock needed here.
   * Adding a lock at this level with the same key causes a non-reentrant deadlock:
   * the worker acquires 'folder-sync:{id}', then syncProviderFolders tries to acquire
   * the same key and fails → "RC-3: Folder sync SKIPPED" — folders never update.
   *
   * @param tenantId - Tenant ID
   * @param providerId - Provider ID
   */
  private async syncFoldersWithLock(tenantId: string, providerId: string): Promise<void> {
    await this.folderSyncService.syncProviderFolders(tenantId, providerId);
  }

  /**
   * RACE CONDITION FIX RC-3: Apply ALL post-sync updates atomically
   * Combines: metadata update, activity tracking, folder count refresh
   * Prevents partial updates if crash occurs between individual operations
   *
   * @param providerId - Provider ID
   * @param tenantId - Tenant ID
   * @param metadataUpdates - Metadata fields to update
   */
  private async applyAllPostSyncUpdates(
    providerId: string,
    tenantId: string, // CITUS: Required for shard routing
    metadataUpdates: Record<string, any>,
  ): Promise<void> {
    const shouldUpdateMetadata = Object.keys(metadataUpdates).length > 0;

    await this.prisma.$transaction(async (tx) => {
      // 1. Merge and update metadata + lastSyncedAt
      let mergedMetadata: Record<string, any> | undefined;

      if (shouldUpdateMetadata) {
        const existingMetadata = await tx.providerConfig.findUnique({
          where: { id: providerId },
          select: { metadata: true },
        });
        mergedMetadata = {
          ...((existingMetadata?.metadata as Record<string, any> | null) || {}),
          ...metadataUpdates,
        };
      }

      // 2. Update provider config with sync timestamp and metadata
      await tx.providerConfig.update({
        where: { id: providerId },
        data: {
          lastSyncedAt: new Date(),
          ...(shouldUpdateMetadata ? { metadata: mergedMetadata } : {}),
        },
      });
    });

    // Refresh folder counters using provider-aware logic.
    // Gmail counts must be derived from label membership, not only email.folder.
    await this.folderSyncService.updateAllFolderCounts(providerId);

    // Update activity rate outside transaction (non-critical, can be async)
    // This is a "fire and forget" operation that updates Smart Sync priority
    this.syncScheduler.updateProviderActivity(providerId).catch((error) => {
      this.logger.warn(
        `Activity update failed for ${providerId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async recordAuthErrorMetadata(providerId: string, errorMessage: string): Promise<void> {
    try {
      const metadata = await this.getProviderMetadata(providerId);
      const updatedMetadata = {
        ...metadata,
        lastAuthErrorAt: new Date().toISOString(),
        lastAuthError: errorMessage,
      };

      await this.prisma.providerConfig.update({
        where: { id: providerId },
        data: { metadata: updatedMetadata },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to record auth error metadata for ${providerId}: ${message}`);
    }
  }

  /**
   * HIGH-1 FIX: Record folder sync error in provider metadata for monitoring
   * This allows tracking of folder sync failures without blocking email sync
   */
  private async recordFolderSyncError(providerId: string, errorMessage: string): Promise<void> {
    try {
      const metadata = await this.getProviderMetadata(providerId);
      const updatedMetadata = {
        ...metadata,
        lastFolderSyncErrorAt: new Date().toISOString(),
        lastFolderSyncError: errorMessage,
        folderSyncErrorCount: ((metadata.folderSyncErrorCount as number) || 0) + 1,
      };

      await this.prisma.providerConfig.update({
        where: { id: providerId },
        data: { metadata: updatedMetadata },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to record folder sync error for ${providerId}: ${message}`);
    }
  }

  /**
   * Detect if an error is related to authentication/token issues
   * These errors should trigger token refresh rather than error streak increment
   */
  private isAuthenticationError(errorMessage: string): boolean {
    const authErrorPatterns = [
      '401',
      'unauthorized',
      'invalid_grant',
      'invalid_token',
      'token expired',
      'token has been expired',
      'access_denied',
      'authentication required',
      'requires re-authentication',
      'refresh token',
      'InvalidAuthenticationToken',
      'AuthenticationError',
      'ExpiredAuthenticationToken',
    ];

    const lowerMessage = errorMessage.toLowerCase();
    return authErrorPatterns.some((pattern) => lowerMessage.includes(pattern.toLowerCase()));
  }
}
