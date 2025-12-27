import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { QueueService } from './queue.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { WebhookStats } from '../interfaces/webhook.interface';

/**
 * BaseWebhookService - Consolidates duplicate code between Gmail and Microsoft webhook services
 *
 * DC-Pattern-1,2,3,4 consolidation from Phase 7 audit:
 * - Webhook stats methods (~100 LOC)
 * - Subscription stats update with Redis lock (~60 LOC)
 * - In-memory cache cleanup logic (~50 LOC)
 * - Distributed lock with fallback (~100 LOC)
 *
 * Provider-specific implementations extend this base class.
 */
export abstract class BaseWebhookService {
  protected abstract readonly logger: Logger;

  /** Provider type for this webhook service */
  protected abstract readonly providerType: 'google' | 'microsoft';

  /** Resource path for webhook subscriptions (e.g., 'gmail/mailbox', '/me/mailFolders/inbox/messages') */
  protected abstract readonly resourcePath: string;

  /** Redis key prefix for deduplication */
  protected abstract readonly DEDUP_KEY_PREFIX: string;

  /** Deduplication TTL in seconds */
  protected abstract readonly DEDUP_TTL_SECONDS: number;

  // In-memory fallback cache for when Redis is unavailable
  protected readonly processedMessagesFallback: Map<string, number> = new Map();
  protected readonly MAX_CACHE_SIZE = 10000;
  protected readonly MESSAGE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly queueService: QueueService,
    protected readonly configService: ConfigService,
    protected readonly redisLock: RedisLockService,
  ) {}

  // ============================================
  // Common Implementations
  // ============================================

  /**
   * Check and mark message as processed using Redis (distributed, atomic)
   * Uses SET NX with TTL for atomic check-and-set across all instances
   *
   * @param messageId - Unique message ID for deduplication
   * @returns true if NEW message (not replayed), false if REPLAYED
   */
  async checkAndMarkProcessed(messageId: string): Promise<boolean> {
    const key = `${this.DEDUP_KEY_PREFIX}${messageId}`;

    try {
      // Atomic SET NX with TTL - returns lockId if new, null if exists
      const lockId = await this.redisLock.acquireLock(
        key,
        this.DEDUP_TTL_SECONDS * 1000, // Convert to ms
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
      // FAIL CLOSED - If Redis unavailable, use in-memory fallback
      // but log warning as this breaks distributed dedup
      this.logger.warn(
        `[DEDUP] Redis unavailable for ${messageId}, using in-memory fallback: ${this.extractErrorMessage(error)}`,
      );
      return this.checkAndMarkProcessedFallback(messageId);
    }
  }

  /**
   * In-memory fallback for deduplication (single-instance only)
   * WARNING: Does not work across multiple workers!
   */
  protected checkAndMarkProcessedFallback(messageId: string): boolean {
    if (this.processedMessagesFallback.has(messageId)) {
      this.logger.debug(`[DEDUP] Replay detected (fallback): ${messageId}`);
      return false; // REPLAYED
    }

    // Enforce max cache size
    if (this.processedMessagesFallback.size >= this.MAX_CACHE_SIZE) {
      this.cleanupExpiredCacheEntries();
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
   * Clean up expired message IDs from fallback cache
   * RC-9/RC-10 FIX: Collect keys to delete first, then delete in separate pass
   * This prevents concurrent modification issues during iteration
   */
  protected cleanupExpiredCacheEntries(): void {
    const now = Date.now();
    // Collect keys first to avoid concurrent modification
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
      this.logger.debug(`[CACHE] Cleaned up ${keysToDelete.length} expired entries from fallback cache`);
    }
  }

  /**
   * RC-11 FIX: Update subscription statistics after receiving notification
   * Uses Redis lock to prevent race conditions during stats update
   */
  protected async updateSubscriptionStats(providerId: string): Promise<void> {
    const lockKey = `webhook:stats:${this.providerType}:${providerId}`;
    try {
      await this.redisLock.withLock(lockKey, 2000, async () => {
        const result = await this.prisma.webhookSubscription.updateMany({
          where: {
            providerId,
            resourcePath: this.resourcePath,
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
            `RC-11: No ${this.providerType} subscription row found for stats update (providerId=${providerId}). Stats not recorded.`,
          );
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to acquire lock')) {
        this.logger.debug(`Stats update already in progress for ${providerId}, skipping...`);
        return;
      }
      this.logger.debug(`Could not update stats for ${providerId}: ${this.extractErrorMessage(error)}`);
    }
  }

  /**
   * Extract error message from unknown error type
   * Consolidates the common pattern: error instanceof Error ? error.message : String(error)
   */
  protected extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  /**
   * Get webhook statistics for this provider type
   */
  async getStats(): Promise<Partial<WebhookStats>> {
    const total = await this.prisma.webhookSubscription.count({
      where: { providerType: this.providerType, resourcePath: this.resourcePath },
    });

    const active = await this.prisma.webhookSubscription.count({
      where: {
        providerType: this.providerType,
        resourcePath: this.resourcePath,
        isActive: true,
      },
    });

    const expiring = await this.prisma.webhookSubscription.count({
      where: {
        providerType: this.providerType,
        resourcePath: this.resourcePath,
        isActive: true,
        expiresAt: {
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
    });

    const last1h = await this.prisma.webhookSubscription.count({
      where: {
        providerType: this.providerType,
        resourcePath: this.resourcePath,
        lastNotificationAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    });

    const withErrors = await this.prisma.webhookSubscription.count({
      where: {
        providerType: this.providerType,
        resourcePath: this.resourcePath,
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

  // ============================================
  // Abstract Methods - Provider-Specific
  // ============================================

  /**
   * Create a webhook subscription for a provider
   */
  abstract createSubscription(options: { providerId: string; providerType: string; webhookUrl?: string }): Promise<void>;

  /**
   * Cancel a webhook subscription
   */
  abstract cancelSubscription(providerId: string): Promise<void>;

  /**
   * Renew expiring subscriptions (called by cron)
   */
  abstract renewExpiringSubscriptions(): Promise<void>;
}
