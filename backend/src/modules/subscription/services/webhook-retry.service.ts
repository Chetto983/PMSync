/**
 * WebhookRetryService - BullMQ queue for Autumn webhook retries
 *
 * Handles failed webhook events with exponential backoff:
 * - 6 retries: 5s, 10s, 20s, 40s, 80s, 160s
 * - Dead letter queue after max retries
 * - Idempotent processing via event ID tracking
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions } from '../../../common/config/queue.config';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

/**
 * Autumn webhook event types
 */
export type AutumnEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.paused'
  | 'customer.subscription.resumed'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed';

export interface WebhookJobData {
  eventId: string;
  eventType: AutumnEventType;
  tenantId: string;
  data: {
    customer_id: string;
    subscription_id?: string;
    product_id?: string;
    status?: string;
    current_period_start?: string;
    current_period_end?: string;
    cancel_at?: string;
  };
  receivedAt: string;
  attempt?: number;
}

const QUEUE_NAME = 'billing-webhook-retry';

@Injectable()
export class WebhookRetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookRetryService.name);
  private queue: Queue<WebhookJobData>;
  private worker: Worker<WebhookJobData>;
  private redisConnection: Redis;

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly deadLetterQueue: DeadLetterQueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    // Create queue with exponential backoff
    this.queue = new Queue<WebhookJobData>(QUEUE_NAME, {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 6, // 6 retries
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 10s, 20s, 40s, 80s, 160s
        },
        removeOnComplete: { count: 100, age: 3600 }, // Keep last 100 or 1 hour
        removeOnFail: false, // Keep failed for analysis
      },
    });

    // Create worker
    this.worker = new Worker<WebhookJobData>(
      QUEUE_NAME,
      async (job) => this.processWebhook(job),
      {
        connection: new Redis(redisOptions),
        concurrency: 5,
        lockDuration: 30000,
      },
    );

    // Handle failed jobs
    this.worker.on('failed', async (job, err) => {
      if (!job) return;

      const isMaxRetries = job.attemptsMade >= (job.opts.attempts || 6);

      if (isMaxRetries) {
        this.logger.error(
          `Webhook ${job.data.eventId} failed permanently after ${job.attemptsMade} attempts: ${err.message}`,
        );

        // Move to dead letter queue
        await this.deadLetterQueue.addToDeadLetter(
          job.id || 'unknown',
          QUEUE_NAME,
          job.data,
          err,
          job.attemptsMade,
          { eventType: job.data.eventType, tenantId: job.data.tenantId },
        );
      } else {
        this.logger.warn(
          `Webhook ${job.data.eventId} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
        );
      }
    });

    this.worker.on('completed', (job) => {
      this.logger.log(
        `Webhook ${job.data.eventId} processed successfully (attempt ${job.attemptsMade})`,
      );
    });

    this.logger.log('WebhookRetryService initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.redisConnection?.quit();
  }

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  /**
   * Enqueue a webhook for retry processing
   */
  async enqueue(jobData: WebhookJobData): Promise<string> {
    // Use eventId for deduplication
    const job = await this.queue.add(jobData.eventType, jobData, {
      jobId: `webhook-${jobData.eventId}`,
      deduplication: {
        id: jobData.eventId,
        ttl: 86400 * 1000, // 24-hour deduplication window
      },
    });

    this.logger.log(`Webhook ${jobData.eventId} enqueued for retry`);
    return job.id || jobData.eventId;
  }

  /**
   * Check if an event has been processed
   */
  async isEventProcessed(eventId: string): Promise<boolean> {
    const key = `webhook:processed:${eventId}`;
    const processed = await this.redisConnection.get(key);
    return processed === 'true';
  }

  /**
   * Mark event as processed
   */
  private async markEventProcessed(eventId: string): Promise<void> {
    const key = `webhook:processed:${eventId}`;
    // Keep processed marker for 7 days
    await this.redisConnection.set(key, 'true', 'EX', 86400 * 7);
  }

  // ==========================================================================
  // Webhook Processing
  // ==========================================================================

  /**
   * Process a webhook event
   */
  private async processWebhook(job: Job<WebhookJobData>): Promise<void> {
    const { eventId, eventType, tenantId, data } = job.data;

    // Check idempotency
    if (await this.isEventProcessed(eventId)) {
      this.logger.debug(`Webhook ${eventId} already processed, skipping`);
      return;
    }

    this.logger.log(`Processing webhook ${eventId}: ${eventType}`);

    switch (eventType) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionChange(tenantId, data);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(tenantId);
        break;

      case 'customer.subscription.paused':
        await this.handleSubscriptionPaused(tenantId);
        break;

      case 'customer.subscription.resumed':
        await this.handleSubscriptionResumed(tenantId);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(tenantId);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(tenantId);
        break;

      default:
        this.logger.debug(`Unhandled webhook event type: ${eventType}`);
    }

    // Mark as processed for idempotency
    await this.markEventProcessed(eventId);
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  private async handleSubscriptionChange(
    tenantId: string,
    data: WebhookJobData['data'],
  ): Promise<void> {
    const plan = this.mapProductToPlan(data.product_id);

    await this.subscriptionService.updatePlan(
      tenantId,
      plan,
      data.subscription_id,
    );
  }

  private async handleSubscriptionDeleted(tenantId: string): Promise<void> {
    await this.subscriptionService.updatePlan(tenantId, SubscriptionPlan.FREE);
    await this.subscriptionService.updateStatus(
      tenantId,
      SubscriptionStatus.CANCELED,
    );
  }

  private async handleSubscriptionPaused(tenantId: string): Promise<void> {
    await this.subscriptionService.updateStatus(
      tenantId,
      SubscriptionStatus.PAST_DUE,
    );
  }

  private async handleSubscriptionResumed(tenantId: string): Promise<void> {
    await this.subscriptionService.updateStatus(
      tenantId,
      SubscriptionStatus.ACTIVE,
    );
  }

  private async handlePaymentSucceeded(tenantId: string): Promise<void> {
    await this.subscriptionService.resetUsage(tenantId);
    await this.subscriptionService.updateStatus(
      tenantId,
      SubscriptionStatus.ACTIVE,
    );
  }

  private async handlePaymentFailed(tenantId: string): Promise<void> {
    await this.subscriptionService.updateStatus(
      tenantId,
      SubscriptionStatus.PAST_DUE,
    );
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Map Autumn product ID to subscription plan
   */
  private mapProductToPlan(productId?: string): SubscriptionPlan {
    if (!productId) return SubscriptionPlan.FREE;

    const productMap: Record<string, SubscriptionPlan> = {
      free: SubscriptionPlan.FREE,
      starter: SubscriptionPlan.STARTER,
      professional: SubscriptionPlan.PROFESSIONAL,
      pro: SubscriptionPlan.PROFESSIONAL,
      enterprise: SubscriptionPlan.ENTERPRISE,
    };

    return productMap[productId.toLowerCase()] || SubscriptionPlan.FREE;
  }

  /**
   * Get queue stats for monitoring
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}
