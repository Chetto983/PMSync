import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, QueueEvents, JobType } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { SyncJobData, SyncStatus } from '../interfaces/sync-job.interface';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';

type QueuePriority = 'high' | 'normal' | 'low';

/**
 * CRIT-5 FIX: Queue size limits for backpressure
 * Prevents unbounded queue growth during webhook floods
 */
export interface QueueLimits {
  maxWaiting: number;      // Max jobs in waiting state
  maxDelayed: number;      // Max jobs in delayed state
  maxPerProvider: number;  // Max jobs per provider (prevents single provider from flooding)
}

/**
 * CRIT-5 FIX: Default queue limits per priority level
 */
const DEFAULT_QUEUE_LIMITS: Record<QueuePriority, QueueLimits> = {
  high: {
    maxWaiting: 1000,      // High priority can handle more
    maxDelayed: 500,
    maxPerProvider: 10,
  },
  normal: {
    maxWaiting: 2000,
    maxDelayed: 1000,
    maxPerProvider: 5,
  },
  low: {
    maxWaiting: 5000,
    maxDelayed: 2000,
    maxPerProvider: 3,
  },
};

/**
 * RC-20/RC-21 FIX: Lua script for atomic provider count increment with limit check
 * Prevents TOCTOU race condition in capacity check + increment
 */
const PROVIDER_COUNT_LUA_SCRIPT = `
  local countKey = KEYS[1]
  local mappingKey = KEYS[2]
  local limit = tonumber(ARGV[1])
  local providerId = ARGV[2]
  local ttl = tonumber(ARGV[3])

  -- Atomic increment
  local newCount = redis.call('INCR', countKey)
  redis.call('EXPIRE', countKey, ttl)

  -- Check limit AFTER increment
  if newCount > limit then
    -- Rollback - exceeded limit
    redis.call('DECR', countKey)
    return {0, newCount - 1}
  end

  -- Store job-to-provider mapping for cleanup
  redis.call('SET', mappingKey, providerId, 'EX', ttl)

  return {1, newCount}
`;

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
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private redisConnection: Redis;

  public highQueue: Queue<SyncJobData>;
  public normalQueue: Queue<SyncJobData>;
  public lowQueue: Queue<SyncJobData>;

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
  private workerToken?: string;

  // RC-8 FIX: Inject RedisLockService for distributed job deduplication
  constructor(
    private configService: ConfigService,
    private readonly redisLock: RedisLockService,
  ) { }

  async onModuleInit() {
    // Initialize Redis connection using centralized options
    const redisOptions = getRedisConnectionOptions();
    this.workerToken = this.configService.get<string>('EMAIL_SYNC_WORKER_TOKEN');

    this.redisConnection = new Redis(redisOptions);

    this.logger.log(`Connecting to Redis at ${redisOptions.host}:${redisOptions.port}`);

    // Initialize HIGH priority queue using centralized config
    this.highQueue = new Queue<SyncJobData>(QUEUE_NAMES.EMAIL_SYNC_HIGH, {
      connection: this.redisConnection,
      defaultJobOptions: getDefaultJobOptions('HIGH'),
    });

    // Initialize NORMAL priority queue using centralized config
    this.normalQueue = new Queue<SyncJobData>(QUEUE_NAMES.EMAIL_SYNC_NORMAL, {
      connection: this.redisConnection,
      defaultJobOptions: getDefaultJobOptions('NORMAL'),
    });

    // Initialize LOW priority queue using centralized config
    this.lowQueue = new Queue<SyncJobData>(QUEUE_NAMES.EMAIL_SYNC_LOW, {
      connection: this.redisConnection,
      defaultJobOptions: getDefaultJobOptions('LOW'),
    });

    // Setup queue events for monitoring
    this.setupQueueEvents();

    this.logger.log('Email sync queues initialized successfully');
  }

  /**
   * CRIT-5 FIX: Get queue capacity status for monitoring
   */
  async getQueueCapacityStatus(): Promise<Record<QueuePriority, {
    limits: QueueLimits;
    current: { waiting: number; delayed: number };
    utilizationPercent: { waiting: number; delayed: number };
    hasCapacity: boolean;
  }>> {
    const result: Record<string, any> = {};

    const queues: Array<{ name: QueuePriority; queue: Queue<SyncJobData> }> = [
      { name: 'high', queue: this.highQueue },
      { name: 'normal', queue: this.normalQueue },
      { name: 'low', queue: this.lowQueue },
    ];

    for (const { name, queue } of queues) {
      const limits = DEFAULT_QUEUE_LIMITS[name];
      const counts = await queue.getJobCounts();
      const waiting = counts.waiting || 0;
      const delayed = counts.delayed || 0;

      result[name] = {
        limits,
        current: { waiting, delayed },
        utilizationPercent: {
          waiting: Math.round((waiting / limits.maxWaiting) * 100),
          delayed: Math.round((delayed / limits.maxDelayed) * 100),
        },
        hasCapacity: waiting < limits.maxWaiting && delayed < limits.maxDelayed,
      };
    }

    return result as Record<QueuePriority, {
      limits: QueueLimits;
      current: { waiting: number; delayed: number };
      utilizationPercent: { waiting: number; delayed: number };
      hasCapacity: boolean;
    }>;
  }

  /**
   * Lightweight health summary for queues + Redis connectivity.
   * CRIT-5 FIX: Now includes capacity status for backpressure monitoring
   */
  async getHealthSummary(): Promise<{
    redisConnected: boolean;
    redisStatus: string;
    queues: SyncStatus[];
    metrics: QueueMetricsSummary[];
    lagMs?: Record<string, number>;
    capacity?: Record<QueuePriority, {
      limits: QueueLimits;
      current: { waiting: number; delayed: number };
      utilizationPercent: { waiting: number; delayed: number };
      hasCapacity: boolean;
    }>;
  }> {
    const redisStatus = this.redisConnection?.status ?? 'unknown';
    const redisConnected = await this.pingRedis();
    const queues = await this.getQueueStatus();
    const lagMs = await this.getQueueLagMs();
    const capacity = await this.getQueueCapacityStatus();

    return {
      redisConnected,
      redisStatus,
      queues,
      metrics: this.getQueueMetricsSummary(),
      lagMs,
      capacity,
    };
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

      queueEvents.on('completed', ({ jobId }) => {
        this.logger.debug(`[${name}] Job ${jobId} completed`);
        this.recordCompletion(name as QueuePriority, queue, jobId).catch((error) => {
          this.logger.debug(
            `[${name}] Failed to record metrics for job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });

        // CRIT-5 FIX: Decrement provider job count on completion
        this.decrementProviderCountForJob(queue, jobId, name as QueuePriority).catch((err) => {
          this.logger.error(`Failed to decrement provider count (completed): ${err.message}`);
        });
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        this.logger.error(`[${name}] Job ${jobId} failed: ${failedReason}`);
        this.recordFailure(name as QueuePriority, failedReason, jobId);

        // CRIT-5 FIX: Decrement provider job count on failure
        this.decrementProviderCountForJob(queue, jobId, name as QueuePriority).catch((err) => {
          this.logger.error(`Failed to decrement provider count (failed): ${err.message}`);
        });
      });

      this.queueEvents.push(queueEvents);
    }
  }

  /**
   * RC-20/RC-21 FIX: Helper to decrement provider count when job finishes
   * Uses stored job-to-provider mapping instead of fetching job (which may be deleted)
   */
  private async decrementProviderCountForJob(
    _queue: Queue<SyncJobData>,
    jobId: string,
    priority: QueuePriority,
  ): Promise<void> {
    try {
      // RC-21 FIX: Use stored mapping instead of fetching job
      const mappingKey = `queue:job-provider:${jobId}`;
      const providerId = await this.redisConnection.get(mappingKey);

      if (providerId) {
        await this.decrementProviderJobCount(priority, providerId);
        await this.redisConnection.del(mappingKey);
      }
    } catch (error) {
      this.logger.debug(
        `CRIT-5: Failed to decrement provider count for job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * RC-20 FIX: Atomic provider count increment with limit check
   * Uses Lua script to prevent TOCTOU race condition
   */
  private async atomicIncrementProviderCount(
    priority: QueuePriority,
    providerId: string,
    jobId: string,
  ): Promise<{ allowed: boolean; currentCount: number }> {
    const countKey = `queue:provider-count:${priority}:${providerId}`;
    const mappingKey = `queue:job-provider:${jobId}`;
    const limits = DEFAULT_QUEUE_LIMITS[priority];
    const ttl = 3600; // 1 hour TTL

    try {
      const result = await this.redisConnection.eval(
        PROVIDER_COUNT_LUA_SCRIPT,
        2,
        countKey,
        mappingKey,
        limits.maxPerProvider.toString(),
        providerId,
        ttl.toString(),
      ) as [number, number];

      const [allowed, currentCount] = result;
      return { allowed: allowed === 1, currentCount };
    } catch (error) {
      this.logger.warn(
        `RC-20: Atomic increment failed, allowing job: ${error instanceof Error ? error.message : String(error)}`,
      );
      // On error, allow the job (fail open) but try to increment non-atomically
      await this.incrementProviderJobCount(priority, providerId);
      return { allowed: true, currentCount: 0 };
    }
  }

  /**
   * CRIT-5 FIX: Check if queue has capacity for new jobs (backpressure)
   * Returns true if the queue can accept new jobs, false if at capacity
   */
  private async checkQueueCapacity(
    queue: Queue<SyncJobData>,
    priority: QueuePriority,
    providerId: string,
  ): Promise<{ hasCapacity: boolean; reason?: string }> {
    const limits = DEFAULT_QUEUE_LIMITS[priority];

    try {
      const counts = await queue.getJobCounts();

      // Check overall waiting limit
      if ((counts.waiting || 0) >= limits.maxWaiting) {
        return {
          hasCapacity: false,
          reason: `CRIT-5: Queue ${priority} at max waiting capacity (${counts.waiting}/${limits.maxWaiting})`,
        };
      }

      // Check overall delayed limit
      if ((counts.delayed || 0) >= limits.maxDelayed) {
        return {
          hasCapacity: false,
          reason: `CRIT-5: Queue ${priority} at max delayed capacity (${counts.delayed}/${limits.maxDelayed})`,
        };
      }

      // Check per-provider limit using Redis counter (faster than scanning jobs)
      const providerCountKey = `queue:provider-count:${priority}:${providerId}`;
      const providerCount = await this.redisConnection.get(providerCountKey);
      const currentProviderJobs = providerCount ? parseInt(providerCount, 10) : 0;

      if (currentProviderJobs >= limits.maxPerProvider) {
        return {
          hasCapacity: false,
          reason: `CRIT-5: Provider ${providerId} at max capacity for ${priority} queue (${currentProviderJobs}/${limits.maxPerProvider})`,
        };
      }

      return { hasCapacity: true };
    } catch (error) {
      // On error, allow the job (fail open)
      this.logger.warn(
        `CRIT-5: Queue capacity check failed, allowing job: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { hasCapacity: true };
    }
  }

  /**
   * CRIT-5 FIX: Increment provider job counter
   */
  private async incrementProviderJobCount(priority: QueuePriority, providerId: string): Promise<void> {
    const key = `queue:provider-count:${priority}:${providerId}`;
    try {
      await this.redisConnection.incr(key);
      // Set TTL of 1 hour for automatic cleanup
      await this.redisConnection.expire(key, 3600);
    } catch (error) {
      this.logger.debug(
        `CRIT-5: Failed to increment provider count: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * CRIT-5 FIX: Decrement provider job counter (called when job completes/fails)
   */
  async decrementProviderJobCount(priority: QueuePriority, providerId: string): Promise<void> {
    const key = `queue:provider-count:${priority}:${providerId}`;
    try {
      const result = await this.redisConnection.decr(key);
      // Clean up if counter reaches 0 or goes negative
      if (result <= 0) {
        await this.redisConnection.del(key);
      }
    } catch (error) {
      this.logger.debug(
        `CRIT-5: Failed to decrement provider count: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * RC-8 FIX: Add sync job with distributed lock to prevent race conditions
   * CRIT-5 FIX: Added backpressure checks to prevent unbounded queue growth
   * RC-20 FIX: Uses atomic increment with limit check to prevent TOCTOU
   * Uses Redis lock around the check+add operation to ensure atomicity
   */
  async addSyncJob(data: SyncJobData): Promise<void> {
    const queue = this.getQueueByPriority(data.priority);
    const jobData = this.withJobToken(data);
    const jobId = `${data.providerId}-${data.syncType || 'delta'}`;

    // CRIT-5 FIX: Check overall queue capacity before attempting to add job
    // Note: Per-provider limit is checked atomically below with atomicIncrementProviderCount
    const capacityCheck = await this.checkQueueCapacity(queue, data.priority, data.providerId);
    if (!capacityCheck.hasCapacity && !capacityCheck.reason?.includes('Provider')) {
      // Only reject on overall queue limits, not per-provider (handled atomically below)
      this.logger.warn(capacityCheck.reason);
      return; // Drop the job (backpressure applied)
    }

    // RC-8 FIX: Use Redis lock to make check+add atomic across workers
    const lockKey = `sync-job-dedup:${jobId}`;
    const lockTtlMs = 2000; // 2 second lock (just enough for dedup check)

    try {
      await this.redisLock.withLock(
        lockKey,
        lockTtlMs,
        async () => {
          // Check if job already exists (inside lock = atomic)
          const existing = await queue.getJob(jobId);
          if (existing) {
            const state = await existing.getState();
            if (state === 'completed' || state === 'failed' || state === 'delayed') {
              await existing.remove();
            } else {
              this.logger.verbose(`Job ${jobId} already queued (state=${state}), skipping duplicate`);
              return;
            }
          }

          // Soft guard: skip if any job for provider is in waiting/active/delayed
          if (await this.hasPendingJob(data.providerId, data.tenantId)) {
            this.logger.verbose(`Provider ${data.providerId} already has a pending job; skipping new enqueue`);
            return;
          }

          // RC-20 FIX: Atomic increment with limit check (prevents TOCTOU race)
          const { allowed, currentCount } = await this.atomicIncrementProviderCount(
            data.priority,
            data.providerId,
            jobId,
          );

          if (!allowed) {
            this.logger.warn(
              `CRIT-5: Provider ${data.providerId} at max capacity for ${data.priority} queue (${currentCount}/${DEFAULT_QUEUE_LIMITS[data.priority].maxPerProvider})`,
            );
            return; // Drop the job (per-provider backpressure)
          }

          // Jitter to spread webhook bursts
          const jitterMs = this.getJitterMs(data.priority);

          await queue.add(
            `sync-${jobData.providerType}-${jobData.email}`,
            {
              ...jobData,
              requestId: CorrelationContext.getContext()?.correlationId,
            },
            {
              jobId,
              delay: jitterMs,
            },
          );

          this.logger.log(`Added ${data.priority} priority sync job for ${data.email} (${data.providerType}) [jobId=${jobId}]`);
        },
        { maxRetries: 2 },
      );
    } catch (error) {
      // Lock acquisition failed - log warning but don't throw
      // This prevents webhook failures when Redis is temporarily unavailable
      this.logger.warn(
        `RC-8: Lock acquisition failed for job ${jobId}, skipping: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * RC-10 FIX: Add bulk sync jobs with per-provider locking to prevent race conditions
   * Uses Redis lock per provider to ensure atomic check+add across workers
   */
  async addBulkSyncJobs(jobs: SyncJobData[]): Promise<void> {
    // RC-10 FIX: First group by provider to enable per-provider locking
    const jobsByProvider = new Map<string, SyncJobData[]>();
    for (const job of jobs) {
      const existing = jobsByProvider.get(job.providerId) || [];
      existing.push(job);
      jobsByProvider.set(job.providerId, existing);
    }

    // Process each provider with a lock to prevent concurrent bulk enqueues
    for (const [providerId, providerJobs] of jobsByProvider) {
      const lockKey = `bulk-sync:${providerId}`;
      const lockTtlMs = 5000; // 5 second lock for bulk operations

      try {
        await this.redisLock.withLock(
          lockKey,
          lockTtlMs,
          async () => {
            // Check if provider already has pending jobs (inside lock = atomic)
            if (await this.hasPendingJob(providerId, providerJobs[0]?.tenantId)) {
              this.logger.verbose(`Provider ${providerId} already has pending job; skipping bulk enqueue`);
              return;
            }

            // Group by priority for this provider
            const byPriority: { [key: string]: SyncJobData[] } = { high: [], normal: [], low: [] };
            for (const job of providerJobs) {
              byPriority[job.priority].push(this.withJobToken(job));
            }

            // Add jobs to respective queues
            for (const [priority, priorityJobs] of Object.entries(byPriority)) {
              if (priorityJobs.length === 0) continue;

              const queue = this.getQueueByPriority(priority as QueuePriority);
              const bullJobs = priorityJobs.map((job, index) => ({
                name: `sync-${job.providerType}-${job.email}`,
                data: job,
                opts: {
                  jobId: `${job.providerId}-${job.syncType || 'delta'}`,
                  delay: this.getJitterMs(priority as QueuePriority) + index * 100,
                },
              }));

              await queue.addBulk(bullJobs);
              this.logger.log(`Added ${bullJobs.length} ${priority} priority jobs for provider ${providerId}`);
            }
          },
          { maxRetries: 2 },
        );
      } catch (error) {
        this.logger.warn(
          `RC-10: Lock acquisition failed for bulk sync (provider ${providerId}), skipping: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async getQueueStatus(): Promise<SyncStatus[]> {
    const queues = [
      { name: QUEUE_NAMES.EMAIL_SYNC_HIGH, queue: this.highQueue },
      { name: QUEUE_NAMES.EMAIL_SYNC_NORMAL, queue: this.normalQueue },
      { name: QUEUE_NAMES.EMAIL_SYNC_LOW, queue: this.lowQueue },
    ];

    const statuses: SyncStatus[] = [];

    for (const { name, queue } of queues) {
      const counts = await queue.getJobCounts();

      statuses.push({
        queueName: name,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      });
    }

    return statuses;
  }

  /**
   * Aggregate waiting + delayed jobs per provider across all queues.
   * Used for per-provider backlog visibility in health metrics.
   */
  async getBacklogByProvider(): Promise<Record<string, number>> {
    const queues = [this.highQueue, this.normalQueue, this.lowQueue];
    const states: JobType[] = ['waiting', 'delayed'];
    const counts: Record<string, number> = {};

    for (const queue of queues) {
      const jobs = await queue.getJobs(states, 0, -1);
      for (const job of jobs) {
        const providerId = job.data?.providerId;
        if (!providerId) continue;
        counts[providerId] = (counts[providerId] || 0) + 1;
      }
    }

    return counts;
  }

  async pauseQueue(priority: 'high' | 'normal' | 'low'): Promise<void> {
    const queue = this.getQueueByPriority(priority);
    await queue.pause();
    this.logger.log(`Paused ${priority} priority queue`);
  }

  async resumeQueue(priority: 'high' | 'normal' | 'low'): Promise<void> {
    const queue = this.getQueueByPriority(priority);
    await queue.resume();
    this.logger.log(`Resumed ${priority} priority queue`);
  }

  async obliterateQueue(priority: 'high' | 'normal' | 'low'): Promise<void> {
    const queue = this.getQueueByPriority(priority);
    await queue.obliterate({ force: true });
    this.logger.warn(`Obliterated ${priority} priority queue - all jobs deleted`);
  }

  async removeJobsForTenant(tenantId: string): Promise<number> {
    const queues = [
      { name: 'high', queue: this.highQueue },
      { name: 'normal', queue: this.normalQueue },
      { name: 'low', queue: this.lowQueue },
    ];

    const removableStates: JobType[] = ['waiting', 'delayed', 'paused', 'waiting-children'];
    let removed = 0;

    for (const { name, queue } of queues) {
      const jobs = await queue.getJobs(removableStates, 0, -1);
      let removedFromQueue = 0;

      for (const job of jobs) {
        if (job?.data?.tenantId === tenantId) {
          await job.remove();
          removed += 1;
          removedFromQueue += 1;
        }
      }

      if (removedFromQueue > 0) {
        this.logger.verbose(
          `Removed pending ${name} priority sync jobs for tenant ${tenantId}.`,
        );
      }
    }

    return removed;
  }

  async removeJobsForProvider(providerId: string): Promise<number> {
    const queues = [
      { name: 'high', queue: this.highQueue },
      { name: 'normal', queue: this.normalQueue },
      { name: 'low', queue: this.lowQueue },
    ];

    const removableStates: JobType[] = ['waiting', 'delayed', 'paused', 'waiting-children'];
    let removed = 0;

    for (const { name, queue } of queues) {
      const jobs = await queue.getJobs(removableStates, 0, -1);
      let removedFromQueue = 0;

      for (const job of jobs) {
        if (job?.data?.providerId === providerId) {
          await job.remove();
          removed += 1;
          removedFromQueue += 1;
        }
      }

      if (removedFromQueue > 0) {
        this.logger.verbose(
          `Removed pending ${name} priority sync jobs for provider ${providerId}.`,
        );
      }
    }

    return removed;
  }

  private withJobToken(job: SyncJobData): SyncJobData {
    if (!this.workerToken) {
      return job;
    }

    return {
      ...job,
      authToken: this.workerToken,
    };
  }

  private getQueueByPriority(priority: 'high' | 'normal' | 'low'): Queue<SyncJobData> {
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

  async onModuleDestroy() {
    this.logger.log('Closing queue connections...');
    try {
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
        `QueueService shutdown encountered an error (swallowed): ${outerError instanceof Error ? outerError.message : outerError
        }`,
      );
    } finally {
      this.logger.log('All queue connections closed');
    }
  }

  getQueueMetricsSummary(): QueueMetricsSummary[] {
    return (['high', 'normal', 'low'] as QueuePriority[]).map((priority) => {
      const metric = this.metrics[priority];
      const averageDuration =
        metric.processed > 0 ? Math.round(metric.totalDurationMs / metric.processed) : 0;

      return {
        queue: priority,
        completed: metric.completed,
        failed: metric.failed,
        lastError: metric.lastError,
        lastCompletedAt: metric.lastCompletedAt,
        lastFailedAt: metric.lastFailedAt,
        averageDurationMs: averageDuration,
        lastDurationMs: metric.lastDurationMs,
      };
    });
  }

  private async recordCompletion(priority: QueuePriority, queue: Queue<SyncJobData>, jobId?: string) {
    const metric = this.metrics[priority];
    metric.completed += 1;
    metric.lastCompletedAt = new Date().toISOString();
    metric.lastJobId = jobId;

    if (!jobId) {
      return;
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job || job.processedOn == null || job.finishedOn == null) {
        return;
      }

      const duration = job.finishedOn - job.processedOn;
      if (Number.isFinite(duration) && duration >= 0) {
        metric.processed += 1;
        metric.totalDurationMs += duration;
        metric.lastDurationMs = duration;
      }
    } catch (error) {
      this.logger.debug(
        `[${priority}] Unable to fetch job ${jobId} for duration metrics: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private recordFailure(priority: QueuePriority, failedReason?: string, _jobId?: string) {
    const metric = this.metrics[priority];
    metric.failed += 1;
    metric.lastFailedAt = new Date().toISOString();
    metric.lastError = failedReason;
    metric.lastJobId = undefined;
  }

  /**
   * Get jitter delay for spreading webhook bursts
   * Higher jitter for lower priority queues
   */
  private getJitterMs(priority: QueuePriority): number {
    switch (priority) {
      case 'high':
        return 50;
      case 'normal':
        return 200;
      case 'low':
        return 500;
      default:
        return 0;
    }
  }

  private async hasPendingJob(providerId: string, _tenantId?: string): Promise<boolean> {
    // OPTIMIZED for 1000+ users: O(1) lookup using job ID instead of O(n) getJobs()
    // Job IDs follow the pattern: {providerId}-{syncType}
    // We check for the two common sync types: 'delta' and 'full'
    const queues = [this.highQueue, this.normalQueue, this.lowQueue];
    const syncTypes = ['delta', 'full', 'incremental'];

    for (const queue of queues) {
      for (const syncType of syncTypes) {
        const jobId = `${providerId}-${syncType}`;
        const job = await queue.getJob(jobId);

        if (job) {
          const state = await job.getState();
          // Only consider active states as "pending"
          if (['waiting', 'active', 'delayed', 'paused', 'waiting-children'].includes(state)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private async getQueueLagMs(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    const now = Date.now();

    const entries: Array<{ name: string; queue: Queue<SyncJobData> }> = [
      { name: 'high', queue: this.highQueue },
      { name: 'normal', queue: this.normalQueue },
      { name: 'low', queue: this.lowQueue },
    ];

    for (const { name, queue } of entries) {
      try {
        const jobs = await queue.getJobs(['waiting', 'delayed'], 0, 20);
        const oldest = jobs
          .filter((j) => j?.timestamp != null)
          .map((j) => j.timestamp)
          .sort((a, b) => a - b)[0];
        if (oldest) {
          result[name] = Math.max(0, now - oldest);
        } else {
          result[name] = 0;
        }
      } catch {
        result[name] = 0;
      }
    }

    return result;
  }

  private async pingRedis(): Promise<boolean> {
    if (!this.redisConnection) {
      return false;
    }

    try {
      const pong = await Promise.race([
        this.redisConnection.ping(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 500),
        ),
      ]);
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
