/**
 * BullMQ-based Scheduled Jobs Queue
 *
 * Replaces @Cron decorators with BullMQ repeatable jobs for horizontal scaling.
 * Only one instance processes each scheduled job at a time (BullMQ guarantees this).
 *
 * Benefits over @Cron:
 * - Single execution across multiple instances (no distributed lock needed)
 * - Job persistence and retry on failure
 * - Visibility into job status via BullMQ dashboard
 * - Graceful handling of long-running jobs
 *
 * @see MVP_COMPLETION_ROADMAP.md Section 11.6
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../config/queue.config';

/**
 * Scheduled job types - each maps to a specific handler
 */
export enum ScheduledJobType {
  // Email sync jobs
  SYNC_SCHEDULER = 'sync-scheduler',

  // Webhook lifecycle jobs
  WEBHOOK_RENEWAL = 'webhook-renewal',
  WEBHOOK_DEEP_CHECK = 'webhook-deep-check',
  WEBHOOK_CLEANUP = 'webhook-cleanup',

  // Email processing jobs
  SCHEDULED_EMAIL_PROCESS = 'scheduled-email-process',
  SCHEDULED_EMAIL_CLEANUP = 'scheduled-email-cleanup',

  // Email cleanup/retention jobs
  EMAIL_CLEANUP_TRASH = 'email-cleanup-trash',
  EMAIL_CLEANUP_ORPHANS = 'email-cleanup-orphans',
  EMAIL_RETENTION = 'email-retention',

  // AI/Embedding jobs
  EMAIL_EMBEDDING_CLEANUP = 'email-embedding-cleanup',

  // Log rotation
  LOG_ROTATION = 'log-rotation',
}

/**
 * Cron patterns for scheduled jobs
 */
export const SCHEDULED_JOB_PATTERNS = {
  [ScheduledJobType.SYNC_SCHEDULER]: '*/5 * * * *', // Every 5 minutes
  [ScheduledJobType.WEBHOOK_RENEWAL]: '0 2 * * *', // Daily at 2 AM
  [ScheduledJobType.WEBHOOK_DEEP_CHECK]: '0 3 * * *', // Daily at 3 AM
  [ScheduledJobType.WEBHOOK_CLEANUP]: '0 4 * * 0', // Weekly on Sunday at 4 AM
  [ScheduledJobType.SCHEDULED_EMAIL_PROCESS]: '* * * * *', // Every minute
  [ScheduledJobType.SCHEDULED_EMAIL_CLEANUP]: '0 0 * * *', // Daily at midnight
  [ScheduledJobType.EMAIL_CLEANUP_TRASH]: '0 3,12 * * *', // 3 AM and 12 PM
  [ScheduledJobType.EMAIL_CLEANUP_ORPHANS]: '30 3 * * *', // 3:30 AM
  [ScheduledJobType.EMAIL_RETENTION]: '0 2 * * *', // Daily at 2 AM
  [ScheduledJobType.EMAIL_EMBEDDING_CLEANUP]: '*/30 * * * *', // Every 30 minutes
  [ScheduledJobType.LOG_ROTATION]: '0 0 * * *', // Daily at midnight
};

export interface ScheduledJobData {
  jobType: ScheduledJobType;
  triggeredAt: string;
}

export type ScheduledJobHandler = (job: Job<ScheduledJobData>) => Promise<void>;

@Injectable()
export class ScheduledJobsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledJobsQueueService.name);
  private redisConnection: Redis;
  private queue: Queue<ScheduledJobData>;
  private worker: Worker<ScheduledJobData>;

  private readonly handlers = new Map<ScheduledJobType, ScheduledJobHandler>();
  private isInitialized = false;

  async onModuleInit() {
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    // Create queue for scheduled jobs
    this.queue = new Queue<ScheduledJobData>(QUEUE_NAMES.SYNC_SCHEDULER, {
      connection: this.redisConnection,
      defaultJobOptions: {
        ...getDefaultJobOptions('SCHEDULED'),
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    });

    // Create worker to process scheduled jobs
    this.worker = new Worker<ScheduledJobData>(
      QUEUE_NAMES.SYNC_SCHEDULER,
      async (job) => this.processJob(job),
      {
        connection: new Redis(redisOptions),
        concurrency: 1, // Process one scheduled job at a time
        lockDuration: 300000, // 5 minute lock (for long-running jobs)
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Scheduled job ${job?.data.jobType} failed: ${err.message}`,
        err.stack,
      );
    });

    this.worker.on('completed', (job) => {
      this.logger.debug(`Scheduled job ${job.data.jobType} completed`);
    });

    this.isInitialized = true;
    this.logger.log('ScheduledJobsQueueService initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.redisConnection?.quit();
  }

  /**
   * Register a handler for a scheduled job type
   * Call this from the service that implements the job logic
   */
  registerHandler(jobType: ScheduledJobType, handler: ScheduledJobHandler): void {
    if (this.handlers.has(jobType)) {
      this.logger.warn(`Handler for ${jobType} already registered, replacing...`);
    }
    this.handlers.set(jobType, handler);
    this.logger.debug(`Registered handler for ${jobType}`);
  }

  /**
   * Initialize all repeatable jobs
   * Call this once during app startup after all handlers are registered
   */
  async initializeRepeatableJobs(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ScheduledJobsQueueService not initialized');
    }

    // Remove existing repeatable jobs to avoid duplicates
    const existingJobs = await this.queue.getRepeatableJobs();
    for (const job of existingJobs) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    // Add repeatable jobs for each registered handler
    for (const [jobType, _handler] of this.handlers) {
      const pattern = SCHEDULED_JOB_PATTERNS[jobType];
      if (!pattern) {
        this.logger.warn(`No cron pattern defined for ${jobType}, skipping...`);
        continue;
      }

      await this.queue.add(
        jobType,
        { jobType, triggeredAt: new Date().toISOString() },
        {
          repeat: { pattern },
          jobId: `scheduled-${jobType}`,
        },
      );

      this.logger.log(`Registered repeatable job: ${jobType} (${pattern})`);
    }
  }

  /**
   * Manually trigger a scheduled job (for testing/admin)
   */
  async triggerJob(jobType: ScheduledJobType): Promise<string> {
    const job = await this.queue.add(
      jobType,
      { jobType, triggeredAt: new Date().toISOString() },
      { jobId: `manual-${jobType}-${Date.now()}` },
    );
    return job.id || 'unknown';
  }

  /**
   * Process a scheduled job
   */
  private async processJob(job: Job<ScheduledJobData>): Promise<void> {
    const { jobType } = job.data;
    const handler = this.handlers.get(jobType);

    if (!handler) {
      this.logger.warn(`No handler registered for job type: ${jobType}`);
      return;
    }

    this.logger.log(`Processing scheduled job: ${jobType}`);
    const startTime = Date.now();

    try {
      await handler(job);
      const duration = Date.now() - startTime;
      this.logger.log(`Scheduled job ${jobType} completed in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scheduled job ${jobType} failed after ${duration}ms: ${message}`);
      throw error; // Re-throw to trigger BullMQ retry
    }
  }

  /**
   * Get status of all repeatable jobs
   */
  async getRepeatableJobsStatus(): Promise<Array<{
    jobType: string;
    pattern: string;
    nextRun: Date | null;
  }>> {
    const jobs = await this.queue.getRepeatableJobs();
    return jobs.map((job) => ({
      jobType: job.name,
      pattern: job.pattern || 'unknown',
      nextRun: job.next ? new Date(job.next) : null,
    }));
  }
}
