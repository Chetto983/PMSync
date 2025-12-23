/**
 * Abstract Calendar Webhook Service
 *
 * Base class for calendar webhook services that handles common functionality:
 * - BullMQ queue/worker setup for scheduled renewals
 * - Module lifecycle (init/destroy)
 * - Subscription renewal logic (expiring + failed retry)
 * - Statistics retrieval
 *
 * Concrete implementations (Google, Microsoft) provide:
 * - Provider-specific subscription setup
 * - Notification handling
 * - Subscription deletion
 */

import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { CalendarSyncQueueService } from './calendar-sync-queue.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';

/**
 * Webhook subscription statistics
 */
export interface WebhookStats {
  activeSubscriptions: number;
  recentNotifications: number;
  lastNotifications: Array<{
    providerId: string;
    notificationCount: number | null;
    lastNotificationAt: Date | null;
  }>;
}

/**
 * Abstract base class for calendar webhook services
 */
export abstract class AbstractCalendarWebhookService implements OnModuleInit, OnModuleDestroy {
  protected abstract readonly logger: Logger;

  /** BullMQ queue for webhook maintenance */
  private maintenanceQueue: Queue | null = null;
  private maintenanceWorker: Worker | null = null;
  private redisConnection: Redis | null = null;

  protected readonly jobsEnabled: boolean;
  protected readonly webhookRenewalIntervalHours: number;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly crypto: CryptoService,
    protected readonly config: ConfigService,
    protected readonly calendarSyncQueue: CalendarSyncQueueService,
  ) {
    this.jobsEnabled =
      (this.config.get<string>('JOBS_ENABLED') || 'true').toLowerCase() !== 'false';
    this.webhookRenewalIntervalHours = this.config.get<number>(
      this.getRenewalIntervalConfigKey(),
      6,
    );
  }

  /**
   * Called after construction to log disabled state if applicable
   */
  protected logDisabledStateIfNeeded(): void {
    if (!this.jobsEnabled) {
      this.logger.warn(`${this.constructor.name} disabled via JOBS_ENABLED=false`);
    }
  }

  // ============================================================================
  // ABSTRACT METHODS - Must be implemented by concrete classes
  // ============================================================================

  /**
   * Get provider type ('google' | 'microsoft')
   */
  protected abstract get providerType(): string;

  /**
   * Get resource path filter for this provider's calendar webhooks
   * Google: /calendar/, Microsoft: /me/events
   */
  protected abstract get resourcePathFilter(): { startsWith?: string; equals?: string };

  /**
   * Get the job name for scheduled renewal
   */
  protected abstract get renewalJobName(): string;

  /**
   * Get config key for renewal interval
   */
  protected abstract getRenewalIntervalConfigKey(): string;

  /**
   * Setup webhook subscription for a provider
   */
  abstract setupSubscription(providerId: string): Promise<void>;

  /**
   * Delete/stop webhook subscription for a provider
   */
  abstract deleteSubscription(providerId: string): Promise<void>;

  // ============================================================================
  // MODULE LIFECYCLE - Common implementation
  // ============================================================================

  async onModuleInit(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }

    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    // Create maintenance queue
    this.maintenanceQueue = new Queue(QUEUE_NAMES.WEBHOOK_MAINTENANCE, {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    // Create worker to process renewal jobs
    this.maintenanceWorker = new Worker(
      QUEUE_NAMES.WEBHOOK_MAINTENANCE,
      async (job: Job) => {
        if (job.name === this.renewalJobName) {
          await this.handleScheduledRenewal();
        }
      },
      {
        connection: this.redisConnection,
        concurrency: 1, // Only one renewal at a time
      },
    );

    this.maintenanceWorker.on('completed', (job) => {
      this.logger.debug(`Webhook maintenance job ${job.id} completed`);
    });

    this.maintenanceWorker.on('failed', (job, error) => {
      this.logger.error(`Webhook maintenance job ${job?.id} failed: ${error.message}`);
    });

    // Schedule repeatable job for webhook renewal (every N hours)
    await this.maintenanceQueue.add(
      this.renewalJobName,
      { type: this.providerType },
      {
        repeat: {
          every: this.webhookRenewalIntervalHours * 60 * 60 * 1000,
        },
        jobId: `${this.renewalJobName}-repeatable`,
      },
    );

    this.logger.log(
      `${this.providerType} Calendar webhook renewal scheduled every ${this.webhookRenewalIntervalHours} hours via Redis`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.maintenanceWorker) {
      await this.maintenanceWorker.close();
    }
    if (this.maintenanceQueue) {
      await this.maintenanceQueue.close();
    }
    if (this.redisConnection && this.redisConnection.status !== 'end') {
      await this.redisConnection.quit();
    }
    this.logger.log(`${this.providerType} Calendar webhook service shut down`);
  }

  // ============================================================================
  // RENEWAL LOGIC - Common implementation
  // ============================================================================

  /**
   * Handle scheduled webhook renewal (called by BullMQ repeatable job)
   */
  protected async handleScheduledRenewal(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }
    try {
      const renewed = await this.renewExpiringSoon();
      if (renewed > 0) {
        this.logger.log(
          `Renewed ${renewed} ${this.providerType} Calendar webhook subscriptions via scheduled job`,
        );
      }
    } catch (error) {
      this.logger.error(`Scheduled ${this.providerType} Calendar webhook renewal failed:`, error);
    }
  }

  /**
   * Renew subscriptions that are about to expire
   */
  async renewExpiringSoon(): Promise<number> {
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

    // Build resource path filter
    const resourcePathWhere = this.resourcePathFilter.startsWith
      ? { startsWith: this.resourcePathFilter.startsWith }
      : this.resourcePathFilter.equals;

    const expiring = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: this.providerType,
        resourcePath: resourcePathWhere,
        isActive: true,
        expiresAt: {
          lte: oneDayFromNow,
        },
      },
    });

    // Also find failed subscriptions that should be retried
    const failedSubscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: this.providerType,
        resourcePath: resourcePathWhere,
        isActive: false,
        errorCount: { lt: 10 }, // Don't retry if too many failures
        provider: {
          isActive: true,
          supportsCalendar: true,
        },
      },
      include: {
        provider: {
          select: { email: true },
        },
      },
    });

    let renewed = 0;

    this.logger.log(
      `Found ${expiring.length} ${this.providerType} Calendar subscriptions to renew, ${failedSubscriptions.length} failed to retry`,
    );

    // Renew expiring subscriptions
    for (const subscription of expiring) {
      try {
        const success = await this.renewSingleSubscription(subscription.providerId);
        if (success) {
          renewed++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to renew ${this.providerType} Calendar subscription for ${subscription.providerId}:`,
          error,
        );
      }
    }

    // Retry failed subscriptions
    for (const subscription of failedSubscriptions) {
      try {
        this.logger.log(
          `Retrying failed ${this.providerType} Calendar subscription for ${subscription.provider?.email}...`,
        );
        await this.setupSubscription(subscription.providerId);
        renewed++;
        this.logger.log(
          `Successfully recreated ${this.providerType} Calendar subscription for ${subscription.provider?.email}`,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to retry calendar subscription for ${subscription.provider?.email}: ${errorMessage}`,
        );
        // Increment error count
        await this.prisma.webhookSubscription.update({
          where: { id: subscription.id },
          data: {
            errorCount: { increment: 1 },
            lastError: errorMessage,
          },
        });
      }
    }

    return renewed;
  }

  /**
   * Renew a single subscription - can be overridden by concrete classes
   * Default implementation calls setupSubscription (works for Google)
   */
  protected async renewSingleSubscription(providerId: string): Promise<boolean> {
    await this.setupSubscription(providerId);
    return true;
  }

  // ============================================================================
  // STATISTICS - Common implementation
  // ============================================================================

  /**
   * Get webhook statistics
   */
  async getStats(): Promise<WebhookStats> {
    // Build resource path filter
    const resourcePathWhere = this.resourcePathFilter.startsWith
      ? { startsWith: this.resourcePathFilter.startsWith }
      : this.resourcePathFilter.equals;

    const total = await this.prisma.webhookSubscription.count({
      where: {
        providerType: this.providerType,
        resourcePath: resourcePathWhere,
        isActive: true,
      },
    });

    const recentNotifications = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: this.providerType,
        resourcePath: resourcePathWhere,
        isActive: true,
        lastNotificationAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24h
        },
      },
      select: {
        providerId: true,
        notificationCount: true,
        lastNotificationAt: true,
      },
    });

    return {
      activeSubscriptions: total,
      recentNotifications: recentNotifications.length,
      lastNotifications: recentNotifications,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Decrypt access token from provider
   */
  protected decryptAccessToken(accessToken: string, iv: string): string {
    return this.crypto.decrypt(accessToken, iv);
  }

  /**
   * Queue a calendar sync job for a provider
   */
  protected async queueCalendarSync(
    tenantId: string,
    providerId: string,
    email: string,
  ): Promise<void> {
    await this.calendarSyncQueue.addSyncJob({
      tenantId,
      providerId,
      providerType: this.providerType as 'google' | 'microsoft',
      email,
      priority: 'high', // High priority for real-time webhook triggers
    });
    this.logger.debug(`Queued calendar sync for provider ${providerId}`);
  }

  /**
   * Update subscription notification stats
   */
  protected async updateSubscriptionStats(subscriptionId: string): Promise<void> {
    await this.prisma.webhookSubscription.update({
      where: { id: subscriptionId },
      data: {
        lastNotificationAt: new Date(),
        notificationCount: { increment: 1 },
      },
    });
  }
}
