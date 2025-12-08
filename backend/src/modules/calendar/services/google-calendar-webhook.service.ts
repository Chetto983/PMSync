import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { calendar_v3, google } from 'googleapis';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { CalendarSyncQueueService } from './calendar-sync-queue.service';
import { nanoid } from 'nanoid';

export interface GoogleCalendarPushNotification {
  message: {
    data: string; // Base64 encoded
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

@Injectable()
export class GoogleCalendarWebhookService {
  private readonly logger = new Logger(GoogleCalendarWebhookService.name);
  private readonly WEBHOOK_URL: string;
  private readonly jobsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly calendarSync: GoogleCalendarSyncService,
    private readonly calendarSyncQueue: CalendarSyncQueueService,
  ) {
    const baseUrl =
      this.config.get<string>('api.url') ||
      this.config.get<string>('API_PUBLIC_URL') ||
      this.config.get<string>('BACKEND_URL') ||
      'http://localhost:3000';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.WEBHOOK_URL = `${normalizedBase}/webhooks/calendar/google/push`;
    this.jobsEnabled =
      (this.config.get<string>('JOBS_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.jobsEnabled) {
      this.logger.warn('GoogleCalendarWebhookService disabled via JOBS_ENABLED=false');
    }
  }

  /**
   * Setup Google Calendar Push Notifications for a provider
   * Similar to Gmail watch, but for Calendar API
   */
  async setupWatch(providerId: string): Promise<void> {
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

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Get list of calendars to watch
      const calendarList = await calendar.calendarList.list();
      const calendars = (calendarList.data.items || []).filter((cal) =>
        this.isWatchableCalendar(cal),
      );

      if (calendars.length === 0) {
        this.logger.warn(`No watchable calendars found for provider ${providerId}`);
        return;
      }

      for (const cal of calendars) {
        const calendarId = cal.id!;
        const resourcePath = `/calendar/v3/calendars/${calendarId}/events`;
        const channelId = `calendar-${providerId}-${nanoid()}`;
        const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

        const watchResponse = await calendar.events.watch({
          calendarId,
          requestBody: {
            id: channelId,
            type: 'web_hook',
            address: this.WEBHOOK_URL,
            expiration: expiration.toString(),
          },
        });

        // Store webhook subscription info
        await this.prisma.webhookSubscription.upsert({
          where: {
            providerId_resourcePath: {
              providerId,
              resourcePath,
            },
          },
          create: {
            tenantId: provider.tenantId,
            providerId,
            providerType: 'google',
            subscriptionId: channelId,
            resourcePath,
            webhookUrl: this.WEBHOOK_URL,
            isActive: true,
            expiresAt: new Date(expiration),
            metadata: {
              resourceId: watchResponse.data.resourceId,
              calendarId,
            },
          },
          update: {
            subscriptionId: channelId,
            resourcePath,
            expiresAt: new Date(expiration),
            isActive: true,
            lastRenewedAt: new Date(),
            metadata: {
              resourceId: watchResponse.data.resourceId,
              calendarId,
            },
          },
        });

        this.logger.log(
          `Setup Google Calendar watch for provider ${providerId}, channel ${channelId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to setup Google Calendar watch for provider ${providerId}:`,
        error,
      );
      throw error;
    }
  }

  private isWatchableCalendar(cal: calendar_v3.Schema$CalendarListEntry): boolean {
    if (!cal.id) {
      return false;
    }

    if (cal.deleted) {
      return false;
    }

    const accessRole = cal.accessRole?.toLowerCase();
    if (accessRole) {
      return ['owner', 'writer', 'editor'].includes(accessRole);
    }

    return !!cal.primary;
  }

  /**
   * Handle Google Calendar push notification
   */
  async handleNotification(headers: Record<string, string>): Promise<void> {
    try {
      const channelId = headers['x-goog-channel-id'];
      const resourceId = headers['x-goog-resource-id'];
      const resourceState = headers['x-goog-resource-state'];

      if (!channelId || !resourceId) {
        this.logger.warn('Received Google Calendar notification without required headers');
        return;
      }

      this.logger.log(
        `Google Calendar notification: channel=${channelId}, state=${resourceState}`,
      );

      // Find provider by channel ID
      const subscription = await this.prisma.webhookSubscription.findFirst({
        where: {
          subscriptionId: channelId,
          providerType: 'google',
          isActive: true,
        },
      });

      if (!subscription) {
        this.logger.warn(`No active subscription found for channel ${channelId}`);
        return;
      }

      if (!subscription.resourcePath?.startsWith('/calendar/')) {
        this.logger.debug(`Ignoring non-calendar subscription ${channelId}`);
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

      // Queue calendar sync for this provider (high priority for real-time webhooks)
      if (resourceState === 'sync' || resourceState === 'exists') {
        // Get provider info for queue job data
        const provider = await this.prisma.providerConfig.findUnique({
          where: { id: subscription.providerId },
          select: { tenantId: true, email: true },
        });

        if (provider) {
          await this.calendarSyncQueue.addSyncJob({
            tenantId: provider.tenantId,
            providerId: subscription.providerId,
            providerType: 'google',
            email: provider.email,
            priority: 'high', // High priority for real-time webhook triggers
          });
          this.logger.debug(`Queued calendar sync for provider ${subscription.providerId}`);
        }
      }
    } catch (error) {
      this.logger.error('Error handling Google Calendar notification:', error);
      throw error;
    }
  }

  /**
   * Renew watch subscriptions that are about to expire
   */
  async renewExpiringSoon(): Promise<number> {
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

    const expiring = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: 'google',
        resourcePath: {
          startsWith: '/calendar/',
        },
        isActive: true,
        expiresAt: {
          lte: oneDayFromNow,
        },
      },
    });

    let renewed = 0;

    for (const subscription of expiring) {
      try {
        await this.setupWatch(subscription.providerId);
        renewed++;
      } catch (error) {
        this.logger.error(
          `Failed to renew Google Calendar watch for ${subscription.providerId}:`,
          error,
        );
      }
    }

    return renewed;
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  private async handleScheduledRenewal(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }
    try {
      const renewed = await this.renewExpiringSoon();
      if (renewed > 0) {
        this.logger.log(`Renewed ${renewed} Google Calendar webhook channels via scheduled job`);
      }
    } catch (error) {
      this.logger.error('Scheduled Google Calendar webhook renewal failed:', error);
    }
  }

  /**
   * Stop watching a calendar
   */
  async stopWatch(providerId: string): Promise<void> {
    try {
      const subscriptions = await this.prisma.webhookSubscription.findMany({
        where: {
          providerId,
          providerType: 'google',
          resourcePath: {
            startsWith: '/calendar/',
          },
          isActive: true,
        },
      });

      if (subscriptions.length === 0) {
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

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      for (const subscription of subscriptions) {
        const metadata = subscription.metadata as any;
        const channelId = subscription.subscriptionId;
        const resourceId = metadata?.resourceId;

        if (channelId && resourceId) {
          await calendar.channels.stop({
            requestBody: {
              id: channelId,
              resourceId,
            },
          });
        }

        await this.prisma.webhookSubscription.update({
          where: { id: subscription.id },
          data: { isActive: false },
        });
      }

      this.logger.log(`Stopped ${subscriptions.length} Google Calendar watch channels for provider ${providerId}`);
    } catch (error) {
      this.logger.error(`Failed to stop Google Calendar watch for ${providerId}:`, error);
    }
  }

  /**
   * Get webhook statistics
   */
  async getStats(): Promise<any> {
    const total = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'google',
        resourcePath: {
          startsWith: '/calendar/',
        },
        isActive: true,
      },
    });

    const recentNotifications = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: 'google',
        resourcePath: {
          startsWith: '/calendar/',
        },
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
