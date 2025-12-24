import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
import { OAuth2Client } from 'google-auth-library';
import { ProviderTokenService } from './provider-token.service';

export const GMAIL_WEBHOOK_RESOURCE = 'gmail/mailbox';

// Security: Replay attack prevention cache (type used by replayCache Map)

/**
 * Simple async mutex for per-provider locking
 * RC-7 Fix: Prevents race conditions in concurrent webhook processing
 */
class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

@Injectable()
export class GmailWebhookService {
  private readonly logger = new Logger(GmailWebhookService.name);

  // Gmail watch() expires after 7 days max
  private readonly DEFAULT_EXPIRATION_DAYS = 7;

  // Security fix (Issue #2): Replay attack prevention
  // In-memory cache of processed message IDs with TTL
  // SEC-3 fix: Reduced TTL from 10 minutes to 3 minutes for tighter replay protection
  private readonly processedMessages: Map<string, number> = new Map();
  private readonly MESSAGE_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes (reduced from 10)
  private readonly MAX_CACHE_SIZE = 10000;

  // RC-7 Fix: Per-provider mutex to prevent concurrent webhook processing
  private readonly providerMutexes: Map<string, AsyncMutex> = new Map();

  // Google OAuth2 client for JWT verification
  private readonly oauth2Client: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private configService: ConfigService,
    private providerTokenService: ProviderTokenService,
  ) {
    // Initialize OAuth2 client for JWT verification
    this.oauth2Client = new OAuth2Client();

    // Start cache cleanup interval
    setInterval(() => this.cleanupProcessedMessages(), this.MESSAGE_CACHE_TTL_MS);
  }

  /**
   * RC-7 Fix: Get or create mutex for a provider
   * Ensures only one webhook is processed at a time per provider
   */
  private getProviderMutex(providerId: string): AsyncMutex {
    let mutex = this.providerMutexes.get(providerId);
    if (!mutex) {
      mutex = new AsyncMutex();
      this.providerMutexes.set(providerId, mutex);
    }
    return mutex;
  }

  /**
   * Security fix (Issue #1): Verify Google Pub/Sub OIDC JWT token
   * Google Pub/Sub sends a signed JWT in the Authorization header
   * @see https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions
   */
  async verifyPubSubToken(token: string): Promise<boolean> {
    const expectedAudience = this.configService.get<string>('GOOGLE_PUBSUB_AUDIENCE');
    const expectedServiceAccount = this.configService.get<string>('GOOGLE_PUBSUB_SERVICE_ACCOUNT');

    // If no audience configured, skip verification (allows opt-in security)
    if (!expectedAudience) {
      this.logger.debug('[JWT] No GOOGLE_PUBSUB_AUDIENCE configured, skipping JWT verification');
      return false;
    }

    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: token,
        audience: expectedAudience,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid Pub/Sub JWT: no payload');
      }

      // Verify service account if configured
      if (expectedServiceAccount && payload.email !== expectedServiceAccount) {
        this.logger.error(`[JWT] Service account mismatch: ${payload.email} !== ${expectedServiceAccount}`);
        throw new UnauthorizedException('Invalid Pub/Sub JWT: service account mismatch');
      }

      // Verify token is not expired (verifyIdToken already checks this, but be explicit)
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new UnauthorizedException('Invalid Pub/Sub JWT: token expired');
      }

      this.logger.debug(`[JWT] Verified Pub/Sub token from ${payload.email}`);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[JWT] Failed to verify Pub/Sub token: ${message}`);
      throw new UnauthorizedException(`Invalid Pub/Sub JWT: ${message}`);
    }
  }

  /**
   * Security fix (Issue #2): Check if message was already processed (replay attack prevention)
   */
  isReplayedMessage(messageId: string): boolean {
    return this.processedMessages.has(messageId);
  }

  /**
   * Security fix (Issue #2): Mark message as processed
   */
  markMessageProcessed(messageId: string): void {
    // Enforce max cache size to prevent memory exhaustion
    if (this.processedMessages.size >= this.MAX_CACHE_SIZE) {
      this.cleanupProcessedMessages();
      // If still at max, remove oldest entries
      if (this.processedMessages.size >= this.MAX_CACHE_SIZE) {
        const entriesToRemove = Math.floor(this.MAX_CACHE_SIZE * 0.1); // Remove 10%
        const entries = Array.from(this.processedMessages.entries())
          .sort((a, b) => a[1] - b[1])
          .slice(0, entriesToRemove);
        entries.forEach(([id]) => this.processedMessages.delete(id));
      }
    }
    this.processedMessages.set(messageId, Date.now());
  }

  /**
   * Clean up expired message IDs from cache
   */
  private cleanupProcessedMessages(): void {
    const now = Date.now();
    let removed = 0;
    for (const [messageId, timestamp] of this.processedMessages.entries()) {
      if (now - timestamp > this.MESSAGE_CACHE_TTL_MS) {
        this.processedMessages.delete(messageId);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`[CACHE] Cleaned up ${removed} expired message IDs`);
    }
  }

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

      // RC-7 Fix: Acquire per-provider mutex to prevent concurrent webhook processing
      // This prevents race conditions on historyId tracking and duplicate sync jobs
      const mutex = this.getProviderMutex(provider.id);
      await mutex.acquire();

      try {
        const subscriptionExists = await this.ensureSubscriptionRow(provider.id);

        // Update webhook subscription stats
        this.logger.debug(`[GMAIL-WEBHOOK] Updating subscription stats for provider ${provider.id}...`);
        await this.updateSubscriptionStats(provider.id);

        // Re-fetch provider to get latest metadata (in case another webhook updated it)
        const freshProvider = await this.prisma.providerConfig.findUnique({
          where: { id: provider.id },
          select: { metadata: true, lastSyncedAt: true },
        });

        const lastHistoryIdRaw = (freshProvider?.metadata as any)?.historyId;
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
          lastSyncedAt: freshProvider?.lastSyncedAt ?? undefined,
        };

        this.logger.log(`[GMAIL-WEBHOOK] Queueing ${syncJob.syncType} sync job for ${provider.email}...`);
        await this.queueService.addSyncJob(syncJob);
        this.logger.log(`[GMAIL-WEBHOOK] Sync job queued successfully`);

        // Persist latest historyId for next delta
        const existingMetadata = (freshProvider?.metadata as Record<string, any>) || {};
        const newMetadata = {
          ...existingMetadata,
          historyId: data.historyId,
          gapDetected: hasGap || !subscriptionExists || undefined,
          lastGapAt: hasGap ? new Date().toISOString() : existingMetadata.lastGapAt,
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
      } finally {
        // RC-7 Fix: Always release mutex, even on error
        mutex.release();
      }
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
      }).catch(() => { }); // Ignore if doesn't exist

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

      // Also find failed subscriptions that should be retried
      // (inactive due to previous failures, but provider still exists and is active)
      const failedSubscriptions = await this.prisma.webhookSubscription.findMany({
        where: {
          providerType: 'google',
          resourcePath: GMAIL_WEBHOOK_RESOURCE,
          isActive: false,
          errorCount: { lt: 10 }, // Don't retry if too many failures
          provider: {
            isActive: true, // Only if provider is still active
          },
        },
        include: {
          provider: {
            select: { email: true },
          },
        },
      });

      this.logger.log(
        `Found ${expiringSubscriptions.length} Gmail subscriptions to renew, ${failedSubscriptions.length} failed to retry`,
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

      // Retry failed subscriptions
      for (const subscription of failedSubscriptions) {
        try {
          this.logger.log(
            `Retrying failed Gmail subscription for ${subscription.provider?.email}...`,
          );
          await this.createSubscription({
            providerId: subscription.providerId,
            providerType: 'google',
          });
          this.logger.log(
            `Successfully recreated Gmail subscription for ${subscription.provider?.email}`,
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to retry subscription for ${subscription.provider?.email}: ${errorMessage}`,
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
   * RC-11 FIX: Update subscription statistics after receiving notification
   * Uses update with where clause - Prisma increment is already atomic at DB level
   */
  private async updateSubscriptionStats(providerId: string): Promise<void> {
    try {
      // Try to update existing subscription
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
        // RC-11 FIX: Log if no subscription exists but don't fail
        this.logger.warn(
          `RC-11: No Gmail subscription row found for stats update (providerId=${providerId}). Stats not recorded.`,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
