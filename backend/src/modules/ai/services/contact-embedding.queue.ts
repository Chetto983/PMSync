import { Job, Queue, Worker } from 'bullmq';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeBaseService } from './knowledge-base.service';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { AlertingService } from '../../../common/services/alerting.service';
import { isRateLimitError } from '../../../common/utils/error.utils';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config';

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

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => KnowledgeBaseService))
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly dlqService: DeadLetterQueueService,
    private readonly alertingService: AlertingService,
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
  }

  onModuleInit() {
    const connection = getRedisConnectionOptions();
    const jobDefaults = getDefaultJobOptions('AI_EMBEDDING');

    this.queue = new Queue<ContactEmbeddingJob>(QUEUE_NAMES.CONTACT_EMBEDDING, {
      connection,
      defaultJobOptions: {
        ...jobDefaults,
        removeOnFail: 1000,
      },
    });

    this.worker = new Worker<ContactEmbeddingJob, boolean>(
      QUEUE_NAMES.CONTACT_EMBEDDING,
      async (job: Job<ContactEmbeddingJob>) => {
        this.logger.debug(`Processing contact embedding job ${job.id}`);
        try {
          return await this.knowledgeBaseService.createEmbeddingForContact(job.data);
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
        connection,
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
}
