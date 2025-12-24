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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
