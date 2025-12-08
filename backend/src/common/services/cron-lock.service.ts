/**
 * Cron Lock Service - Distributed locking for scheduled jobs
 *
 * Prevents multiple instances from running the same cron job simultaneously.
 * Uses Redis SETNX with TTL for distributed locking.
 *
 * IMPORTANT: All cron jobs should use this service to ensure only one instance
 * executes the job at a time when running multiple app instances.
 *
 * Usage:
 * ```typescript
 * @Cron(CronExpression.EVERY_5_MINUTES)
 * async myJob() {
 *   if (!await this.cronLock.acquireLock('my-job', 240)) {
 *     return; // Another instance is running this job
 *   }
 *   try {
 *     // ... job logic
 *   } finally {
 *     await this.cronLock.releaseLock('my-job');
 *   }
 * }
 * ```
 *
 * @see https://redis.io/topics/distlock
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions } from '../../config/configuration';

export interface LockResult {
  acquired: boolean;
  lockId?: string;
  ttlSeconds?: number;
}

@Injectable()
export class CronLockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronLockService.name);
  private redis!: Redis;

  // Redis key prefix for cron locks
  private readonly KEY_PREFIX = 'cron:lock:';

  // Unique identifier for this instance
  private readonly instanceId: string;

  constructor() {
    // Generate unique instance ID (PID + random suffix for uniqueness)
    this.instanceId = `${process.pid}-${Math.random().toString(36).substring(2, 10)}`;
  }

  async onModuleInit() {
    const options = getRedisConnectionOptions();
    this.redis = new Redis({
      ...options,
      connectionName: 'cron-lock',
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis cron lock service error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log(`Redis cron lock service connected (instance: ${this.instanceId})`);
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
   * Acquire a distributed lock for a cron job
   *
   * @param jobName - Unique name for the cron job (e.g., 'sync-scheduler')
   * @param ttlSeconds - Lock TTL in seconds (should be longer than job duration)
   * @returns true if lock acquired, false if another instance holds it
   */
  async acquireLock(jobName: string, ttlSeconds: number = 300): Promise<boolean> {
    const key = `${this.KEY_PREFIX}${jobName}`;

    try {
      // Use SET with NX (only set if not exists) and EX (expiry)
      const result = await this.redis.set(key, this.instanceId, 'EX', ttlSeconds, 'NX');

      if (result === 'OK') {
        this.logger.debug(
          JSON.stringify({
            event: 'cron_lock_acquired',
            jobName,
            instanceId: this.instanceId,
            ttlSeconds,
          }),
        );
        return true;
      }

      // Lock held by another instance
      const holder = await this.redis.get(key);
      this.logger.debug(
        JSON.stringify({
          event: 'cron_lock_busy',
          jobName,
          heldBy: holder,
          thisInstance: this.instanceId,
        }),
      );
      return false;
    } catch (error) {
      // On Redis error, log but don't acquire lock (fail safe)
      this.logger.error(
        `Cron lock acquire failed for ${jobName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Release a distributed lock
   *
   * Only releases if this instance holds the lock (prevents releasing someone else's lock)
   *
   * @param jobName - Unique name for the cron job
   */
  async releaseLock(jobName: string): Promise<void> {
    const key = `${this.KEY_PREFIX}${jobName}`;

    try {
      // Only delete if we hold the lock (Lua script for atomicity)
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, key, this.instanceId);

      if (result === 1) {
        this.logger.debug(
          JSON.stringify({
            event: 'cron_lock_released',
            jobName,
            instanceId: this.instanceId,
          }),
        );
      } else {
        this.logger.debug(
          JSON.stringify({
            event: 'cron_lock_not_held',
            jobName,
            instanceId: this.instanceId,
          }),
        );
      }
    } catch (error) {
      this.logger.error(
        `Cron lock release failed for ${jobName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Extend a lock's TTL (for long-running jobs)
   *
   * @param jobName - Unique name for the cron job
   * @param additionalSeconds - Additional seconds to add to TTL
   * @returns true if lock extended, false if not held by this instance
   */
  async extendLock(jobName: string, additionalSeconds: number): Promise<boolean> {
    const key = `${this.KEY_PREFIX}${jobName}`;

    try {
      // Only extend if we hold the lock (Lua script for atomicity)
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, key, this.instanceId, additionalSeconds);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Cron lock extend failed for ${jobName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Check if a lock is currently held (by any instance)
   *
   * @param jobName - Unique name for the cron job
   * @returns Lock status info
   */
  async isLocked(jobName: string): Promise<{ locked: boolean; heldBy?: string; ttl?: number }> {
    const key = `${this.KEY_PREFIX}${jobName}`;

    try {
      const [holder, ttl] = await Promise.all([
        this.redis.get(key),
        this.redis.ttl(key),
      ]);

      return {
        locked: !!holder,
        heldBy: holder || undefined,
        ttl: ttl > 0 ? ttl : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Cron lock check failed for ${jobName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { locked: false };
    }
  }

  /**
   * Force release a lock (admin use only)
   *
   * WARNING: Only use this if a lock is orphaned (instance crashed)
   *
   * @param jobName - Unique name for the cron job
   */
  async forceReleaseLock(jobName: string): Promise<void> {
    const key = `${this.KEY_PREFIX}${jobName}`;

    try {
      await this.redis.del(key);
      this.logger.warn(
        JSON.stringify({
          event: 'cron_lock_force_released',
          jobName,
          byInstance: this.instanceId,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Cron lock force release failed for ${jobName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Execute a function with a distributed lock
   *
   * Convenience method that handles acquire/release automatically
   *
   * @param jobName - Unique name for the cron job
   * @param fn - Async function to execute while holding the lock
   * @param ttlSeconds - Lock TTL in seconds
   * @returns Result of fn, or undefined if lock not acquired
   */
  async withLock<T>(
    jobName: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 300,
  ): Promise<T | undefined> {
    if (!await this.acquireLock(jobName, ttlSeconds)) {
      return undefined;
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(jobName);
    }
  }
}
