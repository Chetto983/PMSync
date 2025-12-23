/**
 * Contacts Cache Service
 *
 * Handles Redis caching for contact operations:
 * - Contact counts caching
 * - Distributed sync locking
 * - Cache invalidation
 *
 * Extracted from contacts.service.ts for single responsibility.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions } from '../../../common/config';
import { CONTACTS_DEFAULTS, CONTACTS_CACHE_KEYS } from '../contacts.constants';
import type { CachedContactCounts } from '../contacts.types';

@Injectable()
export class ContactsCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactsCacheService.name);
  private redis: Redis | null = null;
  private readonly contactCountsCacheTtl: number;
  private readonly syncLockTtl: number;

  constructor(private readonly configService: ConfigService) {
    this.contactCountsCacheTtl = this.configService.get<number>(
      'CONTACTS_COUNTS_CACHE_TTL',
      CONTACTS_DEFAULTS.CACHE_TTL_SECONDS,
    );
    this.syncLockTtl = this.configService.get<number>(
      'CONTACTS_SYNC_LOCK_TTL',
      CONTACTS_DEFAULTS.SYNC_LOCK_TTL_SECONDS,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      const redisOptions = getRedisConnectionOptions();
      this.redis = new Redis(redisOptions);
      this.logger.log('Redis connection established for ContactsCacheService');
    } catch (error) {
      this.logger.warn(`Failed to connect to Redis, running without caching: ${error}`);
      this.redis = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis && this.redis.status !== 'end') {
      await this.redis.quit();
      this.logger.log('Redis connection closed for ContactsCacheService');
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.redis !== null;
  }

  /**
   * Acquire distributed lock for contact sync
   * Prevents multiple instances from syncing same provider simultaneously
   */
  async acquireSyncLock(providerId: string): Promise<boolean> {
    if (!this.redis) return true; // Allow sync if Redis not available

    const lockKey = `${CONTACTS_CACHE_KEYS.SYNC_LOCK}${providerId}`;
    const result = await this.redis.set(lockKey, process.pid.toString(), 'EX', this.syncLockTtl, 'NX');
    return result === 'OK';
  }

  /**
   * Release distributed lock for contact sync
   */
  async releaseSyncLock(providerId: string): Promise<void> {
    if (!this.redis) return;

    const lockKey = `${CONTACTS_CACHE_KEYS.SYNC_LOCK}${providerId}`;
    await this.redis.del(lockKey);
  }

  /**
   * Get cached contact counts
   */
  async getCachedContactCounts(tenantId: string): Promise<CachedContactCounts | null> {
    if (!this.redis) return null;

    try {
      const cacheKey = `${CONTACTS_CACHE_KEYS.COUNTS}${tenantId}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(`Failed to get cached contact counts: ${error}`);
    }
    return null;
  }

  /**
   * Cache contact counts
   */
  async cacheContactCounts(tenantId: string, counts: CachedContactCounts): Promise<void> {
    if (!this.redis) return;

    try {
      const cacheKey = `${CONTACTS_CACHE_KEYS.COUNTS}${tenantId}`;
      await this.redis.setex(cacheKey, this.contactCountsCacheTtl, JSON.stringify(counts));
    } catch (error) {
      this.logger.warn(`Failed to cache contact counts: ${error}`);
    }
  }

  /**
   * Invalidate contact counts cache
   */
  async invalidateContactCountsCache(tenantId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const cacheKey = `${CONTACTS_CACHE_KEYS.COUNTS}${tenantId}`;
      await this.redis.del(cacheKey);
    } catch (error) {
      this.logger.warn(`Failed to invalidate contact counts cache: ${error}`);
    }
  }
}
