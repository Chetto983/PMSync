/**
 * ProviderSyncBackQueueService
 *
 * BullMQ queue service for syncing email state changes back to providers.
 * This is critical for ensuring local changes (mark read, delete, archive, etc.)
 * are reflected in the user's actual email account (Gmail, Microsoft, IMAP).
 *
 * Key Features:
 * - Batches multiple operations on same email to reduce API calls
 * - Debounces rapid changes (e.g., quick mark read/unread toggles)
 * - Handles provider rate limits with exponential backoff
 * - Dead letter queue integration for failed syncs
 * - Tenant isolation and cleanup support
 *
 * Usage:
 * ```typescript
 * // Queue a mark-read sync-back
 * await syncBackQueue.enqueueSyncBack({
 *   tenantId: 'tenant-123',
 *   providerId: 'provider-456',
 *   providerType: 'google',
 *   action: 'mark-read',
 *   emailIds: ['email-1', 'email-2'],
 * });
 * ```
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents, JobType } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';

/**
 * Supported sync-back actions
 */
export type SyncBackAction =
  | 'mark-read'
  | 'mark-unread'
  | 'star'
  | 'unstar'
  | 'delete'
  | 'archive'
  | 'move'
  | 'add-label'
  | 'remove-label'
  | 'flag'
  | 'unflag';

/**
 * Sync-back job data
 */
export interface SyncBackJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'imap';
  action: SyncBackAction;
  emailIds: string[];
  /** External IDs (provider-specific message IDs) */
  externalIds?: string[];
  /** Target folder for move operations */
  targetFolder?: string;
  /** Label to add/remove */
  labelId?: string;
  /** Request timestamp for ordering */
  requestedAt: string;
  /** Priority (high for user-initiated, normal for background) */
  priority?: 'high' | 'normal';
  /** Retry count for tracking */
  retryCount?: number;
}

/**
 * Sync-back job result
 */
export interface SyncBackJobResult {
  success: boolean;
  action: SyncBackAction;
  emailIds: string[];
  syncedCount: number;
  failedCount: number;
  errors?: string[];
  durationMs: number;
}

/**
 * Queue metrics
 */
export interface SyncBackQueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  avgDurationMs: number;
  lastProcessedAt?: string;
  lastError?: string;
}

interface InternalMetrics {
  completed: number;
  failed: number;
  totalDurationMs: number;
  lastProcessedAt?: string;
  lastError?: string;
}

@Injectable()
export class ProviderSyncBackQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderSyncBackQueueService.name);
  private redisConnection: Redis;
  private queue: Queue<SyncBackJobData, SyncBackJobResult>;
  private queueEvents: QueueEvents;

  private readonly metrics: InternalMetrics = {
    completed: 0,
    failed: 0,
    totalDurationMs: 0,
  };

  // Debounce delay to batch rapid changes (500ms)
  private readonly DEBOUNCE_DELAY_MS: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => DeadLetterQueueService))
    private readonly deadLetterQueue: DeadLetterQueueService,
  ) {
    this.DEBOUNCE_DELAY_MS = this.configService.get<number>('SYNC_BACK_DEBOUNCE_MS', 500);
  }

  async onModuleInit() {
    // Use centralized Redis connection options
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.logger.log(
      `Connecting to Redis for sync-back queue at ${redisOptions.host}:${redisOptions.port}`,
    );

    // Use HIGH priority defaults (user-initiated operations)
    const jobDefaults = getDefaultJobOptions('HIGH');

    this.queue = new Queue<SyncBackJobData, SyncBackJobResult>(QUEUE_NAMES.PROVIDER_SYNC_BACK, {
      connection: this.redisConnection,
      defaultJobOptions: {
        ...jobDefaults,
        // Override for sync-back specific settings
        attempts: 5, // More retries for provider operations
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s, 16s, 32s
        },
      },
    });

    // Setup queue events for monitoring
    this.setupQueueEvents();

    this.logger.log('Provider sync-back queue initialized successfully');
  }

  private setupQueueEvents() {
    this.queueEvents = new QueueEvents(QUEUE_NAMES.PROVIDER_SYNC_BACK, {
      connection: this.redisConnection,
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.logger.debug(`Sync-back job ${jobId} completed`);
      this.recordCompletion(jobId).catch((error) => {
        this.logger.debug(
          `Failed to record metrics for job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.warn(`Sync-back job ${jobId} failed: ${failedReason}`);
      this.recordFailure(failedReason);

      // Add to DLQ if job exhausted all retries
      this.handlePermanentFailure(jobId, failedReason).catch((err: Error) => {
        this.logger.error(`Failed to add job ${jobId} to DLQ: ${err.message}`);
      });
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      this.logger.debug(`Sync-back job ${jobId} progress: ${JSON.stringify(data)}`);
    });
  }

  /**
   * Enqueue a sync-back operation.
   * Automatically deduplicates and batches operations on the same emails.
   *
   * @returns Job ID for tracking
   */
  async enqueueSyncBack(data: SyncBackJobData): Promise<string> {
    // Generate dedup key based on provider + action + sorted email IDs
    const sortedIds = [...data.emailIds].sort().join('-');
    const jobId = `syncback-${data.providerId}-${data.action}-${sortedIds.substring(0, 50)}`;

    // Check for existing job
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'delayed') {
        // Merge email IDs if same action on same provider
        const existingIds = new Set(existing.data.emailIds);
        const newIds = data.emailIds.filter((id) => !existingIds.has(id));

        if (newIds.length > 0) {
          // Update job with merged IDs
          await existing.updateData({
            ...existing.data,
            emailIds: [...existing.data.emailIds, ...newIds],
            requestedAt: data.requestedAt, // Update timestamp
          });
          this.logger.debug(`Merged ${newIds.length} emails into existing sync-back job ${jobId}`);
        }
        return existing.id || jobId;
      } else if (state === 'completed' || state === 'failed') {
        await existing.remove();
      }
    }

    // Add new job with debounce delay
    const job = await this.queue.add(`sync-${data.action}`, data, {
      jobId,
      delay: this.DEBOUNCE_DELAY_MS,
      priority: data.priority === 'high' ? 1 : 5,
    });

    this.logger.log(
      `Queued sync-back: ${data.action} for ${data.emailIds.length} email(s) on ${data.providerType} [${job.id}]`,
    );

    return job.id || jobId;
  }

  /**
   * Enqueue multiple sync-back operations in bulk.
   */
  async enqueueBulkSyncBack(jobs: SyncBackJobData[]): Promise<string[]> {
    if (!jobs.length) return [];

    const jobIds: string[] = [];

    // Group by provider + action for efficient batching
    const grouped = new Map<string, SyncBackJobData>();

    for (const job of jobs) {
      const key = `${job.providerId}-${job.action}`;
      const existing = grouped.get(key);

      if (existing) {
        // Merge email IDs
        const mergedIds = new Set([...existing.emailIds, ...job.emailIds]);
        existing.emailIds = Array.from(mergedIds);
        if (job.externalIds) {
          const mergedExtIds = new Set([...(existing.externalIds || []), ...job.externalIds]);
          existing.externalIds = Array.from(mergedExtIds);
        }
      } else {
        grouped.set(key, { ...job });
      }
    }

    // Enqueue each grouped job
    for (const groupedJob of grouped.values()) {
      const jobId = await this.enqueueSyncBack(groupedJob);
      jobIds.push(jobId);
    }

    this.logger.log(`Bulk queued ${jobIds.length} sync-back jobs (from ${jobs.length} requests)`);
    return jobIds;
  }

  /**
   * Get job status by ID.
   */
  async getJobStatus(
    jobId: string,
  ): Promise<{ state: string; result?: SyncBackJobResult; progress?: number } | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const result = job.returnvalue as SyncBackJobResult | undefined;
    const progress = typeof job.progress === 'number' ? job.progress : undefined;

    return { state, result, progress };
  }

  /**
   * Get queue status and metrics.
   */
  async getQueueStatus(): Promise<SyncBackQueueMetrics> {
    const counts = await this.queue.getJobCounts();

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      avgDurationMs:
        this.metrics.completed > 0
          ? Math.round(this.metrics.totalDurationMs / this.metrics.completed)
          : 0,
      lastProcessedAt: this.metrics.lastProcessedAt,
      lastError: this.metrics.lastError,
    };
  }

  /**
   * Get pending sync-back jobs for a provider.
   */
  async getPendingJobsForProvider(providerId: string): Promise<SyncBackJobData[]> {
    const states: JobType[] = ['waiting', 'active', 'delayed'];
    const jobs = await this.queue.getJobs(states, 0, -1);

    return jobs.filter((job) => job?.data?.providerId === providerId).map((job) => job.data);
  }

  /**
   * Remove all pending jobs for a tenant (used during tenant cleanup).
   */
  async removeJobsForTenant(tenantId: string): Promise<number> {
    const states: JobType[] = ['waiting', 'delayed', 'paused'];
    const jobs = await this.queue.getJobs(states, 0, -1);
    let removed = 0;

    for (const job of jobs) {
      if (job?.data?.tenantId === tenantId) {
        await job.remove();
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} pending sync-back jobs for tenant ${tenantId}`);
    }

    return removed;
  }

  /**
   * Remove all pending jobs for a provider.
   */
  async removeJobsForProvider(providerId: string): Promise<number> {
    const states: JobType[] = ['waiting', 'delayed', 'paused'];
    const jobs = await this.queue.getJobs(states, 0, -1);
    let removed = 0;

    for (const job of jobs) {
      if (job?.data?.providerId === providerId) {
        await job.remove();
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} pending sync-back jobs for provider ${providerId}`);
    }

    return removed;
  }

  /**
   * Pause queue processing.
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    this.logger.log('Sync-back queue paused');
  }

  /**
   * Resume queue processing.
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    this.logger.log('Sync-back queue resumed');
  }

  /**
   * Clear all failed jobs.
   */
  async clearFailedJobs(): Promise<number> {
    const failed = await this.queue.getJobs(['failed'], 0, -1);
    let cleared = 0;

    for (const job of failed) {
      await job.remove();
      cleared++;
    }

    if (cleared > 0) {
      this.logger.log(`Cleared ${cleared} failed sync-back jobs`);
    }

    return cleared;
  }

  /**
   * Get the underlying queue (for worker access).
   */
  getQueue(): Queue<SyncBackJobData, SyncBackJobResult> {
    return this.queue;
  }

  private async recordCompletion(jobId: string) {
    this.metrics.completed++;
    this.metrics.lastProcessedAt = new Date().toISOString();

    try {
      const job = await this.queue.getJob(jobId);
      if (job?.processedOn != null && job?.finishedOn != null) {
        const duration = job.finishedOn - job.processedOn;
        if (Number.isFinite(duration) && duration >= 0) {
          this.metrics.totalDurationMs += duration;
        }
      }
    } catch {
      // Ignore errors when fetching job metrics
    }
  }

  private recordFailure(failedReason?: string) {
    this.metrics.failed++;
    this.metrics.lastError = failedReason;
  }

  /**
   * Handle permanently failed jobs by adding them to the DLQ
   */
  private async handlePermanentFailure(jobId: string, failedReason?: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) return;

    // Check if job has exhausted all retries (attemptsMade >= attempts)
    const maxAttempts = job.opts.attempts || 5;
    if (job.attemptsMade < maxAttempts) {
      return; // Job still has retries remaining
    }

    // Add to DLQ
    await this.deadLetterQueue.addToDeadLetter(
      jobId,
      QUEUE_NAMES.PROVIDER_SYNC_BACK,
      job.data,
      new Error(failedReason || 'Unknown error'),
      job.attemptsMade,
      {
        providerId: job.data.providerId,
        providerType: job.data.providerType,
        action: job.data.action,
        emailCount: job.data.emailIds.length,
      },
    );
  }

  async onModuleDestroy() {
    this.logger.log('Closing sync-back queue...');

    try {
      if (this.queueEvents) {
        await this.queueEvents.close();
      }

      if (this.queue) {
        await this.queue.close();
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
        `Sync-back queue shutdown error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.logger.log('Sync-back queue closed');
    }
  }
}
