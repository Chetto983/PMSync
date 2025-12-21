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
 * Tuning Features (2025):
 * - Adaptive threshold: Auto-adjusts based on hit rate (target: 30-50%)
 * - Category-specific thresholds: Different thresholds for different query types
 * - Analytics: Tracks cache performance for monitoring and optimization
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
  /** Query category for category-specific thresholds */
  category?: QueryCategory;
}

/** Query categories for category-specific threshold tuning */
export type QueryCategory =
  | 'greeting'     // Simple greetings, identity questions (low threshold: 0.88)
  | 'email_search' // Email search queries (medium threshold: 0.90)
  | 'calendar'     // Calendar queries (medium threshold: 0.90)
  | 'insights'     // AI insights like summarize, sentiment (higher threshold: 0.92)
  | 'compose'      // Email composition (high threshold: 0.94)
  | 'general';     // Default category (base threshold: 0.92)

/** Category-specific similarity thresholds */
export const CATEGORY_THRESHOLDS: Record<QueryCategory, number> = {
  greeting: 0.88,      // Greetings are more tolerant
  email_search: 0.90,  // Search queries need moderate precision
  calendar: 0.90,      // Calendar queries need moderate precision
  insights: 0.92,      // Insights need higher precision
  compose: 0.94,       // Composition needs high precision (context-sensitive)
  general: 0.92,       // Default threshold
};

/** Analytics tracking for cache performance */
export interface CacheAnalytics {
  /** Total cache lookup attempts */
  lookups: number;
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Running average of similarity scores on hits */
  avgHitSimilarity: number;
  /** Current adaptive threshold */
  adaptiveThreshold: number;
  /** Last threshold adjustment time */
  lastThresholdAdjustment: number;
  /** Threshold adjustment history (last 10) */
  thresholdHistory: Array<{ threshold: number; hitRate: number; timestamp: number }>;
  /** Per-category stats */
  categoryStats: Record<QueryCategory, { lookups: number; hits: number }>;
}

export interface SemanticCacheConfig {
  /** Base similarity threshold (0-1). Higher = more strict matching. Default: 0.92 */
  similarityThreshold: number;
  /** Cache TTL in seconds. Default: 3600 (1 hour) */
  ttlSeconds: number;
  /** Maximum cache entries per tenant. Default: 1000 */
  maxEntriesPerTenant: number;
  /** Minimum query length to cache. Default: 10 chars */
  minQueryLength: number;
  /** Enable/disable caching. Default: true */
  enabled: boolean;
  /** Enable adaptive threshold tuning. Default: true */
  adaptiveThreshold: boolean;
  /** Target hit rate for adaptive tuning (0-1). Default: 0.35 */
  targetHitRate: number;
  /** Minimum lookups before adaptive tuning kicks in. Default: 100 */
  minLookupsForTuning: number;
  /** Enable category-specific thresholds. Default: true */
  categoryThresholds: boolean;
}

export interface CacheHitResult {
  hit: boolean;
  response?: string;
  similarity?: number;
  cachedAt?: number;
  hits?: number;
  /** Category of the query */
  category?: QueryCategory;
  /** Threshold used for this lookup */
  thresholdUsed?: number;
}

const DEFAULT_CONFIG: SemanticCacheConfig = {
  similarityThreshold: 0.92,
  ttlSeconds: 3600,
  maxEntriesPerTenant: 1000,
  minQueryLength: 10,
  enabled: true,
  adaptiveThreshold: true,
  targetHitRate: 0.35,  // Target 35% hit rate
  minLookupsForTuning: 100,
  categoryThresholds: true,
};

const createDefaultAnalytics = (): CacheAnalytics => ({
  lookups: 0,
  hits: 0,
  misses: 0,
  avgHitSimilarity: 0,
  adaptiveThreshold: DEFAULT_CONFIG.similarityThreshold,
  lastThresholdAdjustment: Date.now(),
  thresholdHistory: [],
  categoryStats: {
    greeting: { lookups: 0, hits: 0 },
    email_search: { lookups: 0, hits: 0 },
    calendar: { lookups: 0, hits: 0 },
    insights: { lookups: 0, hits: 0 },
    compose: { lookups: 0, hits: 0 },
    general: { lookups: 0, hits: 0 },
  },
});

/** Query patterns for category classification */
const CATEGORY_PATTERNS: Array<{ category: QueryCategory; patterns: RegExp[] }> = [
  {
    category: 'greeting',
    patterns: [
      /^(hi|hello|hey|good\s*(morning|afternoon|evening)|ciao|buongiorno)/i,
      /^(who\s+am\s+i|what('s|\s+is)\s+my\s+name|what\s+time)/i,
      /^(what('s|\s+is)\s+today|what\s+day)/i,
    ],
  },
  {
    category: 'email_search',
    patterns: [
      /\b(search|find|look\s+for|show\s+me)\b.*\b(email|message|mail)/i,
      /\b(email|message|mail)s?\s+(from|to|about|containing)/i,
      /\bunread\s+(email|message|mail)/i,
    ],
  },
  {
    category: 'calendar',
    patterns: [
      /\b(calendar|event|meeting|appointment|schedule)/i,
      /\b(what('s|\s+is)\s+on\s+my\s+calendar)/i,
      /\b(free|busy|available)\s+.*(today|tomorrow|this\s+week)/i,
    ],
  },
  {
    category: 'insights',
    patterns: [
      /\b(summarize|summary|analyze|sentiment|priority|categorize)/i,
      /\b(extract\s+action|action\s+items|to-?do)/i,
      /\b(what\s+should\s+I|prioritize)/i,
    ],
  },
  {
    category: 'compose',
    patterns: [
      /\b(compose|write|draft|send|reply|forward)\s+.*(email|message|mail)/i,
      /\b(email|message|mail)\s+(about|regarding|for)/i,
      /\bwrite\s+a?\s*(response|reply)/i,
    ],
  },
];

@Injectable()
export class SemanticCacheService {
  private readonly logger = new Logger(SemanticCacheService.name);
  private readonly config: SemanticCacheConfig;

  // In-memory embedding cache for hot queries (LRU-style)
  private embeddingCache = new Map<string, number[]>();
  private readonly maxEmbeddingCache = 100;

  // Per-tenant analytics (in-memory, synced to Redis periodically)
  private analyticsCache = new Map<string, CacheAnalytics>();
  private readonly analyticsFlushInterval = 60000; // 1 minute
  private analyticsFlushTimer: NodeJS.Timeout | null = null;

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
    if (process.env.SEMANTIC_CACHE_ADAPTIVE === 'false') {
      this.config.adaptiveThreshold = false;
    }
    if (process.env.SEMANTIC_CACHE_CATEGORY_THRESHOLDS === 'false') {
      this.config.categoryThresholds = false;
    }

    // Start periodic analytics flush
    this.analyticsFlushTimer = setInterval(() => {
      this.flushAnalyticsToRedis().catch((err) =>
        this.logger.warn(`Failed to flush analytics: ${err.message}`),
      );
    }, this.analyticsFlushInterval);
  }

  /**
   * Cleanup on module destroy.
   */
  onModuleDestroy(): void {
    if (this.analyticsFlushTimer) {
      clearInterval(this.analyticsFlushTimer);
      this.analyticsFlushTimer = null;
    }
    // Final flush
    this.flushAnalyticsToRedis().catch(() => {});
  }

  /**
   * Classify a query into a category for threshold selection.
   */
  classifyQuery(query: string): QueryCategory {
    const normalizedQuery = query.toLowerCase().trim();

    for (const { category, patterns } of CATEGORY_PATTERNS) {
      if (patterns.some((pattern) => pattern.test(normalizedQuery))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Get the effective threshold for a query.
   * Uses category-specific thresholds if enabled, otherwise uses adaptive/base threshold.
   */
  getEffectiveThreshold(tenantId: string, category: QueryCategory): number {
    // Get adaptive threshold for tenant
    const analytics = this.getAnalytics(tenantId);
    const adaptiveThreshold = this.config.adaptiveThreshold
      ? analytics.adaptiveThreshold
      : this.config.similarityThreshold;

    // If category thresholds enabled, use category-specific adjustment
    if (this.config.categoryThresholds) {
      const categoryThreshold = CATEGORY_THRESHOLDS[category];
      // Blend category threshold with adaptive threshold
      // Category threshold provides base, adaptive provides adjustment
      const adaptiveOffset = adaptiveThreshold - this.config.similarityThreshold;
      return Math.max(0.8, Math.min(0.98, categoryThreshold + adaptiveOffset));
    }

    return adaptiveThreshold;
  }

  /**
   * Get or initialize analytics for a tenant.
   */
  private getAnalytics(tenantId: string): CacheAnalytics {
    if (!this.analyticsCache.has(tenantId)) {
      this.analyticsCache.set(tenantId, createDefaultAnalytics());
    }
    return this.analyticsCache.get(tenantId)!;
  }

  /**
   * Update analytics after a cache lookup.
   */
  private updateAnalytics(
    tenantId: string,
    category: QueryCategory,
    hit: boolean,
    similarity?: number,
  ): void {
    const analytics = this.getAnalytics(tenantId);

    analytics.lookups++;
    analytics.categoryStats[category].lookups++;

    if (hit) {
      analytics.hits++;
      analytics.categoryStats[category].hits++;
      if (similarity !== undefined) {
        // Update running average
        analytics.avgHitSimilarity =
          (analytics.avgHitSimilarity * (analytics.hits - 1) + similarity) / analytics.hits;
      }
    } else {
      analytics.misses++;
    }

    // Check if we should adjust threshold (adaptive tuning)
    if (
      this.config.adaptiveThreshold &&
      analytics.lookups >= this.config.minLookupsForTuning &&
      analytics.lookups % 50 === 0 // Adjust every 50 lookups
    ) {
      this.adjustThreshold(tenantId, analytics);
    }
  }

  /**
   * Adaptive threshold adjustment based on hit rate.
   * Target: 30-50% hit rate (optimal for cost savings vs. cache accuracy)
   */
  private adjustThreshold(tenantId: string, analytics: CacheAnalytics): void {
    const currentHitRate = analytics.hits / analytics.lookups;
    const targetHitRate = this.config.targetHitRate;
    const tolerance = 0.10; // ±10% tolerance

    // If hit rate is within tolerance, no adjustment needed
    if (Math.abs(currentHitRate - targetHitRate) <= tolerance) {
      return;
    }

    const oldThreshold = analytics.adaptiveThreshold;
    let newThreshold = oldThreshold;

    if (currentHitRate < targetHitRate - tolerance) {
      // Hit rate too low - lower threshold to be more permissive
      newThreshold = Math.max(0.80, oldThreshold - 0.02);
      this.logger.debug(
        `[${tenantId}] Adaptive tuning: hit rate ${(currentHitRate * 100).toFixed(1)}% < target, ` +
        `lowering threshold ${oldThreshold.toFixed(3)} → ${newThreshold.toFixed(3)}`,
      );
    } else if (currentHitRate > targetHitRate + tolerance) {
      // Hit rate too high - raise threshold to be more strict
      newThreshold = Math.min(0.98, oldThreshold + 0.01);
      this.logger.debug(
        `[${tenantId}] Adaptive tuning: hit rate ${(currentHitRate * 100).toFixed(1)}% > target, ` +
        `raising threshold ${oldThreshold.toFixed(3)} → ${newThreshold.toFixed(3)}`,
      );
    }

    if (newThreshold !== oldThreshold) {
      analytics.adaptiveThreshold = newThreshold;
      analytics.lastThresholdAdjustment = Date.now();

      // Track history (keep last 10)
      analytics.thresholdHistory.push({
        threshold: newThreshold,
        hitRate: currentHitRate,
        timestamp: Date.now(),
      });
      if (analytics.thresholdHistory.length > 10) {
        analytics.thresholdHistory.shift();
      }
    }
  }

  /**
   * Flush analytics to Redis for persistence and multi-instance support.
   */
  private async flushAnalyticsToRedis(): Promise<void> {
    if (!this.cacheService) return;

    for (const [tenantId, analytics] of this.analyticsCache.entries()) {
      try {
        const key = `semantic_cache:analytics:${tenantId}`;
        await this.cacheService.set(key, analytics, {
          namespace: CacheNamespace.VOLTAGENT_METRICS,
          ttl: 86400, // 24 hours
        });
      } catch {
        // Ignore flush errors
      }
    }
  }

  /**
   * Load analytics from Redis (for multi-instance sync).
   */
  async loadAnalytics(tenantId: string): Promise<CacheAnalytics> {
    if (this.cacheService) {
      try {
        const key = `semantic_cache:analytics:${tenantId}`;
        const stored = await this.cacheService.get<CacheAnalytics>(key, {
          namespace: CacheNamespace.VOLTAGENT_METRICS,
        });
        if (stored) {
          this.analyticsCache.set(tenantId, stored);
          return stored;
        }
      } catch {
        // Fall through to default
      }
    }
    return this.getAnalytics(tenantId);
  }

  /**
   * Check if a similar query exists in cache.
   * Returns cached response if similarity > threshold.
   * Uses category-specific thresholds and adaptive tuning for optimal performance.
   */
  async get(
    tenantId: string,
    query: string,
    model?: string,
  ): Promise<CacheHitResult> {
    if (!this.isEnabled() || query.length < this.config.minQueryLength) {
      return { hit: false };
    }

    // Classify query for category-specific threshold
    const category = this.classifyQuery(query);
    const effectiveThreshold = this.getEffectiveThreshold(tenantId, category);

    try {
      // Generate embedding for query
      const queryEmbedding = await this.getEmbedding(query);
      if (!queryEmbedding) {
        this.updateAnalytics(tenantId, category, false);
        return { hit: false, category, thresholdUsed: effectiveThreshold };
      }

      // Get all cache entries for tenant
      const entries = await this.getCacheEntries(tenantId);
      if (entries.length === 0) {
        this.updateAnalytics(tenantId, category, false);
        return { hit: false, category, thresholdUsed: effectiveThreshold };
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

        if (similarity > bestSimilarity && similarity >= effectiveThreshold) {
          bestSimilarity = similarity;
          bestMatch = entry;
        }
      }

      if (bestMatch) {
        // Update hit count
        bestMatch.hits++;
        await this.updateCacheEntry(tenantId, bestMatch);

        // Update analytics
        this.updateAnalytics(tenantId, category, true, bestSimilarity);

        this.logger.debug(
          `Semantic cache hit: category=${category}, similarity=${bestSimilarity.toFixed(3)}, ` +
          `threshold=${effectiveThreshold.toFixed(3)}, hits=${bestMatch.hits}`,
        );

        return {
          hit: true,
          response: bestMatch.response,
          similarity: bestSimilarity,
          cachedAt: bestMatch.createdAt,
          hits: bestMatch.hits,
          category,
          thresholdUsed: effectiveThreshold,
        };
      }

      // Cache miss
      this.updateAnalytics(tenantId, category, false);
      return { hit: false, category, thresholdUsed: effectiveThreshold };
    } catch (error) {
      this.logger.warn(
        `Semantic cache lookup failed: ${error instanceof Error ? error.message : error}`,
      );
      this.updateAnalytics(tenantId, category, false);
      return { hit: false, category, thresholdUsed: effectiveThreshold };
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

      // Classify query for future lookups
      const category = this.classifyQuery(query);

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
        category,
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
   * Includes analytics, adaptive threshold info, and category breakdown.
   */
  async getStats(tenantId: string): Promise<{
    entries: number;
    totalHits: number;
    avgSimilarity: number;
    estimatedSavings: number;
    analytics: CacheAnalytics;
    hitRate: number;
    config: {
      baseThreshold: number;
      adaptiveEnabled: boolean;
      categoryThresholdsEnabled: boolean;
      currentAdaptiveThreshold: number;
    };
    categoryBreakdown: Array<{
      category: QueryCategory;
      threshold: number;
      lookups: number;
      hits: number;
      hitRate: number;
    }>;
  }> {
    const entries = await this.getCacheEntries(tenantId);
    const analytics = await this.loadAnalytics(tenantId);

    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);
    const totalTokensSaved = entries.reduce((sum, e) => sum + e.tokens * e.hits, 0);

    // Estimate cost savings (assuming $0.002 per 1K tokens for Mistral)
    const estimatedSavings = (totalTokensSaved / 1000) * 0.002;

    // Calculate overall hit rate
    const hitRate = analytics.lookups > 0 ? analytics.hits / analytics.lookups : 0;

    // Category breakdown with thresholds
    const categories: QueryCategory[] = ['greeting', 'email_search', 'calendar', 'insights', 'compose', 'general'];
    const categoryBreakdown = categories.map((category) => {
      const stats = analytics.categoryStats[category];
      return {
        category,
        threshold: this.getEffectiveThreshold(tenantId, category),
        lookups: stats.lookups,
        hits: stats.hits,
        hitRate: stats.lookups > 0 ? stats.hits / stats.lookups : 0,
      };
    });

    return {
      entries: entries.length,
      totalHits,
      avgSimilarity: analytics.avgHitSimilarity,
      estimatedSavings,
      analytics,
      hitRate,
      config: {
        baseThreshold: this.config.similarityThreshold,
        adaptiveEnabled: this.config.adaptiveThreshold,
        categoryThresholdsEnabled: this.config.categoryThresholds,
        currentAdaptiveThreshold: analytics.adaptiveThreshold,
      },
      categoryBreakdown,
    };
  }

  /**
   * Get detailed analytics for monitoring and debugging.
   */
  async getDetailedAnalytics(tenantId: string): Promise<{
    analytics: CacheAnalytics;
    config: SemanticCacheConfig;
    categoryThresholds: Record<QueryCategory, number>;
    recommendations: string[];
  }> {
    const analytics = await this.loadAnalytics(tenantId);
    const hitRate = analytics.lookups > 0 ? analytics.hits / analytics.lookups : 0;

    // Generate recommendations based on analytics
    const recommendations: string[] = [];

    if (analytics.lookups < this.config.minLookupsForTuning) {
      recommendations.push(
        `Need ${this.config.minLookupsForTuning - analytics.lookups} more lookups before adaptive tuning activates.`,
      );
    }

    if (hitRate < 0.20 && analytics.lookups >= 50) {
      recommendations.push(
        'Hit rate is very low (<20%). Consider lowering the base threshold or increasing cache TTL.',
      );
    }

    if (hitRate > 0.60 && analytics.lookups >= 50) {
      recommendations.push(
        'Hit rate is very high (>60%). The threshold may be too permissive - consider raising it for better cache accuracy.',
      );
    }

    // Check for category imbalances
    for (const [category, stats] of Object.entries(analytics.categoryStats)) {
      if (stats.lookups >= 20 && stats.hits / stats.lookups < 0.10) {
        recommendations.push(
          `Category '${category}' has very low hit rate. Consider adjusting category-specific threshold.`,
        );
      }
    }

    // Build effective thresholds for all categories
    const effectiveThresholds: Record<QueryCategory, number> = {
      greeting: this.getEffectiveThreshold(tenantId, 'greeting'),
      email_search: this.getEffectiveThreshold(tenantId, 'email_search'),
      calendar: this.getEffectiveThreshold(tenantId, 'calendar'),
      insights: this.getEffectiveThreshold(tenantId, 'insights'),
      compose: this.getEffectiveThreshold(tenantId, 'compose'),
      general: this.getEffectiveThreshold(tenantId, 'general'),
    };

    return {
      analytics,
      config: this.config,
      categoryThresholds: effectiveThresholds,
      recommendations,
    };
  }

  /**
   * Reset analytics for a tenant (useful for testing or recalibration).
   */
  async resetAnalytics(tenantId: string): Promise<void> {
    this.analyticsCache.delete(tenantId);
    if (this.cacheService) {
      const key = `semantic_cache:analytics:${tenantId}`;
      await this.cacheService.del(key, { namespace: CacheNamespace.VOLTAGENT_METRICS });
    }
    this.logger.log(`[${tenantId}] Analytics reset`);
  }

  /**
   * Manually set the adaptive threshold for a tenant (admin override).
   */
  setAdaptiveThreshold(tenantId: string, threshold: number): void {
    if (threshold < 0.80 || threshold > 0.98) {
      throw new Error('Threshold must be between 0.80 and 0.98');
    }
    const analytics = this.getAnalytics(tenantId);
    analytics.adaptiveThreshold = threshold;
    analytics.lastThresholdAdjustment = Date.now();
    analytics.thresholdHistory.push({
      threshold,
      hitRate: analytics.lookups > 0 ? analytics.hits / analytics.lookups : 0,
      timestamp: Date.now(),
    });
    this.logger.log(`[${tenantId}] Adaptive threshold manually set to ${threshold.toFixed(3)}`);
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
