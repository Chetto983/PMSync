import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config';

export interface ContactsSyncJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft';
  email: string;
  priority: 'high' | 'normal' | 'low';
  lastSyncedAt?: Date;
}

export interface ContactsSyncJobResult {
  success: boolean;
  providerId: string;
  contactsProcessed: number;
  newContacts: number;
  updatedContacts: number;
  syncDuration: number;
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

@Injectable()
export class ContactsSyncQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactsSyncQueueService.name);
  private redisConnection: Redis;

  public highQueue: Queue<ContactsSyncJobData>;
  public normalQueue: Queue<ContactsSyncJobData>;
  public lowQueue: Queue<ContactsSyncJobData>;

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

  constructor() {}

  async onModuleInit() {
    // Initialize Redis connection using centralized config
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.logger.log(
      `Connecting to Redis for contacts sync at ${redisOptions.host}:${redisOptions.port}`,
    );

    // Get centralized job defaults for contacts sync
    const jobDefaults = getDefaultJobOptions('CONTACTS_SYNC');

    // Initialize HIGH priority queue
    this.highQueue = new Queue<ContactsSyncJobData>(QUEUE_NAMES.CONTACTS_SYNC_HIGH, {
      connection: this.redisConnection,
      defaultJobOptions: jobDefaults,
    });

    // Initialize NORMAL priority queue
    this.normalQueue = new Queue<ContactsSyncJobData>(QUEUE_NAMES.CONTACTS_SYNC_NORMAL, {
      connection: this.redisConnection,
      defaultJobOptions: jobDefaults,
    });

    // Initialize LOW priority queue
    this.lowQueue = new Queue<ContactsSyncJobData>(QUEUE_NAMES.CONTACTS_SYNC_LOW, {
      connection: this.redisConnection,
      defaultJobOptions: jobDefaults,
    });

    // Setup queue events for monitoring
    this.setupQueueEvents();

    this.logger.log('Contacts sync queues initialized successfully');
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

    this.logger.log('Queue event listeners attached');
  }

  async onModuleDestroy() {
    this.logger.log('Closing contacts sync queue connections...');
    try {
      // Close queue events safely
      for (const queueEvents of this.queueEvents) {
        try {
          await queueEvents.close();
        } catch (error) {
          this.logger.debug(
            `QueueEvents close skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      // Close queues safely
      for (const queue of [this.highQueue, this.normalQueue, this.lowQueue]) {
        try {
          await queue.close();
        } catch (error) {
          this.logger.debug(
            `Queue close skipped: ${error instanceof Error ? error.message : error}`,
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
        `ContactsSyncQueueService shutdown encountered an error (swallowed): ${
          outerError instanceof Error ? outerError.message : outerError
        }`,
      );
    } finally {
      this.logger.log('Contacts sync queue connections closed');
    }
  }

  /**
   * Add a single sync job to the appropriate queue
   * Uses consistent jobId for deduplication - prevents duplicate jobs for same provider
   */
  async addSyncJob(jobData: ContactsSyncJobData): Promise<void> {
    const queue = this.getQueue(jobData.priority);
    const jobId = `${jobData.providerId}-contacts`;

    // Check if job already exists in any state (waiting, active, delayed)
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (['waiting', 'active', 'delayed'].includes(state)) {
        this.logger.debug(
          `Skipping duplicate contacts sync job for ${jobData.email} (state: ${state})`,
        );
        return;
      }
    }

    await queue.add(`sync-${jobData.providerId}`, jobData, {
      jobId,
    });

    this.logger.debug(`Added contacts sync job for ${jobData.email} to ${jobData.priority} queue`);
  }

  /**
   * Add multiple sync jobs in bulk
   */
  async addBulkSyncJobs(jobs: ContactsSyncJobData[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }

    // Group jobs by priority
    const highPriorityJobs = jobs.filter((j) => j.priority === 'high');
    const normalPriorityJobs = jobs.filter((j) => j.priority === 'normal');
    const lowPriorityJobs = jobs.filter((j) => j.priority === 'low');

    // Add jobs to respective queues in bulk
    const promises: Promise<any>[] = [];

    if (highPriorityJobs.length > 0) {
      promises.push(
        this.highQueue.addBulk(
          highPriorityJobs.map((job) => ({
            name: `sync-${job.providerId}`,
            data: job,
            opts: {
              jobId: `${job.providerId}-contacts`,
            },
          })),
        ),
      );
    }

    if (normalPriorityJobs.length > 0) {
      promises.push(
        this.normalQueue.addBulk(
          normalPriorityJobs.map((job) => ({
            name: `sync-${job.providerId}`,
            data: job,
            opts: {
              jobId: `${job.providerId}-contacts`,
            },
          })),
        ),
      );
    }

    if (lowPriorityJobs.length > 0) {
      promises.push(
        this.lowQueue.addBulk(
          lowPriorityJobs.map((job) => ({
            name: `sync-${job.providerId}`,
            data: job,
            opts: {
              jobId: `${job.providerId}-contacts`,
            },
          })),
        ),
      );
    }

    await Promise.all(promises);

    this.logger.log(
      `Added ${jobs.length} contacts sync jobs (High: ${highPriorityJobs.length}, Normal: ${normalPriorityJobs.length}, Low: ${lowPriorityJobs.length})`,
    );
  }

  /**
   * Get queue by priority
   */
  private getQueue(priority: QueuePriority): Queue<ContactsSyncJobData> {
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
