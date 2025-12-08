/**
 * BulkOperationsQueueService
 *
 * BullMQ queue service for handling bulk email operations.
 * Optimized for processing large batches of emails efficiently.
 *
 * Key Features:
 * - Batch processing with configurable chunk sizes
 * - Progress tracking for long-running operations
 * - Rate limiting to avoid provider throttling
 * - Cancellation support
 * - Automatic retry with dead-letter handling
 *
 * Usage:
 * ```typescript
 * // Bulk delete emails
 * const jobId = await bulkOpsQueue.enqueueBulkOperation({
 *   tenantId: 'tenant-123',
 *   providerId: 'provider-456',
 *   operation: 'delete',
 *   emailIds: ['email-1', 'email-2', ...],
 *   chunkSize: 50,
 * });
 *
 * // Check progress
 * const progress = await bulkOpsQueue.getProgress(jobId);
 * // { processed: 150, total: 500, percentage: 30 }
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
 * Supported bulk operations
 */
export type BulkOperationType =
  | 'delete'
  | 'archive'
  | 'mark-read'
  | 'mark-unread'
  | 'star'
  | 'unstar'
  | 'move'
  | 'add-label'
  | 'remove-label'
  | 'spam'
  | 'not-spam';

/**
 * Bulk operation job data
 */
export interface BulkOperationJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'imap';
  operation: BulkOperationType;
  /** Email IDs to process */
  emailIds: string[];
  /** For move/label operations */
  targetFolderId?: string;
  /** For label operations */
  labelId?: string;
  /** Chunk size for batch processing (default: 50) */
  chunkSize?: number;
  /** Request timestamp */
  requestedAt: string;
  /** User ID who initiated the operation */
  userId?: string;
  /** Whether to sync back to provider */
  syncToProvider?: boolean;
}

/**
 * Bulk operation progress
 */
export interface BulkOperationProgress {
  processed: number;
  total: number;
  percentage: number;
  failed: number;
  errors: string[];
  startedAt?: string;
  estimatedCompletionAt?: string;
}

/**
 * Bulk operation job result
 */
export interface BulkOperationJobResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
  durationMs: number;
  completedAt: string;
}

/**
 * Queue metrics
 */
export interface BulkOperationsQueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  totalEmailsProcessed: number;
  avgBatchDurationMs: number;
}

interface InternalMetrics {
  completed: number;
  failed: number;
  totalEmailsProcessed: number;
  totalDurationMs: number;
}

@Injectable()
export class BulkOperationsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkOperationsQueueService.name);
  private redisConnection: Redis;
  private queue: Queue<BulkOperationJobData, BulkOperationJobResult>;
  private queueEvents: QueueEvents;

  private readonly metrics: InternalMetrics = {
    completed: 0,
    failed: 0,
    totalEmailsProcessed: 0,
    totalDurationMs: 0,
  };

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => DeadLetterQueueService))
    private readonly deadLetterQueue: DeadLetterQueueService,
  ) {}

  async onModuleInit() {
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.logger.log(
      `Connecting to Redis for bulk operations queue at ${redisOptions.host}:${redisOptions.port}`,
    );

    // Use NORMAL priority defaults (background batch processing)
    const jobDefaults = getDefaultJobOptions('NORMAL');

    this.queue = new Queue<BulkOperationJobData, BulkOperationJobResult>(
      QUEUE_NAMES.BULK_OPERATIONS,
      {
        connection: this.redisConnection,
        defaultJobOptions: {
          ...jobDefaults,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000, // 10s, 20s, 40s
          },
          // Keep completed jobs longer for audit trail
          removeOnComplete: {
            age: 7 * 24 * 3600, // 7 days
            count: 1000,
          },
        },
      },
    );

    this.setupQueueEvents();

    this.logger.log('Bulk operations queue initialized successfully');
  }

  private setupQueueEvents() {
    this.queueEvents = new QueueEvents(QUEUE_NAMES.BULK_OPERATIONS, {
      connection: this.redisConnection,
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.logger.debug(`Bulk operation job ${jobId} completed`);
      this.recordCompletion(jobId).catch((error) => {
        this.logger.debug(
          `Failed to record metrics for job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.warn(`Bulk operation job ${jobId} failed: ${failedReason}`);
      this.metrics.failed++;

      // Add to DLQ if job exhausted all retries
      this.handlePermanentFailure(jobId, failedReason).catch((err: Error) => {
        this.logger.error(`Failed to add job ${jobId} to DLQ: ${err.message}`);
      });
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      this.logger.debug(`Bulk operation job ${jobId} progress: ${JSON.stringify(data)}`);
    });
  }

  /**
   * Enqueue a bulk operation.
   *
   * @returns Job ID for tracking progress
   */
  async enqueueBulkOperation(data: BulkOperationJobData): Promise<string> {
    // Generate a unique job ID
    const jobId = `bulk-${data.operation}-${data.providerId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const job = await this.queue.add('bulk-operation', data, {
      jobId,
      // Lower priority for larger batches to avoid blocking smaller ops
      priority: data.emailIds.length > 1000 ? 10 : 5,
    });

    this.logger.log(
      `Queued bulk ${data.operation}: ${data.emailIds.length} emails for provider ${data.providerId} [${job.id}]`,
    );

    return job.id || jobId;
  }

  /**
   * Get progress for a bulk operation job.
   */
  async getProgress(jobId: string): Promise<BulkOperationProgress | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = (job.progress as BulkOperationProgress) || {
      processed: 0,
      total: job.data.emailIds.length,
      percentage: 0,
      failed: 0,
      errors: [],
    };

    // If completed, return full progress
    if (state === 'completed' && job.returnvalue) {
      const result = job.returnvalue;
      return {
        processed: result.processed,
        total: job.data.emailIds.length,
        percentage: 100,
        failed: result.failed,
        errors: result.errors,
      };
    }

    return progress;
  }

  /**
   * Cancel a pending bulk operation.
   *
   * @returns true if cancelled, false if not cancellable
   */
  async cancelOperation(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;

    const state = await job.getState();

    // Can only cancel waiting or delayed jobs
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      this.logger.log(`Cancelled bulk operation: ${jobId}`);
      return true;
    }

    // For active jobs, we can't cancel mid-execution
    // Worker should check for cancellation flag periodically
    if (state === 'active') {
      // Mark for cancellation (worker should check this)
      await job.updateData({
        ...job.data,
        _cancelled: true,
      } as BulkOperationJobData);
      this.logger.log(`Marked bulk operation for cancellation: ${jobId}`);
      return true;
    }

    return false;
  }

  /**
   * Get job status.
   */
  async getJobStatus(
    jobId: string,
  ): Promise<{ state: string; progress?: BulkOperationProgress; result?: BulkOperationJobResult } | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = await this.getProgress(jobId);
    const result = state === 'completed' ? (job.returnvalue) : undefined;

    return { state, progress: progress || undefined, result };
  }

  /**
   * Get all active/pending bulk operations for a tenant.
   */
  async getOperationsForTenant(
    tenantId: string,
  ): Promise<Array<{ jobId: string; operation: BulkOperationType; emailCount: number; state: string }>> {
    const states: JobType[] = ['waiting', 'active', 'delayed'];
    const jobs = await this.queue.getJobs(states, 0, -1);

    const results: Array<{ jobId: string; operation: BulkOperationType; emailCount: number; state: string }> = [];

    for (const job of jobs) {
      if (job?.data?.tenantId === tenantId) {
        const state = await job.getState();
        results.push({
          jobId: job.id || '',
          operation: job.data.operation,
          emailCount: job.data.emailIds.length,
          state,
        });
      }
    }

    return results;
  }

  /**
   * Get queue status and metrics.
   */
  async getQueueStatus(): Promise<BulkOperationsQueueMetrics> {
    const counts = await this.queue.getJobCounts();

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      totalEmailsProcessed: this.metrics.totalEmailsProcessed,
      avgBatchDurationMs:
        this.metrics.completed > 0
          ? Math.round(this.metrics.totalDurationMs / this.metrics.completed)
          : 0,
    };
  }

  /**
   * Remove all pending jobs for a tenant.
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
      this.logger.log(`Removed ${removed} pending bulk operation jobs for tenant ${tenantId}`);
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
      this.logger.log(`Removed ${removed} pending bulk operation jobs for provider ${providerId}`);
    }

    return removed;
  }

  /**
   * Pause queue processing.
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    this.logger.log('Bulk operations queue paused');
  }

  /**
   * Resume queue processing.
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    this.logger.log('Bulk operations queue resumed');
  }

  /**
   * Get the underlying queue (for worker access).
   */
  getQueue(): Queue<BulkOperationJobData, BulkOperationJobResult> {
    return this.queue;
  }

  private async recordCompletion(jobId: string) {
    this.metrics.completed++;

    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        // Track emails processed
        if (job.returnvalue) {
          const result = job.returnvalue;
          this.metrics.totalEmailsProcessed += result.processed;
        }

        // Track duration
        if (job.processedOn != null && job.finishedOn != null) {
          const duration = job.finishedOn - job.processedOn;
          if (Number.isFinite(duration) && duration >= 0) {
            this.metrics.totalDurationMs += duration;
          }
        }
      }
    } catch {
      // Ignore errors when fetching job metrics
    }
  }

  /**
   * Handle permanently failed jobs by adding them to the DLQ
   */
  private async handlePermanentFailure(jobId: string, failedReason?: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) return;

    // Check if job has exhausted all retries (attemptsMade >= attempts)
    const maxAttempts = job.opts.attempts || 3;
    if (job.attemptsMade < maxAttempts) {
      return; // Job still has retries remaining
    }

    // Add to DLQ
    await this.deadLetterQueue.addToDeadLetter(
      jobId,
      QUEUE_NAMES.BULK_OPERATIONS,
      job.data,
      new Error(failedReason || 'Unknown error'),
      job.attemptsMade,
      {
        providerId: job.data.providerId,
        providerType: job.data.providerType,
        operation: job.data.operation,
        emailCount: job.data.emailIds.length,
      },
    );
  }

  async onModuleDestroy() {
    this.logger.log('Closing bulk operations queue...');

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
        `Bulk operations queue shutdown error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.logger.log('Bulk operations queue closed');
    }
  }
}
