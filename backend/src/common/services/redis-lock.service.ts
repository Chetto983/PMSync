/**
 * Redis Lock Service - Distributed locking for concurrent operations
 *
 * Prevents race conditions in multi-worker environments by providing
 * distributed locks with automatic retry and exponential backoff.
 *
 * RACE CONDITION FIX: RC-1, RC-4, RC-5
 *
 * Features:
 * - SET NX (atomic lock acquisition)
 * - Automatic TTL expiration (prevents deadlocks)
 * - Exponential backoff retry
 * - Safe release (only release if we hold the lock)
 * - withLock() convenience method
 *
 * Usage:
 * ```typescript
 * // Option 1: withLock (recommended)
 * const result = await this.redisLock.withLock(
 *   `email:upsert:${providerId}:${externalId}`,
 *   5000,  // 5 second TTL
 *   async () => {
 *     return await this.prisma.email.upsert({...});
 *   }
 * );
 *
 * // Option 2: Manual acquire/release
 * const lockId = await this.redisLock.acquireLock('my-lock', 5000);
 * if (lockId) {
 *   try {
 *     // ... protected code
 *   } finally {
 *     await this.redisLock.releaseLock('my-lock', lockId);
 *   }
 * }
 * ```
 *
 * @see https://redis.io/topics/distlock
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions } from '../config';

export interface LockOptions {
  /** Maximum retries before giving up (default: 5) */
  maxRetries?: number;
  /** Base delay between retries in ms (default: 50) */
  baseDelayMs?: number;
  /** Maximum delay between retries in ms (default: 500) */
  maxDelayMs?: number;
}

@Injectable()
export class RedisLockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private redis!: Redis;

  // Redis key prefix for distributed locks
  private readonly KEY_PREFIX = 'lock:';

  // Unique identifier for this instance
  private readonly instanceId: string;

  constructor() {
    // Generate unique instance ID (PID + timestamp + random suffix)
    this.instanceId = `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  async onModuleInit() {
    const options = getRedisConnectionOptions();
    this.redis = new Redis({
      ...options,
      connectionName: 'redis-lock',
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis lock service error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.debug(`Redis lock service connected (instance: ${this.instanceId})`);
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
   * Acquire a distributed lock with retry
   *
   * @param key - Unique lock key (will be prefixed with 'lock:')
   * @param ttlMs - Lock TTL in milliseconds
   * @param options - Retry options
   * @returns Lock ID if acquired, null if failed
   */
  async acquireLock(
    key: string,
    ttlMs: number,
    options: LockOptions = {},
  ): Promise<string | null> {
    const { maxRetries = 5, baseDelayMs = 50, maxDelayMs = 500 } = options;
    const fullKey = `${this.KEY_PREFIX}${key}`;
    const lockId = `${this.instanceId}-${Date.now()}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Atomic SET NX with PX (TTL in ms)
        const result = await this.redis.set(fullKey, lockId, 'PX', ttlMs, 'NX');

        if (result === 'OK') {
          this.logger.debug(`Lock acquired: ${key} (attempt ${attempt + 1})`);
          return lockId;
        }

        // Lock is held by another process - retry with exponential backoff
        if (attempt < maxRetries - 1) {
          const delay = Math.min(
            baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs,
            maxDelayMs,
          );
          await this.sleep(delay);
        }
      } catch (error) {
        this.logger.error(
          `Lock acquire error for ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // On Redis error, don't retry - fail fast
        return null;
      }
    }

    this.logger.warn(`Failed to acquire lock ${key} after ${maxRetries} attempts`);
    return null;
  }

  /**
   * Release a distributed lock
   *
   * Only releases if the lock is held by this lockId (prevents releasing someone else's lock)
   *
   * @param key - Lock key (without prefix)
   * @param lockId - Lock ID returned from acquireLock
   * @returns true if released, false if not held
   */
  async releaseLock(key: string, lockId: string): Promise<boolean> {
    const fullKey = `${this.KEY_PREFIX}${key}`;

    try {
      // Atomic check-and-delete using Lua script
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, fullKey, lockId);

      if (result === 1) {
        this.logger.debug(`Lock released: ${key}`);
        return true;
      }

      this.logger.debug(`Lock not held by this process: ${key}`);
      return false;
    } catch (error) {
      this.logger.error(
        `Lock release error for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Execute a function with a distributed lock
   *
   * This is the recommended way to use distributed locks.
   * Automatically handles acquire, execute, and release.
   *
   * @param key - Unique lock key
   * @param ttlMs - Lock TTL in milliseconds
   * @param fn - Async function to execute while holding the lock
   * @param options - Retry options
   * @returns Result of fn
   * @throws Error if lock cannot be acquired
   */
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
    options: LockOptions = {},
  ): Promise<T> {
    const lockId = await this.acquireLock(key, ttlMs, options);

    if (!lockId) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(key, lockId);
    }
  }

  /**
   * Try to execute with lock, return undefined if lock not available
   *
   * Non-throwing version of withLock - useful when you want to skip
   * rather than fail when lock is unavailable.
   *
   * @param key - Unique lock key
   * @param ttlMs - Lock TTL in milliseconds
   * @param fn - Async function to execute while holding the lock
   * @param options - Retry options
   * @returns Result of fn, or undefined if lock not acquired
   */
  async tryWithLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
    options: LockOptions = {},
  ): Promise<T | undefined> {
    const lockId = await this.acquireLock(key, ttlMs, options);

    if (!lockId) {
      return undefined;
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(key, lockId);
    }
  }

  /**
   * Extend a lock's TTL (for long-running operations)
   *
   * @param key - Lock key
   * @param lockId - Lock ID from acquireLock
   * @param additionalMs - Additional milliseconds to add
   * @returns true if extended, false if not held
   */
  async extendLock(key: string, lockId: string, additionalMs: number): Promise<boolean> {
    const fullKey = `${this.KEY_PREFIX}${key}`;

    try {
      // Atomic check-and-extend using Lua script
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, fullKey, lockId, additionalMs);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Lock extend error for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Check if a lock is currently held
   *
   * @param key - Lock key
   * @returns Lock info if held, null if not
   */
  async isLocked(key: string): Promise<{ heldBy: string; ttlMs: number } | null> {
    const fullKey = `${this.KEY_PREFIX}${key}`;

    try {
      const [holder, pttl] = await Promise.all([
        this.redis.get(fullKey),
        this.redis.pttl(fullKey),
      ]);

      if (holder && pttl > 0) {
        return { heldBy: holder, ttlMs: pttl };
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Lock check error for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  // ====================================
  // Phase 6.5: Fencing Tokens
  // ====================================

  /**
   * Phase 6.5: Acquire lock with fencing token for long-running operations
   *
   * Fencing tokens prevent stale lock holders from corrupting state.
   * Per Redis docs: "Important for operations that can take significant time."
   *
   * @param key - Lock key
   * @param ttlMs - Lock TTL in milliseconds
   * @param options - Retry options
   * @returns Lock ID and fence token if acquired, null if failed
   */
  async acquireLockWithFence(
    key: string,
    ttlMs: number,
    options: LockOptions = {},
  ): Promise<{ lockId: string; fenceToken: number } | null> {
    const lockId = await this.acquireLock(key, ttlMs, options);
    if (!lockId) return null;

    try {
      // Increment global fence counter atomically
      const fenceToken = await this.redis.incr(`fence:${this.KEY_PREFIX}${key}`);
      return { lockId, fenceToken };
    } catch (error) {
      // Release lock if fence token acquisition fails
      await this.releaseLock(key, lockId);
      this.logger.error(
        `Fence token error for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Phase 6.5: Execute with fencing token validation
   *
   * Verifies fence token is still valid before executing write operation.
   * Prevents stale lock holders from corrupting data.
   *
   * @param key - Lock key
   * @param currentFence - Fence token from acquireLockWithFence
   * @param writeFn - Async function to execute if fence is valid
   * @throws Error if fence token is stale (another process took over)
   */
  async writeWithFence<T>(
    key: string,
    currentFence: number,
    writeFn: () => Promise<T>,
  ): Promise<T> {
    const latestFence = await this.redis.get(`fence:${this.KEY_PREFIX}${key}`);
    const latestFenceNum = parseInt(latestFence || '0', 10);

    if (latestFenceNum > currentFence) {
      throw new Error(`Stale lock - fence token ${currentFence} is behind current ${latestFenceNum}`);
    }

    return await writeFn();
  }

  /**
   * Phase 6.5: withLock variant that includes fencing token
   *
   * Convenience method combining lock acquisition with fencing.
   * Use for long-running sync operations (10+ minutes).
   *
   * @param key - Lock key
   * @param ttlMs - Lock TTL
   * @param fn - Function receiving fence token for validation
   * @param options - Retry options
   */
  async withLockAndFence<T>(
    key: string,
    ttlMs: number,
    fn: (fenceToken: number) => Promise<T>,
    options: LockOptions = {},
  ): Promise<T> {
    const result = await this.acquireLockWithFence(key, ttlMs, options);

    if (!result) {
      throw new Error(`Failed to acquire lock with fence: ${key}`);
    }

    try {
      return await fn(result.fenceToken);
    } finally {
      await this.releaseLock(key, result.lockId);
    }
  }

  // ====================================
  // Phase 6.6: Per-Provider Rate Limiting
  // ====================================

  /**
   * Provider-specific API rate limits
   * Based on official documentation:
   * - Gmail: 100 messages/second burst, 250 quota/user/second
   * - Microsoft: 10,000 requests/10min per mailbox
   * - IMAP: Conservative limits for generic servers
   */
  private readonly PROVIDER_LIMITS: Record<string, { perSecond: number; perMinute: number }> = {
    google: { perSecond: 25, perMinute: 100 },
    microsoft: { perSecond: 10, perMinute: 30 },
    imap: { perSecond: 5, perMinute: 60 },
  };

  /**
   * Phase 6.6: Check if provider is within rate limits
   *
   * Uses Redis INCR + EXPIRE pattern for sliding window rate limiting.
   *
   * @param providerId - Unique provider ID
   * @param providerType - Provider type (google, microsoft, imap)
   * @returns true if request is allowed, false if rate limited
   */
  async checkProviderRateLimit(providerId: string, providerType: string): Promise<boolean> {
    const limits = this.PROVIDER_LIMITS[providerType] || this.PROVIDER_LIMITS.imap;
    const now = Math.floor(Date.now() / 1000);
    const minuteKey = `rate:${providerType}:${providerId}:min:${now - (now % 60)}`;

    try {
      const count = await this.redis.incr(minuteKey);

      // Set expiry on first increment
      if (count === 1) {
        await this.redis.expire(minuteKey, 120); // Keep for 2 minutes
      }

      if (count > limits.perMinute) {
        this.logger.warn(`Rate limit exceeded for ${providerType}:${providerId}: ${count}/${limits.perMinute}/min`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Rate limit check error: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fail open - allow request if Redis fails
      return true;
    }
  }

  /**
   * Phase 6.6: Get current rate limit status for a provider
   *
   * @param providerId - Provider ID
   * @param providerType - Provider type
   * @returns Current usage and limits
   */
  async getRateLimitStatus(
    providerId: string,
    providerType: string,
  ): Promise<{ current: number; limit: number; remainingSeconds: number }> {
    const limits = this.PROVIDER_LIMITS[providerType] || this.PROVIDER_LIMITS.imap;
    const now = Math.floor(Date.now() / 1000);
    const minuteKey = `rate:${providerType}:${providerId}:min:${now - (now % 60)}`;

    try {
      const [countStr, ttl] = await Promise.all([
        this.redis.get(minuteKey),
        this.redis.ttl(minuteKey),
      ]);

      return {
        current: parseInt(countStr || '0', 10),
        limit: limits.perMinute,
        remainingSeconds: Math.max(0, ttl),
      };
    } catch {
      return { current: 0, limit: limits.perMinute, remainingSeconds: 60 };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
