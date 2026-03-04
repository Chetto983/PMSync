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

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisConnectionService } from './redis-connection.service';

/**
 * RC-NEW-1 FIX: Atomic rate limit Lua script
 * Performs INCR + EXPIRE + TTL in a single atomic operation
 * Returns [count, ttl]
 */
const RATE_LIMIT_LUA_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

/**
 * RC-NEW-2 FIX: Atomic failed attempt + lockout Lua script
 * Checks lockout, increments failure counter, and triggers lockout if threshold reached
 * Returns [isLockedOut, lockoutTtl, failures, shouldLockout]
 */
const FAILED_ATTEMPT_LUA_SCRIPT = `
local lockoutKey = KEYS[1]
local failedKey = KEYS[2]
local lockoutThreshold = tonumber(ARGV[1])
local lockoutSeconds = tonumber(ARGV[2])

-- Check if already locked out
local lockoutTtl = redis.call('TTL', lockoutKey)
if lockoutTtl > 0 then
  return {1, lockoutTtl, 0, 0}
end

-- Increment failed attempts with TTL
local failures = redis.call('INCR', failedKey)
if failures == 1 then
  redis.call('EXPIRE', failedKey, lockoutSeconds)
end

-- Check if should trigger lockout
if failures >= lockoutThreshold then
  redis.call('SETEX', lockoutKey, lockoutSeconds, '1')
  redis.call('DEL', failedKey)
  return {1, lockoutSeconds, failures, 1}
end

return {0, 0, failures, 0}
`;

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
export class RedisRateLimiterService implements OnModuleInit {
  private readonly logger = new Logger(RedisRateLimiterService.name);
  private redis!: Redis;

  // Default configuration (can be overridden per-call)
  private readonly defaultMaxAttempts: number;
  private readonly defaultWindowSeconds: number;
  private readonly defaultLockoutSeconds: number;
  private readonly lockoutThreshold: number;

  constructor(
    private readonly config: ConfigService,
    private readonly redisConnection: RedisConnectionService,
  ) {
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

  onModuleInit() {
    this.redis = this.redisConnection.client;
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
      // RC-NEW-1 FIX: Atomic INCR + EXPIRE + TTL via Lua script
      const result = await this.redis.eval(
        RATE_LIMIT_LUA_SCRIPT,
        1,
        redisKey,
        windowSeconds.toString(),
      ) as [number, number];

      const [count, ttl] = result;
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
    const lockoutKey = `lockout:${key}`;
    const failedKey = `failed:${key}`;

    try {
      // RC-NEW-2 FIX: Atomic lockout check + failed attempt recording via Lua script
      const result = await this.redis.eval(
        FAILED_ATTEMPT_LUA_SCRIPT,
        2,
        lockoutKey,
        failedKey,
        lockoutThreshold.toString(),
        lockoutSeconds.toString(),
      ) as [number, number, number, number];

      const [isLockedOut, lockoutTtl, failures, shouldLockout] = result;

      if (shouldLockout === 1) {
        this.logger.warn(
          JSON.stringify({
            event: 'lockout_triggered',
            key: this.redactKey(key),
            failures,
            lockoutSeconds,
          }),
        );
      }

      if (isLockedOut === 1) {
        return {
          isLockedOut: true,
          lockoutEndsAt: new Date(Date.now() + lockoutTtl * 1000),
          retryAfterSeconds: lockoutTtl,
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
