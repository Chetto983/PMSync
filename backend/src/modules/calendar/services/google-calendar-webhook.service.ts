/**
 * Google Calendar Webhook Service
 *
 * Extends AbstractCalendarWebhookService with Google Calendar API implementations.
 * Uses channel-based push notifications for real-time calendar updates.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calendar_v3, google } from 'googleapis';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { CalendarSyncQueueService } from './calendar-sync-queue.service';
import { AbstractCalendarWebhookService } from './abstract-calendar-webhook.service';
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
export class GoogleCalendarWebhookService extends AbstractCalendarWebhookService {
  protected readonly logger = new Logger(GoogleCalendarWebhookService.name);

  private readonly WEBHOOK_URL: string;
  /** Webhook subscription expiration in days (default: 7) */
  private readonly webhookExpirationDays: number;

  constructor(
    prisma: PrismaService,
    crypto: CryptoService,
    config: ConfigService,
    calendarSyncQueue: CalendarSyncQueueService,
  ) {
    super(prisma, crypto, config, calendarSyncQueue);

    const baseUrl =
      this.config.get<string>('api.url') ||
      this.config.get<string>('API_PUBLIC_URL') ||
      this.config.get<string>('BACKEND_URL') ||
      'http://localhost:3000';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    // Include webhook token in URL for authentication (Google Calendar doesn't support custom headers)
    const webhookToken = this.config.get<string>('EMAIL_SYNC_WEBHOOK_TOKEN');
    const tokenParam = webhookToken ? `?token=${webhookToken}` : '';
    this.WEBHOOK_URL = `${normalizedBase}/webhooks/calendar/google/push${tokenParam}`;
    this.webhookExpirationDays = this.config.get<number>('GOOGLE_CALENDAR_WEBHOOK_EXPIRATION_DAYS', 7);

    // Log disabled state after logger is initialized
    this.logDisabledStateIfNeeded();
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  protected get providerType(): string {
    return 'google';
  }

  protected get resourcePathFilter(): { startsWith?: string; equals?: string } {
    return { startsWith: '/calendar/' };
  }

  protected get renewalJobName(): string {
    return 'google-calendar-webhook-renewal';
  }

  protected getRenewalIntervalConfigKey(): string {
    return 'GOOGLE_CALENDAR_WEBHOOK_RENEWAL_HOURS';
  }

  /**
   * Setup Google Calendar Push Notifications for a provider
   */
  async setupSubscription(providerId: string): Promise<void> {
    try {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || !provider.supportsCalendar || !provider.accessToken) {
        throw new Error('Provider not found or does not support calendar');
      }

      // NULL CHECK FIX: Validate tokenEncryptionIv before decryption
      if (!provider.tokenEncryptionIv) {
        throw new Error(`Provider ${providerId} missing tokenEncryptionIv for webhook setup`);
      }

      const accessToken = this.decryptAccessToken(
        provider.accessToken,
        provider.tokenEncryptionIv,
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
        const expiration = Date.now() + this.webhookExpirationDays * 24 * 60 * 60 * 1000;

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

  /**
   * Stop watching calendars for a provider
   */
  async deleteSubscription(providerId: string): Promise<void> {
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

      // NULL CHECK FIX: Validate tokenEncryptionIv before decryption
      if (!provider.tokenEncryptionIv) {
        this.logger.warn(`Provider ${providerId} missing tokenEncryptionIv, cannot delete subscriptions`);
        return;
      }

      const accessToken = this.decryptAccessToken(
        provider.accessToken,
        provider.tokenEncryptionIv,
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

  // ============================================================================
  // GOOGLE-SPECIFIC METHODS
  // ============================================================================

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

      // Find provider by channel ID (include provider to avoid N+1 query)
      const subscription = await this.prisma.webhookSubscription.findFirst({
        where: {
          subscriptionId: channelId,
          providerType: 'google',
          isActive: true,
        },
        include: {
          provider: {
            select: { email: true },
          },
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
      await this.updateSubscriptionStats(subscription.id);

      // Queue calendar sync for this provider (high priority for real-time webhooks)
      if (resourceState === 'sync' || resourceState === 'exists') {
        await this.queueCalendarSync(
          subscription.tenantId,
          subscription.providerId,
          subscription.provider.email,
        );
      }
    } catch (error) {
      this.logger.error('Error handling Google Calendar notification:', error);
      throw error;
    }
  }

  /**
   * Alias for backward compatibility
   */
  async setupWatch(providerId: string): Promise<void> {
    return this.setupSubscription(providerId);
  }

  /**
   * Alias for backward compatibility
   */
  async stopWatch(providerId: string): Promise<void> {
    return this.deleteSubscription(providerId);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

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
}
