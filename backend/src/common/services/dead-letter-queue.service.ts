import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { CacheService, CacheNamespace } from './cache.service';
import { getSharedRedisConnection, releaseSharedRedisConnection, QUEUE_NAMES } from '../config';
import { CorrelationContext } from './correlation-context.service';

/**
 * Dead Letter Queue Job Data
 */
export interface DLQJobData<T = any> {
  originalJobId: string;
  originalQueue: string;
  originalData: T;
  failedAt: Date;
  attemptsMade: number;
  lastError: string;
  errorStack?: string;
  failureCount: number;
  metadata?: Record<string, any>;
}

/**
 * DLQ Statistics
 */
export interface DLQStats {
  totalFailed: number;
  byQueue: Record<string, number>;
  byErrorType: Record<string, number>;
  recentFailures: Array<{
    jobId: string;
    queue: string;
    failedAt: string;
    error: string;
  }>;
  oldestFailure: {
    jobId: string;
    failedAt: string;
  } | null;
}

/**
 * Retry Options
 */
export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  priority?: number;
}

/**
 * DeadLetterQueueService
 *
 * Centralized service for handling permanently failed jobs.
 * Provides visibility, analysis, and manual recovery for failed jobs.
 *
 * Features:
 * - Automatic DLQ job creation when jobs exhaust retries
 * - Failed job analysis and categorization
 * - Manual retry with configurable options
 * - Failure pattern detection
 * - Alerting integration
 * - Retention policies
 * - Batch processing for DLQ cleanup
 *
 * Architecture:
 * - Separate Redis queue for failed jobs
 * - Event-driven job capture from source queues
 * - Cache-based statistics aggregation
 * - Time-series failure tracking
 *
 * Usage:
 * ```typescript
 * // Automatic capture (via queue events)
 * // Jobs are automatically added to DLQ when they fail permanently
 *
 * // Manual retry
 * await dlq.retryJob('failed-job-123', {
 *   maxRetries: 3,
 *   retryDelay: 5000,
 * });
 *
 * // Get stats
 * const stats = await dlq.getStats();
 *
 * // Clean old failures
 * await dlq.cleanOldFailures(7); // Older than 7 days
 * ```
 */
@Injectable()
export class DeadLetterQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeadLetterQueueService.name);
  private redisConnection: Redis;
  private dlqQueue: Queue<DLQJobData>;
  private queueEvents: QueueEvents;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly DLQ_RETENTION_DAYS = 7; // Keep DLQ items for 7 days (was 30)
  private readonly FAILURE_CACHE_TTL = 86400; // 24 hours

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  async onModuleInit() {
    // Use shared Redis connection to prevent connection sprawl (AUDIT-03)
    this.redisConnection = getSharedRedisConnection();

    // Initialize Dead Letter Queue using centralized queue name
    this.dlqQueue = new Queue<DLQJobData>(QUEUE_NAMES.DEAD_LETTER, {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 1, // No retries for DLQ jobs
        removeOnComplete: { count: 500, age: 604800 }, // Keep 500 or 7 days
        removeOnFail: { count: 500 }, // Keep last 500 failed for analysis
      },
    });

    // Setup event monitoring using centralized queue name
    this.queueEvents = new QueueEvents(QUEUE_NAMES.DEAD_LETTER, {
      connection: this.redisConnection,
    });

    this.queueEvents.on('added', ({ jobId }) => {
      this.logger.warn(`Job added to DLQ: ${jobId}`);
      void this.incrementFailureCount();
    });

    this.logger.log('Dead Letter Queue service initialized');

    // Schedule periodic cleanup
    this.scheduleCleanup();
  }

  /**
   * Add a failed job to the DLQ
   *
   * Called when a job exhausts all retry attempts.
   */
  async addToDeadLetter<T = any>(
    originalJobId: string,
    originalQueue: string,
    originalData: T,
    error: Error,
    attemptsMade: number,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      // Check if job already exists in DLQ
      const existingJob = await this.dlqQueue.getJob(`dlq-${originalJobId}`);
      let failureCount = 1;

      if (existingJob) {
        failureCount = (existingJob.data.failureCount || 0) + 1;
        await existingJob.remove(); // Remove old entry
      }

      const dlqJobData: DLQJobData<T> = {
        originalJobId,
        originalQueue,
        originalData,
        failedAt: new Date(),
        attemptsMade,
        lastError: error.message,
        errorStack: error.stack,
        failureCount,
        metadata: {
          ...metadata,
          errorName: error.name,
          timestamp: new Date().toISOString(),
        },
      };

      await this.dlqQueue.add('failed-job', {
        ...dlqJobData,
        requestId: (dlqJobData as any).requestId || CorrelationContext.getContext()?.correlationId,
      } as DLQJobData<T>, {
        jobId: `dlq-${originalJobId}`,
      });

      // Update failure stats
      await this.trackFailure(originalQueue, error.message);

      this.logger.error(
        `Job ${originalJobId} from ${originalQueue} added to DLQ after ${attemptsMade} attempts: ${error.message}`,
      );

      // Check if this failure warrants an alert
      await this.checkAlertThresholds(originalQueue);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Failed to add job to DLQ: ${error.message}`, error.stack);
    }
  }

  /**
   * Retry a failed job from the DLQ.
   *
   * Re-enqueues the original job data into the original queue with fresh retry
   * budget, then removes the DLQ entry. If the original queue doesn't exist or
   * the re-enqueue fails, the DLQ entry is kept so data is never silently lost.
   */
  async retryJob(dlqJobId: string, options?: RetryOptions): Promise<boolean> {
    try {
      const job = await this.dlqQueue.getJob(dlqJobId);

      if (!job) {
        this.logger.warn(`DLQ job ${dlqJobId} not found`);
        return false;
      }

      const dlqData = job.data;

      this.logger.log(
        `Retrying job ${dlqData.originalJobId} from ${dlqData.originalQueue} (failure count: ${dlqData.failureCount})`,
      );

      // Re-enqueue into the original queue with fresh retry budget
      const targetQueue = this.getOrCreateQueue(dlqData.originalQueue);
      await targetQueue.add(
        `dlq-retry:${dlqData.originalJobId}`,
        dlqData.originalData,
        {
          attempts: options?.maxRetries ?? 3,
          backoff: { type: 'exponential', delay: options?.retryDelay ?? 5000 },
          priority: options?.priority,
          removeOnComplete: { age: 3600, count: 200 },
          removeOnFail: { age: 86400, count: 500 },
        },
      );

      // Store retry attempt for tracking
      await this.cache.set(
        `retry:${dlqData.originalJobId}`,
        {
          retriedAt: new Date().toISOString(),
          retriedFrom: dlqJobId,
          options,
        },
        {
          namespace: CacheNamespace.WEBHOOK_NONCE,
          ttl: 3600,
        },
      );

      // Only remove from DLQ after successful re-enqueue
      await job.remove();

      this.logger.log(`Successfully retried job ${dlqJobId} → ${dlqData.originalQueue}`);
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Failed to retry job ${dlqJobId}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Get or create a transient BullMQ Queue handle for re-enqueuing.
   * Uses the shared Redis connection so no new connections are opened.
   */
  private readonly transientQueues = new Map<string, Queue>();

  private getOrCreateQueue(queueName: string): Queue {
    let q = this.transientQueues.get(queueName);
    if (!q) {
      q = new Queue(queueName, { connection: this.redisConnection });
      this.transientQueues.set(queueName, q);
    }
    return q;
  }

  /**
   * Bulk retry failed jobs
   *
   * Retries multiple jobs from the DLQ.
   */
  async retryBulk(jobIds: string[], options?: RetryOptions): Promise<number> {
    let successCount = 0;

    for (const jobId of jobIds) {
      const success = await this.retryJob(jobId, options);
      if (success) {
        successCount++;
      }
    }

    this.logger.log(`Bulk retry: ${successCount}/${jobIds.length} jobs retried successfully`);
    return successCount;
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<DLQStats> {
    const jobs = await this.dlqQueue.getJobs(['waiting', 'active', 'completed'], 0, 1000);

    const byQueue: Record<string, number> = {};
    const byErrorType: Record<string, number> = {};
    const recentFailures: DLQStats['recentFailures'] = [];
    let oldestFailure: DLQStats['oldestFailure'] = null;

    for (const job of jobs) {
      const data = job.data;

      // Count by queue
      byQueue[data.originalQueue] = (byQueue[data.originalQueue] || 0) + 1;

      // Count by error type (extract error type from message)
      const errorType = this.extractErrorType(data.lastError);
      byErrorType[errorType] = (byErrorType[errorType] || 0) + 1;

      // Track recent failures (last 10)
      // Note: failedAt may be Date or string after Redis deserialization
      const failedAtStr = this.toISOString(data.failedAt);
      if (recentFailures.length < 10) {
        recentFailures.push({
          jobId: data.originalJobId,
          queue: data.originalQueue,
          failedAt: failedAtStr,
          error: data.lastError,
        });
      }

      // Track oldest failure
      const failedAtDate = new Date(data.failedAt);
      if (!oldestFailure || failedAtDate < new Date(oldestFailure.failedAt)) {
        oldestFailure = {
          jobId: data.originalJobId,
          failedAt: failedAtStr,
        };
      }
    }

    return {
      totalFailed: jobs.length,
      byQueue,
      byErrorType,
      recentFailures,
      oldestFailure,
    };
  }

  /**
   * Get jobs from DLQ with filtering
   */
  async getJobs(options: {
    queue?: string;
    errorType?: string;
    limit?: number;
    offset?: number;
  }): Promise<(DLQJobData & { dlqJobId: string })[]> {
    const { queue, errorType, limit = 50, offset = 0 } = options;

    const jobs = await this.dlqQueue.getJobs(['waiting', 'active', 'completed'], 0, limit + offset);

    let filtered = jobs.map((job) => ({ ...job.data, dlqJobId: job.id ?? '' }));

    // Filter by queue
    if (queue) {
      filtered = filtered.filter((data) => data.originalQueue === queue);
    }

    // Filter by error type
    if (errorType) {
      filtered = filtered.filter((data) => this.extractErrorType(data.lastError) === errorType);
    }

    // Apply pagination
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Clean old failures from DLQ
   *
   * Removes jobs older than specified days.
   */
  async cleanOldFailures(olderThanDays?: number): Promise<number> {
    const retentionDays = olderThanDays || this.DLQ_RETENTION_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const jobs = await this.dlqQueue.getJobs(['completed', 'waiting'], 0, 200);
    let removedCount = 0;

    for (const job of jobs) {
      const failedAt = new Date(job.data.failedAt);
      if (failedAt < cutoffDate) {
        await job.remove();
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.log(`Cleaned ${removedCount} old DLQ jobs older than ${retentionDays} days`);
    }

    return removedCount;
  }

  /**
   * Remove specific job from DLQ
   */
  async removeJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.dlqQueue.getJob(jobId);
      if (!job) {
        return false;
      }

      await job.remove();
      this.logger.log(`Removed job ${jobId} from DLQ`);
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Failed to remove job ${jobId} from DLQ: ${error.message}`);
      return false;
    }
  }

  /**
   * Get job details from DLQ
   */
  async getJob(jobId: string): Promise<DLQJobData | null> {
    const job = await this.dlqQueue.getJob(jobId);
    return job ? job.data : null;
  }

  /**
   * Track failure for analytics
   */
  private async trackFailure(queue: string, error: string): Promise<void> {
    const errorType = this.extractErrorType(error);

    // Increment counters in cache
    await Promise.all([
      this.cache.incr(`dlq:total`, { namespace: CacheNamespace.RATE_LIMIT }),
      this.cache.incr(`dlq:queue:${queue}`, { namespace: CacheNamespace.RATE_LIMIT }),
      this.cache.incr(`dlq:error:${errorType}`, { namespace: CacheNamespace.RATE_LIMIT }),
    ]);
  }

  /**
   * Increment total failure count
   */
  private async incrementFailureCount(): Promise<void> {
    await this.cache.incr('dlq:total:count', {
      namespace: CacheNamespace.RATE_LIMIT,
    });
  }

  /**
   * Extract error type from error message
   */
  private extractErrorType(errorMessage: string): string {
    // Common error patterns
    const patterns = [
      { regex: /timeout/i, type: 'Timeout' },
      { regex: /network|ECONNREFUSED|ENOTFOUND/i, type: 'Network' },
      { regex: /unauthorized|authentication|401/i, type: 'Authentication' },
      { regex: /forbidden|403/i, type: 'Authorization' },
      { regex: /not found|404/i, type: 'NotFound' },
      { regex: /rate limit|429/i, type: 'RateLimit' },
      { regex: /validation|invalid/i, type: 'Validation' },
      { regex: /database|sql|prisma/i, type: 'Database' },
      { regex: /redis/i, type: 'Redis' },
    ];

    for (const { regex, type } of patterns) {
      if (regex.test(errorMessage)) {
        return type;
      }
    }

    return 'Unknown';
  }

  /**
   * Safely convert Date or string to ISO string
   * Handles Redis deserialization where Date becomes string
   */
  private toISOString(value: Date | string): string {
    if (typeof value === 'string') {
      return value; // Already a string (from Redis JSON)
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    // Fallback: try to create Date from value
    return new Date(value).toISOString();
  }

  /**
   * Check if failure rate exceeds alert thresholds
   */
  private async checkAlertThresholds(queue: string): Promise<void> {
    const failureCount = await this.cache.get<number>(`dlq:queue:${queue}`, {
      namespace: CacheNamespace.RATE_LIMIT,
    });

    const threshold = this.config.get<number>('DLQ_ALERT_THRESHOLD', 10);

    if (failureCount && failureCount >= threshold) {
      this.logger.error(
        `⚠️ ALERT: Queue ${queue} has ${failureCount} failures in DLQ (threshold: ${threshold})`,
      );

      // DEBT: Integrate with alerting service (email, Slack, PagerDuty) - tracked in BUG-034
      // await this.alertingService.send({
      //   severity: 'high',
      //   message: `Queue ${queue} has ${failureCount} failures`,
      //   queue,
      //   failureCount,
      // });
    }
  }

  /**
   * Schedule periodic cleanup
   * Uses .unref() to prevent keeping event loop alive during shutdown
   */
  private scheduleCleanup(): void {
    const cleanupInterval = this.config.get<number>('DLQ_CLEANUP_INTERVAL_MS') ?? 86400000; // 24 hours

    this.cleanupTimer = setInterval(() => {
      void this.performCleanup();
    }, cleanupInterval);

    // Don't keep event loop alive just for cleanup
    this.cleanupTimer.unref();

    this.logger.log(
      `Scheduled DLQ cleanup every ${cleanupInterval / 1000 / 60 / 60} hours`,
    );
  }

  /**
   * Perform cleanup (async wrapper for scheduled task)
   */
  private async performCleanup(): Promise<void> {
    try {
      await this.cleanOldFailures();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`DLQ cleanup failed: ${error.message}`, error.stack);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Closing DLQ connections...');
    try {
      // Clear cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }

      // Close queue events safely
      try {
        await this.queueEvents.close();
      } catch (error) {
        this.logger.debug(
          `DLQ QueueEvents close skipped: ${error instanceof Error ? error.message : error}`,
        );
      }

      // Close DLQ queue safely
      try {
        await this.dlqQueue.close();
      } catch (error) {
        this.logger.debug(
          `DLQ queue close skipped: ${error instanceof Error ? error.message : error}`,
        );
      }

      // Close transient retry queues
      for (const [name, q] of this.transientQueues) {
        try {
          await q.close();
        } catch (error) {
          this.logger.debug(`Transient queue ${name} close skipped: ${error instanceof Error ? error.message : error}`);
        }
      }
      this.transientQueues.clear();

      // Release shared Redis connection reference (AUDIT-03)
      // Connection only closes when all references are released
      releaseSharedRedisConnection();
    } catch (outerError) {
      this.logger.warn(
        `DeadLetterQueueService shutdown encountered an error (swallowed): ${
          outerError instanceof Error ? outerError.message : outerError
        }`,
      );
    } finally {
      this.logger.log('DLQ connections closed');
    }
  }
}
