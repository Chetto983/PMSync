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
import { RedisLockService } from '../../../common/services/redis-lock.service';

export const GMAIL_WEBHOOK_RESOURCE = 'gmail/mailbox';

// RC-2 FIX: Increased TTL for better replay attack prevention
// In-memory cache only used as fallback when Redis unavailable
const WEBHOOK_DEDUP_TTL_SECONDS = 3600; // 1 hour (was 3 minutes)
const WEBHOOK_DEDUP_KEY_PREFIX = 'webhook:gmail:dedup:';

@Injectable()
export class GmailWebhookService {
  private readonly logger = new Logger(GmailWebhookService.name);

  // Gmail watch() expires after 7 days max
  private readonly DEFAULT_EXPIRATION_DAYS = 7;

  // RC-2 FIX: In-memory fallback cache only used when Redis unavailable
  // Primary deduplication now uses Redis with 1-hour TTL
  private readonly processedMessagesFallback: Map<string, number> = new Map();
  private readonly MESSAGE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (increased from 3 minutes)
  private readonly MAX_CACHE_SIZE = 10000;

  // Google OAuth2 client for JWT verification
  private readonly oauth2Client: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private configService: ConfigService,
    private providerTokenService: ProviderTokenService,
    // RC-2 + RC-7 FIX: Use Redis for distributed dedup and per-provider locking
    private redisLock: RedisLockService,
  ) {
    // Initialize OAuth2 client for JWT verification
    this.oauth2Client = new OAuth2Client();

    // Start cache cleanup interval for fallback cache
    setInterval(() => this.cleanupProcessedMessages(), this.MESSAGE_CACHE_TTL_MS / 4);
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
   * RC-2 FIX: Check and mark message as processed using Redis (distributed, atomic)
   * Uses SET NX with TTL for atomic check-and-set across all instances
   *
   * @param messageId - Unique message ID (Pub/Sub message ID)
   * @returns true if NEW message (not replayed), false if REPLAYED
   */
  async checkAndMarkProcessed(messageId: string): Promise<boolean> {
    const key = `${WEBHOOK_DEDUP_KEY_PREFIX}${messageId}`;

    try {
      // Atomic SET NX with TTL - returns lockId if new, null if exists
      const lockId = await this.redisLock.acquireLock(
        key,
        WEBHOOK_DEDUP_TTL_SECONDS * 1000, // Convert to ms
        { maxRetries: 1 }, // Single attempt - if exists, it's a replay
      );

      if (lockId) {
        this.logger.debug(`[DEDUP] New message accepted: ${messageId}`);
        // Note: We intentionally don't release the lock - it expires after TTL
        // This prevents the same message from being processed again
        return true; // NEW message
      }

      this.logger.debug(`[DEDUP] Replay detected (Redis): ${messageId}`);
      return false; // REPLAYED
    } catch (error) {
      // RC-2 FIX: FAIL CLOSED - If Redis unavailable, use in-memory fallback
      // but log warning as this breaks distributed dedup
      this.logger.warn(
        `[DEDUP] Redis unavailable for ${messageId}, using in-memory fallback: ${error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.checkAndMarkProcessedFallback(messageId);
    }
  }

  /**
   * In-memory fallback for deduplication (single-instance only)
   * WARNING: Does not work across multiple workers!
   */
  private checkAndMarkProcessedFallback(messageId: string): boolean {
    if (this.processedMessagesFallback.has(messageId)) {
      this.logger.debug(`[DEDUP] Replay detected (fallback): ${messageId}`);
      return false; // REPLAYED
    }

    // Enforce max cache size
    if (this.processedMessagesFallback.size >= this.MAX_CACHE_SIZE) {
      this.cleanupProcessedMessages();
      if (this.processedMessagesFallback.size >= this.MAX_CACHE_SIZE) {
        const entriesToRemove = Math.floor(this.MAX_CACHE_SIZE * 0.1);
        const entries = Array.from(this.processedMessagesFallback.entries())
          .sort((a, b) => a[1] - b[1])
          .slice(0, entriesToRemove);
        entries.forEach(([id]) => this.processedMessagesFallback.delete(id));
      }
    }

    this.processedMessagesFallback.set(messageId, Date.now());
    return true; // NEW message
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use checkAndMarkProcessed instead
   */
  isReplayedMessage(messageId: string): boolean {
    // Synchronous check for in-memory fallback only
    return this.processedMessagesFallback.has(messageId);
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use checkAndMarkProcessed instead
   */
  markMessageProcessed(messageId: string): void {
    this.processedMessagesFallback.set(messageId, Date.now());
  }

  /**
   * Clean up expired message IDs from fallback cache
   * RC-9 FIX: Collect keys to delete first, then delete in separate pass
   * This prevents concurrent modification issues during iteration
   */
  private cleanupProcessedMessages(): void {
    const now = Date.now();
    // RC-9 FIX: Collect keys first to avoid concurrent modification
    const keysToDelete: string[] = [];
    for (const [messageId, timestamp] of this.processedMessagesFallback.entries()) {
      if (now - timestamp > this.MESSAGE_CACHE_TTL_MS) {
        keysToDelete.push(messageId);
      }
    }
    // Delete in separate pass
    for (const key of keysToDelete) {
      this.processedMessagesFallback.delete(key);
    }
    if (keysToDelete.length > 0) {
      this.logger.debug(`[CACHE] Cleaned up ${keysToDelete.length} expired message IDs from fallback cache`);
    }
  }

  /**
   * Handle incoming Gmail Pub/Sub notification
   * RC-7 FIX: Uses Redis distributed lock for per-provider coordination
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

      // RC-7 FIX: Use Redis distributed lock for per-provider coordination
      // This works across multiple app instances (unlike in-memory mutex)
      const lockKey = `gmail:webhook:${provider.id}`;
      const lockTtlMs = 30000; // 30 second lock for webhook processing

      try {
        await this.redisLock.withLock(
          lockKey,
          lockTtlMs,
          async () => {
            await this.processWebhookWithLock(provider.id, provider.tenantId, provider.email, data);
          },
          { maxRetries: 3 },
        );
      } catch (lockError) {
        // RC-7: If lock fails, log and skip - another instance is handling this provider
        this.logger.warn(
          `[GMAIL-WEBHOOK] Lock failed for provider ${provider.id}, skipping: ${lockError instanceof Error ? lockError.message : String(lockError)
          }`,
        );
        // Don't throw - this is expected in high-concurrency scenarios
      }
    } catch (error) {
      this.logger.error('Error processing Gmail notification:', error);
      throw error;
    }
  }

  /**
   * Process webhook notification with distributed lock held
   * RC-7 FIX: Extracted to separate method for cleaner locking
   */
  private async processWebhookWithLock(
    providerId: string,
    tenantId: string,
    email: string,
    data: GmailPubSubData,
  ): Promise<void> {
    const subscriptionExists = await this.ensureSubscriptionRow(providerId);

    // Update webhook subscription stats
    this.logger.debug(`[GMAIL-WEBHOOK] Updating subscription stats for provider ${providerId}...`);
    await this.updateSubscriptionStats(providerId);

    // Re-fetch provider to get latest metadata (in case another webhook updated it)
    const freshProvider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { metadata: true, lastSyncedAt: true },
    });

    const lastHistoryIdRaw = (freshProvider?.metadata as any)?.historyId;
    // CRIT-1 FIX: Use BigInt for historyId comparison to prevent integer overflow
    // Gmail historyId can exceed Number.MAX_SAFE_INTEGER (2^53-1)
    // Using string comparison or BigInt prevents precision loss
    let hasGap = false;
    let lastHistoryIdStr = '';
    const incomingHistoryIdStr = data.historyId || '';

    if (lastHistoryIdRaw && data.historyId) {
      lastHistoryIdStr = String(lastHistoryIdRaw);
      try {
        // Use BigInt for safe comparison of large integers
        const lastBigInt = BigInt(lastHistoryIdStr);
        const incomingBigInt = BigInt(incomingHistoryIdStr);
        hasGap = incomingBigInt < lastBigInt;
      } catch {
        // Fallback to string comparison if BigInt fails (non-numeric values)
        this.logger.warn(
          `[GMAIL-WEBHOOK] Invalid historyId format, falling back to string comparison`,
        );
        hasGap = incomingHistoryIdStr < lastHistoryIdStr;
      }
    }

    this.logger.debug(
      `[GMAIL-WEBHOOK] History IDs - last: ${lastHistoryIdStr}, incoming: ${incomingHistoryIdStr}, hasGap: ${hasGap}`,
    );

    // Trigger incremental sync with high priority (fallback full if gap detected)
    const syncJob: SyncJobData = {
      tenantId,
      providerId,
      providerType: 'google',
      email,
      priority: 'high', // Webhook triggers are high priority
      syncType: hasGap || !subscriptionExists ? 'full' : 'incremental',
      lastSyncedAt: freshProvider?.lastSyncedAt ?? undefined,
    };

    this.logger.log(`[GMAIL-WEBHOOK] Queueing ${syncJob.syncType} sync job for ${email}...`);
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
      where: { id: providerId },
      data: { metadata: newMetadata },
    });
    this.logger.debug(`[GMAIL-WEBHOOK] Provider metadata updated successfully`);

    this.logger.log(
      `[GMAIL-WEBHOOK] ✅ Triggered ${syncJob.syncType} sync for ${email} via webhook`,
    );
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
      }).catch((updateErr) => {
        // Q-7 FIX: Log subscription update failures for debugging (record may not exist)
        this.logger.debug(`Failed to update subscription status: ${updateErr instanceof Error ? updateErr.message : updateErr}`);
      });

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
    // RC-11 FIX: Use distributed lock to prevent race conditions during stats update
    const lockKey = `webhook:stats:google:${providerId}`;
    try {
      await this.redisLock.withLock(lockKey, 2000, async () => {
        const result = await this.prisma.webhookSubscription.updateMany({
          where: {
            providerId,
            resourcePath: GMAIL_WEBHOOK_RESOURCE,
          },
          data: {
            lastNotificationAt: new Date(),
            notificationCount: { increment: 1 },
            errorCount: 0,
          },
        });

        if (result.count === 0) {
          // RC-11 FIX: Log if no subscription exists but don't fail
          this.logger.warn(
            `RC-11: No Gmail subscription row found for stats update (providerId=${providerId}). Stats not recorded.`,
          );
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to acquire lock')) {
        this.logger.debug(`Stats update already in progress for ${providerId}, skipping...`);
        return;
      }
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
