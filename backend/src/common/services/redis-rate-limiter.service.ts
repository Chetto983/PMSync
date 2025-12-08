/**
 * Redis-based Rate Limiter Service
 *
 * Provides distributed rate limiting that works across multiple instances.
 * Uses Redis INCR with TTL for sliding window rate limiting.
 *
 * Features:
 * - Distributed (works across multiple app instances)
 * - Sliding window rate limiting
 * - Per-key lockout support
 * - Configurable via environment variables
 *
 * @see OWASP Brute Force Prevention
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions } from '../../config/configuration';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export interface LockoutResult {
  isLockedOut: boolean;
  lockoutEndsAt?: Date;
  retryAfterSeconds: number;
}

@Injectable()
export class RedisRateLimiterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimiterService.name);
  private redis!: Redis;

  // Default configuration (can be overridden per-call)
  private readonly defaultMaxAttempts: number;
  private readonly defaultWindowSeconds: number;
  private readonly defaultLockoutSeconds: number;
  private readonly lockoutThreshold: number;

  constructor(private readonly config: ConfigService) {
    // Load defaults from config
    this.defaultMaxAttempts = parseInt(
      this.config.get<string>('RATE_LIMIT_MAX') || '10',
      10,
    );
    this.defaultWindowSeconds = parseInt(
      this.config.get<string>('RATE_LIMIT_WINDOW_SECONDS') || '60',
      10,
    );
    this.defaultLockoutSeconds = parseInt(
      this.config.get<string>('RATE_LIMIT_LOCKOUT_SECONDS') || '900',
      10,
    );
    this.lockoutThreshold = parseInt(
      this.config.get<string>('RATE_LIMIT_LOCKOUT_THRESHOLD') || '5',
      10,
    );
  }

  async onModuleInit() {
    const options = getRedisConnectionOptions();
    this.redis = new Redis({
      ...options,
      connectionName: 'rate-limiter',
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis rate limiter error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis rate limiter connected');
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => {
        // Ignore quit errors during shutdown
      });
    }
  }

  /**
   * Check rate limit for a key (e.g., IP address, user ID)
   *
   * @param key - Unique identifier (e.g., "login:192.168.1.1")
   * @param maxAttempts - Maximum attempts allowed in window
   * @param windowSeconds - Time window in seconds
   * @returns Rate limit result
   */
  async checkRateLimit(
    key: string,
    maxAttempts: number = this.defaultMaxAttempts,
    windowSeconds: number = this.defaultWindowSeconds,
  ): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    const now = Math.floor(Date.now() / 1000);

    try {
      // Increment counter
      const count = await this.redis.incr(redisKey);

      // Set TTL on first request
      if (count === 1) {
        await this.redis.expire(redisKey, windowSeconds);
      }

      // Get TTL for reset time
      const ttl = await this.redis.ttl(redisKey);
      const resetAt = new Date((now + Math.max(ttl, 0)) * 1000);

      const allowed = count <= maxAttempts;
      const remaining = Math.max(0, maxAttempts - count);
      const retryAfterSeconds = allowed ? 0 : Math.max(ttl, 0);

      if (!allowed) {
        this.logger.warn(
          JSON.stringify({
            event: 'rate_limit_exceeded',
            key: this.redactKey(key),
            count,
            maxAttempts,
            retryAfterSeconds,
          }),
        );
      }

      return {
        allowed,
        remaining,
        resetAt,
        retryAfterSeconds,
      };
    } catch (error) {
      // On Redis error, allow the request (fail open)
      this.logger.error(
        `Rate limit check failed for ${this.redactKey(key)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        allowed: true,
        remaining: maxAttempts,
        resetAt: new Date(Date.now() + windowSeconds * 1000),
        retryAfterSeconds: 0,
      };
    }
  }

  /**
   * Record a failed attempt and check for lockout
   *
   * @param key - Unique identifier
   * @param lockoutThreshold - Number of failures before lockout
   * @param lockoutSeconds - Duration of lockout in seconds
   * @returns Lockout result
   */
  async recordFailedAttempt(
    key: string,
    lockoutThreshold: number = this.lockoutThreshold,
    lockoutSeconds: number = this.defaultLockoutSeconds,
  ): Promise<LockoutResult> {
    const failedKey = `failed:${key}`;
    const lockoutKey = `lockout:${key}`;

    try {
      // Check if already locked out
      const lockoutTtl = await this.redis.ttl(lockoutKey);
      if (lockoutTtl > 0) {
        return {
          isLockedOut: true,
          lockoutEndsAt: new Date(Date.now() + lockoutTtl * 1000),
          retryAfterSeconds: lockoutTtl,
        };
      }

      // Increment failed attempts
      const failures = await this.redis.incr(failedKey);
      if (failures === 1) {
        // Set TTL on first failure (track failures for lockout window)
        await this.redis.expire(failedKey, lockoutSeconds);
      }

      // Check if should lock out
      if (failures >= lockoutThreshold) {
        await this.redis.setex(lockoutKey, lockoutSeconds, '1');
        await this.redis.del(failedKey); // Clear failure counter

        this.logger.warn(
          JSON.stringify({
            event: 'lockout_triggered',
            key: this.redactKey(key),
            failures,
            lockoutSeconds,
          }),
        );

        return {
          isLockedOut: true,
          lockoutEndsAt: new Date(Date.now() + lockoutSeconds * 1000),
          retryAfterSeconds: lockoutSeconds,
        };
      }

      return {
        isLockedOut: false,
        retryAfterSeconds: 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed attempt recording failed for ${this.redactKey(key)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        isLockedOut: false,
        retryAfterSeconds: 0,
      };
    }
  }

  /**
   * Check if a key is currently locked out
   */
  async isLockedOut(key: string): Promise<LockoutResult> {
    const lockoutKey = `lockout:${key}`;

    try {
      const ttl = await this.redis.ttl(lockoutKey);
      if (ttl > 0) {
        return {
          isLockedOut: true,
          lockoutEndsAt: new Date(Date.now() + ttl * 1000),
          retryAfterSeconds: ttl,
        };
      }
      return {
        isLockedOut: false,
        retryAfterSeconds: 0,
      };
    } catch (error) {
      this.logger.error(
        `Lockout check failed for ${this.redactKey(key)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        isLockedOut: false,
        retryAfterSeconds: 0,
      };
    }
  }

  /**
   * Clear failed attempts on successful action (e.g., successful login)
   */
  async clearFailedAttempts(key: string): Promise<void> {
    const failedKey = `failed:${key}`;
    try {
      await this.redis.del(failedKey);
    } catch (error) {
      this.logger.error(
        `Failed to clear attempts for ${this.redactKey(key)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Redact sensitive parts of keys for logging
   */
  private redactKey(key: string): string {
    // Redact IP addresses and emails
    if (key.includes('@')) {
      const parts = key.split('@');
      return `${parts[0].substring(0, 2)}***@***`;
    }
    if (key.match(/\d+\.\d+\.\d+\.\d+/)) {
      return key.replace(/\d+\.\d+\.\d+\.\d+/, '***.***.***.***');
    }
    return key.length > 10 ? `${key.substring(0, 5)}...` : key;
  }
}
