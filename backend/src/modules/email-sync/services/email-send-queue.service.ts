/**
 * EmailSendQueueService
 *
 * BullMQ queue service for sending outbound emails through providers.
 * Extends BaseQueueService for common queue boilerplate.
 *
 * Key Features:
 * - Priority queuing (urgent vs scheduled)
 * - Scheduled send support (send later)
 * - Retry with exponential backoff
 * - Rate limiting per provider
 * - Draft auto-save integration
 * - Delivery status tracking
 *
 * CONSOLIDATION DC-5: Extends BaseQueueService to eliminate ~150 lines of boilerplate
 */
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions } from 'bullmq';
import * as crypto from 'crypto';
import { QUEUE_NAMES } from '../../../common/config';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { BaseQueueService, QueuePriority } from './base-queue.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';

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
  /** Correlation ID from the originating HTTP request */
  requestId?: string;
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
 * Queue metrics (extends base metrics with send-specific fields)
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

/**
 * Extended internal metrics for send queue
 */
interface SendQueueMetrics {
  lastSentAt?: string;
}

@Injectable()
export class EmailSendQueueService extends BaseQueueService<EmailSendJobData, EmailSendJobResult> {
  private readonly sendMetrics: SendQueueMetrics = {};

  constructor(
    configService: ConfigService,
    @Inject(forwardRef(() => DeadLetterQueueService))
    deadLetterQueue: DeadLetterQueueService,
  ) {
    super(configService, deadLetterQueue);
  }

  // ==================== BaseQueueService Abstract Implementations ====================

  protected getQueueName(): string {
    return QUEUE_NAMES.EMAIL_SEND;
  }

  protected getQueuePriority(): QueuePriority {
    return 'HIGH'; // User-initiated sends
  }

  protected getJobDefaultOverrides(): Partial<JobsOptions> {
    return {
      attempts: 3, // Fewer retries for sends (avoid duplicate emails)
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      },
    };
  }

  protected setupCustomEvents(): void {
    this.queueEvents.on('delayed', ({ jobId, delay }) => {
      this.logger.debug(`Email send job ${jobId} delayed for ${delay}ms`);
    });
  }

  protected extractDlqMetadata(jobData: EmailSendJobData): Record<string, any> {
    return {
      providerId: jobData.providerId,
      providerType: jobData.providerType,
      recipients: jobData.email.to.map((r) => r.email).join(', '),
    };
  }

  // ==================== Override recordCompletion for lastSentAt ====================

  protected async recordCompletion(jobId: string): Promise<void> {
    await super.recordCompletion(jobId);
    this.sendMetrics.lastSentAt = new Date().toISOString();
  }

  // ==================== Email Send Business Logic ====================

  /**
   * Generate deterministic idempotency key from email content
   * AUDIT FIX #4: Uses content hash instead of Date.now() to properly dedupe retries
   */
  private generateIdempotencyKey(data: EmailSendJobData, prefix: string = 'send'): string {
    const email = data.email;

    const contentParts = [
      data.tenantId,
      data.providerId,
      email.to.map((r) => r.email).sort().join(','),
      email.cc?.map((r) => r.email).sort().join(',') || '',
      email.bcc?.map((r) => r.email).sort().join(',') || '',
      email.subject || '',
      (email.bodyText || email.bodyHtml || '').substring(0, 200),
      email.inReplyTo || '',
      data.scheduledAt || '',
    ];

    const contentString = contentParts.join('|');
    const hash = crypto.createHash('sha256').update(contentString).digest('hex').substring(0, 16);

    return `${prefix}-${data.providerId.substring(0, 8)}-${hash}`;
  }

  /**
   * Enqueue an email for immediate sending.
   */
  async enqueueSend(data: EmailSendJobData): Promise<string> {
    const idempotencyKey = data.idempotencyKey || this.generateIdempotencyKey(data, 'send');

    // Check for duplicate send
    const existingJob = await this.queue.getJob(idempotencyKey);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') {
        this.logger.warn(`Duplicate send detected, returning existing job ${existingJob.id}`);
        return existingJob.id || idempotencyKey;
      }
    }

    const job = await this.queue.add('send', {
      ...data,
      requestId: CorrelationContext.getContext()?.correlationId,
    } as EmailSendJobData, {
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
   */
  async scheduleSend(data: EmailSendJobData & { scheduledAt: string }): Promise<string> {
    const scheduledTime = new Date(data.scheduledAt).getTime();
    const now = Date.now();
    const delay = Math.max(0, scheduledTime - now);

    const idempotencyKey = data.idempotencyKey || this.generateIdempotencyKey(data, 'scheduled');

    const job = await this.queue.add('scheduled-send', {
      ...data,
      requestId: CorrelationContext.getContext()?.correlationId,
    } as EmailSendJobData & { scheduledAt: string }, {
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
    const baseMetrics = await this.getBaseMetrics();
    const delayedJobs = await this.queue.getJobs(['delayed'], 0, -1);

    return {
      ...baseMetrics,
      scheduled: delayedJobs.filter((j) => j?.data?.scheduledAt).length,
      avgDurationMs: this.getAverageDuration(),
      lastSentAt: this.sendMetrics.lastSentAt,
      lastError: this.baseMetrics.lastError,
    };
  }
}
