import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { SyncJobData, SyncJobResult } from '../interfaces/sync-job.interface';
import { SyncSchedulerService } from '../services/sync-scheduler.service';
import { FolderSyncService } from '../services/folder-sync.service';
import { SyncAuthService } from '../services/sync-auth.service';
import { GoogleSyncService } from '../services/gmail/google-sync.service';
import { MicrosoftSyncService } from '../services/microsoft/microsoft-sync.service';
import { ImapSyncService } from '../services/imap/imap-sync.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';
import { RedisLockService } from '../../../common/services/redis-lock.service';

@Injectable()
export class SyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncWorker.name);
  private redisConnection: Redis;
  private workers: Worker[] = [];

  // Worker configuration - OPTIMIZED FOR 1000+ TENANTS
  private readonly WORKER_CONFIG = {
    high: {
      concurrency: 17, // 17 jobs simultaneously (was 5)
    },
    normal: {
      concurrency: 10, // 10 jobs simultaneously (was 3)
    },
    low: {
      concurrency: 7, // 7 jobs simultaneously (was 2)
    },
  };

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => SyncSchedulerService))
    private syncScheduler: SyncSchedulerService,
    private folderSyncService: FolderSyncService,
    private readonly syncAuth: SyncAuthService,
    private readonly googleSyncService: GoogleSyncService,
    private readonly microsoftSyncService: MicrosoftSyncService,
    private readonly imapSyncService: ImapSyncService,
    // RACE CONDITION FIX RC-4: Redis lock for folder sync coordination
    private readonly redisLock: RedisLockService,
  ) {}

  async onModuleInit() {
    const workersEnabled =
      (this.configService.get<string>('EMAIL_SYNC_WORKERS_ENABLED') || 'true').toLowerCase() !==
      'false';
    if (!workersEnabled) {
      this.logger.warn('Email sync workers are disabled via EMAIL_SYNC_WORKERS_ENABLED=false');
      return;
    }

    // Initialize Redis connection for workers using centralized config
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    // Start workers for each priority queue using centralized queue names
    this.startWorker(QUEUE_NAMES.EMAIL_SYNC_HIGH, this.WORKER_CONFIG.high.concurrency);
    this.startWorker(QUEUE_NAMES.EMAIL_SYNC_NORMAL, this.WORKER_CONFIG.normal.concurrency);
    this.startWorker(QUEUE_NAMES.EMAIL_SYNC_LOW, this.WORKER_CONFIG.low.concurrency);

    this.logger.log('Email sync workers started successfully');
  }

  private startWorker(queueName: string, concurrency: number) {
    const worker = new Worker<SyncJobData, SyncJobResult>(
      queueName,
      async (job: Job<SyncJobData>) => {
        return await this.processJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency,
        limiter: {
          max: concurrency * 2, // Max jobs processed
          duration: 60000, // per minute
        },
        // Long-running syncs need generous lock to avoid "missing lock" stalls
        // Performance fix: Increased from 5min to 15min for large mailboxes
        lockDuration: Number(this.configService.get('SYNC_WORKER_LOCK_MS')) || 900000,
        stalledInterval: Math.max(
          1000,
          Number(this.configService.get('SYNC_WORKER_STALLED_INTERVAL_MS')) || 120000,
        ),
      },
    );

    worker.on('completed', (job, result) => {
      this.logger.log(
        `[${queueName}] Job ${job.id} completed: ${result.messagesProcessed} messages, ${result.newMessages} new`,
      );
    });

    worker.on('failed', (job, error) => {
      this.logger.error(
        `[${queueName}] Job ${job?.id} failed for ${job?.data?.email}: ${error.message}`,
      );
    });

    worker.on('error', (error) => {
      this.logger.error(`[${queueName}] Worker error: ${error.message}`);
    });

    this.workers.push(worker);
    this.logger.log(`Started worker for queue ${queueName} with concurrency ${concurrency}`);
  }

  private async processJob(job: Job<SyncJobData>): Promise<SyncJobResult> {
    const { tenantId, providerId, providerType: jobProviderType, email, syncType } = job.data;

    // Optional job token validation to align with webhook handshake pattern
    this.syncAuth.validateJobToken(job.data.authToken);

    const startTime = Date.now();

    // BUG FIX ES-7: Validate providerType from database, don't trust job data
    // This prevents malformed job data from dispatching the wrong driver
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { id: true, tenantId: true, providerType: true, email: true },
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
      try {
        await this.syncFoldersWithLock(tenantId, providerId);
      } catch (folderError) {
        this.logger.warn(
          `Folder sync failed for ${email}, continuing with email sync: ${folderError instanceof Error ? folderError.message : String(folderError)}`,
        );
      }

      // Delegate to provider-specific sync services (they also persist emails to DB)
      const result = await this.runProviderSync(job.data);

      // RACE CONDITION FIX RC-3: Apply ALL post-sync updates atomically
      // Prevents partial updates if crash occurs between individual operations
      const metadataUpdates: Record<string, any> = {
        ...(result.metadata || {}),
      };
      if (result.lastSyncToken && metadataUpdates.lastSyncToken === undefined) {
        metadataUpdates.lastSyncToken = result.lastSyncToken;
      }

      await this.applyAllPostSyncUpdates(providerId, tenantId, metadataUpdates);

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
   * RACE CONDITION FIX RC-4: Sync folders with distributed lock
   * Prevents concurrent folder syncs from racing and producing inconsistent counts
   *
   * @param tenantId - Tenant ID
   * @param providerId - Provider ID
   */
  private async syncFoldersWithLock(tenantId: string, providerId: string): Promise<void> {
    const lockKey = `folder-sync:${providerId}`;
    const lockTtlMs = 30000; // 30 second TTL for folder sync

    try {
      await this.redisLock.withLock(
        lockKey,
        lockTtlMs,
        async () => {
          await this.folderSyncService.syncProviderFolders(tenantId, providerId);
        },
        { maxRetries: 3 },
      );
    } catch (lockError) {
      // If lock acquisition fails, try without lock (graceful degradation)
      this.logger.warn(
        `Folder sync lock failed for ${providerId}, proceeding without lock: ${
          lockError instanceof Error ? lockError.message : String(lockError)
        }`,
      );
      await this.folderSyncService.syncProviderFolders(tenantId, providerId);
    }
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
    tenantId: string,
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

      // 3. Update folder counts atomically using raw SQL for efficiency
      // This updates all folders for this provider in a single query
      await tx.$executeRaw`
        UPDATE "folders"
        SET
          "totalCount" = (
            SELECT COUNT(*)
            FROM "emails"
            WHERE "emails"."providerId" = "folders"."providerId"
              AND "emails"."folder" = "folders"."name"
              AND "emails"."isDeleted" = false
          ),
          "unreadCount" = (
            SELECT COUNT(*)
            FROM "emails"
            WHERE "emails"."providerId" = "folders"."providerId"
              AND "emails"."folder" = "folders"."name"
              AND "emails"."isDeleted" = false
              AND "emails"."isRead" = false
          ),
          "updatedAt" = NOW()
        WHERE "folders"."providerId" = ${providerId}
      `;
    });

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

  async onModuleDestroy() {
    const workersEnabled =
      (this.configService.get<string>('EMAIL_SYNC_WORKERS_ENABLED') || 'true').toLowerCase() !==
      'false';
    if (!workersEnabled) {
      return;
    }

    this.logger.log('Stopping email sync workers...');

    try {
      // Stop all workers safely
      for (const worker of this.workers) {
        try {
          await worker.close();
        } catch (error) {
          this.logger.debug(
            `Worker close skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      // Close Redis connection safely
      if (
        this.redisConnection &&
        this.redisConnection.status !== 'end' &&
        this.redisConnection.status !== 'close'
      ) {
        try {
          await this.redisConnection.quit();
        } catch (error) {
          this.logger.debug(
            `Redis quit skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    } catch (outerError) {
      this.logger.warn(
        `SyncWorker shutdown encountered an error (swallowed): ${
          outerError instanceof Error ? outerError.message : outerError
        }`,
      );
    } finally {
      this.logger.log('All workers stopped successfully');
    }
  }
}


