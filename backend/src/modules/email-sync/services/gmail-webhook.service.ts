import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { QueueService } from './queue.service';
import {
  GmailPubSubMessage,
  GmailPubSubData,
  GmailWatchResponse,
  CreateWebhookOptions,
  WebhookStats,
} from '../interfaces/webhook.interface';
import { SyncJobData } from '../interfaces/sync-job.interface';
import { google, gmail_v1 } from 'googleapis';
import { ProviderTokenService } from './provider-token.service';

export const GMAIL_WEBHOOK_RESOURCE = 'gmail/mailbox';

@Injectable()
export class GmailWebhookService {
  private readonly logger = new Logger(GmailWebhookService.name);

  // Gmail watch() expires after 7 days max
  private readonly DEFAULT_EXPIRATION_DAYS = 7;

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private configService: ConfigService,
    private providerTokenService: ProviderTokenService,
  ) {}

  /**
   * Handle incoming Gmail Pub/Sub notification
   */
  async handleNotification(message: GmailPubSubMessage): Promise<void> {
    try {
      this.logger.debug('[GMAIL-WEBHOOK] Starting handleNotification...');

      // Decode the base64-encoded data
      const decodedData = Buffer.from(message.message.data, 'base64').toString(
        'utf-8',
      );
      const data: GmailPubSubData = JSON.parse(decodedData);

      this.logger.log(
        `[GMAIL-WEBHOOK] Gmail notification for ${data.emailAddress}, historyId: ${data.historyId}`,
      );

      // Find provider by email
      const provider = await this.prisma.providerConfig.findFirst({
        where: {
          email: data.emailAddress,
          providerType: 'google',
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          tenantId: true,
          lastSyncedAt: true,
          metadata: true,
        },
      });

      if (!provider) {
        this.logger.warn(
          `[GMAIL-WEBHOOK] No active Gmail provider found for ${data.emailAddress}`,
        );
        return;
      }

      this.logger.debug(`[GMAIL-WEBHOOK] Found provider: ${provider.id} for tenant: ${provider.tenantId}`);

      const subscriptionExists = await this.ensureSubscriptionRow(provider.id);

      // Update webhook subscription stats
      this.logger.debug(`[GMAIL-WEBHOOK] Updating subscription stats for provider ${provider.id}...`);
      await this.updateSubscriptionStats(provider.id);

      const lastHistoryIdRaw = (provider.metadata as any)?.historyId;
      const lastHistoryId = lastHistoryIdRaw ? Number(lastHistoryIdRaw) : undefined;
      const incomingHistoryId = data.historyId ? Number(data.historyId) : undefined;
      const hasGap =
        incomingHistoryId !== undefined &&
        lastHistoryId !== undefined &&
        incomingHistoryId < lastHistoryId;

      this.logger.debug(
        `[GMAIL-WEBHOOK] History IDs - last: ${lastHistoryId}, incoming: ${incomingHistoryId}, hasGap: ${hasGap}`,
      );

      // Trigger incremental sync with high priority (fallback full if gap detected)
      const syncJob: SyncJobData = {
        tenantId: provider.tenantId,
        providerId: provider.id,
        providerType: 'google',
        email: provider.email,
        priority: 'high', // Webhook triggers are high priority
        syncType: hasGap || !subscriptionExists ? 'full' : 'incremental',
        lastSyncedAt: provider.lastSyncedAt ?? undefined,
      };

      this.logger.log(`[GMAIL-WEBHOOK] Queueing ${syncJob.syncType} sync job for ${provider.email}...`);
      await this.queueService.addSyncJob(syncJob);
      this.logger.log(`[GMAIL-WEBHOOK] Sync job queued successfully`);

      // Persist latest historyId for next delta
      const newMetadata = {
        ...(provider.metadata as Record<string, any>),
        historyId: data.historyId,
        gapDetected: hasGap || !subscriptionExists || undefined,
        lastGapAt: hasGap ? new Date().toISOString() : (provider.metadata as any)?.lastGapAt,
      };
      this.logger.debug(`[GMAIL-WEBHOOK] Updating provider metadata with historyId: ${data.historyId}...`);
      await this.prisma.providerConfig.update({
        where: { id: provider.id },
        data: { metadata: newMetadata },
      });
      this.logger.debug(`[GMAIL-WEBHOOK] Provider metadata updated successfully`);

      this.logger.log(
        `[GMAIL-WEBHOOK] ✅ Triggered ${syncJob.syncType} sync for ${provider.email} via webhook`,
      );
    } catch (error) {
      this.logger.error('Error processing Gmail notification:', error);
      throw error;
    }
  }

  /**
   * Get fresh access token for a provider (decrypt + refresh if needed)
   */
  private async getFreshAccessToken(providerId: string): Promise<string> {
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
      providerId,
    );

    if (provider.providerType !== 'google') {
      throw new Error('Invalid Gmail provider');
    }

    return accessToken;
  }

  /**
   * Create a Gmail watch subscription for a provider
   */
  async createSubscription(options: CreateWebhookOptions): Promise<void> {
    const { providerId } = options;
    const subscriptionWhere = {
      providerId_resourcePath: {
        providerId,
        resourcePath: GMAIL_WEBHOOK_RESOURCE,
      },
    };

    try {
      // Get provider info
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || provider.providerType !== 'google') {
        throw new Error('Invalid Gmail provider');
      }

      // Get fresh access token (decrypt + refresh if needed)
      const accessToken = await this.getFreshAccessToken(providerId);

      // Get Pub/Sub topic name from config
      const topicName = this.configService.get<string>(
        'GOOGLE_PUBSUB_TOPIC',
        'projects/YOUR_PROJECT/topics/gmail-notifications',
      );

      // Initialize Gmail API client with fresh token
      const oauth2Client = new google.auth.OAuth2(
        this.configService.get<string>('GOOGLE_CLIENT_ID'),
        this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      const configuredLabels = this.configService.get<string>('GMAIL_WATCH_LABELS');
      const requestBody: gmail_v1.Schema$WatchRequest = {
        topicName,
        labelFilterAction: 'include',
      };

      if (configuredLabels) {
        requestBody.labelIds = configuredLabels
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean);
      }

      // Call Gmail watch() API
      const response = await gmail.users.watch({
        userId: 'me',
        requestBody,
      });

      const watchResponse: GmailWatchResponse = response.data as any;

      // Calculate expiration (Gmail returns Unix timestamp in milliseconds)
      const expiresAt = new Date(parseInt(watchResponse.expiration));

      // Save subscription to database
      await this.prisma.webhookSubscription.upsert({
        where: subscriptionWhere,
        create: {
          tenantId: provider.tenantId,
          providerId,
          providerType: 'google',
          subscriptionId: watchResponse.historyId,
          resourcePath: GMAIL_WEBHOOK_RESOURCE,
          isActive: true,
          expiresAt,
          metadata: {
            topicName,
            historyId: watchResponse.historyId,
          },
        },
        update: {
          subscriptionId: watchResponse.historyId,
          resourcePath: GMAIL_WEBHOOK_RESOURCE,
          isActive: true,
          expiresAt,
          lastRenewedAt: new Date(),
          metadata: {
            topicName,
            historyId: watchResponse.historyId,
          },
        },
      });

      this.logger.log(
        `Created Gmail watch subscription for ${provider.email}, expires at ${expiresAt}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error creating Gmail subscription: ${errorMessage}`);

      // Log error in subscription record
      await this.prisma.webhookSubscription.update({
        where: subscriptionWhere,
        data: {
          isActive: false,
          lastError: errorMessage,
          errorCount: { increment: 1 },
        },
      }).catch(() => {}); // Ignore if doesn't exist

      throw error;
    }
  }

  /**
   * Renew expiring Gmail watch subscriptions
   * Should be called daily via cron
   */
  async renewExpiringSubscriptions(): Promise<void> {
    try {
      // Find subscriptions expiring in next 24 hours
      const expiringSubscriptions = await this.prisma.webhookSubscription.findMany({
        where: {
          providerType: 'google',
          resourcePath: GMAIL_WEBHOOK_RESOURCE,
          isActive: true,
          expiresAt: {
            lte: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next 24h
          },
        },
      });

      this.logger.log(
        `Found ${expiringSubscriptions.length} Gmail subscriptions to renew`,
      );

      for (const subscription of expiringSubscriptions) {
        try {
          await this.createSubscription({
            providerId: subscription.providerId,
            providerType: 'google',
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to renew subscription for provider ${subscription.providerId}: ${errorMessage}`,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error renewing Gmail subscriptions:', error);
    }
  }

  /**
   * Cancel a Gmail watch subscription
   */
  async cancelSubscription(providerId: string): Promise<void> {
    try {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error('Provider not found');
      }

      // Get fresh access token (decrypt + refresh if needed)
      const accessToken = await this.getFreshAccessToken(providerId);

      // Initialize Gmail API client with fresh token
      const oauth2Client = new google.auth.OAuth2(
        this.configService.get<string>('GOOGLE_CLIENT_ID'),
        this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Call Gmail stop() API
      await gmail.users.stop({ userId: 'me' });

      // Update database
      await this.prisma.webhookSubscription.update({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: GMAIL_WEBHOOK_RESOURCE,
          },
        },
        data: { isActive: false },
      });

      this.logger.log(`Cancelled Gmail watch for ${provider.email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error cancelling Gmail subscription: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Update subscription statistics after receiving notification
   */
  private async updateSubscriptionStats(providerId: string): Promise<void> {
    try {
      const result = await this.prisma.webhookSubscription.updateMany({
        where: {
          providerId,
          resourcePath: GMAIL_WEBHOOK_RESOURCE,
        },
        data: {
          lastNotificationAt: new Date(),
          notificationCount: { increment: 1 },
        },
      });
      if (result.count === 0) {
        this.logger.warn(`No gmail subscription row found for stats update (providerId=${providerId})`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Ignore if subscription doesn't exist, but keep trace for diagnostics
      this.logger.debug(`Could not update stats for ${providerId}: ${errorMessage}`);
    }
  }

  /**
   * Ensure a subscription row exists; warn and return false if missing.
   */
  private async ensureSubscriptionRow(providerId: string): Promise<boolean> {
    const subscription = await this.prisma.webhookSubscription.findFirst({
      where: {
        providerId,
        resourcePath: GMAIL_WEBHOOK_RESOURCE,
      },
    });

    if (!subscription) {
      this.logger.warn(
        `[GMAIL-WEBHOOK] No subscription record found for provider ${providerId}; switching to full sync and relying on cron/backfill.`,
      );
      return false;
    }

    return true;
  }

  /**
   * Get Gmail webhook statistics
   */
  async getStats(): Promise<Partial<WebhookStats>> {
    const total = await this.prisma.webhookSubscription.count({
      where: { providerType: 'google', resourcePath: GMAIL_WEBHOOK_RESOURCE },
    });

    const active = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'google',
        resourcePath: GMAIL_WEBHOOK_RESOURCE,
        isActive: true,
      },
    });

    const expiring = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'google',
        resourcePath: GMAIL_WEBHOOK_RESOURCE,
        isActive: true,
        expiresAt: {
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
    });

    const last1h = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'google',
        resourcePath: GMAIL_WEBHOOK_RESOURCE,
        lastNotificationAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    });

    const withErrors = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'google',
        resourcePath: GMAIL_WEBHOOK_RESOURCE,
        errorCount: { gt: 0 },
      },
    });

    return {
      totalSubscriptions: total,
      activeSubscriptions: active,
      expiringWithin24h: expiring,
      recentNotifications: {
        last1h,
        last24h: 0, // Would need separate query
      },
      errors: {
        totalErrors: 0, // Would need aggregate
        providersWithErrors: withErrors,
      },
    };
  }
}
