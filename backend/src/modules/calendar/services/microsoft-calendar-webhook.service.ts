/**
 * Microsoft Calendar Webhook Service
 *
 * Extends AbstractCalendarWebhookService with Microsoft Graph API implementations.
 * Uses subscription-based notifications for real-time calendar updates.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { CalendarSyncQueueService } from './calendar-sync-queue.service';
import { AbstractCalendarWebhookService } from './abstract-calendar-webhook.service';
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
export class MicrosoftCalendarWebhookService extends AbstractCalendarWebhookService {
  protected readonly logger = new Logger(MicrosoftCalendarWebhookService.name);

  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private readonly WEBHOOK_URL: string;
  private readonly CLIENT_STATE: string;

  constructor(
    prisma: PrismaService,
    crypto: CryptoService,
    config: ConfigService,
    calendarSyncQueue: CalendarSyncQueueService,
  ) {
    super(prisma, crypto, config, calendarSyncQueue);

    // Derive webhook URL from API_PUBLIC_URL if not explicitly set
    const configuredWebhookUrl = this.config.get<string>('MICROSOFT_CALENDAR_WEBHOOK_URL');
    if (configuredWebhookUrl) {
      this.WEBHOOK_URL = configuredWebhookUrl;
    } else {
      const apiUrl = this.config.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
      this.WEBHOOK_URL = `${apiUrl}/webhooks/calendar/microsoft/notifications`;
    }
    this.CLIENT_STATE = this.config.get<string>('WEBHOOK_CLIENT_STATE', nanoid());

    // Log disabled state after logger is initialized
    this.logDisabledStateIfNeeded();
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  protected get providerType(): string {
    return 'microsoft';
  }

  protected get resourcePathFilter(): { startsWith?: string; equals?: string } {
    return { equals: MICROSOFT_CALENDAR_RESOURCE };
  }

  protected get renewalJobName(): string {
    return 'microsoft-calendar-webhook-renewal';
  }

  protected getRenewalIntervalConfigKey(): string {
    return 'MICROSOFT_CALENDAR_WEBHOOK_RENEWAL_HOURS';
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

      // NULL CHECK FIX: Validate tokenEncryptionIv before decryption
      if (!provider.tokenEncryptionIv) {
        throw new Error(`Provider ${providerId} missing tokenEncryptionIv for webhook setup`);
      }

      const accessToken = this.decryptAccessToken(
        provider.accessToken,
        provider.tokenEncryptionIv,
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
   * Delete a Microsoft Calendar subscription
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

      // NULL CHECK FIX: Validate tokenEncryptionIv before decryption
      if (!provider.tokenEncryptionIv) {
        this.logger.warn(`Provider ${providerId} missing tokenEncryptionIv, cannot delete subscription`);
        return;
      }

      const accessToken = this.decryptAccessToken(
        provider.accessToken,
        provider.tokenEncryptionIv,
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
   * Override renewal to use PATCH instead of recreating subscription
   */
  protected async renewSingleSubscription(providerId: string): Promise<boolean> {
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

    // NULL CHECK FIX: Validate tokenEncryptionIv before decryption
    if (!provider.tokenEncryptionIv) {
      this.logger.warn(`Provider ${providerId} missing tokenEncryptionIv, cannot renew subscription`);
      return false;
    }

    const accessToken = this.decryptAccessToken(
      provider.accessToken,
      provider.tokenEncryptionIv,
    );

    // Calculate new expiration
    const expirationDateTime = new Date();
    expirationDateTime.setDate(expirationDateTime.getDate() + 3);

    // Update subscription via PATCH
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

  // ============================================================================
  // MICROSOFT-SPECIFIC METHODS
  // ============================================================================

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
    const subscriptionId = notification.subscriptionId;

    // Find provider by subscription ID (include provider to avoid N+1 query)
    const subscription = await this.prisma.webhookSubscription.findFirst({
      where: {
        subscriptionId,
        providerType: 'microsoft',
        isActive: true,
      },
      include: {
        provider: {
          select: { email: true },
        },
      },
    });

    if (!subscription) {
      this.logger.warn(
        `No active subscription found for Microsoft Calendar subscription ${subscriptionId}`,
      );
      return;
    }

    // Verify client state using the stored per-subscription clientState
    // This ensures validation works across restarts (fixes clientState stability issue)
    const storedClientState = (subscription.metadata as Record<string, unknown>)?.clientState;
    if (notification.clientState && storedClientState && notification.clientState !== storedClientState) {
      this.logger.warn(
        `Microsoft Calendar notification with invalid client state for subscription ${subscriptionId}`,
      );
      return;
    }

    // Update subscription stats
    await this.updateSubscriptionStats(subscription.id);

    this.logger.log(
      `Microsoft Calendar notification: subscription=${subscriptionId}, changeType=${notification.changeType}`,
    );

    // Queue calendar sync for this provider
    await this.queueCalendarSync(
      subscription.tenantId,
      subscription.providerId,
      subscription.provider.email,
    );
  }
}
