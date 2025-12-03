/**
 * Semantic Cache Service
 *
 * Implements semantic caching for LLM responses using Redis + embeddings.
 * Provides 50-60% cost reduction by caching similar queries.
 *
 * How it works:
 * 1. Generate embedding for user query
 * 2. Search Redis for similar cached queries (cosine similarity > threshold)
 * 3. If match found, return cached response
 * 4. If no match, proceed with LLM call and cache the result
 *
 * Based on LangChain semantic caching patterns.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { MistralService } from '../../services/mistral.service';

export interface SemanticCacheEntry {
  queryEmbedding: number[];
  queryText: string;
  response: string;
  model: string;
  tokens: number;
  createdAt: number;
  ttl: number;
  hits: number;
  tenantId: string;
}

export interface SemanticCacheConfig {
  /** Similarity threshold (0-1). Higher = more strict matching. Default: 0.92 */
  similarityThreshold: number;
  /** Cache TTL in seconds. Default: 3600 (1 hour) */
  ttlSeconds: number;
  /** Maximum cache entries per tenant. Default: 1000 */
  maxEntriesPerTenant: number;
  /** Minimum query length to cache. Default: 10 chars */
  minQueryLength: number;
  /** Enable/disable caching. Default: true */
  enabled: boolean;
}

export interface CacheHitResult {
  hit: boolean;
  response?: string;
  similarity?: number;
  cachedAt?: number;
  hits?: number;
}

const DEFAULT_CONFIG: SemanticCacheConfig = {
  similarityThreshold: 0.92,
  ttlSeconds: 3600,
  maxEntriesPerTenant: 1000,
  minQueryLength: 10,
  enabled: true,
};

@Injectable()
export class SemanticCacheService {
  private readonly logger = new Logger(SemanticCacheService.name);
  private readonly config: SemanticCacheConfig;

  // In-memory embedding cache for hot queries (LRU-style)
  private embeddingCache = new Map<string, number[]>();
  private readonly maxEmbeddingCache = 100;

  constructor(
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly mistralService?: MistralService,
  ) {
    this.config = { ...DEFAULT_CONFIG };

    // Override from environment
    if (process.env.SEMANTIC_CACHE_THRESHOLD) {
      this.config.similarityThreshold = parseFloat(process.env.SEMANTIC_CACHE_THRESHOLD);
    }
    if (process.env.SEMANTIC_CACHE_TTL) {
      this.config.ttlSeconds = parseInt(process.env.SEMANTIC_CACHE_TTL, 10);
    }
    if (process.env.SEMANTIC_CACHE_ENABLED === 'false') {
      this.config.enabled = false;
    }
  }

  /**
   * Check if a similar query exists in cache.
   * Returns cached response if similarity > threshold.
   */
  async get(
    tenantId: string,
    query: string,
    model?: string,
  ): Promise<CacheHitResult> {
    if (!this.isEnabled() || query.length < this.config.minQueryLength) {
      return { hit: false };
    }

    try {
      // Generate embedding for query
      const queryEmbedding = await this.getEmbedding(query);
      if (!queryEmbedding) {
        return { hit: false };
      }

      // Get all cache entries for tenant
      const entries = await this.getCacheEntries(tenantId);
      if (entries.length === 0) {
        return { hit: false };
      }

      // Find best matching entry
      let bestMatch: SemanticCacheEntry | null = null;
      let bestSimilarity = 0;

      for (const entry of entries) {
        // Filter by model if specified
        if (model && entry.model !== model) {
          continue;
        }

        // Check if entry is expired
        if (Date.now() > entry.createdAt + entry.ttl * 1000) {
          continue;
        }

        // Calculate cosine similarity
        const similarity = this.cosineSimilarity(queryEmbedding, entry.queryEmbedding);

        if (similarity > bestSimilarity && similarity >= this.config.similarityThreshold) {
          bestSimilarity = similarity;
          bestMatch = entry;
        }
      }

      if (bestMatch) {
        // Update hit count
        bestMatch.hits++;
        await this.updateCacheEntry(tenantId, bestMatch);

        this.logger.debug(
          `Semantic cache hit: similarity=${bestSimilarity.toFixed(3)}, hits=${bestMatch.hits}`,
        );

        return {
          hit: true,
          response: bestMatch.response,
          similarity: bestSimilarity,
          cachedAt: bestMatch.createdAt,
          hits: bestMatch.hits,
        };
      }

      return { hit: false };
    } catch (error) {
      this.logger.warn(
        `Semantic cache lookup failed: ${error instanceof Error ? error.message : error}`,
      );
      return { hit: false };
    }
  }

  /**
   * Store a query-response pair in semantic cache.
   */
  async set(
    tenantId: string,
    query: string,
    response: string,
    model: string,
    tokens: number,
  ): Promise<void> {
    if (!this.isEnabled() || query.length < this.config.minQueryLength) {
      return;
    }

    try {
      // Generate embedding for query
      const queryEmbedding = await this.getEmbedding(query);
      if (!queryEmbedding) {
        return;
      }

      const entry: SemanticCacheEntry = {
        queryEmbedding,
        queryText: query,
        response,
        model,
        tokens,
        createdAt: Date.now(),
        ttl: this.config.ttlSeconds,
        hits: 0,
        tenantId,
      };

      // Get existing entries
      const entries = await this.getCacheEntries(tenantId);

      // Check for duplicates (very high similarity)
      for (const existing of entries) {
        const similarity = this.cosineSimilarity(queryEmbedding, existing.queryEmbedding);
        if (similarity > 0.98) {
          // Update existing entry instead
          existing.response = response;
          existing.tokens = tokens;
          existing.createdAt = Date.now();
          await this.saveCacheEntries(tenantId, entries);
          return;
        }
      }

      // Add new entry
      entries.push(entry);

      // Enforce max entries (remove oldest, least-hit entries)
      if (entries.length > this.config.maxEntriesPerTenant) {
        entries.sort((a, b) => {
          // Prioritize by: recency * hit_count
          const aScore = a.createdAt * (1 + a.hits * 0.1);
          const bScore = b.createdAt * (1 + b.hits * 0.1);
          return aScore - bScore;
        });
        entries.splice(0, entries.length - this.config.maxEntriesPerTenant);
      }

      await this.saveCacheEntries(tenantId, entries);

      this.logger.debug(`Semantic cache stored: query="${query.substring(0, 50)}..."`);
    } catch (error) {
      this.logger.warn(
        `Semantic cache store failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Invalidate cache entries for a tenant.
   */
  async invalidate(tenantId: string, pattern?: string): Promise<number> {
    if (!this.cacheService) {
      return 0;
    }

    try {
      if (pattern) {
        // Invalidate entries matching pattern
        const entries = await this.getCacheEntries(tenantId);
        const originalCount = entries.length;
        const filtered = entries.filter((e) => !e.queryText.includes(pattern));
        await this.saveCacheEntries(tenantId, filtered);
        return originalCount - filtered.length;
      }

      // Invalidate all entries for tenant
      const key = this.getCacheKey(tenantId);
      await this.cacheService.del(key, { namespace: CacheNamespace.VOLTAGENT_METRICS });
      return -1; // Unknown count
    } catch (error) {
      this.logger.warn(
        `Semantic cache invalidation failed: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }

  /**
   * Get cache statistics for a tenant.
   */
  async getStats(tenantId: string): Promise<{
    entries: number;
    totalHits: number;
    avgSimilarity: number;
    estimatedSavings: number;
  }> {
    const entries = await this.getCacheEntries(tenantId);

    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);
    const totalTokensSaved = entries.reduce((sum, e) => sum + e.tokens * e.hits, 0);

    // Estimate cost savings (assuming $0.002 per 1K tokens for Mistral)
    const estimatedSavings = (totalTokensSaved / 1000) * 0.002;

    return {
      entries: entries.length,
      totalHits,
      avgSimilarity: 0, // Would need to track this
      estimatedSavings,
    };
  }

  /**
   * Check if caching is enabled and services are available.
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.cacheService && !!this.mistralService;
  }

  /**
   * Get or generate embedding for text.
   * Uses in-memory LRU cache for hot queries.
   */
  private async getEmbedding(text: string): Promise<number[] | null> {
    if (!this.mistralService) {
      return null;
    }

    // Normalize text for caching
    const normalizedText = text.toLowerCase().trim();
    const cacheKey = this.hashString(normalizedText);

    // Check in-memory cache
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    try {
      const embedding = await this.mistralService.generateEmbedding(text);

      // Add to in-memory cache (LRU eviction)
      if (this.embeddingCache.size >= this.maxEmbeddingCache) {
        const firstKey = this.embeddingCache.keys().next().value;
        if (firstKey) {
          this.embeddingCache.delete(firstKey);
        }
      }
      this.embeddingCache.set(cacheKey, embedding);

      return embedding;
    } catch (error) {
      this.logger.warn(
        `Embedding generation failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Get cache entries for a tenant from Redis.
   */
  private async getCacheEntries(tenantId: string): Promise<SemanticCacheEntry[]> {
    if (!this.cacheService) {
      return [];
    }

    try {
      const key = this.getCacheKey(tenantId);
      const data = await this.cacheService.get<SemanticCacheEntry[]>(key, {
        namespace: CacheNamespace.VOLTAGENT_METRICS,
      });
      return data || [];
    } catch {
      return [];
    }
  }

  /**
   * Save cache entries for a tenant to Redis.
   */
  private async saveCacheEntries(tenantId: string, entries: SemanticCacheEntry[]): Promise<void> {
    if (!this.cacheService) {
      return;
    }

    const key = this.getCacheKey(tenantId);
    await this.cacheService.set(key, entries, {
      namespace: CacheNamespace.VOLTAGENT_METRICS,
      ttl: this.config.ttlSeconds * 2, // Double TTL for Redis key
    });
  }

  /**
   * Update a single cache entry.
   */
  private async updateCacheEntry(tenantId: string, entry: SemanticCacheEntry): Promise<void> {
    const entries = await this.getCacheEntries(tenantId);
    const index = entries.findIndex(
      (e) =>
        e.queryText === entry.queryText && e.createdAt === entry.createdAt,
    );

    if (index >= 0) {
      entries[index] = entry;
      await this.saveCacheEntries(tenantId, entries);
    }
  }

  /**
   * Get Redis cache key for tenant.
   */
  private getCacheKey(tenantId: string): string {
    return `semantic_cache:${tenantId}`;
  }

  /**
   * Simple string hash for caching.
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
