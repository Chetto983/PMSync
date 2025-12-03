import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, QueueEvents, JobType } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { SyncJobData, SyncStatus } from '../interfaces/sync-job.interface';
import { getRedisConnectionOptions } from '../../../config/configuration';

// Extended interface for sync job processing
// interface ProcessableSyncJobData extends SyncJobData {
//   maxMessages?: number;
//   folder?: string;
//   historyId?: string;
//   deltaLink?: string;
// }

// Provider data structure for processing
// interface ProviderWithTokens {
//   id: string;
//   providerType: 'google' | 'microsoft' | 'imap';
//   email: string;
//   decryptedAccessToken: string;
//   decryptedRefreshToken?: string;
// }

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

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    // Initialize Redis connection using centralized options
    const redisOptions = getRedisConnectionOptions();
    this.workerToken = this.configService.get<string>('EMAIL_SYNC_WORKER_TOKEN');

    this.redisConnection = new Redis(redisOptions);

    this.logger.log(`Connecting to Redis at ${redisOptions.host}:${redisOptions.port}`);

    // Initialize HIGH priority queue
    this.highQueue = new Queue<SyncJobData>('email-sync-high', {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: this.getAttempts('HIGH'),
        backoff: this.getBackoff('HIGH'),
        removeOnComplete: this.getRemoveOnComplete('HIGH'),
        removeOnFail: this.getRemoveOnFail('HIGH'),
      },
    });

    // Initialize NORMAL priority queue
    this.normalQueue = new Queue<SyncJobData>('email-sync-normal', {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: this.getAttempts('NORMAL'),
        backoff: this.getBackoff('NORMAL'),
        removeOnComplete: this.getRemoveOnComplete('NORMAL'),
        removeOnFail: this.getRemoveOnFail('NORMAL'),
      },
    });

    // Initialize LOW priority queue
    this.lowQueue = new Queue<SyncJobData>('email-sync-low', {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: this.getAttempts('LOW'),
        backoff: this.getBackoff('LOW'),
        removeOnComplete: this.getRemoveOnComplete('LOW'),
        removeOnFail: this.getRemoveOnFail('LOW'),
      },
    });

    // Setup queue events for monitoring
    this.setupQueueEvents();

    this.logger.log('Email sync queues initialized successfully');
  }

  /**
   * Lightweight health summary for queues + Redis connectivity.
   */
  async getHealthSummary(): Promise<{
    redisConnected: boolean;
    redisStatus: string;
    queues: SyncStatus[];
    metrics: QueueMetricsSummary[];
    lagMs?: Record<string, number>;
  }> {
    const redisStatus = this.redisConnection?.status ?? 'unknown';
    const redisConnected = await this.pingRedis();
    const queues = await this.getQueueStatus();
    const lagMs = await this.getQueueLagMs();

    return {
      redisConnected,
      redisStatus,
      queues,
      metrics: this.getQueueMetricsSummary(),
      lagMs,
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
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        this.logger.error(`[${name}] Job ${jobId} failed: ${failedReason}`);
        this.recordFailure(name as QueuePriority, failedReason, jobId);
      });

      this.queueEvents.push(queueEvents);
    }
  }

  async addSyncJob(data: SyncJobData): Promise<void> {
    const queue = this.getQueueByPriority(data.priority);
    const jobData = this.withJobToken(data);

    // Dedup job per provider + syncType to avoid bursts
    const jobId = `${data.providerId}-${data.syncType || 'delta'}`;
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

    // Jitter to spread webhook bursts; higher jitter for normal/low
    const jitterMs = this.getJitterMs(data.priority);

    await queue.add(
      `sync-${jobData.providerType}-${jobData.email}`,
      jobData,
      {
        jobId,
        delay: jitterMs,
      },
    );

    this.logger.log(`Added ${data.priority} priority sync job for ${data.email} (${data.providerType}) [jobId=${jobId}]`);
  }

  async addBulkSyncJobs(jobs: SyncJobData[]): Promise<void> {
    // Group jobs by priority
    const jobsByPriority: { [key: string]: SyncJobData[] } = {
      high: [],
      normal: [],
      low: [],
    };

    for (const job of jobs) {
      jobsByPriority[job.priority].push(job);
    }

    // Add jobs to respective queues
    for (const [priority, priorityJobs] of Object.entries(jobsByPriority)) {
      if (priorityJobs.length === 0) continue;

      const queue = this.getQueueByPriority(priority as any);

      // Filter out jobs that already have pending work for the same provider
      const filteredJobs: SyncJobData[] = [];
      for (const job of priorityJobs) {
        if (await this.hasPendingJob(job.providerId, job.tenantId)) {
          this.logger.verbose(`Provider ${job.providerId} already has pending job; skipping bulk enqueue`);
          continue;
        }
        filteredJobs.push(this.withJobToken(job));
      }

      if (filteredJobs.length === 0) {
        continue;
      }

      const bullJobs = filteredJobs.map((job, index) => ({
        name: `sync-${job.providerType}-${job.email}`,
        data: job,
        opts: {
          jobId: `${job.providerId}-${job.syncType || 'delta'}`,
          delay: this.getJitterMs(priority as QueuePriority) + index * 100, // Stagger jobs with base jitter
        },
      }));

      await queue.addBulk(bullJobs);

      this.logger.log(`Added ${bullJobs.length} ${priority} priority jobs (filtered from ${priorityJobs.length})`);
    }
  }

  async getQueueStatus(): Promise<SyncStatus[]> {
    const queues = [
      { name: 'high', queue: this.highQueue },
      { name: 'normal', queue: this.normalQueue },
      { name: 'low', queue: this.lowQueue },
    ];

    const statuses: SyncStatus[] = [];

    for (const { name, queue } of queues) {
      const counts = await queue.getJobCounts();

      statuses.push({
        queueName: `email-sync-${name}`,
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
        `QueueService shutdown encountered an error (swallowed): ${
          outerError instanceof Error ? outerError.message : outerError
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

  private getAttempts(level: 'HIGH' | 'NORMAL' | 'LOW'): number {
    switch (level) {
      case 'HIGH':
        return this.getNumber('QUEUE_HIGH_ATTEMPTS', 3);
      case 'NORMAL':
        return this.getNumber('QUEUE_NORMAL_ATTEMPTS', 2);
      case 'LOW':
        return this.getNumber('QUEUE_LOW_ATTEMPTS', 1);
      default:
        return 1;
    }
  }

  private getBackoff(level: 'HIGH' | 'NORMAL' | 'LOW'):
    | { type: 'exponential'; delay: number }
    | undefined {
    switch (level) {
      case 'HIGH':
        return {
          type: 'exponential',
          delay: this.getNumber('QUEUE_HIGH_BACKOFF_MS', 5000),
        };
      case 'NORMAL':
        return {
          type: 'exponential',
          delay: this.getNumber('QUEUE_NORMAL_BACKOFF_MS', 10000),
        };
      case 'LOW':
        return undefined;
      default:
        return undefined;
    }
  }

  private getJitterMs(priority: QueuePriority): number {
    switch (priority) {
      case 'high':
        return this.getNumber('QUEUE_HIGH_JITTER_MS', 50);
      case 'normal':
        return this.getNumber('QUEUE_NORMAL_JITTER_MS', 200);
      case 'low':
        return this.getNumber('QUEUE_LOW_JITTER_MS', 500);
      default:
        return 0;
    }
  }

  private getRemoveOnComplete(level: 'HIGH' | 'NORMAL' | 'LOW'): boolean | { count?: number; age?: number } {
    switch (level) {
      case 'HIGH':
        return {
          count: this.getNumber('QUEUE_HIGH_REMOVE_ON_COMPLETE_COUNT', 50),
          age: this.getNumber('QUEUE_HIGH_REMOVE_ON_COMPLETE_AGE', 3600),
        };
      case 'NORMAL':
      case 'LOW':
        return true;
      default:
        return true;
    }
  }

  private getRemoveOnFail(level: 'HIGH' | 'NORMAL' | 'LOW'): boolean | { count?: number } {
    switch (level) {
      case 'HIGH':
        return {
          count: this.getNumber('QUEUE_HIGH_REMOVE_ON_FAIL_COUNT', 100),
        };
      case 'NORMAL':
      case 'LOW':
        return true;
      default:
        return true;
    }
  }

  private getNumber(envKey: string, defaultValue: number): number {
    const raw = this.configService.get<string | number>(envKey);
    if (raw === undefined || raw === null || raw === '') {
      return defaultValue;
    }

    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  private async hasPendingJob(providerId: string, tenantId?: string): Promise<boolean> {
    const queues = [this.highQueue, this.normalQueue, this.lowQueue];
    const states: JobType[] = ['waiting', 'active', 'delayed', 'paused', 'waiting-children'];

    // Soft guard: skip if any job for provider is in waiting/active/delayed
    for (const queue of queues) {
      const jobs = await queue.getJobs(states, 0, -1);
      if (
        jobs.some(
          (job) =>
            job?.data?.providerId === providerId &&
            (!tenantId || job?.data?.tenantId === tenantId),
        )
      ) {
        return true;
      }
    }

    // Hard guard: check in Redis keys for any job referencing providerId
    // Use SCAN instead of KEYS to prevent blocking Redis in production
    const keyPattern = `bull:*:jobs:*`;
    let cursor = '0';
    const matchedKeys: string[] = [];

    do {
      const result = await this.redisConnection.scan(
        cursor,
        'MATCH',
        keyPattern,
        'COUNT',
        100,
      );
      cursor = result[0];
      matchedKeys.push(...result[1]);

      // Early exit if we find a matching key
      const hasMatch = result[1].some(
        (k) => k.includes(providerId) && (!tenantId || k.includes(tenantId)),
      );
      if (hasMatch) {
        return true;
      }
    } while (cursor !== '0');

    return matchedKeys.some(
      (k) => k.includes(providerId) && (!tenantId || k.includes(tenantId)),
    );
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
