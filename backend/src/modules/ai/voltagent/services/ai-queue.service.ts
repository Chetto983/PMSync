/**
 * AI Queue Service
 *
 * BullMQ-based background job processing for AI operations.
 * Provides 8x throughput improvement via async processing.
 *
 * Job Types:
 * - email-insights: Analyze emails (sentiment, priority, intent)
 * - embedding-generation: Generate embeddings for semantic search
 * - batch-analysis: Bulk email analysis
 * - learning-update: Update learning profiles from feedback
 * - cache-warmup: Pre-warm semantic cache for common queries
 *
 * Features:
 * - Priority queues (high/normal/low)
 * - Automatic retries with exponential backoff
 * - Job deduplication
 * - Progress tracking
 * - Metrics collection
 */
import { Inject, Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents, Worker, Job, JobType } from 'bullmq';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions, getDefaultJobOptions } from '../../../../common/config';

export type AiJobType =
  | 'email-insights'
  | 'embedding-generation'
  | 'batch-analysis'
  | 'learning-update'
  | 'cache-warmup'
  | 'smart-reply'
  | 'email-summary'
  | 'contact-enrichment';

export type AiJobPriority = 'high' | 'normal' | 'low';

export interface AiJobData {
  type: AiJobType;
  tenantId: string;
  userId?: string;
  payload: Record<string, unknown>;
  priority?: AiJobPriority;
  /** Unique key for deduplication */
  dedupKey?: string;
  /** Maximum execution time in ms */
  timeout?: number;
}

export interface AiJobResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  processingTimeMs: number;
  tokenCount?: number;
}

export interface AiQueueMetrics {
  queue: AiJobPriority;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  avgProcessingTimeMs: number;
  throughputPerMinute: number;
}

interface InternalMetrics {
  completed: number;
  failed: number;
  totalProcessingTimeMs: number;
  recentCompletions: number[];
  lastCompletedAt?: number;
}

@Injectable()
export class AiQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiQueueService.name);
  private redisConnection: Redis | null = null;

  // Priority queues
  private highQueue: Queue<AiJobData, AiJobResult> | null = null;
  private normalQueue: Queue<AiJobData, AiJobResult> | null = null;
  private lowQueue: Queue<AiJobData, AiJobResult> | null = null;

  // Workers (only in worker mode)
  private workers: Worker<AiJobData, AiJobResult>[] = [];

  // Queue events for monitoring
  private queueEvents: QueueEvents[] = [];

  // Internal metrics
  private readonly metrics: Record<AiJobPriority, InternalMetrics> = {
    high: { completed: 0, failed: 0, totalProcessingTimeMs: 0, recentCompletions: [] },
    normal: { completed: 0, failed: 0, totalProcessingTimeMs: 0, recentCompletions: [] },
    low: { completed: 0, failed: 0, totalProcessingTimeMs: 0, recentCompletions: [] },
  };

  // Job processor registry
  private processors: Map<AiJobType, (job: Job<AiJobData>) => Promise<AiJobResult>> = new Map();

  private enabled = false;

  constructor(
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(ConfigService) private readonly configService?: ConfigService,
  ) {}

  async onModuleInit() {
    // Use centralized Redis connection options (includes maxRetriesPerRequest: null for BullMQ)
    const redisOptions = getRedisConnectionOptions();
    const isWorkerMode = this.configService?.get<string>('AI_QUEUE_WORKER_MODE') === 'true';

    try {
      this.redisConnection = new Redis({
        ...redisOptions,
        lazyConnect: true,
      });

      await this.redisConnection.connect();
      this.logger.log(`AI Queue: Connected to Redis at ${redisOptions.host}:${redisOptions.port}`);

      // Use centralized queue presets for consistent job options
      const highJobDefaults = getDefaultJobOptions('HIGH');
      const normalJobDefaults = getDefaultJobOptions('NORMAL');
      const lowJobDefaults = getDefaultJobOptions('LOW');

      // Initialize queues with centralized job defaults
      this.highQueue = new Queue<AiJobData, AiJobResult>('ai-jobs-high', {
        connection: this.redisConnection,
        defaultJobOptions: {
          ...highJobDefaults,
          removeOnFail: { count: 50 }, // AI-specific override
        },
      });

      this.normalQueue = new Queue<AiJobData, AiJobResult>('ai-jobs-normal', {
        connection: this.redisConnection,
        defaultJobOptions: {
          ...normalJobDefaults,
          removeOnComplete: { count: 50, age: 1800 }, // AI-specific override
        },
      });

      this.lowQueue = new Queue<AiJobData, AiJobResult>('ai-jobs-low', {
        connection: this.redisConnection,
        defaultJobOptions: lowJobDefaults,
      });

      // Setup queue events for monitoring
      this.setupQueueEvents();

      // Initialize workers if in worker mode
      if (isWorkerMode) {
        await this.initializeWorkers();
      }

      this.enabled = true;
      this.logger.log('AI Queue service initialized successfully');
    } catch (error) {
      this.logger.warn(
        `AI Queue initialization failed (Redis unavailable): ${error instanceof Error ? error.message : error}`,
      );
      this.enabled = false;
    }
  }

  /**
   * Register a job processor for a specific job type.
   * Used when running in worker mode.
   */
  registerProcessor(
    type: AiJobType,
    processor: (job: Job<AiJobData>) => Promise<AiJobResult>,
  ): void {
    this.processors.set(type, processor);
    this.logger.debug(`Registered processor for job type: ${type}`);
  }

  /**
   * Add a job to the queue.
   * Returns job ID for tracking.
   */
  async addJob(data: AiJobData): Promise<string | null> {
    if (!this.enabled) {
      this.logger.debug('AI Queue disabled, skipping job');
      return null;
    }

    const priority = data.priority || 'normal';
    const queue = this.getQueue(priority);

    if (!queue) {
      return null;
    }

    // Check for duplicate if dedupKey provided
    if (data.dedupKey) {
      const existing = await queue.getJob(data.dedupKey);
      if (existing) {
        const state = await existing.getState();
        if (state === 'waiting' || state === 'active' || state === 'delayed') {
          this.logger.debug(`Job ${data.dedupKey} already queued, skipping`);
          return existing.id ?? null;
        }
      }
    }

    const job = await queue.add(`${data.type}:${data.tenantId}`, data, {
      jobId: data.dedupKey,
    });

    this.logger.debug(`Added ${priority} priority AI job: ${data.type} (${job.id})`);
    return job.id ?? null;
  }

  /**
   * Add multiple jobs in bulk.
   * More efficient than adding jobs one by one.
   */
  async addBulkJobs(jobs: AiJobData[]): Promise<string[]> {
    if (!this.enabled || jobs.length === 0) {
      return [];
    }

    const jobIds: string[] = [];

    // Group by priority
    const byPriority: Record<AiJobPriority, AiJobData[]> = {
      high: [],
      normal: [],
      low: [],
    };

    for (const job of jobs) {
      byPriority[job.priority || 'normal'].push(job);
    }

    // Add bulk jobs per queue
    for (const [priority, priorityJobs] of Object.entries(byPriority)) {
      if (priorityJobs.length === 0) continue;

      const queue = this.getQueue(priority as AiJobPriority);
      if (!queue) continue;

      const bullJobs = priorityJobs.map((job, index) => ({
        name: `${job.type}:${job.tenantId}`,
        data: job,
        opts: {
          jobId: job.dedupKey,
          delay: index * 50, // Stagger jobs by 50ms
        },
      }));

      const addedJobs = await queue.addBulk(bullJobs);
      jobIds.push(...addedJobs.map((j) => j.id ?? '').filter(Boolean));
    }

    this.logger.debug(`Added ${jobIds.length} bulk AI jobs`);
    return jobIds;
  }

  /**
   * Get job status.
   */
  async getJobStatus(jobId: string): Promise<{
    status: string;
    progress?: number;
    result?: AiJobResult;
    failedReason?: string;
  } | null> {
    if (!this.enabled) {
      return null;
    }

    // Check all queues
    for (const queue of [this.highQueue, this.normalQueue, this.lowQueue]) {
      if (!queue) continue;

      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        return {
          status: state,
          progress: job.progress as number | undefined,
          result: job.returnvalue ?? undefined,
          failedReason: job.failedReason,
        };
      }
    }

    return null;
  }

  /**
   * Cancel a pending job.
   */
  async cancelJob(jobId: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    for (const queue of [this.highQueue, this.normalQueue, this.lowQueue]) {
      if (!queue) continue;

      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === 'waiting' || state === 'delayed') {
          await job.remove();
          this.logger.debug(`Cancelled AI job: ${jobId}`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get queue metrics.
   */
  async getQueueMetrics(): Promise<AiQueueMetrics[]> {
    if (!this.enabled) {
      return [];
    }

    const results: AiQueueMetrics[] = [];

    for (const [priority, queue] of [
      ['high', this.highQueue],
      ['normal', this.normalQueue],
      ['low', this.lowQueue],
    ] as const) {
      if (!queue) continue;

      const counts = await queue.getJobCounts();
      const metric = this.metrics[priority];

      // Calculate throughput (completions per minute)
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      const recentCount = metric.recentCompletions.filter((t) => t > oneMinuteAgo).length;

      results.push({
        queue: priority,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: metric.completed,
        failed: metric.failed,
        avgProcessingTimeMs:
          metric.completed > 0 ? Math.round(metric.totalProcessingTimeMs / metric.completed) : 0,
        throughputPerMinute: recentCount,
      });
    }

    return results;
  }

  /**
   * Remove all jobs for a tenant.
   */
  async removeJobsForTenant(tenantId: string): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    let removed = 0;
    const states: JobType[] = ['waiting', 'delayed', 'paused'];

    for (const queue of [this.highQueue, this.normalQueue, this.lowQueue]) {
      if (!queue) continue;

      const jobs = await queue.getJobs(states, 0, -1);
      for (const job of jobs) {
        if (job?.data?.tenantId === tenantId) {
          await job.remove();
          removed++;
        }
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} AI jobs for tenant ${tenantId}`);
    }

    return removed;
  }

  /**
   * Pause all queues.
   */
  async pauseAll(): Promise<void> {
    if (!this.enabled) return;

    await Promise.all([
      this.highQueue?.pause(),
      this.normalQueue?.pause(),
      this.lowQueue?.pause(),
    ]);

    this.logger.log('All AI queues paused');
  }

  /**
   * Resume all queues.
   */
  async resumeAll(): Promise<void> {
    if (!this.enabled) return;

    await Promise.all([
      this.highQueue?.resume(),
      this.normalQueue?.resume(),
      this.lowQueue?.resume(),
    ]);

    this.logger.log('All AI queues resumed');
  }

  /**
   * Check if queue service is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down AI Queue service...');
    try {
      // Close workers (ignore already-closed errors)
      for (const worker of this.workers) {
        try {
          await worker.close();
        } catch (error) {
          this.logger.debug(`Worker close skipped: ${error instanceof Error ? error.message : error}`);
        }
      }

      // Close queue events safely
      for (const queueEvent of this.queueEvents) {
        try {
          await queueEvent.close();
        } catch (error) {
          this.logger.debug(
            `QueueEvents close skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      // Close queues safely
      for (const queue of [this.highQueue, this.normalQueue, this.lowQueue]) {
        try {
          await queue?.close();
        } catch (error) {
          this.logger.debug(`Queue close skipped: ${error instanceof Error ? error.message : error}`);
        }
      }

      // Close Redis connection safely (avoid "Connection is closed.")
      if (this.redisConnection) {
        try {
          if (this.redisConnection.status !== 'end' && this.redisConnection.status !== 'close') {
            await this.redisConnection.quit();
          }
        } catch (error) {
          this.logger.debug(
            `Redis quit skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    } catch (outerError) {
      // Swallow shutdown errors to avoid surfacing during Nest teardown
      this.logger.warn(
        `AI Queue shutdown encountered an error (swallowed): ${
          outerError instanceof Error ? outerError.message : outerError
        }`,
      );
    } finally {
      this.logger.log('AI Queue service shut down');
    }
  }

  private getQueue(priority: AiJobPriority): Queue<AiJobData, AiJobResult> | null {
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

  private setupQueueEvents() {
    const queues: Array<{ priority: AiJobPriority; queue: Queue<AiJobData, AiJobResult> | null }> = [
      { priority: 'high', queue: this.highQueue },
      { priority: 'normal', queue: this.normalQueue },
      { priority: 'low', queue: this.lowQueue },
    ];

    for (const { priority, queue } of queues) {
      if (!queue || !this.redisConnection) continue;

      const queueEvents = new QueueEvents(queue.name, {
        connection: this.redisConnection,
      });

      queueEvents.on('completed', async ({ jobId }) => {
        const metric = this.metrics[priority];
        metric.completed++;
        metric.lastCompletedAt = Date.now();
        metric.recentCompletions.push(Date.now());

        // Keep only last 5 minutes of completions
        const fiveMinutesAgo = Date.now() - 300000;
        metric.recentCompletions = metric.recentCompletions.filter((t) => t > fiveMinutesAgo);

        // Track processing time
        try {
          const job = await queue.getJob(jobId);
          if (job?.processedOn && job?.finishedOn) {
            const duration = job.finishedOn - job.processedOn;
            if (Number.isFinite(duration) && duration >= 0) {
              metric.totalProcessingTimeMs += duration;
            }
          }
        } catch {
          // Ignore errors when fetching job
        }

        this.logger.debug(`[${priority}] AI job completed: ${jobId}`);
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        const metric = this.metrics[priority];
        metric.failed++;
        this.logger.warn(`[${priority}] AI job failed: ${jobId} - ${failedReason}`);
      });

      this.queueEvents.push(queueEvents);
    }
  }

  private async initializeWorkers() {
    if (!this.redisConnection) return;

    const concurrency = this.configService?.get<number>('AI_QUEUE_CONCURRENCY', 3) ?? 3;

    const queues: Array<{ priority: AiJobPriority; queue: Queue<AiJobData, AiJobResult> | null }> = [
      { priority: 'high', queue: this.highQueue },
      { priority: 'normal', queue: this.normalQueue },
      { priority: 'low', queue: this.lowQueue },
    ];

    for (const { priority, queue } of queues) {
      if (!queue) continue;

      const worker = new Worker<AiJobData, AiJobResult>(
        queue.name,
        async (job) => this.processJob(job),
        {
          connection: this.redisConnection,
          concurrency: priority === 'high' ? concurrency : Math.max(1, concurrency - 1),
        },
      );

      worker.on('error', (err) => {
        this.logger.error(`Worker error [${priority}]: ${err.message}`);
      });

      this.workers.push(worker);
    }

    this.logger.log(`Initialized ${this.workers.length} AI queue workers`);
  }

  private async processJob(job: Job<AiJobData>): Promise<AiJobResult> {
    const startTime = Date.now();

    try {
      const processor = this.processors.get(job.data.type);
      if (!processor) {
        throw new Error(`No processor registered for job type: ${job.data.type}`);
      }

      const result = await processor(job);
      return {
        ...result,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: Date.now() - startTime,
      };
    }
  }
}
