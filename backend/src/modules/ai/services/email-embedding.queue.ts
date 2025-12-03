import { Job, Queue, Worker } from 'bullmq';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeBaseService } from './knowledge-base.service';

export interface EmailEmbeddingJob {
  tenantId: string;
  providerId?: string;
  emailId: string;
  subject: string;
  snippet?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  from?: string | null;
  receivedAt?: string | Date | null;
}

@Injectable()
export class EmailEmbeddingQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailEmbeddingQueueService.name);
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
  private readonly seenIds = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => KnowledgeBaseService))
    private readonly knowledgeBaseService: KnowledgeBaseService,
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
    const connection = {
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.config.get<number>('REDIS_PORT', 6379)),
      password: this.config.get<string>('REDIS_PASSWORD'),
    };

    this.queue = new Queue<EmailEmbeddingJob>('email-embedding', {
      connection,
      defaultJobOptions: {
        attempts: 6,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    });

    this.worker = new Worker<EmailEmbeddingJob, boolean>(
      'email-embedding',
      async (job: Job<EmailEmbeddingJob>) => {
        this.logger.debug(`Processing email embedding job ${job.id}`);
        try {
          return await this.knowledgeBaseService.createEmbeddingForEmail(job.data);
        } catch (error) {
          if (this.isRateLimitError(error)) {
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
        lockDuration: this.WORKER_LOCK_MS, // long embeddings shouldn’t stall
        stalledInterval: Math.max(1000, Math.floor(this.WORKER_LOCK_MS / 2)),
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.verbose(`Email embedding job ${job.id} completed`);
    });

    this.worker.on('failed', (job, error) => {
      const jobId = job?.id ?? 'unknown';
      this.logger.warn(`Email embedding job ${jobId} failed: ${error?.message ?? error}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
  }

  async enqueue(job: EmailEmbeddingJob) {
    await this.enqueueMany([job]);
  }

  async enqueueMany(jobs: EmailEmbeddingJob[]) {
    if (!jobs.length) return;

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

    const jobs = await this.queue.getJobs(removableStates, 0, -1);
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

    const jobs = await this.queue.getJobs(removableStates, 0, -1);
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

  private isRateLimitError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    // Check HTTP status codes
    const possibleStatus =
      (error as any)?.status ??
      (error as any)?.statusCode ??
      (error as any)?.response?.status ??
      (error as any)?.response?.statusCode;

    if (typeof possibleStatus === 'number' && possibleStatus === 429) {
      return true;
    }

    // Check error message for rate limit indicators
    if (error instanceof Error && typeof error.message === 'string') {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('quota exceeded')
      );
    }

    return false;
  }

  /**
   * Extract Retry-After value from error response (in seconds)
   */
  private extractRetryAfter(error: unknown): number | null {
    if (!error) return null;

    // Check for Retry-After header in response
    const retryAfter =
      (error as any)?.response?.headers?.['retry-after'] ??
      (error as any)?.headers?.['retry-after'] ??
      (error as any)?.retryAfter;

    if (retryAfter !== undefined && retryAfter !== null) {
      const parsed = parseInt(String(retryAfter), 10);
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
}
