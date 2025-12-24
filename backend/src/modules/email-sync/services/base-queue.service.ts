/**
 * BaseQueueService
 *
 * Abstract base class for BullMQ queue services.
 * Extracts common boilerplate patterns:
 * - Redis connection management
 * - Queue and QueueEvents initialization
 * - Lifecycle management (onModuleInit, onModuleDestroy)
 * - Pause/resume operations
 * - Metrics tracking
 * - Dead letter queue integration
 *
 * CONSOLIDATION DC-5: Queue service boilerplate reduction
 * Before: ~200 lines duplicated across 4 queue services
 * After: Shared base class with ~150 lines, subclasses focus on business logic
 *
 * Subclasses must implement:
 * - getQueueName(): Return the queue name constant
 * - getJobDefaults(): Return job-specific default options
 * - setupCustomEvents(): Set up queue-specific event handlers
 */
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueEvents, JobType, Job, JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionOptions, getDefaultJobOptions } from '../../../common/config';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';

/**
 * Priority level for job defaults
 */
export type QueuePriority = 'HIGH' | 'NORMAL' | 'LOW';

/**
 * Base metrics tracked by all queues
 */
export interface BaseQueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/**
 * Common internal metrics
 */
export interface InternalQueueMetrics {
  completed: number;
  failed: number;
  totalDurationMs: number;
  lastError?: string;
}

/**
 * Abstract base class for queue services
 */
export abstract class BaseQueueService<TJobData, TJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger: Logger;
  protected redisConnection: Redis;
  protected queue: Queue<TJobData, TJobResult>;
  protected queueEvents: QueueEvents;

  protected readonly baseMetrics: InternalQueueMetrics = {
    completed: 0,
    failed: 0,
    totalDurationMs: 0,
  };

  constructor(
    protected readonly configService: ConfigService,
    protected readonly deadLetterQueue?: DeadLetterQueueService,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  // ==================== Abstract Methods ====================

  /**
   * Get the queue name constant (from QUEUE_NAMES)
   */
  protected abstract getQueueName(): string;

  /**
   * Get the priority level for default job options
   */
  protected abstract getQueuePriority(): QueuePriority;

  /**
   * Get additional job default options specific to this queue
   */
  protected abstract getJobDefaultOverrides(): Partial<JobsOptions>;

  /**
   * Set up queue-specific event handlers beyond completed/failed
   */
  protected abstract setupCustomEvents(): void;

  /**
   * Extract metadata for DLQ from a failed job
   */
  protected abstract extractDlqMetadata(jobData: TJobData): Record<string, any>;

  // ==================== Lifecycle Management ====================

  async onModuleInit(): Promise<void> {
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    const queueName = this.getQueueName();
    this.logger.log(`Connecting to Redis for ${queueName} at ${redisOptions.host}:${redisOptions.port}`);

    // Merge base defaults with queue-specific overrides
    const baseDefaults = getDefaultJobOptions(this.getQueuePriority());
    const overrides = this.getJobDefaultOverrides();

    this.queue = new Queue<TJobData, TJobResult>(queueName, {
      connection: this.redisConnection,
      defaultJobOptions: {
        ...baseDefaults,
        ...overrides,
      },
    });

    this.setupQueueEvents();
    this.setupCustomEvents();

    this.logger.log(`${queueName} queue initialized successfully`);
  }

  private setupQueueEvents(): void {
    const queueName = this.getQueueName();

    this.queueEvents = new QueueEvents(queueName, {
      connection: this.redisConnection,
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.logger.debug(`Job ${jobId} completed`);
      this.recordCompletion(jobId).catch((error) => {
        this.logger.debug(
          `Failed to record metrics for job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.warn(`Job ${jobId} failed: ${failedReason}`);
      this.recordFailure(failedReason);

      // Add to DLQ if job exhausted all retries
      this.handlePermanentFailure(jobId, failedReason).catch((err) => {
        this.logger.error(
          `Failed to add job ${jobId} to DLQ: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    const queueName = this.getQueueName();
    this.logger.log(`Closing ${queueName} queue...`);

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
        `${queueName} shutdown error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.logger.log(`${queueName} queue closed`);
    }
  }

  // ==================== Common Operations ====================

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    this.logger.log(`${this.getQueueName()} paused`);
  }

  /**
   * Resume queue processing
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    this.logger.log(`${this.getQueueName()} resumed`);
  }

  /**
   * Get the underlying queue
   */
  getQueue(): Queue<TJobData, TJobResult> {
    return this.queue;
  }

  /**
   * Get base queue metrics
   */
  async getBaseMetrics(): Promise<BaseQueueMetrics> {
    const counts = await this.queue.getJobCounts();
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    };
  }

  /**
   * Get average duration from completed jobs
   */
  protected getAverageDuration(): number {
    return this.baseMetrics.completed > 0
      ? Math.round(this.baseMetrics.totalDurationMs / this.baseMetrics.completed)
      : 0;
  }

  /**
   * Remove all pending jobs for a tenant
   */
  async removeJobsForTenant(tenantId: string): Promise<number> {
    return this.removeJobsByFilter((job) => (job.data as any)?.tenantId === tenantId);
  }

  /**
   * Remove all pending jobs for a provider
   */
  async removeJobsForProvider(providerId: string): Promise<number> {
    return this.removeJobsByFilter((job) => (job.data as any)?.providerId === providerId);
  }

  /**
   * Remove jobs matching a filter function
   */
  protected async removeJobsByFilter(
    filter: (job: Job<TJobData, TJobResult>) => boolean,
  ): Promise<number> {
    const states: JobType[] = ['waiting', 'delayed', 'paused'];
    const jobs = await this.queue.getJobs(states, 0, -1);
    let removed = 0;

    for (const job of jobs) {
      // Cast to typed Job - BullMQ getJobs returns loosely typed array
      const typedJob = job as Job<TJobData, TJobResult> | undefined;
      if (typedJob && filter(typedJob)) {
        await typedJob.remove();
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} pending jobs from ${this.getQueueName()}`);
    }

    return removed;
  }

  // ==================== Metrics Tracking ====================

  protected async recordCompletion(jobId: string): Promise<void> {
    this.baseMetrics.completed++;

    try {
      const job = await this.queue.getJob(jobId);
      if (job?.processedOn != null && job?.finishedOn != null) {
        const duration = job.finishedOn - job.processedOn;
        if (Number.isFinite(duration) && duration >= 0) {
          this.baseMetrics.totalDurationMs += duration;
        }
      }
    } catch {
      // Ignore errors when fetching job metrics
    }
  }

  protected recordFailure(failedReason?: string): void {
    this.baseMetrics.failed++;
    this.baseMetrics.lastError = failedReason;
  }

  /**
   * Handle permanently failed jobs by adding them to the DLQ
   */
  protected async handlePermanentFailure(jobId: string, failedReason?: string): Promise<void> {
    // Skip DLQ if not configured
    if (!this.deadLetterQueue) return;

    const job = await this.queue.getJob(jobId);
    if (!job) return;

    // Check if job has exhausted all retries
    const maxAttempts = job.opts.attempts || 3;
    if (job.attemptsMade < maxAttempts) {
      return; // Job still has retries remaining
    }

    // Add to DLQ with queue-specific metadata
    await this.deadLetterQueue.addToDeadLetter(
      jobId,
      this.getQueueName(),
      job.data,
      new Error(failedReason || 'Unknown error'),
      job.attemptsMade,
      this.extractDlqMetadata(job.data),
    );
  }
}
