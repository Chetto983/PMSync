import { Injectable, Logger } from '@nestjs/common';
import { timingSafeEqual, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { QueueService } from './queue.service';
import {
  MicrosoftGraphNotification,
  MicrosoftGraphSubscription,
  CreateWebhookOptions,
  WebhookStats,
} from '../interfaces/webhook.interface';
import { SyncJobData } from '../interfaces/sync-job.interface';
import axios from 'axios';
import { ProviderTokenService } from './provider-token.service';
import type { ProviderConfig } from '@prisma/client';

export const MICROSOFT_MAIL_RESOURCE = '/me/mailFolders/inbox/messages';

// Security fix (Issue #3): Rate limiting structure
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// Security fix (SEC-1): Duplicate notification detection
interface ProcessedNotification {
  timestamp: number;
}

@Injectable()
export class MicrosoftWebhookService {
  private readonly logger = new Logger(MicrosoftWebhookService.name);

  // Microsoft Graph subscriptions expire after max 4230 minutes (~ 3 days)
  private readonly DEFAULT_EXPIRATION_MINUTES = 4230;
  private readonly GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';
  // Drift tolerance before flagging stale renewals (default 24h)
  private readonly RENEWAL_DRIFT_MINUTES =
    Number(process.env.MICROSOFT_RENEWAL_DRIFT_MINUTES) || 1440;

  // Security fix (Issue #3): Rate limiting configuration
  private readonly rateLimitMap: Map<string, RateLimitEntry> = new Map();
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
  private readonly RATE_LIMIT_MAX_REQUESTS = 100; // Max 100 notifications per minute per subscription
  private readonly RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

  // Security fix (SEC-1): Duplicate notification detection
  // Microsoft can send duplicate notifications; track recently processed ones
  private readonly processedNotifications: Map<string, ProcessedNotification> = new Map();
  private readonly NOTIFICATION_DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minute dedup window

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private configService: ConfigService,
    private providerTokenService: ProviderTokenService,
  ) {
    // Start rate limit cleanup interval
    setInterval(() => this.cleanupRateLimitEntries(), this.RATE_LIMIT_CLEANUP_INTERVAL_MS);
  }

  /**
   * Security fix (Issue #3): Check and update rate limit for a subscription
   * @returns true if request is allowed, false if rate limited
   */
  private checkRateLimit(subscriptionId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimitMap.get(subscriptionId);

    if (!entry) {
      // First request for this subscription
      this.rateLimitMap.set(subscriptionId, { count: 1, windowStart: now });
      return true;
    }

    // Check if we're in a new window
    if (now - entry.windowStart > this.RATE_LIMIT_WINDOW_MS) {
      // Reset window
      this.rateLimitMap.set(subscriptionId, { count: 1, windowStart: now });
      return true;
    }

    // Check if limit exceeded
    if (entry.count >= this.RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }

    // Increment count
    entry.count++;
    return true;
  }

  /**
   * Cleanup expired rate limit entries to prevent memory leak
   */
  private cleanupRateLimitEntries(): void {
    const now = Date.now();
    let removed = 0;
    for (const [subscriptionId, entry] of this.rateLimitMap.entries()) {
      if (now - entry.windowStart > this.RATE_LIMIT_WINDOW_MS * 2) {
        this.rateLimitMap.delete(subscriptionId);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`[RATE-LIMIT] Cleaned up ${removed} expired rate limit entries`);
    }

    // Also cleanup old notification dedup entries
    let dedupRemoved = 0;
    for (const [notificationKey, entry] of this.processedNotifications.entries()) {
      if (now - entry.timestamp > this.NOTIFICATION_DEDUP_WINDOW_MS) {
        this.processedNotifications.delete(notificationKey);
        dedupRemoved++;
      }
    }
    if (dedupRemoved > 0) {
      this.logger.debug(`[DEDUP] Cleaned up ${dedupRemoved} expired notification dedup entries`);
    }
  }

  /**
   * Security fix (SEC-1): Check if notification was already processed (idempotency)
   * Creates a unique key from subscription + resource + change type to detect duplicates
   * @returns true if this is a NEW notification, false if duplicate
   */
  private checkAndMarkProcessed(notification: MicrosoftGraphNotification): boolean {
    // Create unique key: subscriptionId + resource + changeType + resourceData (if available)
    const resourceId = notification.resourceData?.id || notification.resource || '';
    const notificationKey = `${notification.subscriptionId}:${resourceId}:${notification.changeType}`;

    const now = Date.now();
    const existing = this.processedNotifications.get(notificationKey);

    if (existing && (now - existing.timestamp) < this.NOTIFICATION_DEDUP_WINDOW_MS) {
      // Duplicate notification within dedup window
      return false;
    }

    // Mark as processed
    this.processedNotifications.set(notificationKey, { timestamp: now });
    return true;
  }

  /**
   * Security fix: Timing-safe string comparison (CWE-208)
   * Prevents timing attacks on clientState validation
   */
  private safeCompare(provided: string, expected: string): boolean {
    if (provided.length !== expected.length) {
      const paddedProvided = Buffer.alloc(expected.length, provided);
      const expectedBuf = Buffer.from(expected);
      timingSafeEqual(paddedProvided, expectedBuf);
      return false;
    }
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }

  /**
   * Handle incoming Microsoft Graph notifications
   */
  async handleNotifications(
    notifications: MicrosoftGraphNotification[],
  ): Promise<void> {
    for (const notification of notifications) {
      try {
        await this.handleSingleNotification(notification);
      } catch (error) {
        this.logger.error(
          `Error processing notification ${notification.subscriptionId}:`,
          error,
        );
      }
    }
  }

  /**
   * Process a single Microsoft Graph notification
   */
  private async handleSingleNotification(
    notification: MicrosoftGraphNotification,
  ): Promise<void> {
    this.logger.log(
      `Microsoft notification: ${notification.changeType} for subscription ${notification.subscriptionId}`,
    );

    // Security fix (Issue #3): Apply rate limiting per subscription
    if (!this.checkRateLimit(notification.subscriptionId)) {
      this.logger.warn(
        `[RATE-LIMIT] Rate limit exceeded for subscription ${notification.subscriptionId}, dropping notification`,
      );
      return;
    }

    // Security fix (SEC-1): Check for duplicate notifications
    if (!this.checkAndMarkProcessed(notification)) {
      this.logger.debug(
        `[DEDUP] Duplicate notification detected for subscription ${notification.subscriptionId}, skipping`,
      );
      return;
    }

    // Find subscription in database
    const subscription = await this.prisma.webhookSubscription.findFirst({
      where: {
        subscriptionId: notification.subscriptionId,
        providerType: 'microsoft',
        isActive: true,
      },
    });

    if (!subscription) {
      this.logger.warn(
        `No active subscription found for ${notification.subscriptionId}`,
      );
      return;
    }

    // Update subscription stats
    await this.updateSubscriptionStats(subscription.providerId);

    // Get provider
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: subscription.providerId },
    });

    if (!provider) {
      this.logger.warn(`Provider not found for subscription ${subscription.id}`);
      return;
    }

    // Validate clientState to prevent spoofed notifications
    const expectedClientState =
      (subscription.metadata as any)?.clientState ??
      (subscription as any).clientState;
    if (expectedClientState && !this.safeCompare(notification.clientState || '', expectedClientState)) {
      this.logger.warn(
        `ClientState mismatch for provider ${provider.id}: expected ${expectedClientState}, got ${notification.clientState}; dropping notification.`,
      );
      return;
    }

    // Trigger incremental sync based on change type
    if (['created', 'updated', 'deleted'].includes(notification.changeType)) {
      const syncJob: SyncJobData = {
        tenantId: provider.tenantId,
        providerId: provider.id,
        providerType: 'microsoft',
        email: provider.email,
        priority: 'high', // Webhook triggers are high priority
        syncType: 'incremental',
        lastSyncedAt: provider.lastSyncedAt ?? undefined,
      };

      await this.queueService.addSyncJob(syncJob);

      this.logger.log(
        `Triggered incremental sync for ${provider.email} via webhook`,
      );
    }
  }

  /**
   * Create a Microsoft Graph subscription for a provider
   */
  async createSubscription(options: CreateWebhookOptions): Promise<void> {
    const { providerId, webhookUrl } = options;

    if (!webhookUrl) {
      throw new Error('webhookUrl is required for Microsoft Graph subscriptions');
    }

    try {
      // Get provider credentials
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || provider.providerType !== 'microsoft') {
        throw new Error('Invalid Microsoft provider');
      }

      const accessToken = await this.getFreshAccessToken(provider);

      // Generate a unique client state for validation
      const clientState = this.generateClientState(providerId);

      // Calculate expiration (max 4230 minutes for mailFolder resource)
      const expirationDateTime = new Date(
        Date.now() + this.DEFAULT_EXPIRATION_MINUTES * 60 * 1000,
      ).toISOString();

      // Create subscription via Microsoft Graph API
      const subscriptionData = {
        changeType: 'created,updated,deleted',
        notificationUrl: webhookUrl,
        resource: MICROSOFT_MAIL_RESOURCE, // Watch inbox messages
        expirationDateTime,
        clientState,
      };

      const response = await axios.post<MicrosoftGraphSubscription>(
        `${this.GRAPH_API_URL}/subscriptions`,
        subscriptionData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const subscription = response.data;

      // Save subscription to database
      await this.prisma.webhookSubscription.upsert({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: MICROSOFT_MAIL_RESOURCE,
          },
        },
        create: {
          tenantId: provider.tenantId,
          providerId,
          providerType: 'microsoft',
          subscriptionId: subscription.id,
          webhookUrl,
          resourcePath: subscription.resource,
          isActive: true,
          expiresAt: new Date(subscription.expirationDateTime),
          metadata: {
            clientState,
            changeType: subscription.changeType,
          },
        },
        update: {
          subscriptionId: subscription.id,
          webhookUrl,
          resourcePath: subscription.resource,
          isActive: true,
          expiresAt: new Date(subscription.expirationDateTime),
          lastRenewedAt: new Date(),
          metadata: {
            clientState,
            changeType: subscription.changeType,
          },
        },
      });

      this.logger.log(
        `Created Microsoft Graph subscription for ${provider.email}, expires at ${subscription.expirationDateTime}`,
      );
    } catch (error) {
      const errorMessage = this.getAxiosErrorMessage(error);
      this.logger.error(
        `Error creating Microsoft subscription: ${errorMessage}`,
      );

      // Log error in subscription record
      await this.prisma.webhookSubscription
        .update({
          where: {
            providerId_resourcePath: {
              providerId,
              resourcePath: MICROSOFT_MAIL_RESOURCE,
            },
          },
          data: {
            isActive: false,
            lastError: errorMessage,
            errorCount: { increment: 1 },
          },
        })
        .catch(() => {}); // Ignore if doesn't exist

      throw error;
    }
  }

  /**
   * Renew expiring Microsoft Graph subscriptions
   * Should be called every 6 hours via cron (Microsoft subscriptions expire after ~3 days)
   */
  async renewExpiringSubscriptions(): Promise<void> {
    try {
      const now = new Date();
      const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Find subscriptions expiring in next 24 hours OR already expired (active ones)
      const expiringSubscriptions =
        await this.prisma.webhookSubscription.findMany({
          where: {
            providerType: 'microsoft',
            resourcePath: MICROSOFT_MAIL_RESOURCE,
            isActive: true,
            expiresAt: {
              lte: next24h, // Next 24h or already expired
            },
          },
        });

      // Also find failed subscriptions that should be retried
      // (inactive due to previous failures, but provider still exists and is active)
      const failedSubscriptions = await this.prisma.webhookSubscription.findMany({
        where: {
          providerType: 'microsoft',
          resourcePath: MICROSOFT_MAIL_RESOURCE,
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

      // Separate expired from expiring-soon
      const expired = expiringSubscriptions.filter((s) => s.expiresAt && s.expiresAt < now);
      const expiringSoon = expiringSubscriptions.filter((s) => s.expiresAt && s.expiresAt >= now);

      this.logger.log(
        `Found ${expiringSubscriptions.length} Microsoft subscriptions to renew (${expired.length} expired, ${expiringSoon.length} expiring soon), ${failedSubscriptions.length} failed to retry`,
      );

      // Process active subscriptions that need renewal
      for (const subscription of expiringSubscriptions) {
        const isExpired = subscription.expiresAt && subscription.expiresAt < now;

        try {
          if (isExpired) {
            // Expired subscriptions need to be recreated, not renewed
            this.logger.warn(
              `Microsoft subscription ${subscription.subscriptionId} has expired, recreating...`,
            );
            await this.recreateSubscription(subscription.providerId);
          } else {
            await this.renewSubscription(subscription.subscriptionId, subscription.providerId);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to ${isExpired ? 'recreate' : 'renew'} subscription ${subscription.subscriptionId}: ${errorMessage}`,
          );
          await this.failOpenToCron(subscription.providerId, subscription.subscriptionId);
        }
      }

      // Retry failed subscriptions
      for (const subscription of failedSubscriptions) {
        try {
          this.logger.log(
            `Retrying failed Microsoft subscription for ${subscription.provider?.email}...`,
          );
          await this.recreateSubscription(subscription.providerId);
          this.logger.log(
            `Successfully recreated Microsoft subscription for ${subscription.provider?.email}`,
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
      this.logger.error('Error renewing Microsoft subscriptions:', error);
    }
  }

  /**
   * Recreate an expired Microsoft Graph subscription
   */
  private async recreateSubscription(providerId: string): Promise<void> {
    // First delete the old subscription from our DB (it's already expired on Microsoft's side)
    await this.prisma.webhookSubscription.updateMany({
      where: {
        providerId,
        resourcePath: MICROSOFT_MAIL_RESOURCE,
      },
      data: { isActive: false },
    });

    // Get webhook URL from config
    const configuredUrl = this.configService.get<string>('MICROSOFT_EMAIL_WEBHOOK_URL');
    const apiUrl = this.configService.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
    const webhookUrl = configuredUrl || `${apiUrl}/webhooks/microsoft/notifications`;

    // Create a fresh subscription
    await this.createSubscription({
      providerId,
      providerType: 'microsoft',
      webhookUrl,
    });
  }

  /**
   * Renew a specific Microsoft Graph subscription
   */
  private async renewSubscription(
    subscriptionId: string,
    providerId: string,
  ): Promise<void> {
    try {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || provider.providerType !== 'microsoft') {
        throw new Error('Invalid provider');
      }

      const accessToken = await this.getFreshAccessToken(provider);

      // Calculate new expiration
      const expirationDateTime = new Date(
        Date.now() + this.DEFAULT_EXPIRATION_MINUTES * 60 * 1000,
      ).toISOString();

      // Update subscription via Microsoft Graph API
      const response = await axios.patch<MicrosoftGraphSubscription>(
        `${this.GRAPH_API_URL}/subscriptions/${subscriptionId}`,
        { expirationDateTime },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const updatedSubscription = response.data;

      // Update database
      await this.prisma.webhookSubscription.update({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: MICROSOFT_MAIL_RESOURCE,
          },
        },
        data: {
          expiresAt: new Date(updatedSubscription.expirationDateTime),
          lastRenewedAt: new Date(),
        },
      });

      this.logger.log(
        `Renewed Microsoft subscription ${subscriptionId}, new expiration: ${updatedSubscription.expirationDateTime}`,
      );
    } catch (error) {
      const errorMessage = this.getAxiosErrorMessage(error);
      this.logger.error(
        `Error renewing subscription ${subscriptionId}: ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Cancel a Microsoft Graph subscription
   */
  async cancelSubscription(providerId: string): Promise<void> {
    try {
      const subscription = await this.prisma.webhookSubscription.findFirst({
        where: {
          providerId,
          resourcePath: MICROSOFT_MAIL_RESOURCE,
        },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || provider.providerType !== 'microsoft') {
        throw new Error('Invalid provider or missing token');
      }

      const accessToken = await this.getFreshAccessToken(provider);

      // Delete subscription via Microsoft Graph API
      await axios.delete(
        `${this.GRAPH_API_URL}/subscriptions/${subscription.subscriptionId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      // Update database
      await this.prisma.webhookSubscription.update({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: MICROSOFT_MAIL_RESOURCE,
          },
        },
        data: { isActive: false },
      });

      this.logger.log(
        `Cancelled Microsoft subscription for provider ${providerId}`,
      );
    } catch (error) {
      const errorMessage = this.getAxiosErrorMessage(error);
      this.logger.error(
        `Error cancelling Microsoft subscription: ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Update subscription statistics after receiving notification
   */
  private async updateSubscriptionStats(providerId: string): Promise<void> {
    try {
      await this.prisma.webhookSubscription.update({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: MICROSOFT_MAIL_RESOURCE,
          },
        },
        data: {
          lastNotificationAt: new Date(),
          notificationCount: { increment: 1 },
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Could not update stats for ${providerId}: ${errorMessage}`);
    }
  }

  /**
   * Generate a cryptographically secure random client state for subscription validation
   * Security fix (SEC-2): Use crypto.randomBytes() instead of Math.random()
   */
  private generateClientState(providerId: string): string {
    // Generate 16 bytes of cryptographically secure random data
    const randomString = randomBytes(16).toString('hex');
    return `${providerId}-${randomString}`;
  }

  /**
   * Ensure we have a decrypted, non-expired Microsoft access token
   */
  private async getFreshAccessToken(provider: ProviderConfig): Promise<string> {
    const { provider: fullProvider, accessToken } = await this.providerTokenService.getProviderWithToken(
      provider.id,
    );

    if (fullProvider.providerType !== 'microsoft') {
      throw new Error('Invalid Microsoft provider');
    }

    return accessToken;
  }

  private getAxiosErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error;
      const status = axiosError.response?.status;
      const data =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response.data
          : JSON.stringify(axiosError.response?.data);
      return status ? `HTTP ${status}: ${data}` : axiosError.message;
    }

    return error instanceof Error ? error.message : String(error);
  }

  /**
   * If renewal fails, deactivate webhook and force cron fallback for the provider.
   */
  private async failOpenToCron(providerId: string, subscriptionId?: string): Promise<void> {
    try {
      await this.prisma.webhookSubscription.update({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: MICROSOFT_MAIL_RESOURCE,
          },
        },
        data: {
          isActive: false,
          lastError: `Renewal failed${subscriptionId ? ` (${subscriptionId})` : ''}`,
          metadata: {
            renewalFailedAt: new Date().toISOString(),
            subscriptionId,
          },
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to mark subscription ${subscriptionId ?? ''} inactive after renewal failure: ${msg}`,
      );
    }

    try {
      await this.prisma.providerConfig.update({
        where: { id: providerId },
        data: {
          nextSyncAt: new Date(), // force cron backup
          syncPriority: 2, // medium-high
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to set cron fallback for provider ${providerId} after webhook renewal failure: ${msg}`,
      );
    }
  }

  /**
   * Get Microsoft webhook statistics
   */
  async getStats(): Promise<Partial<WebhookStats>> {
    const now = new Date();
    const driftCutoff = new Date(
      now.getTime() - this.RENEWAL_DRIFT_MINUTES * 60 * 1000,
    );

    const total = await this.prisma.webhookSubscription.count({
      where: { providerType: 'microsoft', resourcePath: MICROSOFT_MAIL_RESOURCE },
    });

    const active = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_MAIL_RESOURCE,
        isActive: true,
      },
    });

    const expiring = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_MAIL_RESOURCE,
        isActive: true,
        expiresAt: {
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
    });

    const last1h = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_MAIL_RESOURCE,
        lastNotificationAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    });

    const staleRenewals = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_MAIL_RESOURCE,
        isActive: true,
        lastRenewedAt: { lt: driftCutoff },
      },
    });

    const withErrors = await this.prisma.webhookSubscription.count({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_MAIL_RESOURCE,
        errorCount: { gt: 0 },
      },
    });

    return {
      totalSubscriptions: total,
      activeSubscriptions: active,
      expiringWithin24h: expiring,
      staleRenewals,
      recentNotifications: {
        last1h,
        last24h: 0,
      },
      errors: {
        totalErrors: 0,
        providersWithErrors: withErrors,
      },
    };
  }
}
