import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { getErrorMessage } from '../../../common/utils';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config';
import { CorrelationContext } from '../../../common/services/correlation-context.service';

export interface CalendarSyncJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft';
  email: string;
  priority: 'high' | 'normal' | 'low';
  lastSyncedAt?: Date;
  syncToken?: string;
  /** Correlation ID from the originating HTTP request (undefined for cron/worker-triggered jobs) */
  requestId?: string;
}

export interface CalendarSyncJobResult {
  success: boolean;
  providerId: string;
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  deletedEvents: number;
  syncDuration: number;
  nextSyncToken?: string;
}

type QueuePriority = 'high' | 'normal' | 'low';

export interface QueueMetricsSummary {
  queue: QueuePriority;
  completed: number;
  failed: number;
  lastError?: string;
  lastCompletedAt?: string;
  lastFailedAt?: string;
  averageDurationMs: number;
  lastDurationMs?: number;
}

interface InternalQueueMetrics {
  completed: number;
  failed: number;
  processed: number;
  totalDurationMs: number;
  lastDurationMs?: number;
  lastCompletedAt?: string;
  lastFailedAt?: string;
  lastError?: string;
  lastJobId?: string;
}

/**
 * CalendarSyncQueueService
 *
 * Manages BullMQ queues for calendar sync operations.
 * Provides priority-based queuing for Google and Microsoft calendar syncs.
 *
 * Features:
 * - Three priority queues (high, normal, low)
 * - Automatic retry with exponential backoff
 * - Job deduplication per provider
 * - Metrics tracking
 */
@Injectable()
export class CalendarSyncQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarSyncQueueService.name);
  private redisConnection: Redis;

  public highQueue: Queue<CalendarSyncJobData>;
  public normalQueue: Queue<CalendarSyncJobData>;
  public lowQueue: Queue<CalendarSyncJobData>;

  private queueEvents: QueueEvents[] = [];
  private readonly metrics: Record<QueuePriority, InternalQueueMetrics> = {
    high: {
      completed: 0,
      failed: 0,
      processed: 0,
      totalDurationMs: 0,
    },
    normal: {
      completed: 0,
      failed: 0,
      processed: 0,
      totalDurationMs: 0,
    },
    low: {
      completed: 0,
      failed: 0,
      processed: 0,
      totalDurationMs: 0,
    },
  };

  constructor() { }

  async onModuleInit() {
    // Initialize Redis connection using centralized config
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.logger.log(
      `Connecting to Redis for calendar sync at ${redisOptions.host}:${redisOptions.port}`,
    );

    // Get centralized job defaults for calendar sync
    const jobDefaults = getDefaultJobOptions('CALENDAR_SYNC');

    // Initialize HIGH priority queue
    this.highQueue = new Queue<CalendarSyncJobData>(QUEUE_NAMES.CALENDAR_SYNC_HIGH, {
      connection: this.redisConnection,
      defaultJobOptions: jobDefaults,
    });

    // Initialize NORMAL priority queue
    this.normalQueue = new Queue<CalendarSyncJobData>(QUEUE_NAMES.CALENDAR_SYNC_NORMAL, {
      connection: this.redisConnection,
      defaultJobOptions: jobDefaults,
    });

    // Initialize LOW priority queue
    this.lowQueue = new Queue<CalendarSyncJobData>(QUEUE_NAMES.CALENDAR_SYNC_LOW, {
      connection: this.redisConnection,
      defaultJobOptions: jobDefaults,
    });

    // Setup queue events for monitoring
    this.setupQueueEvents();

    this.logger.log('Calendar sync queues initialized successfully');
  }

  private setupQueueEvents() {
    const queues = [
      { name: 'high', queue: this.highQueue },
      { name: 'normal', queue: this.normalQueue },
      { name: 'low', queue: this.lowQueue },
    ];

    for (const { name, queue } of queues) {
      const queueEvents = new QueueEvents(queue.name, {
        connection: this.redisConnection,
      });

      // Track metrics
      queueEvents.on('completed', ({ jobId, returnvalue }) => {
        const priority = name as QueuePriority;
        this.metrics[priority].completed++;
        this.metrics[priority].processed++;
        this.metrics[priority].lastCompletedAt = new Date().toISOString();
        this.metrics[priority].lastJobId = jobId;

        // returnvalue can be string or object depending on job result
        if (returnvalue && typeof returnvalue === 'object') {
          const result = returnvalue as Record<string, any>;
          if ('syncDuration' in result && typeof result.syncDuration === 'number') {
            this.metrics[priority].lastDurationMs = result.syncDuration;
            this.metrics[priority].totalDurationMs += result.syncDuration;
          }
        }
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        const priority = name as QueuePriority;
        this.metrics[priority].failed++;
        this.metrics[priority].lastFailedAt = new Date().toISOString();
        this.metrics[priority].lastError = failedReason;
        this.metrics[priority].lastJobId = jobId;
      });

      this.queueEvents.push(queueEvents);
    }

    this.logger.log('Calendar queue event listeners attached');
  }

  async onModuleDestroy() {
    this.logger.log('Closing calendar sync queue connections...');
    try {
      // Close queue events safely
      for (const queueEvents of this.queueEvents) {
        try {
          await queueEvents.close();
        } catch (error) {
          this.logger.debug(
            `QueueEvents close skipped: ${getErrorMessage(error)}`,
          );
        }
      }

      // Close queues safely
      for (const queue of [this.highQueue, this.normalQueue, this.lowQueue]) {
        try {
          await queue.close();
        } catch (error) {
          this.logger.debug(
            `Queue close skipped: ${getErrorMessage(error)}`,
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
        `CalendarSyncQueueService shutdown encountered an error (swallowed): ${outerError instanceof Error ? outerError.message : outerError
        }`,
      );
    } finally {
      this.logger.log('Calendar sync queue connections closed');
    }
  }

  /**
   * Add a single sync job to the appropriate queue
   * Uses consistent jobId for deduplication - prevents duplicate jobs for same provider
   * Checks ALL queues for existing jobs to prevent cross-priority duplicates
   */
  async addSyncJob(jobData: CalendarSyncJobData): Promise<void> {
    const queue = this.getQueue(jobData.priority);
    const jobId = `${jobData.providerId}-calendar`;

    // Check if job already exists in ANY queue (waiting, active, delayed)
    // This prevents the same provider from being queued in multiple priorities
    const allQueues = [this.highQueue, this.normalQueue, this.lowQueue];
    for (const q of allQueues) {
      const existingJob = await q.getJob(jobId);
      if (existingJob) {
        const state = await existingJob.getState();
        if (['waiting', 'active', 'delayed'].includes(state)) {
          this.logger.debug(
            `Skipping duplicate calendar sync job for ${jobData.email} (found in ${q.name}, state: ${state})`,
          );
          return;
        }
      }
    }

    await queue.add(`calendar-sync-${jobData.providerId}`, {
      ...jobData,
      requestId: CorrelationContext.getContext()?.correlationId,
    } as CalendarSyncJobData, {
      jobId,
    });

    this.logger.debug(`Added calendar sync job for ${jobData.email} to ${jobData.priority} queue`);
  }

  /**
   * Add multiple sync jobs in bulk
   *
   * RACE CONDITION FIX: Now checks for existing jobs in ALL queues before adding
   * to prevent duplicate jobs across different priority queues.
   */
  async addBulkSyncJobs(jobs: CalendarSyncJobData[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }

    // RACE CONDITION FIX: Filter out jobs that already exist in any queue
    const allQueues = [this.highQueue, this.normalQueue, this.lowQueue];
    const filteredJobs: CalendarSyncJobData[] = [];

    for (const job of jobs) {
      const jobId = `${job.providerId}-calendar`;
      let existsInAnyQueue = false;

      for (const q of allQueues) {
        const existingJob = await q.getJob(jobId);
        if (existingJob) {
          const state = await existingJob.getState();
          if (['waiting', 'active', 'delayed'].includes(state)) {
            existsInAnyQueue = true;
            this.logger.debug(
              `Skipping duplicate bulk calendar sync job for ${job.email} (found in ${q.name}, state: ${state})`,
            );
            break;
          }
        }
      }

      if (!existsInAnyQueue) {
        filteredJobs.push(job);
      }
    }

    if (filteredJobs.length === 0) {
      this.logger.debug('All bulk sync jobs already exist in queues, skipping');
      return;
    }

    // Group jobs by priority
    const highPriorityJobs = filteredJobs.filter((j) => j.priority === 'high');
    const normalPriorityJobs = filteredJobs.filter((j) => j.priority === 'normal');
    const lowPriorityJobs = filteredJobs.filter((j) => j.priority === 'low');

    // Add jobs to respective queues in bulk
    const promises: Promise<any>[] = [];

    if (highPriorityJobs.length > 0) {
      promises.push(
        this.highQueue.addBulk(
          highPriorityJobs.map((job) => ({
            name: `calendar-sync-${job.providerId}`,
            data: job,
            opts: {
              jobId: `${job.providerId}-calendar`,
            },
          })),
        ),
      );
    }

    if (normalPriorityJobs.length > 0) {
      promises.push(
        this.normalQueue.addBulk(
          normalPriorityJobs.map((job) => ({
            name: `calendar-sync-${job.providerId}`,
            data: job,
            opts: {
              jobId: `${job.providerId}-calendar`,
            },
          })),
        ),
      );
    }

    if (lowPriorityJobs.length > 0) {
      promises.push(
        this.lowQueue.addBulk(
          lowPriorityJobs.map((job) => ({
            name: `calendar-sync-${job.providerId}`,
            data: job,
            opts: {
              jobId: `${job.providerId}-calendar`,
            },
          })),
        ),
      );
    }

    await Promise.all(promises);

    this.logger.log(
      `Added ${filteredJobs.length} calendar sync jobs (High: ${highPriorityJobs.length}, Normal: ${normalPriorityJobs.length}, Low: ${lowPriorityJobs.length}), skipped ${jobs.length - filteredJobs.length} duplicates`,
    );
  }

  /**
   * Get queue by priority
   */
  private getQueue(priority: QueuePriority): Queue<CalendarSyncJobData> {
    switch (priority) {
      case 'high':
        return this.highQueue;
      case 'normal':
        return this.normalQueue;
      case 'low':
        return this.lowQueue;
      default:
        return this.normalQueue;
    }
  }

  /**
   * Get queue status and metrics
   */
  async getQueueStatus() {
    const [highCounts, normalCounts, lowCounts] = await Promise.all([
      this.highQueue.getJobCounts(),
      this.normalQueue.getJobCounts(),
      this.lowQueue.getJobCounts(),
    ]);

    return {
      high: {
        ...highCounts,
        metrics: this.getMetricsSummary('high'),
      },
      normal: {
        ...normalCounts,
        metrics: this.getMetricsSummary('normal'),
      },
      low: {
        ...lowCounts,
        metrics: this.getMetricsSummary('low'),
      },
    };
  }

  /**
   * Get metrics summary for a queue
   */
  getMetricsSummary(queue: QueuePriority): QueueMetricsSummary {
    const metrics = this.metrics[queue];
    return {
      queue,
      completed: metrics.completed,
      failed: metrics.failed,
      lastError: metrics.lastError,
      lastCompletedAt: metrics.lastCompletedAt,
      lastFailedAt: metrics.lastFailedAt,
      averageDurationMs:
        metrics.completed > 0 ? Math.round(metrics.totalDurationMs / metrics.completed) : 0,
      lastDurationMs: metrics.lastDurationMs,
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): QueueMetricsSummary[] {
    return [
      this.getMetricsSummary('high'),
      this.getMetricsSummary('normal'),
      this.getMetricsSummary('low'),
    ];
  }
}
