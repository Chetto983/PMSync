 import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { getConfiguration } from '../../config/configuration';

/**
 * Cache namespace prefixes for different data types
 * This prevents key collisions and makes cache invalidation easier
 */
export enum CacheNamespace {
  PROVIDER_TOKEN = 'provider:token',
  PROVIDER_METADATA = 'provider:meta',
  FOLDER_STRUCTURE = 'folder:struct',
  EMAIL_METADATA = 'email:meta',
  USER_SESSION = 'user:session',
  WEBHOOK_NONCE = 'webhook:nonce',
  RATE_LIMIT = 'ratelimit',
  MULTIAGENT_METRICS = 'multiagent:metrics',
  OAUTH_STATE = 'oauth:state',
  /** Idempotency keys for action executor to prevent duplicate execution */
  ACTION_IDEMPOTENCY = 'action:idempotency',
  /** Mistral web search agents (shared across instances) */
  WEB_SEARCH_AGENT = 'websearch:agent',
  /** Web search results cache */
  WEB_SEARCH_RESULT = 'websearch:result',
  /** Email content cache for VoltAgent insights tools (tenant-scoped) */
  EMAIL_CONTENT = 'email:content',
  /** Calendar event metadata cache for VoltAgent tools (tenant-scoped) */
  CALENDAR_EVENT = 'calendar:event',
  /** Contact metadata cache for VoltAgent tools (tenant-scoped) */
  CONTACT_METADATA = 'contact:meta',
  /** Folder metadata cache for VoltAgent tools (tenant-scoped) */
  FOLDER_METADATA = 'folder:meta',
  /** Upcoming deadlines cache (tenant:userId scoped) */
  DEADLINE_UPCOMING = 'deadline:upcoming',
  /** AI Analytics agents and results cache */
  AI_ANALYTICS = 'ai:analytics',
  /** PII resolution mappings for agent tool execution (session-scoped) */
  PII_RESOLUTION = 'pii:resolution',
}

/**
 * Cache options for set operations
 */
export interface CacheSetOptions {
  /** Time to live in seconds */
  ttl?: number;
  /** Namespace for the key */
  namespace?: CacheNamespace;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

/**
 * Redis-based CacheService
 *
 * Provides a type-safe, namespaced caching layer using Redis.
 * Designed to support horizontal scaling by replacing in-memory caches.
 *
 * Features:
 * - Automatic JSON serialization/deserialization
 * - Namespace support for logical grouping
 * - Configurable TTLs per operation
 * - Graceful degradation on Redis errors
 * - Cache statistics tracking
 * - Bulk operations support
 *
 * Usage:
 * ```typescript
 * // Set with TTL
 * await cache.set('user:123', userData, { ttl: 3600, namespace: CacheNamespace.USER_SESSION });
 *
 * // Get with automatic deserialization
 * const user = await cache.get<User>('user:123', { namespace: CacheNamespace.USER_SESSION });
 *
 * // Delete
 * await cache.del('user:123', { namespace: CacheNamespace.USER_SESSION });
 *
 * // Invalidate entire namespace
 * await cache.invalidateNamespace(CacheNamespace.USER_SESSION);
 * ```
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: RedisClientType;
  private isConnected = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const redisConfig = getConfiguration().redis;

    this.logger.log(`Connecting to Redis at ${redisConfig.host}:${redisConfig.port}...`);

    try {
      this.client = createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
        },
        password: redisConfig.password,
        database: redisConfig.db,
      }) as RedisClientType;

      this.client.on('error', (err) => {
        this.logger.error('Redis client error:', err);
        this.stats.errors++;
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.logger.log('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        this.logger.log('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        this.logger.warn('Redis client reconnecting...');
        this.isConnected = false;
      });

      await this.client.connect();
      this.logger.log('✅ Redis cache service initialized');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      // Don't throw - allow app to start without Redis (graceful degradation)
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      if (this.isConnected) {
        try {
          this.logger.log('Disconnecting Redis client...');
          await this.client.quit();
          this.logger.log('Redis client disconnected');
        } catch (error) {
          this.logger.debug(
            `Redis client quit skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
      } else {
        this.logger.debug('Redis client already closed; skip quit');
      }
    }
  }

  /**
   * Build a namespaced key
   */
  private buildKey(key: string, namespace?: CacheNamespace): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  /**
   * Get a value from cache
   * @returns The cached value or null if not found/error
   */
  async get<T = any>(key: string, options?: { namespace?: CacheNamespace }): Promise<T | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cache miss');
      this.stats.misses++;
      return null;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      const value = await this.client.get(fullKey);

      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set(key: string, value: any, options?: CacheSetOptions): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, skipping cache set');
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      const serialized = JSON.stringify(value);

      if (options?.ttl) {
        await this.client.setEx(fullKey, options.ttl, serialized);
      } else {
        await this.client.set(fullKey, serialized);
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key: string, options?: { namespace?: CacheNamespace }): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      await this.client.del(fullKey);
      this.stats.deletes++;
      return true;
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string, options?: { namespace?: CacheNamespace }): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch (error) {
      this.logger.error(`Cache exists error for key ${key}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get time to live for a key in seconds
   * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key: string, options?: { namespace?: CacheNamespace }): Promise<number> {
    if (!this.isConnected) {
      return -2;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      return await this.client.ttl(fullKey);
    } catch (error) {
      this.logger.error(`Cache TTL error for key ${key}:`, error);
      this.stats.errors++;
      return -2;
    }
  }

  /**
   * Invalidate all keys in a namespace
   * Uses SCAN for production safety (non-blocking, iterative)
   */
  async invalidateNamespace(namespace: CacheNamespace): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const pattern = `${namespace}:*`;
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const result = await this.client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });
        cursor = String(result.cursor);

        if (result.keys.length > 0) {
          await this.client.del(result.keys);
          totalDeleted += result.keys.length;
          this.stats.deletes += result.keys.length;
        }
      } while (cursor !== '0');

      if (totalDeleted > 0) {
        this.logger.log(`Invalidated ${totalDeleted} keys in namespace ${namespace}`);
      }
      return totalDeleted;
    } catch (error) {
      this.logger.error(`Cache invalidateNamespace error for ${namespace}:`, error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Invalidate keys matching a pattern within a namespace
   * Uses SCAN for production safety (non-blocking)
   *
   * @param pattern - The pattern to match (e.g., "tenant123:*" or "tenant123:user456:*")
   * @param namespace - The cache namespace
   * @returns Number of keys deleted
   */
  async invalidatePattern(pattern: string, namespace: CacheNamespace): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const fullPattern = `${namespace}:${pattern}`;
      let cursor = '0';
      let totalDeleted = 0;

      // Use SCAN for production safety (non-blocking, iterative)
      do {
        const result = await this.client.scan(cursor, {
          MATCH: fullPattern,
          COUNT: 100,
        });
        cursor = String(result.cursor);

        if (result.keys.length > 0) {
          await this.client.del(result.keys);
          totalDeleted += result.keys.length;
          this.stats.deletes += result.keys.length;
        }
      } while (cursor !== '0');

      if (totalDeleted > 0) {
        this.logger.log(`Invalidated ${totalDeleted} keys matching ${fullPattern}`);
      }
      return totalDeleted;
    } catch (error) {
      this.logger.error(`Pattern invalidation failed for ${namespace}:${pattern}:`, error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Invalidate all keys for a specific tenant within a namespace (GDPR-compliant)
   *
   * @param tenantId - The tenant ID to invalidate
   * @param namespace - The cache namespace
   * @returns Number of keys deleted
   */
  async invalidateTenantPattern(tenantId: string, namespace: CacheNamespace): Promise<number> {
    return this.invalidatePattern(`${tenantId}:*`, namespace);
  }

  /**
   * Invalidate all keys for a specific user within a tenant (GDPR Art. 17 - Right to Erasure)
   *
   * @param tenantId - The tenant ID
   * @param userId - The user ID to invalidate
   * @param namespace - The cache namespace
   * @returns Number of keys deleted
   */
  async invalidateUserPattern(
    tenantId: string,
    userId: string,
    namespace: CacheNamespace,
  ): Promise<number> {
    return this.invalidatePattern(`${tenantId}:${userId}:*`, namespace);
  }

  /**
   * Get multiple values at once
   */
  async mget<T = any>(
    keys: string[],
    options?: { namespace?: CacheNamespace },
  ): Promise<(T | null)[]> {
    if (!this.isConnected || keys.length === 0) {
      return keys.map(() => null);
    }

    try {
      const fullKeys = keys.map((key) => this.buildKey(key, options?.namespace));
      const values = await this.client.mGet(fullKeys);

      return values.map((value) => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        this.stats.hits++;
        return JSON.parse(value) as T;
      });
    } catch (error) {
      this.logger.error('Cache mget error:', error);
      this.stats.errors++;
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values at once
   */
  async mset(
    entries: Array<{ key: string; value: any }>,
    options?: CacheSetOptions,
  ): Promise<boolean> {
    if (!this.isConnected || entries.length === 0) {
      return false;
    }

    try {
      const pipeline = this.client.multi();

      for (const entry of entries) {
        const fullKey = this.buildKey(entry.key, options?.namespace);
        const serialized = JSON.stringify(entry.value);

        if (options?.ttl) {
          pipeline.setEx(fullKey, options.ttl, serialized);
        } else {
          pipeline.set(fullKey, serialized);
        }
      }

      await pipeline.exec();
      this.stats.sets += entries.length;
      return true;
    } catch (error) {
      this.logger.error('Cache mset error:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Increment a numeric value
   */
  async incr(key: string, options?: { namespace?: CacheNamespace }): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      return await this.client.incr(fullKey);
    } catch (error) {
      this.logger.error(`Cache incr error for key ${key}:`, error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Increment a numeric value by a specified integer amount (atomic INCRBY)
   * Used for billing counters to prevent race conditions
   */
  async incrBy(
    key: string,
    amount: number,
    options?: { namespace?: CacheNamespace; ttl?: number },
  ): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      const result = await this.client.incrBy(fullKey, Math.floor(amount));

      // Set TTL if provided (for billing counters that reset monthly)
      if (options?.ttl) {
        await this.client.expire(fullKey, options.ttl);
      }

      return result;
    } catch (error) {
      this.logger.error(`Cache incrBy error for key ${key}:`, error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Increment a numeric value by a specified float amount (atomic INCRBYFLOAT)
   * Used for cost tracking with decimal precision
   */
  async incrByFloat(
    key: string,
    amount: number,
    options?: { namespace?: CacheNamespace; ttl?: number },
  ): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      const result = await this.client.incrByFloat(fullKey, amount);

      // Set TTL if provided (for billing counters that reset monthly)
      if (options?.ttl) {
        await this.client.expire(fullKey, options.ttl);
      }

      return parseFloat(result);
    } catch (error) {
      this.logger.error(`Cache incrByFloat error for key ${key}:`, error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Decrement a numeric value
   */
  async decr(key: string, options?: { namespace?: CacheNamespace }): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      return await this.client.decr(fullKey);
    } catch (error) {
      this.logger.error(`Cache decr error for key ${key}:`, error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Flush all keys in the current database (USE WITH CAUTION!)
   */
  async flushDb(): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      this.logger.warn('⚠️ Flushing entire Redis database!');
      await this.client.flushDb();
      return true;
    } catch (error) {
      this.logger.error('Cache flushDb error:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  /**
   * Check if Redis is connected
   */
  isHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Ping Redis to check connectivity
   */
  async ping(): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Cache ping error:', error);
      return false;
    }
  }

  // ==========================================================================
  // LIST OPERATIONS - For efficient metrics buffering
  // ==========================================================================

  /**
   * Push values to the left of a list (newest first)
   * Ideal for time-series data like metrics
   */
  async lpush(key: string, values: any[], options?: { namespace?: CacheNamespace }): Promise<number> {
    if (!this.isConnected || values.length === 0) {
      return 0;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      const serialized = values.map((v) => JSON.stringify(v));
      return await this.client.lPush(fullKey, serialized);
    } catch (error) {
      this.logger.error(`Cache lpush error for key ${key}:`, error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Get a range of values from a list
   * @param start Start index (0-based)
   * @param stop End index (-1 for last element)
   */
  async lrange<T = any>(
    key: string,
    start: number,
    stop: number,
    options?: { namespace?: CacheNamespace },
  ): Promise<T[]> {
    if (!this.isConnected) {
      return [];
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      const values = await this.client.lRange(fullKey, start, stop);
      return values.map((v) => JSON.parse(v) as T);
    } catch (error) {
      this.logger.error(`Cache lrange error for key ${key}:`, error);
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Trim a list to only contain the specified range
   * Useful for maintaining a rolling buffer
   */
  async ltrim(
    key: string,
    start: number,
    stop: number,
    options?: { namespace?: CacheNamespace },
  ): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      await this.client.lTrim(fullKey, start, stop);
      return true;
    } catch (error) {
      this.logger.error(`Cache ltrim error for key ${key}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get the length of a list
   */
  async llen(key: string, options?: { namespace?: CacheNamespace }): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      return await this.client.lLen(fullKey);
    } catch (error) {
      this.logger.error(`Cache llen error for key ${key}:`, error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Bulk push and trim in one atomic operation (pipeline)
   * Efficient for maintaining rolling buffers
   */
  async lpushAndTrim(
    key: string,
    values: any[],
    maxSize: number,
    options?: { namespace?: CacheNamespace },
  ): Promise<number> {
    if (!this.isConnected || values.length === 0) {
      return 0;
    }

    try {
      const fullKey = this.buildKey(key, options?.namespace);
      const serialized = values.map((v) => JSON.stringify(v));

      const pipeline = this.client.multi();
      pipeline.lPush(fullKey, serialized);
      pipeline.lTrim(fullKey, 0, maxSize - 1);
      const results = await pipeline.exec();

      // First result is the lpush count
      const lpushResult = results[0];
      return typeof lpushResult === 'number' ? lpushResult : values.length;
    } catch (error) {
      this.logger.error(`Cache lpushAndTrim error for key ${key}:`, error);
      this.stats.errors++;
      return 0;
    }
  }
}
