/**
 * AI Rate Limiter Service
 *
 * Token bucket rate limiting for AI requests.
 * Designed for 1000+ concurrent users with fair resource allocation.
 *
 * Features:
 * - Per-tenant rate limiting (prevents noisy neighbors)
 * - Global rate limiting (protects API quotas)
 * - Sliding window algorithm (smooth traffic)
 * - Redis-backed for multi-instance deployment
 * - Graceful degradation when Redis unavailable
 *
 * IMPORTANT: Provider-specific limits (2026-01-28 update):
 * - Mistral API: 12 req/sec = 720 req/min (we use 600 for safety buffer)
 * - Azure OpenAI: Higher limits via env vars (AI_RATE_LIMIT_GLOBAL_RPM)
 *
 * Default Limits (Mistral 12 req/sec tier):
 * - 60 requests/minute per tenant (fair sharing)
 * - 600 requests/minute global (10 req/sec < Mistral's 12 req/sec)
 * - 200,000 tokens/hour per tenant
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';

export interface RateLimitConfig {
  /** Requests per minute per tenant */
  tenantRequestsPerMinute: number;
  /** Tokens per hour per tenant */
  tenantTokensPerHour: number;
  /** Global requests per minute (all tenants) */
  globalRequestsPerMinute: number;
  /** Enable/disable rate limiting */
  enabled: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  reason?: string;
}

interface RateLimitBucket {
  count: number;
  tokens: number;
  windowStart: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  tenantRequestsPerMinute: 60, // Doubled for 1000+ users (was 30)
  tenantTokensPerHour: 200000, // 4x increase for power users (was 50000)
  globalRequestsPerMinute: 10000, // ~166 req/sec for 1000+ users (was 300)
  enabled: true,
};

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly config: RateLimitConfig;

  // In-memory fallback when Redis unavailable
  private readonly localBuckets = new Map<string, RateLimitBucket>();
  private readonly WINDOW_SIZE_MS = 60000; // 1 minute sliding window
  private readonly TOKEN_WINDOW_MS = 3600000; // 1 hour for token limits

  constructor(
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(CacheService) private readonly cacheService?: CacheService,
  ) {
    this.config = { ...DEFAULT_CONFIG };

    // Override from environment
    if (process.env.AI_RATE_LIMIT_TENANT_RPM) {
      this.config.tenantRequestsPerMinute = parseInt(process.env.AI_RATE_LIMIT_TENANT_RPM, 10);
    }
    if (process.env.AI_RATE_LIMIT_TENANT_TPH) {
      this.config.tenantTokensPerHour = parseInt(process.env.AI_RATE_LIMIT_TENANT_TPH, 10);
    }
    if (process.env.AI_RATE_LIMIT_GLOBAL_RPM) {
      this.config.globalRequestsPerMinute = parseInt(process.env.AI_RATE_LIMIT_GLOBAL_RPM, 10);
    }
    if (process.env.AI_RATE_LIMIT_ENABLED === 'false') {
      this.config.enabled = false;
    }

    this.logger.log(
      `Rate limiter initialized: ${this.config.tenantRequestsPerMinute} req/min per tenant, ` +
        `${this.config.globalRequestsPerMinute} req/min global`,
    );
  }

  /**
   * Check if a request is allowed under rate limits.
   * Call this before processing AI requests.
   */
  async checkLimit(tenantId: string, estimatedTokens = 500): Promise<RateLimitResult> {
    if (!this.config.enabled) {
      return { allowed: true, remaining: -1, resetInSeconds: 0 };
    }

    const now = Date.now();

    // Check tenant request limit
    const tenantResult = await this.checkTenantRequestLimit(tenantId, now);
    if (!tenantResult.allowed) {
      return tenantResult;
    }

    // Check tenant token limit
    const tokenResult = await this.checkTenantTokenLimit(tenantId, estimatedTokens, now);
    if (!tokenResult.allowed) {
      return tokenResult;
    }

    // Check global limit
    const globalResult = await this.checkGlobalLimit(now);
    if (!globalResult.allowed) {
      return globalResult;
    }

    return {
      allowed: true,
      remaining: Math.min(tenantResult.remaining, globalResult.remaining),
      resetInSeconds: Math.max(tenantResult.resetInSeconds, globalResult.resetInSeconds),
    };
  }

  /**
   * Record token usage after a request completes.
   * Call this after processing to track actual usage.
   */
  async recordUsage(tenantId: string, tokensUsed: number): Promise<void> {
    if (!this.config.enabled) return;

    const key = `rate:tokens:${tenantId}`;
    const now = Date.now();

    try {
      if (this.cacheService) {
        const bucket = await this.cacheService.get<RateLimitBucket>(key, {
          namespace: CacheNamespace.VOLTAGENT_METRICS,
        });

        if (bucket && now - bucket.windowStart < this.TOKEN_WINDOW_MS) {
          bucket.tokens += tokensUsed;
          await this.cacheService.set(key, bucket, {
            namespace: CacheNamespace.VOLTAGENT_METRICS,
            ttl: Math.ceil((this.TOKEN_WINDOW_MS - (now - bucket.windowStart)) / 1000),
          });
        }
      } else {
        const bucket = this.localBuckets.get(key);
        if (bucket && now - bucket.windowStart < this.TOKEN_WINDOW_MS) {
          bucket.tokens += tokensUsed;
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to record token usage: ${error}`);
    }
  }

  /**
   * Get current rate limit status for a tenant.
   */
  async getStatus(tenantId: string): Promise<{
    requestsRemaining: number;
    tokensRemaining: number;
    requestsResetIn: number;
    tokensResetIn: number;
  }> {
    const now = Date.now();

    const requestBucket = await this.getBucket(`rate:req:${tenantId}`, now, this.WINDOW_SIZE_MS);
    const tokenBucket = await this.getBucket(`rate:tokens:${tenantId}`, now, this.TOKEN_WINDOW_MS);

    return {
      requestsRemaining: Math.max(0, this.config.tenantRequestsPerMinute - requestBucket.count),
      tokensRemaining: Math.max(0, this.config.tenantTokensPerHour - tokenBucket.tokens),
      requestsResetIn: Math.ceil((this.WINDOW_SIZE_MS - (now - requestBucket.windowStart)) / 1000),
      tokensResetIn: Math.ceil((this.TOKEN_WINDOW_MS - (now - tokenBucket.windowStart)) / 1000),
    };
  }

  /**
   * Reset rate limits for a tenant (admin use).
   */
  async resetLimits(tenantId: string): Promise<void> {
    const keys = [`rate:req:${tenantId}`, `rate:tokens:${tenantId}`];

    for (const key of keys) {
      if (this.cacheService) {
        await this.cacheService.del(key, { namespace: CacheNamespace.VOLTAGENT_METRICS });
      }
      this.localBuckets.delete(key);
    }

    this.logger.log(`Rate limits reset for tenant: ${tenantId}`);
  }

  private async checkTenantRequestLimit(tenantId: string, now: number): Promise<RateLimitResult> {
    const key = `rate:req:${tenantId}`;
    const bucket = await this.getBucket(key, now, this.WINDOW_SIZE_MS);

    if (bucket.count >= this.config.tenantRequestsPerMinute) {
      const resetIn = Math.ceil((this.WINDOW_SIZE_MS - (now - bucket.windowStart)) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: resetIn,
        reason: `Tenant rate limit exceeded (${this.config.tenantRequestsPerMinute}/min)`,
      };
    }

    // Increment count
    bucket.count++;
    await this.saveBucket(key, bucket, this.WINDOW_SIZE_MS);

    return {
      allowed: true,
      remaining: this.config.tenantRequestsPerMinute - bucket.count,
      resetInSeconds: Math.ceil((this.WINDOW_SIZE_MS - (now - bucket.windowStart)) / 1000),
    };
  }

  private async checkTenantTokenLimit(
    tenantId: string,
    estimatedTokens: number,
    now: number,
  ): Promise<RateLimitResult> {
    const key = `rate:tokens:${tenantId}`;
    const bucket = await this.getBucket(key, now, this.TOKEN_WINDOW_MS);

    if (bucket.tokens + estimatedTokens > this.config.tenantTokensPerHour) {
      const resetIn = Math.ceil((this.TOKEN_WINDOW_MS - (now - bucket.windowStart)) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: resetIn,
        reason: `Tenant token limit exceeded (${this.config.tenantTokensPerHour}/hour)`,
      };
    }

    // Reserve tokens (actual usage recorded later)
    bucket.tokens += estimatedTokens;
    await this.saveBucket(key, bucket, this.TOKEN_WINDOW_MS);

    return {
      allowed: true,
      remaining: this.config.tenantTokensPerHour - bucket.tokens,
      resetInSeconds: Math.ceil((this.TOKEN_WINDOW_MS - (now - bucket.windowStart)) / 1000),
    };
  }

  private async checkGlobalLimit(now: number): Promise<RateLimitResult> {
    const key = 'rate:global';
    const bucket = await this.getBucket(key, now, this.WINDOW_SIZE_MS);

    if (bucket.count >= this.config.globalRequestsPerMinute) {
      const resetIn = Math.ceil((this.WINDOW_SIZE_MS - (now - bucket.windowStart)) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: resetIn,
        reason: `Global rate limit exceeded (${this.config.globalRequestsPerMinute}/min)`,
      };
    }

    bucket.count++;
    await this.saveBucket(key, bucket, this.WINDOW_SIZE_MS);

    return {
      allowed: true,
      remaining: this.config.globalRequestsPerMinute - bucket.count,
      resetInSeconds: Math.ceil((this.WINDOW_SIZE_MS - (now - bucket.windowStart)) / 1000),
    };
  }

  private async getBucket(key: string, now: number, windowMs: number): Promise<RateLimitBucket> {
    try {
      if (this.cacheService) {
        const bucket = await this.cacheService.get<RateLimitBucket>(key, {
          namespace: CacheNamespace.VOLTAGENT_METRICS,
        });

        if (bucket && now - bucket.windowStart < windowMs) {
          return bucket;
        }
      } else {
        const bucket = this.localBuckets.get(key);
        if (bucket && now - bucket.windowStart < windowMs) {
          return bucket;
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to get rate limit bucket: ${error}`);
    }

    // Create new bucket
    return { count: 0, tokens: 0, windowStart: now };
  }

  private async saveBucket(key: string, bucket: RateLimitBucket, windowMs: number): Promise<void> {
    const ttlSeconds = Math.ceil(windowMs / 1000);

    try {
      if (this.cacheService) {
        await this.cacheService.set(key, bucket, {
          namespace: CacheNamespace.VOLTAGENT_METRICS,
          ttl: ttlSeconds,
        });
      } else {
        this.localBuckets.set(key, bucket);
      }
    } catch (error) {
      this.logger.debug(`Failed to save rate limit bucket: ${error}`);
      // Fallback to local
      this.localBuckets.set(key, bucket);
    }
  }

  /**
   * Clean up expired local buckets (memory management).
   */
  cleanupExpiredBuckets(): void {
    const now = Date.now();
    for (const [key, bucket] of this.localBuckets) {
      const windowMs = key.includes('tokens') ? this.TOKEN_WINDOW_MS : this.WINDOW_SIZE_MS;
      if (now - bucket.windowStart >= windowMs) {
        this.localBuckets.delete(key);
      }
    }
  }
}
