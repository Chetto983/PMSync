import { Job, Queue, Worker } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import {
  KNOWLEDGE_BASE,
  IKnowledgeBase,
  type EmailEmbeddingJob,
} from '../../../common/interfaces/embedding-queue.interface';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { AlertingService } from '../../../common/services/alerting.service';
import { isRateLimitError } from '../../../common/utils/error.utils';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

// Re-export for backward compatibility
export type { EmailEmbeddingJob } from '../../../common/interfaces/embedding-queue.interface';

/** Maximum retry attempts before sending to DLQ */
const MAX_ATTEMPTS = 6;

@Injectable()
export class EmailEmbeddingQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailEmbeddingQueueService.name);
  private knowledgeBaseService?: IKnowledgeBase;
  private queue!: Queue<EmailEmbeddingJob>;
  private worker!: Worker<EmailEmbeddingJob, boolean>;
  private pending: EmailEmbeddingJob[] = [];
  private flushTimer?: NodeJS.Timeout;
  private readonly BULK_SIZE: number;
  private readonly FLUSH_MS: number;
  private readonly WORKER_CONCURRENCY: number;
  private readonly RATE_MAX: number;
  private readonly RATE_DURATION_MS: number;
  private readonly WORKER_LOCK_MS: number;
  private readonly RATE_LIMIT_BASE_DELAY_MS: number;
  private readonly RATE_LIMIT_MAX_DELAY_MS: number;
  /** Deduplication set to prevent duplicate job enqueuing - limited to prevent memory leaks */
  private readonly seenIds = new Set<string>();
  /** Maximum seenIds size before forced cleanup (prevents unbounded memory growth) */
  private readonly MAX_SEEN_IDS = 10000;

  constructor(
    private readonly config: ConfigService,
    private readonly moduleRef: ModuleRef,
    private readonly dlqService: DeadLetterQueueService,
    private readonly alertingService: AlertingService,
  ) {
    // Bulk batching settings
    this.BULK_SIZE = this.getPositiveNumber('EMBEDDING_BULK_SIZE', 50);
    this.FLUSH_MS = this.getPositiveNumber('EMBEDDING_FLUSH_MS', 200);

    // Worker concurrency (1 = sequential, safe for rate limits)
    this.WORKER_CONCURRENCY = this.getPositiveNumber('EMBEDDING_CONCURRENCY', 1);

    // Rate limiting: Mistral API limits vary by tier
    // Free tier: ~1 RPS, 500K tokens/min
    // Paid tiers: up to 5 RPS, 2M tokens/min
    // Default: 2 requests per second (safe for most paid tiers)
    this.RATE_MAX = this.getPositiveNumber('EMBEDDING_RATE_MAX', 2);
    this.RATE_DURATION_MS = this.getPositiveNumber('EMBEDDING_RATE_DURATION_MS', 1000);

    // Rate limit backoff settings
    // Base delay for exponential backoff on 429 errors
    this.RATE_LIMIT_BASE_DELAY_MS = this.getPositiveNumber('EMBEDDING_RATE_LIMIT_BASE_DELAY_MS', 5000);
    // Maximum delay to prevent infinite waits (default 2 minutes)
    this.RATE_LIMIT_MAX_DELAY_MS = this.getPositiveNumber('EMBEDDING_RATE_LIMIT_MAX_DELAY_MS', 120000);

    this.WORKER_LOCK_MS = this.getPositiveNumber('EMBEDDING_LOCK_MS', 180000);
  }

  onModuleInit() {
    this.knowledgeBaseService = this.resolveKnowledgeBaseService();

    // Use centralized Redis connection options (includes maxRetriesPerRequest: null for BullMQ)
    // Override lazyConnect: false — BullMQ Worker.duplicate() inherits lazyConnect and may never connect
    const connection = { ...getRedisConnectionOptions(), lazyConnect: false };

    // Use centralized job defaults for AI embedding operations
    const jobDefaults = getDefaultJobOptions('AI_EMBEDDING');

    this.queue = new Queue<EmailEmbeddingJob>(QUEUE_NAMES.EMAIL_EMBEDDING, {
      connection,
      defaultJobOptions: {
        ...jobDefaults,
        removeOnFail: 1000, // Override: keep more for embedding debugging
      },
    });

    this.worker = new Worker<EmailEmbeddingJob, boolean>(
      QUEUE_NAMES.EMAIL_EMBEDDING,
      async (job: Job<EmailEmbeddingJob>) => {
        this.logger.debug(`Processing email embedding job ${job.id}`);
        try {
          // BullMQ workers run outside HTTP context — bypass tenant scoping for Prisma calls
          return await withoutTenantScopingAsync(() =>
            this.resolveKnowledgeBaseService().createEmbeddingForEmail(job.data),
          );
        } catch (error) {
          if (isRateLimitError(error)) {
            const delayMs = this.computeBackoffDelay(job.attemptsMade, error);
            this.logger.warn(
              `Rate limit hit for email embedding job ${job.id}. Retry ${job.attemptsMade + 1}/${job.opts.attempts} in ${Math.round(delayMs / 1000)}s`,
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
        connection,
        concurrency: this.WORKER_CONCURRENCY,
        limiter: {
          max: this.RATE_MAX,
          duration: this.RATE_DURATION_MS,
        },
        lockDuration: this.WORKER_LOCK_MS, // long embeddings shouldn't stall
        stalledInterval: Math.max(1000, Math.floor(this.WORKER_LOCK_MS / 2)),
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.verbose(`Email embedding job ${job.id} completed`);
    });

    this.worker.on('failed', async (job, error) => {
      const jobId = job?.id ?? 'unknown';
      const errorMessage = error?.message ?? String(error);
      this.logger.warn(`Email embedding job ${jobId} failed: ${errorMessage}`);

      // Phase 1: Add to DLQ if this is the last retry attempt
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
            providerId: job.data.providerId,
            emailId: job.data.emailId,
            subject: job.data.subject,
            queueName: job.queueName,
          },
        );

        // Create alert for permanent embedding failure
        const alert = this.alertingService.createAlert(
          'critical',
          'ai_embedding_failed',
          `Email embedding permanently failed for email ${job.data.emailId} (tenant: ${job.data.tenantId}) after ${MAX_ATTEMPTS} attempts: ${errorMessage}`,
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
  }

  async enqueue(job: EmailEmbeddingJob): Promise<void> {
    await this.enqueueMany([job]);
  }

  async enqueueMany(jobs: EmailEmbeddingJob[]): Promise<void> {
    if (!jobs.length) return;

    // Check if embeddings are disabled (for stress testing)
    const embeddingsEnabled = this.config.get<boolean>('ai.features.embeddingsEnabled');
    const aiEnabled = this.config.get<boolean>('ai.features.aiEnabled');
    if (embeddingsEnabled === false || aiEnabled === false) {
      this.logger.debug(`Embeddings disabled (DISABLE_EMBEDDINGS=${!embeddingsEnabled}, DISABLE_AI=${!aiEnabled}), skipping ${jobs.length} jobs`);
      return;
    }

    // Prevent memory leak: clear seenIds if it grows too large
    if (this.seenIds.size > this.MAX_SEEN_IDS) {
      this.logger.debug(`Clearing seenIds cache (size: ${this.seenIds.size} > ${this.MAX_SEEN_IDS})`);
      this.seenIds.clear();
    }

    for (const job of jobs) {
      if (job.emailId && this.seenIds.has(job.emailId)) {
        continue;
      }
      if (job.emailId) {
        this.seenIds.add(job.emailId);
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
        jobId: job.emailId,
        attempts: 6,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }));

    await this.queue.addBulk(bullJobs);
    this.logger.verbose(`Queued ${bullJobs.length} embedding job(s) in bulk`);
  }

  private scheduleFlush() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      void this.flushPending().catch((err) =>
        this.logger.warn(
          `Failed to flush embedding jobs: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, this.FLUSH_MS);
  }

  /**
   * Best-effort removal of a queued embedding job for a specific email.
   * Uses emailId as jobId (set during enqueue). Does nothing if job is already processing.
   */
  async removeJobForEmail(emailId: string): Promise<boolean> {
    if (!this.queue || !emailId) return false;
    try {
      // BullMQ Queue.remove works for waiting/delayed jobs (not active)
      const removed = await this.queue.remove(emailId);
      if (removed) {
        this.seenIds.delete(emailId);
        this.logger.debug(`Removed queued embedding job for email ${emailId}`);
      }
      return !!removed;
    } catch {
      // Job may already be active or completed — not an error
      return false;
    }
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
      `Removed ${removed} pending email embedding job(s) for tenant ${tenantId}.`,
    );

    return removed;
  }

  async removeJobsForProvider(providerId: string): Promise<number> {
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
      if (job?.data?.providerId === providerId) {
        await job.remove();
        removed += 1;
      }
    }

    if (removed > 0) {
      this.logger.verbose(
        `Removed ${removed} pending email embedding job(s) for provider ${providerId}.`,
      );
    }

    return removed;
  }

  // NOTE: isRateLimitError DELETED - use import from common/utils/error.utils
  // Consolidated in Phase 4 (2025-01-05)

  /**
   * Extract Retry-After value from error response (in seconds)
   */
  private extractRetryAfter(error: unknown): number | null {
    if (!error) return null;

    // Type guard for error objects with potential headers
    const err = error as Record<string, unknown>;
    const response = err.response as Record<string, unknown> | undefined;
    const responseHeaders = response?.headers as Record<string, unknown> | undefined;
    const errHeaders = err.headers as Record<string, unknown> | undefined;

    // Check for Retry-After header in response
    const retryAfter =
      responseHeaders?.['retry-after'] ??
      errHeaders?.['retry-after'] ??
      err.retryAfter;

    if (retryAfter !== undefined && retryAfter !== null) {
      // Handle different types: number, string, or object
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

  /**
   * Compute backoff delay for rate limit retries
   * Uses exponential backoff with configurable base and max delays
   * Respects Retry-After header if available
   */
  private computeBackoffDelay(attemptsMade: number, error?: unknown): number {
    // First, check for Retry-After header from API
    const retryAfterSeconds = this.extractRetryAfter(error);
    if (retryAfterSeconds !== null) {
      // Convert to ms and add small jitter
      const delayMs = retryAfterSeconds * 1000 + Math.random() * 1000;
      return Math.min(delayMs, this.RATE_LIMIT_MAX_DELAY_MS);
    }

    // Exponential backoff: baseDelay * 2^attemptsMade
    const exponent = Math.max(0, attemptsMade);
    const delay = this.RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, exponent);

    // Add jitter (10-20% random variation) to prevent thundering herd
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
      throw new Error('KNOWLEDGE_BASE provider is unavailable for EmailEmbeddingQueueService');
    }

    this.knowledgeBaseService = knowledgeBaseService;
    return knowledgeBaseService;
  }
}
