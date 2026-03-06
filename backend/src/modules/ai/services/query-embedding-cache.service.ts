import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { getRedisConnectionOptions } from '../../../common/config';

/**
 * Cache service for query embeddings to reduce Mistral API calls.
 *
 * GDPR COMPLIANT: Cache keys include tenantId for complete data isolation.
 * Each tenant has their own cache namespace - no cross-tenant data sharing.
 *
 * When users search for the same or similar queries, we can reuse
 * the cached embeddings instead of generating new ones.
 *
 * Expected cache hit rate: 40-60% in production (per tenant)
 * Cost savings: 50-70% reduction in Mistral API calls
 * Latency improvement: 2-3x faster (cache ~5ms vs API ~200ms)
 */
@Injectable()
export class QueryEmbeddingCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(QueryEmbeddingCacheService.name);
  private readonly redis: Redis;
  private readonly CACHE_TTL: number;
  private readonly CACHE_PREFIX = 'qemb:'; // query embedding

  constructor(private readonly config: ConfigService) {
    // Use centralized Redis connection options (includes maxRetriesPerRequest: null)
    const redisOptions = getRedisConnectionOptions();
    const defaultDb = redisOptions.db ?? 0;
    // Use separate DB for query cache if configured
    const queryCacheDb = this.config.get<number>('REDIS_QUERY_CACHE_DB', defaultDb);

    this.redis = new Redis({
      ...redisOptions,
      db: queryCacheDb,
      lazyConnect: true, // Don't connect immediately, allow error handling
      connectionName: 'query-embedding-cache',
    });

    // Handle connection errors gracefully
    this.redis.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });

    // TTL: 1 hour by default (configurable)
    this.CACHE_TTL = this.config.get<number>('QUERY_EMBEDDING_CACHE_TTL', 3600);

    // Attempt initial connection
    this.redis.connect().catch((error) => {
      this.logger.warn(
        `Failed to connect to Redis on startup: ${error.message}. Cache will be unavailable.`,
      );
    });

    this.logger.log(
      `Query embedding cache initialized with TTL=${this.CACHE_TTL}s, prefix=${this.CACHE_PREFIX}`,
    );
  }

  async onModuleDestroy() {
    try {
      if (this.redis.status !== 'end' && this.redis.status !== 'close') {
        await this.redis.quit();
        this.logger.debug('Redis connection closed gracefully');
      }
    } catch (error) {
      this.logger.warn(
        `Failed to close Redis connection during shutdown: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get cached embedding for query text (GDPR: tenant-isolated)
   * @param tenantId - Tenant ID for cache isolation
   * @param queryText - Query text to get embedding for
   */
  async getCachedEmbedding(tenantId: string, queryText: string): Promise<number[] | null> {
    const cacheKey = this.getCacheKey(tenantId, queryText);

    try {
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached);

        // Validate that parsed value is an array of finite numbers
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((item) => typeof item === 'number' && Number.isFinite(item))
        ) {
          this.logger.debug(`Query embedding cache HIT for tenant=${tenantId}`);
          return parsed;
        } else {
          this.logger.warn(
            `Invalid cached embedding format for tenant=${tenantId} - deleting corrupted entry`,
          );
          await this.redis.del(cacheKey);
          return null;
        }
      }

      this.logger.debug(`Query embedding cache MISS for tenant=${tenantId}`);
      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to get cached query embedding: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Cache embedding for query text (GDPR: tenant-isolated)
   * @param tenantId - Tenant ID for cache isolation
   * @param queryText - Query text to cache embedding for
   * @param embedding - Embedding vector to cache
   */
  async setCachedEmbedding(tenantId: string, queryText: string, embedding: number[]): Promise<void> {
    // Validate embedding before caching
    if (!embedding || embedding.length === 0 || !embedding.every(Number.isFinite)) {
      this.logger.warn('Attempted to cache invalid embedding - skipping');
      return;
    }

    const cacheKey = this.getCacheKey(tenantId, queryText);

    try {
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(embedding));

      this.logger.debug(
        `Cached query embedding for tenant=${tenantId} (TTL: ${this.CACHE_TTL}s, dims: ${embedding.length})`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to cache query embedding: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generate cache key from tenant + query text (normalized + hashed)
   * GDPR COMPLIANT: Each tenant has isolated cache namespace
   *
   * Format: qemb:{tenantId}:{queryHash}
   */
  private getCacheKey(tenantId: string, queryText: string): string {
    // Normalize: lowercase, trim, collapse whitespace
    const normalized = queryText.toLowerCase().trim().replace(/\s+/g, ' ');

    // Hash for consistent key length (SHA-256 = 64 chars hex)
    const hash = createHash('sha256').update(normalized, 'utf-8').digest('hex');

    // Include tenantId in key for GDPR isolation
    return `${this.CACHE_PREFIX}${tenantId}:${hash}`;
  }

  /**
   * Clear cached query embeddings for a specific tenant (GDPR: right to erasure)
   * @param tenantId - Tenant ID to clear cache for (required for GDPR compliance)
   */
  async clearCache(tenantId: string): Promise<number> {
    try {
      // Only clear cache for specified tenant (GDPR isolation)
      const pattern = `${this.CACHE_PREFIX}${tenantId}:*`;
      let cursor = '0';
      let deleted = 0;

      do {
        const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          deleted += await this.redis.del(...keys);
        }
      } while (cursor !== '0');

      this.logger.log(`Cleared ${deleted} cached query embeddings for tenant=${tenantId}`);
      return deleted;
    } catch (error) {
      this.logger.error(
        `Failed to clear query embedding cache: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Get cache statistics for a specific tenant (GDPR: tenant isolation)
   * @param tenantId - Tenant ID to get stats for
   */
  async getCacheStats(tenantId: string): Promise<{
    totalKeys: number;
    memoryUsed: string;
    hitRate?: number;
  }> {
    try {
      // Only count keys for specified tenant (GDPR isolation)
      const pattern = `${this.CACHE_PREFIX}${tenantId}:*`;
      let cursor = '0';
      let totalKeys = 0;

      do {
        const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        totalKeys += result[1].length;
      } while (cursor !== '0');

      // Get memory usage info (global - not per tenant)
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memoryUsed = memoryMatch ? memoryMatch[1] : 'unknown';

      return {
        totalKeys,
        memoryUsed,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get cache stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        totalKeys: 0,
        memoryUsed: 'error',
      };
    }
  }
}
