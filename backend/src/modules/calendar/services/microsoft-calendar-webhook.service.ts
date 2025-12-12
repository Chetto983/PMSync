import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { MicrosoftCalendarSyncService } from './microsoft-calendar-sync.service';
import { CalendarSyncQueueService } from './calendar-sync-queue.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';
import { nanoid } from 'nanoid';

export const MICROSOFT_CALENDAR_RESOURCE = '/me/events';

export interface MicrosoftCalendarNotification {
  subscriptionId: string;
  clientState?: string;
  changeType: string;
  resource: string;
  subscriptionExpirationDateTime: string;
  resourceData?: {
    '@odata.type': string;
    '@odata.id': string;
    '@odata.etag': string;
    id: string;
  };
}

@Injectable()
export class MicrosoftCalendarWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MicrosoftCalendarWebhookService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private readonly WEBHOOK_URL: string;
  private readonly CLIENT_STATE: string;
  private readonly jobsEnabled: boolean;
  /** Webhook renewal check interval in hours (default: 6) */
  private readonly webhookRenewalIntervalHours: number;

  /** BullMQ queue for webhook maintenance */
  private maintenanceQueue: Queue | null = null;
  private maintenanceWorker: Worker | null = null;
  private redisConnection: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly calendarSync: MicrosoftCalendarSyncService,
    private readonly calendarSyncQueue: CalendarSyncQueueService,
  ) {
    // Derive webhook URL from API_PUBLIC_URL if not explicitly set
    const configuredWebhookUrl = this.config.get<string>('MICROSOFT_CALENDAR_WEBHOOK_URL');
    if (configuredWebhookUrl) {
      this.WEBHOOK_URL = configuredWebhookUrl;
    } else {
      const apiUrl = this.config.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
      this.WEBHOOK_URL = `${apiUrl}/webhooks/calendar/microsoft/notifications`;
    }
    this.CLIENT_STATE = this.config.get<string>('WEBHOOK_CLIENT_STATE', nanoid());
    this.jobsEnabled =
      (this.config.get<string>('JOBS_ENABLED') || 'true').toLowerCase() !== 'false';
    this.webhookRenewalIntervalHours = this.config.get<number>('MICROSOFT_CALENDAR_WEBHOOK_RENEWAL_HOURS', 6);
    if (!this.jobsEnabled) {
      this.logger.warn('MicrosoftCalendarWebhookService disabled via JOBS_ENABLED=false');
    }
  }

  async onModuleInit() {
    if (!this.jobsEnabled) {
      return;
    }

    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    // Create maintenance queue (shared with Google Calendar webhook service)
    this.maintenanceQueue = new Queue(QUEUE_NAMES.WEBHOOK_MAINTENANCE, {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    // Create worker to process Microsoft renewal jobs
    this.maintenanceWorker = new Worker(
      QUEUE_NAMES.WEBHOOK_MAINTENANCE,
      async (job: Job) => {
        if (job.name === 'microsoft-calendar-webhook-renewal') {
          await this.handleScheduledRenewal();
        }
      },
      {
        connection: this.redisConnection,
        concurrency: 1,
      },
    );

    this.maintenanceWorker.on('completed', (job) => {
      this.logger.debug(`Microsoft webhook maintenance job ${job.id} completed`);
    });

    this.maintenanceWorker.on('failed', (job, error) => {
      this.logger.error(`Microsoft webhook maintenance job ${job?.id} failed: ${error.message}`);
    });

    // Schedule repeatable job for webhook renewal (every N hours)
    await this.maintenanceQueue.add(
      'microsoft-calendar-webhook-renewal',
      { type: 'microsoft-calendar' },
      {
        repeat: {
          every: this.webhookRenewalIntervalHours * 60 * 60 * 1000,
        },
        jobId: 'microsoft-calendar-webhook-renewal-repeatable',
      },
    );

    this.logger.log(
      `Microsoft Calendar webhook renewal scheduled every ${this.webhookRenewalIntervalHours} hours via Redis`,
    );
  }

  async onModuleDestroy() {
    if (this.maintenanceWorker) {
      await this.maintenanceWorker.close();
    }
    if (this.maintenanceQueue) {
      await this.maintenanceQueue.close();
    }
    if (this.redisConnection && this.redisConnection.status !== 'end') {
      await this.redisConnection.quit();
    }
    this.logger.log('Microsoft Calendar webhook service shut down');
  }

  /**
   * Handle scheduled webhook renewal (called by BullMQ repeatable job)
   */
  private async handleScheduledRenewal(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }
    try {
      const renewed = await this.renewExpiringSoon();
      if (renewed > 0) {
        this.logger.log(`Renewed ${renewed} Microsoft Calendar webhook subscriptions via scheduled job`);
      }
    } catch (error) {
      this.logger.error('Scheduled Microsoft Calendar webhook renewal failed:', error);
    }
  }

  /**
   * Setup Microsoft Calendar webhook subscription
   */
  async setupSubscription(providerId: string): Promise<void> {
    try {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || !provider.supportsCalendar || !provider.accessToken) {
        throw new Error('Provider not found or does not support calendar');
      }

      const accessToken = this.crypto.decrypt(
        provider.accessToken,
        provider.tokenEncryptionIv!,
      );

      // Calculate expiration (max 4230 minutes = ~3 days for calendar)
      const expirationDateTime = new Date();
      expirationDateTime.setDate(expirationDateTime.getDate() + 3);

      // Create subscription for calendar events
      const subscription = {
        changeType: 'created,updated,deleted',
        notificationUrl: this.WEBHOOK_URL,
        resource: '/me/events',
        expirationDateTime: expirationDateTime.toISOString(),
        clientState: this.CLIENT_STATE,
      };

      const response = await axios.post(
        `${this.GRAPH_API_BASE}/subscriptions`,
        subscription,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const subscriptionId = response.data.id;

      // Store webhook subscription info
      await this.prisma.webhookSubscription.upsert({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: MICROSOFT_CALENDAR_RESOURCE,
          },
        },
        create: {
          tenantId: provider.tenantId,
          providerId,
          providerType: 'microsoft',
          subscriptionId,
          resourcePath: MICROSOFT_CALENDAR_RESOURCE,
          webhookUrl: this.WEBHOOK_URL,
          isActive: true,
          expiresAt: new Date(expirationDateTime),
          metadata: {
            clientState: this.CLIENT_STATE,
            changeType: 'created,updated,deleted',
          },
        },
        update: {
          subscriptionId,
          resourcePath: MICROSOFT_CALENDAR_RESOURCE,
          expiresAt: new Date(expirationDateTime),
          isActive: true,
          lastRenewedAt: new Date(),
          metadata: {
            clientState: this.CLIENT_STATE,
            changeType: 'created,updated,deleted',
          },
        },
      });

      this.logger.log(
        `Setup Microsoft Calendar subscription for provider ${providerId}, subscription ${subscriptionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to setup Microsoft Calendar subscription for provider ${providerId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Handle Microsoft Calendar notifications
   */
  async handleNotifications(
    notifications: MicrosoftCalendarNotification[],
  ): Promise<void> {
    for (const notification of notifications) {
      try {
        await this.handleSingleNotification(notification);
      } catch (error) {
        this.logger.error(
          `Error handling Microsoft Calendar notification ${notification.subscriptionId}:`,
          error,
        );
      }
    }
  }

  /**
   * Handle a single notification
   */
  private async handleSingleNotification(
    notification: MicrosoftCalendarNotification,
  ): Promise<void> {
    // Verify client state
    if (notification.clientState !== this.CLIENT_STATE) {
      this.logger.warn('Microsoft Calendar notification with invalid client state');
      return;
    }

    const subscriptionId = notification.subscriptionId;

    // Find provider by subscription ID
    const subscription = await this.prisma.webhookSubscription.findFirst({
      where: {
        subscriptionId,
        providerType: 'microsoft',
        isActive: true,
      },
    });

    if (!subscription) {
      this.logger.warn(
        `No active subscription found for Microsoft Calendar subscription ${subscriptionId}`,
      );
      return;
    }

    // Update subscription stats
    await this.prisma.webhookSubscription.update({
      where: { id: subscription.id },
      data: {
        lastNotificationAt: new Date(),
        notificationCount: { increment: 1 },
      },
    });

    this.logger.log(
      `Microsoft Calendar notification: subscription=${subscriptionId}, changeType=${notification.changeType}`,
    );

    // Queue calendar sync for this provider (high priority for real-time webhooks)
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: subscription.providerId },
      select: { tenantId: true, email: true },
    });

    if (provider) {
      await this.calendarSyncQueue.addSyncJob({
        tenantId: provider.tenantId,
        providerId: subscription.providerId,
        providerType: 'microsoft',
        email: provider.email,
        priority: 'high', // High priority for real-time webhook triggers
      });
      this.logger.debug(`Queued calendar sync for provider ${subscription.providerId}`);
    }
  }

  /**
   * Renew subscriptions that are about to expire
   */
  async renewExpiringSoon(): Promise<number> {
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

    const expiring = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_CALENDAR_RESOURCE,
        isActive: true,
        expiresAt: {
          lte: oneDayFromNow,
        },
      },
    });

    let renewed = 0;

    for (const subscription of expiring) {
      try {
        const success = await this.renewSubscription(subscription.providerId);
        if (success) {
          renewed++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to renew Microsoft Calendar subscription for ${subscription.providerId}:`,
          error,
        );
      }
    }

    return renewed;
  }

  /**
   * Renew a specific subscription
   */
  private async renewSubscription(providerId: string): Promise<boolean> {
    const subscription = await this.prisma.webhookSubscription.findFirst({
      where: {
        providerId,
        resourcePath: MICROSOFT_CALENDAR_RESOURCE,
      },
    });

    if (!subscription || subscription.providerType !== 'microsoft') {
      return false;
    }

    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider || !provider.accessToken) {
      return false;
    }

    const accessToken = this.crypto.decrypt(
      provider.accessToken,
      provider.tokenEncryptionIv!,
    );

    // Calculate new expiration
    const expirationDateTime = new Date();
    expirationDateTime.setDate(expirationDateTime.getDate() + 3);

    // Update subscription
    await axios.patch(
      `${this.GRAPH_API_BASE}/subscriptions/${subscription.subscriptionId}`,
      { expirationDateTime: expirationDateTime.toISOString() },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    // Update database
    await this.prisma.webhookSubscription.update({
      where: {
        providerId_resourcePath: {
          providerId,
          resourcePath: MICROSOFT_CALENDAR_RESOURCE,
        },
      },
      data: {
        expiresAt: new Date(expirationDateTime),
        lastRenewedAt: new Date(),
      },
    });

    this.logger.log(`Renewed Microsoft Calendar subscription for provider ${providerId}`);
    return true;
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(providerId: string): Promise<void> {
    try {
      const subscription = await this.prisma.webhookSubscription.findFirst({
        where: {
          providerId,
          resourcePath: MICROSOFT_CALENDAR_RESOURCE,
        },
      });

      if (!subscription || subscription.providerType !== 'microsoft') {
        return;
      }

      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || !provider.accessToken) {
        return;
      }

      const accessToken = this.crypto.decrypt(
        provider.accessToken,
        provider.tokenEncryptionIv!,
      );

      // Delete subscription from Microsoft
      await axios.delete(
        `${this.GRAPH_API_BASE}/subscriptions/${subscription.subscriptionId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      // Mark subscription as inactive
      await this.prisma.webhookSubscription.update({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: MICROSOFT_CALENDAR_RESOURCE,
          },
        },
        data: { isActive: false },
      });

      this.logger.log(`Deleted Microsoft Calendar subscription for provider ${providerId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete Microsoft Calendar subscription for ${providerId}:`,
        error,
      );
    }
  }

  /**
   * Get webhook statistics
   */
  async getStats(): Promise<any> {
    const total = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_CALENDAR_RESOURCE,
        isActive: true,
      },
    });

    const recentNotifications = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_CALENDAR_RESOURCE,
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
}
