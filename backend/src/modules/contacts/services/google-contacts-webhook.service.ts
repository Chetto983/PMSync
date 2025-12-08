import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleContactsSyncService } from './google-contacts-sync.service';
import { ContactsSyncQueueService } from './contacts-sync-queue.service';

export const GOOGLE_CONTACTS_RESOURCE = '/contacts';

/**
 * Google Contacts Webhook Service
 *
 * Note: Google People API doesn't support push notifications like Calendar API.
 * This service implements a polling-based approach with sync tokens for efficiency.
 * We store sync state in WebhookSubscription for consistency with calendar webhooks.
 */
@Injectable()
export class GoogleContactsWebhookService {
  private readonly logger = new Logger(GoogleContactsWebhookService.name);
  private readonly contactsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly contactsSync: GoogleContactsSyncService,
    private readonly contactsSyncQueue: ContactsSyncQueueService,
  ) {
    this.contactsEnabled =
      (this.config.get<string>('CONTACTS_SYNC_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.contactsEnabled) {
      this.logger.warn('GoogleContactsWebhookService disabled via CONTACTS_SYNC_ENABLED=false');
    }
  }

  /**
   * Setup "subscription" (really just marks provider for polling)
   * This maintains API compatibility with calendar webhooks
   */
  async setupWatch(providerId: string): Promise<void> {
    if (!this.contactsEnabled) {
      this.logger.warn('Skipping Google Contacts watch setup (CONTACTS_SYNC_ENABLED=false)');
      return;
    }
    try {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || !provider.supportsContacts) {
        throw new Error('Provider not found or does not support contacts');
      }

      // Create or update webhook subscription record
      // For Google Contacts, this is just tracking metadata for polling
      await this.prisma.webhookSubscription.upsert({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: GOOGLE_CONTACTS_RESOURCE,
          },
        },
        create: {
          tenantId: provider.tenantId,
          providerId,
          providerType: 'google',
          subscriptionId: `contacts-${providerId}`, // Pseudo subscription ID
          resourcePath: GOOGLE_CONTACTS_RESOURCE,
          webhookUrl: null, // No actual webhook for Google Contacts
          isActive: true,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          metadata: {
            syncToken: null,
            lastPollAt: new Date(),
            pollInterval: 300000, // 5 minutes default
          },
        },
        update: {
          isActive: true,
          lastRenewedAt: new Date(),
          metadata: {
            lastPollAt: new Date(),
            pollInterval: 300000,
          },
        },
      });

      this.logger.log(`Setup Google Contacts watch for provider ${providerId}`);
    } catch (error) {
      this.logger.error(
        `Failed to setup Google Contacts watch for provider ${providerId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Poll for contact changes
   * This should be called by a scheduled job
   */
  async pollForChanges(providerId: string): Promise<void> {
    try {
      const subscription = await this.prisma.webhookSubscription.findFirst({
        where: {
          providerId,
          resourcePath: GOOGLE_CONTACTS_RESOURCE,
          isActive: true,
        },
      });

      if (!subscription) {
        this.logger.warn(`No active subscription for provider ${providerId}`);
        return;
      }

      // Check if it's time to poll based on interval
      const metadata = subscription.metadata as any;
      const lastPollAt = metadata?.lastPollAt ? new Date(metadata.lastPollAt) : null;
      const pollInterval = metadata?.pollInterval || 300000; // 5 minutes default

      if (lastPollAt && Date.now() - lastPollAt.getTime() < pollInterval) {
        this.logger.debug(
          `Skipping poll for provider ${providerId}, too soon since last poll`,
        );
        return;
      }

      // Queue contacts sync (normal priority for scheduled polling)
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
        select: { tenantId: true, email: true },
      });

      if (provider) {
        await this.contactsSyncQueue.addSyncJob({
          tenantId: provider.tenantId,
          providerId,
          providerType: 'google',
          email: provider.email,
          priority: 'normal', // Normal priority for scheduled polling
        });
        this.logger.debug(`Queued contacts sync for provider ${providerId}`);
      }

      // Update last poll time
      await this.prisma.webhookSubscription.update({
        where: { id: subscription.id },
        data: {
          lastNotificationAt: new Date(),
          notificationCount: { increment: 1 },
          metadata: {
            ...metadata,
            lastPollAt: new Date(),
          },
        },
      });

      this.logger.log(`Polled Google Contacts for provider ${providerId}`);
    } catch (error) {
      this.logger.error(`Error polling Google Contacts for provider ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Handle manual sync trigger (webhook-like behavior)
   */
  async handleNotification(providerId: string): Promise<void> {
    try {
      const subscription = await this.prisma.webhookSubscription.findFirst({
        where: {
          providerId,
          resourcePath: GOOGLE_CONTACTS_RESOURCE,
          isActive: true,
        },
      });

      if (!subscription) {
        this.logger.warn(`No active subscription for provider ${providerId}`);
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

      this.logger.log(`Google Contacts notification received for provider ${providerId}`);

      // Queue contacts sync (high priority for manual/webhook triggers)
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
        select: { tenantId: true, email: true },
      });

      if (provider) {
        await this.contactsSyncQueue.addSyncJob({
          tenantId: provider.tenantId,
          providerId,
          providerType: 'google',
          email: provider.email,
          priority: 'high', // High priority for manual triggers
        });
        this.logger.debug(`Queued contacts sync for provider ${providerId}`);
      }
    } catch (error) {
      this.logger.error(
        `Error handling Google Contacts notification for provider ${providerId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Renew expiring subscriptions (placeholder for consistency)
   */
  async renewExpiringSoon(): Promise<number> {
    // Google Contacts subscriptions don't actually expire
    // This is just for API compatibility
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: 'google',
        resourcePath: GOOGLE_CONTACTS_RESOURCE,
        isActive: true,
      },
    });

    for (const subscription of subscriptions) {
      await this.prisma.webhookSubscription.update({
        where: { id: subscription.id },
        data: {
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          lastRenewedAt: new Date(),
        },
      });
    }

    return subscriptions.length;
  }

  /**
   * Stop watching contacts for a provider
   */
  async stopWatch(providerId: string): Promise<void> {
    if (!this.contactsEnabled) {
      return;
    }
    try {
      await this.prisma.webhookSubscription.updateMany({
        where: {
          providerId,
          resourcePath: GOOGLE_CONTACTS_RESOURCE,
        },
        data: { isActive: false },
      });

      this.logger.log(`Stopped Google Contacts watch for provider ${providerId}`);
    } catch (error) {
      this.logger.error(
        `Failed to stop Google Contacts watch for provider ${providerId}:`,
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
        providerType: 'google',
        resourcePath: GOOGLE_CONTACTS_RESOURCE,
        isActive: true,
      },
    });

    const recentNotifications = await this.prisma.webhookSubscription.findMany({
      where: {
        providerType: 'google',
        resourcePath: GOOGLE_CONTACTS_RESOURCE,
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
