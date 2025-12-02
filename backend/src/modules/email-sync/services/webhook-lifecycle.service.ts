import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { GmailWebhookService, GMAIL_WEBHOOK_RESOURCE } from './gmail-webhook.service';
import { MicrosoftWebhookService, MICROSOFT_MAIL_RESOURCE } from './microsoft-webhook.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhookLifecycleService {
  private readonly logger = new Logger(WebhookLifecycleService.name);
  private isRenewalRunning = false;
  private isDeepCheckRunning = false;
  private readonly jobsEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private gmailWebhook: GmailWebhookService,
    private microsoftWebhook: MicrosoftWebhookService,
    private configService: ConfigService,
  ) {
    this.jobsEnabled =
      (this.configService.get<string>('JOBS_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.jobsEnabled) {
      this.logger.warn('WebhookLifecycleService disabled via JOBS_ENABLED=false');
    }
  }

  /**
   * Auto-create webhook subscriptions for new providers
   * Called when a new provider is added
   * Returns true if successful, false if failed
   */
  async autoCreateWebhook(providerId: string): Promise<boolean> {
    try {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || !provider.isActive) {
        return false;
      }

      const resourcePath = this.getResourcePathForProvider(provider.providerType);
      if (!resourcePath) {
        return false;
      }

      // Check if webhook already exists
      const existing = await this.prisma.webhookSubscription.findFirst({
        where: {
          providerId,
          resourcePath,
        },
      });

      if (existing) {
        this.logger.debug(`Webhook already exists for provider ${providerId}`);
        return false;
      }

      // Create webhook based on provider type
      if (provider.providerType === 'google') {
        await this.gmailWebhook.createSubscription({
          providerId,
          providerType: 'google',
        });
      } else if (provider.providerType === 'microsoft') {
        // Derive webhook URL from API_PUBLIC_URL if not explicitly set
        const configuredUrl = this.configService.get<string>('MICROSOFT_EMAIL_WEBHOOK_URL');
        const apiUrl = this.configService.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
        const webhookUrl = configuredUrl || `${apiUrl}/webhooks/microsoft/notifications`;

        await this.microsoftWebhook.createSubscription({
          providerId,
          providerType: 'microsoft',
          webhookUrl,
        });
      }

      this.logger.log(`Auto-created webhook for ${provider.email}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error auto-creating webhook for ${providerId}: ${errorMessage}`,
      );
      return false;
    }
  }

  /**
   * Renew expiring webhooks - runs daily at 2 AM
   */
  @Cron('0 2 * * *', {
    name: 'renew-webhooks',
    timeZone: 'UTC',
  })
  async renewExpiringWebhooks(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }
    if (this.isRenewalRunning) {
      this.logger.warn('Webhook renewal already running, skipping...');
      return;
    }

    this.isRenewalRunning = true;

    try {
      this.logger.log('Starting webhook renewal process...');

      // Renew Gmail subscriptions
      await this.gmailWebhook.renewExpiringSubscriptions();

      // Renew Microsoft subscriptions
      await this.microsoftWebhook.renewExpiringSubscriptions();

      this.logger.log('Webhook renewal completed');
    } catch (error) {
      this.logger.error('Error in webhook renewal:', error);
    } finally {
      this.isRenewalRunning = false;
    }
  }

  /**
   * Deep check - full sync for all accounts once per day
   * Runs at 3 AM UTC to catch any missed changes
   */
  @Cron('0 3 * * *', {
    name: 'deep-check-sync',
    timeZone: 'UTC',
  })
  async performDeepCheck(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }
    if (this.isDeepCheckRunning) {
      this.logger.warn('Deep check already running, skipping...');
      return;
    }

    this.isDeepCheckRunning = true;

    try {
      this.logger.log('Starting daily deep check...');

      // Get all active providers
      const providers = await this.prisma.providerConfig.findMany({
        where: { isActive: true },
        select: {
          id: true,
          email: true,
          lastSyncedAt: true,
        },
      });

      // Count providers that haven't been synced in 24h
      const staleProviders = providers.filter((p) => {
        if (!p.lastSyncedAt) return true;
        const hoursSinceSync =
          (Date.now() - p.lastSyncedAt.getTime()) / (1000 * 60 * 60);
        return hoursSinceSync > 24;
      });

      if (staleProviders.length > 0) {
        this.logger.warn(
          `Deep check found ${staleProviders.length} providers not synced in 24h`,
        );

        // Force sync for stale providers
        for (const provider of staleProviders) {
          await this.prisma.providerConfig.update({
            where: { id: provider.id },
            data: {
              nextSyncAt: new Date(), // Force immediate sync
              syncPriority: 2, // Medium-high priority
            },
          });
        }
      }

      this.logger.log(
        `Deep check completed. Total providers: ${providers.length}, Stale: ${staleProviders.length}`,
      );
    } catch (error) {
      this.logger.error('Error in deep check:', error);
    } finally {
      this.isDeepCheckRunning = false;
    }
  }

  /**
   * Cleanup failed/inactive webhooks - runs weekly
   */
  @Cron(CronExpression.EVERY_WEEK, {
    name: 'cleanup-webhooks',
  })
  async cleanupInactiveWebhooks(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }
    try {
      this.logger.log('Starting webhook cleanup...');

      // Find webhooks with high error count (>10 errors)
      const failedWebhooks = await this.prisma.webhookSubscription.findMany({
        where: {
          errorCount: { gte: 10 },
          isActive: true,
        },
      });

      for (const webhook of failedWebhooks) {
        this.logger.warn(
          `Deactivating webhook ${webhook.id} due to high error count (${webhook.errorCount})`,
        );

        await this.prisma.webhookSubscription.update({
          where: { id: webhook.id },
          data: { isActive: false },
        });

        // Provider will fall back to polling
      }

      // Find expired webhooks that weren't renewed
      const expiredWebhooks = await this.prisma.webhookSubscription.findMany({
        where: {
          expiresAt: { lt: new Date() },
          isActive: true,
        },
      });

      for (const webhook of expiredWebhooks) {
        this.logger.warn(`Deactivating expired webhook ${webhook.id}`);

        await this.prisma.webhookSubscription.update({
          where: { id: webhook.id },
          data: { isActive: false },
        });
      }

      this.logger.log(
        `Webhook cleanup completed. Failed: ${failedWebhooks.length}, Expired: ${expiredWebhooks.length}`,
      );
    } catch (error) {
      this.logger.error('Error in webhook cleanup:', error);
    }
  }

  /**
   * Health check for webhook system
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    gmail: { active: number; expiring: number };
    microsoft: { active: number; expiring: number };
    issues: string[];
  }> {
    const issues: string[] = [];

    const gmailStats = await this.gmailWebhook.getStats();
    const microsoftStats = await this.microsoftWebhook.getStats();

    // Check for issues
    if (
      (gmailStats.expiringWithin24h ?? 0) > 0 ||
      (microsoftStats.expiringWithin24h ?? 0) > 0
    ) {
      issues.push(
        `${(gmailStats.expiringWithin24h ?? 0) + (microsoftStats.expiringWithin24h ?? 0)} webhooks expiring within 24h`,
      );
    }

    if (
      (gmailStats.errors?.providersWithErrors ?? 0) > 5 ||
      (microsoftStats.errors?.providersWithErrors ?? 0) > 5
    ) {
      issues.push('Multiple webhooks with errors detected');
    }

    return {
      healthy: issues.length === 0,
      gmail: {
        active: gmailStats.activeSubscriptions ?? 0,
        expiring: gmailStats.expiringWithin24h ?? 0,
      },
      microsoft: {
        active: microsoftStats.activeSubscriptions ?? 0,
        expiring: microsoftStats.expiringWithin24h ?? 0,
      },
      issues,
    };
  }

  /**
   * Manually trigger webhook creation for all eligible providers
   */
  async createAllWebhooks(): Promise<{ created: number; failed: number }> {
    let created = 0;
    let failed = 0;

    const providers = await this.prisma.providerConfig.findMany({
      where: {
        isActive: true,
        providerType: { in: ['google', 'microsoft'] },
      },
    });

    for (const provider of providers) {
      const success = await this.autoCreateWebhook(provider.id);
      if (success) {
        created++;
      } else {
        failed++;
      }
    }

    this.logger.log(
      `Batch webhook creation: ${created} created, ${failed} failed`,
    );

    return { created, failed };
  }

  /**
   * Remove webhook subscription and cancel upstream watcher for a provider.
   */
  async removeWebhookForProvider(providerId: string): Promise<void> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return;
    }

    const resourcePath = this.getResourcePathForProvider(provider.providerType);
    if (!resourcePath) {
      return;
    }

    const subscription = await this.prisma.webhookSubscription.findFirst({
      where: {
        providerId,
        resourcePath,
      },
    });

    if (!subscription) {
      return;
    }

    try {
      if (subscription.providerType === 'google') {
        await this.gmailWebhook.cancelSubscription(providerId);
      } else if (subscription.providerType === 'microsoft') {
        await this.microsoftWebhook.cancelSubscription(providerId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to cancel ${subscription.providerType} webhook for provider ${providerId}: ${message}`,
      );
    }

    try {
      await this.prisma.webhookSubscription.delete({
        where: { id: subscription.id },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to delete webhook record for provider ${providerId}: ${message}`,
      );
    }
  }

  private getResourcePathForProvider(providerType: string): string | null {
    if (providerType === 'google') {
      return GMAIL_WEBHOOK_RESOURCE;
    }

    if (providerType === 'microsoft') {
      return MICROSOFT_MAIL_RESOURCE;
    }

    return null;
  }
}
