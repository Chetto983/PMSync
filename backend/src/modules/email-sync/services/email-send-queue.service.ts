/**
 * EmailSendQueueService
 *
 * BullMQ queue service for sending outbound emails through providers.
 * Handles email composition, scheduling, retry logic, and delivery tracking.
 *
 * Key Features:
 * - Priority queuing (urgent vs scheduled)
 * - Scheduled send support (send later)
 * - Retry with exponential backoff
 * - Rate limiting per provider
 * - Draft auto-save integration
 * - Delivery status tracking
 *
 * Usage:
 * ```typescript
 * // Queue an email for immediate send
 * await emailSendQueue.enqueueSend({
 *   tenantId: 'tenant-123',
 *   providerId: 'provider-456',
 *   providerType: 'google',
 *   email: {
 *     to: ['user@example.com'],
 *     subject: 'Hello',
 *     body: 'Email body',
 *   },
 *   priority: 'high',
 * });
 *
 * // Schedule for later
 * await emailSendQueue.scheduleSend({
 *   ...data,
 *   scheduledAt: '2024-01-15T10:00:00Z',
 * });
 * ```
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents, JobType } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';

/**
 * Email recipient with optional name
 */
export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  filename: string;
  content?: string; // Base64 encoded
  contentType?: string;
  size?: number;
  /** Reference to stored attachment ID */
  attachmentId?: string;
}

/**
 * Email content for sending
 */
export interface OutboundEmail {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
  /** Reply to message ID */
  inReplyTo?: string;
  /** Thread ID for replies */
  threadId?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * Send job data
 */
export interface EmailSendJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'imap';
  email: OutboundEmail;
  /** Draft ID if saving as draft first */
  draftId?: string;
  /** Scheduled send time (ISO string) */
  scheduledAt?: string;
  /** Priority (high for user-initiated, normal for automated) */
  priority?: 'high' | 'normal';
  /** Idempotency key to prevent duplicates */
  idempotencyKey?: string;
  /** Request timestamp */
  requestedAt: string;
  /** Retry count */
  retryCount?: number;
}

/**
 * Send job result
 */
export interface EmailSendJobResult {
  success: boolean;
  /** Provider message ID after send */
  messageId?: string;
  /** Thread ID */
  threadId?: string;
  /** Error message if failed */
  error?: string;
  /** Delivery timestamp */
  sentAt?: string;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Queue metrics
 */
export interface EmailSendQueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  scheduled: number;
  avgDurationMs: number;
  lastSentAt?: string;
  lastError?: string;
}

interface InternalMetrics {
  completed: number;
  failed: number;
  totalDurationMs: number;
  lastSentAt?: string;
  lastError?: string;
}

@Injectable()
export class EmailSendQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailSendQueueService.name);
  private redisConnection: Redis;
  private queue: Queue<EmailSendJobData, EmailSendJobResult>;
  private queueEvents: QueueEvents;

  private readonly metrics: InternalMetrics = {
    completed: 0,
    failed: 0,
    totalDurationMs: 0,
  };

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => DeadLetterQueueService))
    private readonly deadLetterQueue: DeadLetterQueueService,
  ) {}

  async onModuleInit() {
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.logger.log(
      `Connecting to Redis for email send queue at ${redisOptions.host}:${redisOptions.port}`,
    );

    // Use HIGH priority defaults (user-initiated sends)
    const jobDefaults = getDefaultJobOptions('HIGH');

    this.queue = new Queue<EmailSendJobData, EmailSendJobResult>(QUEUE_NAMES.EMAIL_SEND, {
      connection: this.redisConnection,
      defaultJobOptions: {
        ...jobDefaults,
        attempts: 3, // Fewer retries for sends (avoid duplicate emails)
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 10s, 20s
        },
      },
    });

    this.setupQueueEvents();

    this.logger.log('Email send queue initialized successfully');
  }

  private setupQueueEvents() {
    this.queueEvents = new QueueEvents(QUEUE_NAMES.EMAIL_SEND, {
      connection: this.redisConnection,
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.logger.debug(`Email send job ${jobId} completed`);
      this.recordCompletion(jobId).catch((error) => {
        this.logger.debug(
          `Failed to record metrics for job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.warn(`Email send job ${jobId} failed: ${failedReason}`);
      this.recordFailure(failedReason);

      // Add to DLQ if job exhausted all retries
      this.handlePermanentFailure(jobId, failedReason).catch((err) => {
        this.logger.error(`Failed to add job ${jobId} to DLQ: ${err instanceof Error ? err.message : String(err)}`);
      });
    });

    this.queueEvents.on('delayed', ({ jobId, delay }) => {
      this.logger.debug(`Email send job ${jobId} delayed for ${delay}ms`);
    });
  }

  /**
   * Enqueue an email for immediate sending.
   *
   * @returns Job ID for tracking
   */
  async enqueueSend(data: EmailSendJobData): Promise<string> {
    // Generate idempotency key if not provided
    const idempotencyKey =
      data.idempotencyKey ||
      `send-${data.providerId}-${data.email.to.map((r) => r.email).join(',')}-${Date.now()}`;

    // Check for duplicate send
    const existingJob = await this.queue.getJob(idempotencyKey);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') {
        this.logger.warn(`Duplicate send detected, returning existing job ${existingJob.id}`);
        return existingJob.id || idempotencyKey;
      }
    }

    const job = await this.queue.add('send', data, {
      jobId: idempotencyKey,
      priority: data.priority === 'high' ? 1 : 5,
    });

    this.logger.log(
      `Queued email send: to ${data.email.to.map((r) => r.email).join(', ')} via ${data.providerType} [${job.id}]`,
    );

    return job.id || idempotencyKey;
  }

  /**
   * Schedule an email for later sending.
   *
   * @param data - Job data with scheduledAt timestamp
   * @returns Job ID for tracking
   */
  async scheduleSend(data: EmailSendJobData & { scheduledAt: string }): Promise<string> {
    const scheduledTime = new Date(data.scheduledAt).getTime();
    const now = Date.now();
    const delay = Math.max(0, scheduledTime - now);

    const idempotencyKey =
      data.idempotencyKey || `scheduled-${data.providerId}-${data.scheduledAt}-${Date.now()}`;

    const job = await this.queue.add('scheduled-send', data, {
      jobId: idempotencyKey,
      delay,
      priority: 10, // Lower priority than immediate sends
    });

    this.logger.log(
      `Scheduled email send: to ${data.email.to.map((r) => r.email).join(', ')} at ${data.scheduledAt} [${job.id}]`,
    );

    return job.id || idempotencyKey;
  }

  /**
   * Cancel a scheduled send.
   *
   * @returns true if cancelled, false if not found or already sent
   */
  async cancelScheduledSend(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;

    const state = await job.getState();
    if (state === 'delayed' || state === 'waiting') {
      await job.remove();
      this.logger.log(`Cancelled scheduled send: ${jobId}`);
      return true;
    }

    return false;
  }

  /**
   * Get job status by ID.
   */
  async getJobStatus(
    jobId: string,
  ): Promise<{ state: string; result?: EmailSendJobResult; scheduledAt?: string } | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const result = job.returnvalue as EmailSendJobResult | undefined;
    const scheduledAt = job.data.scheduledAt;

    return { state, result, scheduledAt };
  }

  /**
   * Get all scheduled sends for a tenant.
   */
  async getScheduledSendsForTenant(tenantId: string): Promise<EmailSendJobData[]> {
    const delayedJobs = await this.queue.getJobs(['delayed'], 0, -1);

    return delayedJobs.filter((job) => job?.data?.tenantId === tenantId).map((job) => job.data);
  }

  /**
   * Get queue status and metrics.
   */
  async getQueueStatus(): Promise<EmailSendQueueMetrics> {
    const counts = await this.queue.getJobCounts();
    const delayedJobs = await this.queue.getJobs(['delayed'], 0, -1);

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      scheduled: delayedJobs.filter((j) => j?.data?.scheduledAt).length,
      avgDurationMs:
        this.metrics.completed > 0
          ? Math.round(this.metrics.totalDurationMs / this.metrics.completed)
          : 0,
      lastSentAt: this.metrics.lastSentAt,
      lastError: this.metrics.lastError,
    };
  }

  /**
   * Remove all pending jobs for a tenant.
   */
  async removeJobsForTenant(tenantId: string): Promise<number> {
    const states: JobType[] = ['waiting', 'delayed', 'paused'];
    const jobs = await this.queue.getJobs(states, 0, -1);
    let removed = 0;

    for (const job of jobs) {
      if (job?.data?.tenantId === tenantId) {
        await job.remove();
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} pending email send jobs for tenant ${tenantId}`);
    }

    return removed;
  }

  /**
   * Remove all pending jobs for a provider.
   */
  async removeJobsForProvider(providerId: string): Promise<number> {
    const states: JobType[] = ['waiting', 'delayed', 'paused'];
    const jobs = await this.queue.getJobs(states, 0, -1);
    let removed = 0;

    for (const job of jobs) {
      if (job?.data?.providerId === providerId) {
        await job.remove();
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} pending email send jobs for provider ${providerId}`);
    }

    return removed;
  }

  /**
   * Pause queue processing.
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    this.logger.log('Email send queue paused');
  }

  /**
   * Resume queue processing.
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    this.logger.log('Email send queue resumed');
  }

  /**
   * Get the underlying queue (for worker access).
   */
  getQueue(): Queue<EmailSendJobData, EmailSendJobResult> {
    return this.queue;
  }

  private async recordCompletion(jobId: string) {
    this.metrics.completed++;
    this.metrics.lastSentAt = new Date().toISOString();

    try {
      const job = await this.queue.getJob(jobId);
      if (job?.processedOn != null && job?.finishedOn != null) {
        const duration = job.finishedOn - job.processedOn;
        if (Number.isFinite(duration) && duration >= 0) {
          this.metrics.totalDurationMs += duration;
        }
      }
    } catch {
      // Ignore errors when fetching job metrics
    }
  }

  private recordFailure(failedReason?: string) {
    this.metrics.failed++;
    this.metrics.lastError = failedReason;
  }

  /**
   * Handle permanently failed jobs by adding them to the DLQ
   */
  private async handlePermanentFailure(jobId: string, failedReason?: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) return;

    // Check if job has exhausted all retries (attemptsMade >= attempts)
    const maxAttempts = job.opts.attempts || 3;
    if (job.attemptsMade < maxAttempts) {
      return; // Job still has retries remaining
    }

    // Add to DLQ
    await this.deadLetterQueue.addToDeadLetter(
      jobId,
      QUEUE_NAMES.EMAIL_SEND,
      job.data,
      new Error(failedReason || 'Unknown error'),
      job.attemptsMade,
      {
        providerId: job.data.providerId,
        providerType: job.data.providerType,
        recipients: job.data.email.to.map((r) => r.email).join(', '),
      },
    );
  }

  async onModuleDestroy() {
    this.logger.log('Closing email send queue...');

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
        `Email send queue shutdown error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.logger.log('Email send queue closed');
    }
  }
}
