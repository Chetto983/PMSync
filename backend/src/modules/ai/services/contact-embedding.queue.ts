import { Job, Queue, Worker } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { KNOWLEDGE_BASE, IKnowledgeBase } from '../../../common/interfaces/embedding-queue.interface';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { AlertingService } from '../../../common/services/alerting.service';
import { RedisConnectionService } from '../../../common/services/redis-connection.service';
import { isRateLimitError } from '../../../common/utils/error.utils';
import {
  getDefaultJobOptions,
  getSharedRedisConnection,
  getSharedWorkerConnection,
  QUEUE_NAMES,
  releaseSharedRedisConnection,
  releaseSharedWorkerConnection,
} from '../../../common/config';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

/** Maximum retry attempts before sending to DLQ */
const MAX_ATTEMPTS = 6;

export interface ContactEmbeddingJob {
  tenantId: string;
  contactId: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  notes?: string | null;
  tags?: string[];
  emails?: { value: string; type?: string }[] | null;
  phoneNumbers?: { value: string; type?: string }[] | null;
}

@Injectable()
export class ContactEmbeddingQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactEmbeddingQueueService.name);
  private knowledgeBaseService?: IKnowledgeBase;
  private queue!: Queue<ContactEmbeddingJob>;
  private worker!: Worker<ContactEmbeddingJob, boolean>;
  private pending: ContactEmbeddingJob[] = [];
  private flushTimer?: NodeJS.Timeout;
  private readonly BULK_SIZE: number;
  private readonly FLUSH_MS: number;
  private readonly WORKER_CONCURRENCY: number;
  private readonly RATE_MAX: number;
  private readonly RATE_DURATION_MS: number;
  private readonly WORKER_LOCK_MS: number;
  private readonly RATE_LIMIT_BASE_DELAY_MS: number;
  private readonly RATE_LIMIT_MAX_DELAY_MS: number;
  /** Deduplication set to prevent duplicate job enqueuing */
  private readonly seenIds = new Set<string>();
  private readonly MAX_SEEN_IDS = 10000;

  /** KB-M2: Per-tenant rate limiting */
  private static readonly TENANT_RATE_PREFIX = 'pmsync:contact-embed:rate:';
  private static readonly TENANT_RATE_TTL = 60; // 1 minute sliding window
  private readonly PER_TENANT_PER_MINUTE: number;

  constructor(
    private readonly config: ConfigService,
    private readonly moduleRef: ModuleRef,
    private readonly dlqService: DeadLetterQueueService,
    private readonly alertingService: AlertingService,
    private readonly redisConnection: RedisConnectionService,
  ) {
    // Bulk batching settings
    this.BULK_SIZE = this.getPositiveNumber('EMBEDDING_BULK_SIZE', 50);
    this.FLUSH_MS = this.getPositiveNumber('EMBEDDING_FLUSH_MS', 200);

    // Worker concurrency (1 = sequential, safe for rate limits)
    this.WORKER_CONCURRENCY = this.getPositiveNumber('EMBEDDING_CONCURRENCY', 1);

    // Rate limiting: Mistral API limits
    this.RATE_MAX = this.getPositiveNumber('EMBEDDING_RATE_MAX', 2);
    this.RATE_DURATION_MS = this.getPositiveNumber('EMBEDDING_RATE_DURATION_MS', 1000);

    // Rate limit backoff settings
    this.RATE_LIMIT_BASE_DELAY_MS = this.getPositiveNumber('EMBEDDING_RATE_LIMIT_BASE_DELAY_MS', 5000);
    this.RATE_LIMIT_MAX_DELAY_MS = this.getPositiveNumber('EMBEDDING_RATE_LIMIT_MAX_DELAY_MS', 120000);

    this.WORKER_LOCK_MS = this.getPositiveNumber('EMBEDDING_LOCK_MS', 180000);

    // KB-M2: Per-tenant rate limit (default 120/min = 2/s)
    this.PER_TENANT_PER_MINUTE = this.getPositiveNumber('CONTACT_EMBEDDING_PER_TENANT_PER_MINUTE', 120);
  }

  onModuleInit() {
    // D-12: AI module-level worker toggle. When AI_WORKERS_ENABLED=false this
    // instance serves HTTP only and does not consume/produce embedding jobs.
    const aiWorkersEnabled =
      this.config.get<string>('AI_WORKERS_ENABLED') || 'true';
    if (aiWorkersEnabled.toLowerCase() === 'false') {
      this.logger.warn(
        'Contact embedding workers disabled (AI_WORKERS_ENABLED=false)',
      );
      return;
    }

    this.knowledgeBaseService = this.resolveKnowledgeBaseService();

    // D-01: use shared producer connection (was per-instance options object).
    // D-02: use shared worker connection (BullMQ duplicates internally).
    const producerConnection = getSharedRedisConnection();
    const workerConnection = getSharedWorkerConnection();

    // D-09: removed `removeOnFail: 1000` override — DLQ captures permanent
    // failures and the preset value ({ count: 20 }) is the phase-wide mandate.
    const jobDefaults = getDefaultJobOptions('AI_EMBEDDING');

    this.queue = new Queue<ContactEmbeddingJob>(QUEUE_NAMES.CONTACT_EMBEDDING, {
      connection: producerConnection,
      defaultJobOptions: {
        ...jobDefaults,
      },
    });

    this.worker = new Worker<ContactEmbeddingJob, boolean>(
      QUEUE_NAMES.CONTACT_EMBEDDING,
      async (job: Job<ContactEmbeddingJob>) => {
        this.logger.debug(`Processing contact embedding job ${job.id}`);
        try {
          // KB-M2: Per-tenant rate check — delay job if tenant exceeded limit
          const throttled = await this.isTenantThrottled(job.data.tenantId);
          if (throttled) {
            this.logger.debug(`Tenant ${job.data.tenantId} throttled, delaying contact embedding job ${job.id}`);
            await job.moveToDelayed(Date.now() + 5000, job.token); // retry in 5s
            return false;
          }
          await this.incrementTenantCounter(job.data.tenantId);
          return await withoutTenantScopingAsync(() =>
            this.resolveKnowledgeBaseService().createEmbeddingForContact(job.data),
          );
        } catch (error) {
          if (isRateLimitError(error)) {
            const delayMs = this.computeBackoffDelay(job.attemptsMade, error);
            this.logger.warn(
              `Rate limit hit for contact embedding job ${job.id}. Retry ${job.attemptsMade + 1}/${job.opts.attempts} in ${Math.round(delayMs / 1000)}s`,
            );
            await job.updateProgress({
              status: 'rate_limited',
              retryInMs: delayMs,
              attempt: job.attemptsMade + 1,
            });
          }
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency: this.WORKER_CONCURRENCY,
        limiter: {
          max: this.RATE_MAX,
          duration: this.RATE_DURATION_MS,
        },
        lockDuration: this.WORKER_LOCK_MS,
        stalledInterval: Math.max(1000, Math.floor(this.WORKER_LOCK_MS / 2)),
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.verbose(`Contact embedding job ${job.id} completed`);
    });

    this.worker.on('failed', async (job, error) => {
      const jobId = job?.id ?? 'unknown';
      const errorMessage = error?.message ?? String(error);
      this.logger.warn(`Contact embedding job ${jobId} failed: ${errorMessage}`);

      if (job && job.attemptsMade + 1 >= MAX_ATTEMPTS) {
        this.logger.warn(`Job ${jobId} exhausted all ${MAX_ATTEMPTS} retries, adding to DLQ`);

        const errorObj = error instanceof Error ? error : new Error(errorMessage);
        await this.dlqService.addToDeadLetter(
          jobId,
          job.queueName,
          job.data,
          errorObj,
          job.attemptsMade + 1,
          {
            tenantId: job.data.tenantId,
            contactId: job.data.contactId,
            displayName: job.data.displayName,
            queueName: job.queueName,
          },
        );

        const alert = this.alertingService.createAlert(
          'critical',
          'ai_embedding_failed',
          `Contact embedding permanently failed for contact ${job.data.contactId} (tenant: ${job.data.tenantId}) after ${MAX_ATTEMPTS} attempts: ${errorMessage}`,
          job.attemptsMade + 1,
          MAX_ATTEMPTS,
        );
        this.logger.error(`ALERT: ${alert.type} - ${alert.message}`);
      }
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    // D-01: release ref-counted shared connections. The queue/worker presence
    // acts as a guard for the AI_WORKERS_ENABLED=false early-return case —
    // when init bailed out early neither was created and no refs were acquired.
    if (this.queue) {
      releaseSharedRedisConnection();
    }
    if (this.worker) {
      releaseSharedWorkerConnection();
    }
  }

  async enqueue(job: ContactEmbeddingJob): Promise<void> {
    await this.enqueueMany([job]);
  }

  async enqueueMany(jobs: ContactEmbeddingJob[]): Promise<void> {
    if (!jobs.length) return;

    // Check if embeddings are disabled
    const embeddingsEnabled = this.config.get<boolean>('ai.features.embeddingsEnabled');
    const aiEnabled = this.config.get<boolean>('ai.features.aiEnabled');
    if (embeddingsEnabled === false || aiEnabled === false) {
      this.logger.debug(`Embeddings disabled, skipping ${jobs.length} contact embedding jobs`);
      return;
    }

    // Prevent memory leak
    if (this.seenIds.size > this.MAX_SEEN_IDS) {
      this.logger.debug(`Clearing seenIds cache (size: ${this.seenIds.size} > ${this.MAX_SEEN_IDS})`);
      this.seenIds.clear();
    }

    for (const job of jobs) {
      if (job.contactId && this.seenIds.has(job.contactId)) {
        continue;
      }
      if (job.contactId) {
        this.seenIds.add(job.contactId);
      }
      this.pending.push(job);
    }

    if (this.pending.length >= this.BULK_SIZE) {
      await this.flushPending();
    } else {
      this.scheduleFlush();
    }
  }

  private async flushPending() {
    if (!this.pending.length || !this.queue) {
      this.flushTimer = undefined;
      return;
    }

    const jobs = this.pending.splice(0, this.pending.length);
    this.flushTimer = undefined;
    this.seenIds.clear();

    const bullJobs = jobs.map((job) => ({
      name: 'create',
      data: job,
      opts: {
        jobId: job.contactId,
        attempts: 6,
        backoff: {
          type: 'exponential' as const,
          delay: 1000,
        },
      },
    }));

    await this.queue.addBulk(bullJobs);
    this.logger.verbose(`Queued ${bullJobs.length} contact embedding job(s) in bulk`);
  }

  private scheduleFlush() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      void this.flushPending().catch((err) =>
        this.logger.warn(
          `Failed to flush contact embedding jobs: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, this.FLUSH_MS);
  }

  async removeJobsForTenant(tenantId: string): Promise<number> {
    if (!this.queue) {
      return 0;
    }

    const removableStates: Array<'waiting' | 'delayed' | 'paused' | 'waiting-children'> = [
      'waiting',
      'delayed',
      'paused',
      'waiting-children',
    ];

    const jobs = await this.queue.getJobs(removableStates, 0, 100);
    let removed = 0;

    for (const job of jobs) {
      if (job?.data?.tenantId === tenantId) {
        await job.remove();
        removed += 1;
      }
    }

    this.logger.verbose(
      `Removed ${removed} pending contact embedding job(s) for tenant ${tenantId}.`,
    );

    return removed;
  }

  /**
   * KB-M2: Check if a tenant has exceeded the per-minute contact embedding limit.
   * Fails open: if Redis is unavailable, allow the job (embedding is non-critical).
   */
  private async isTenantThrottled(tenantId: string): Promise<boolean> {
    try {
      const key = `${ContactEmbeddingQueueService.TENANT_RATE_PREFIX}${tenantId}`;
      const current = await this.redisConnection.client.get(key);
      return current !== null && parseInt(current, 10) >= this.PER_TENANT_PER_MINUTE;
    } catch {
      return false; // Fail open
    }
  }

  /**
   * KB-M2: Increment per-tenant counter with auto-expiring TTL.
   */
  private async incrementTenantCounter(tenantId: string): Promise<void> {
    try {
      const key = `${ContactEmbeddingQueueService.TENANT_RATE_PREFIX}${tenantId}`;
      const redis = this.redisConnection.client;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, ContactEmbeddingQueueService.TENANT_RATE_TTL);
      }
    } catch {
      // Non-critical — worst case we slightly over-process
    }
  }

  private extractRetryAfter(error: unknown): number | null {
    if (!error) return null;

    const err = error as Record<string, unknown>;
    const response = err.response as Record<string, unknown> | undefined;
    const responseHeaders = response?.headers as Record<string, unknown> | undefined;
    const errHeaders = err.headers as Record<string, unknown> | undefined;

    const retryAfter =
      responseHeaders?.['retry-after'] ??
      errHeaders?.['retry-after'] ??
      err.retryAfter;

    if (retryAfter !== undefined && retryAfter !== null) {
      let retryValue: string;
      if (typeof retryAfter === 'number') {
        retryValue = retryAfter.toString();
      } else if (typeof retryAfter === 'string') {
        retryValue = retryAfter;
      } else if (typeof retryAfter === 'object') {
        retryValue = JSON.stringify(retryAfter);
      } else {
        retryValue = String(retryAfter as string | number);
      }
      const parsed = parseInt(retryValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private computeBackoffDelay(attemptsMade: number, error?: unknown): number {
    const retryAfterSeconds = this.extractRetryAfter(error);
    if (retryAfterSeconds !== null) {
      const delayMs = retryAfterSeconds * 1000 + Math.random() * 1000;
      return Math.min(delayMs, this.RATE_LIMIT_MAX_DELAY_MS);
    }

    const exponent = Math.max(0, attemptsMade);
    const delay = this.RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, exponent);
    const jitter = delay * (0.1 + Math.random() * 0.1);

    return Math.min(delay + jitter, this.RATE_LIMIT_MAX_DELAY_MS);
  }

  private getPositiveNumber(envKey: string, fallback: number): number {
    const raw = this.config.get(envKey);
    const asNumber = typeof raw === 'string' ? Number(raw) : (raw as number);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber;
    }
    return fallback;
  }

  private resolveKnowledgeBaseService(): IKnowledgeBase {
    if (this.knowledgeBaseService) {
      return this.knowledgeBaseService;
    }

    const knowledgeBaseService = this.moduleRef.get<IKnowledgeBase>(KNOWLEDGE_BASE, {
      strict: false,
    });
    if (!knowledgeBaseService) {
      throw new Error('KNOWLEDGE_BASE provider is unavailable for ContactEmbeddingQueueService');
    }

    this.knowledgeBaseService = knowledgeBaseService;
    return knowledgeBaseService;
  }

  /** OBS-M2: Queue health metrics for /ai/health/detailed. */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    failed: number;
  }> {
    const [waiting, active, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getFailedCount(),
    ]);
    return { waiting, active, failed };
  }
}
