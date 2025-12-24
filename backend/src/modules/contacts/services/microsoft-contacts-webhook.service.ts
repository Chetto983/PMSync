import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { MicrosoftContactsSyncService } from './microsoft-contacts-sync.service';
import { ContactsSyncQueueService } from './contacts-sync-queue.service';
import { ContactsError, ContactsErrorCode } from '../errors/contacts-error';
import { nanoid } from 'nanoid';

export const MICROSOFT_CONTACTS_RESOURCE = '/me/contacts';

export interface MicrosoftContactsNotification {
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
export class MicrosoftContactsWebhookService {
  private readonly logger = new Logger(MicrosoftContactsWebhookService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private readonly WEBHOOK_URL: string;
  private readonly CLIENT_STATE: string;
  private readonly contactsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly contactsSync: MicrosoftContactsSyncService,
    private readonly contactsSyncQueue: ContactsSyncQueueService,
  ) {
    // Derive webhook URL from API_PUBLIC_URL if not explicitly set
    const configuredWebhookUrl = this.config.get<string>('MICROSOFT_CONTACTS_WEBHOOK_URL');
    if (configuredWebhookUrl) {
      this.WEBHOOK_URL = configuredWebhookUrl;
    } else {
      const apiUrl = this.config.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
      this.WEBHOOK_URL = `${apiUrl}/webhooks/contacts/microsoft/notifications`;
    }
    this.CLIENT_STATE = this.config.get<string>('WEBHOOK_CLIENT_STATE', nanoid());

    this.contactsEnabled =
      (this.config.get<string>('CONTACTS_SYNC_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.contactsEnabled) {
      this.logger.warn('MicrosoftContactsWebhookService disabled via CONTACTS_SYNC_ENABLED=false');
    }
  }

  /**
   * Setup Microsoft Contacts webhook subscription
   */
  async setupSubscription(providerId: string): Promise<void> {
    if (!this.contactsEnabled) {
      this.logger.warn('Skipping Microsoft Contacts subscription setup (CONTACTS_SYNC_ENABLED=false)');
      return;
    }
    try {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || !provider.supportsContacts || !provider.accessToken) {
        throw new ContactsError('Provider not found or does not support contacts', ContactsErrorCode.PROVIDER_NOT_SUPPORTED, { retryable: false });
      }

      const accessToken = this.crypto.decrypt(
        provider.accessToken,
        provider.tokenEncryptionIv!,
      );

      // Calculate expiration (max 4230 minutes = ~3 days)
      const expirationDateTime = new Date();
      expirationDateTime.setDate(expirationDateTime.getDate() + 3);

      // Create subscription for contacts
      const subscription = {
        changeType: 'created,updated,deleted',
        notificationUrl: this.WEBHOOK_URL,
        resource: '/me/contacts',
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
            resourcePath: MICROSOFT_CONTACTS_RESOURCE,
          },
        },
        create: {
          tenantId: provider.tenantId,
          providerId,
          providerType: 'microsoft',
          subscriptionId,
          resourcePath: MICROSOFT_CONTACTS_RESOURCE,
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
          resourcePath: MICROSOFT_CONTACTS_RESOURCE,
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
        `Setup Microsoft Contacts subscription for provider ${providerId}, subscription ${subscriptionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to setup Microsoft Contacts subscription for provider ${providerId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Handle Microsoft Contacts notifications
   */
  async handleNotifications(
    notifications: MicrosoftContactsNotification[],
  ): Promise<void> {
    if (!this.contactsEnabled) {
      return;
    }
    for (const notification of notifications) {
      try {
        await this.handleSingleNotification(notification);
      } catch (error) {
        this.logger.error(
          `Error handling Microsoft Contacts notification ${notification.subscriptionId}:`,
          error,
        );
      }
    }
  }

  /**
   * Handle a single notification
   */
  private async handleSingleNotification(
    notification: MicrosoftContactsNotification,
  ): Promise<void> {
    // Verify client state
    if (notification.clientState !== this.CLIENT_STATE) {
      this.logger.warn('Microsoft Contacts notification with invalid client state');
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
        `No active subscription found for Microsoft Contacts subscription ${subscriptionId}`,
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
      `Microsoft Contacts notification: subscription=${subscriptionId}, changeType=${notification.changeType}`,
    );

    // Queue contacts sync for this provider (high priority for real-time webhooks)
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: subscription.providerId },
      select: { tenantId: true, email: true },
    });

    if (provider) {
      await this.contactsSyncQueue.addSyncJob({
        tenantId: provider.tenantId,
        providerId: subscription.providerId,
        providerType: 'microsoft',
        email: provider.email,
        priority: 'high', // High priority for real-time webhook triggers
      });
      this.logger.debug(`Queued contacts sync for provider ${subscription.providerId}`);
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
        resourcePath: MICROSOFT_CONTACTS_RESOURCE,
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
          `Failed to renew Microsoft Contacts subscription for ${subscription.providerId}:`,
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
        resourcePath: MICROSOFT_CONTACTS_RESOURCE,
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
          resourcePath: MICROSOFT_CONTACTS_RESOURCE,
        },
      },
      data: {
        expiresAt: new Date(expirationDateTime),
        lastRenewedAt: new Date(),
      },
    });

    this.logger.log(`Renewed Microsoft Contacts subscription for provider ${providerId}`);
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
          resourcePath: MICROSOFT_CONTACTS_RESOURCE,
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
            resourcePath: MICROSOFT_CONTACTS_RESOURCE,
          },
        },
        data: { isActive: false },
      });

      this.logger.log(`Deleted Microsoft Contacts subscription for provider ${providerId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete Microsoft Contacts subscription for ${providerId}:`,
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
        resourcePath: MICROSOFT_CONTACTS_RESOURCE,
        isActive: true,
      },
    });

    const recentNotifications = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_CONTACTS_RESOURCE,
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
