/**
 * UsageTrackingService - Real-time usage tracking with Redis
 *
 * Provides atomic, real-time usage counters for quota enforcement.
 * Uses Redis for low-latency reads/writes with periodic sync to Prisma.
 *
 * Key features:
 * - Atomic increments (no race conditions)
 * - Sub-millisecond quota checks
 * - Daily cost tracking
 * - Per-feature usage breakdowns
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { SubscriptionPlan } from '@prisma/client';

/**
 * Usage tracking namespace (add to CacheNamespace enum)
 * Using a string constant here to avoid modifying core cache service
 */
const USAGE_NAMESPACE = 'subscription:usage' as unknown as CacheNamespace;

export interface UsageStats {
  emailsProcessed: number;
  aiCallsUsed: number;
  dailyCost: number;
  lastUpdated: number;
}

export interface FeatureUsage {
  smartReplies: number;
  summaries: number;
  triage: number;
  briefings: number;
  embeddings: number;
}

/**
 * Estimated costs per operation (Hybrid GDPR Strategy)
 * @see P10-SUBSCRIPTION-BILLING-ROADMAP.md Part 2.6
 */
export const OPERATION_COSTS = {
  embedding: 0.00002,      // Azure text-embedding-3-small ~1000 tokens
  triage: 0.00035,         // Mistral small ~1000 tokens
  summary: 0.00028,        // Mistral small ~800 tokens
  smartReply: 0.00017,     // Mistral small ~500 tokens
  briefing: 0.0007,        // Mistral small ~2000 tokens
  complexCompose: 0.0035,  // Mistral medium ~1500 tokens
} as const;

@Injectable()
export class UsageTrackingService {
  private readonly logger = new Logger(UsageTrackingService.name);

  constructor(private readonly cache: CacheService) {}

  // ==========================================================================
  // Core Usage Tracking
  // ==========================================================================

  /**
   * Get current usage for a tenant
   */
  async getUsage(tenantId: string): Promise<UsageStats> {
    const key = this.buildKey(tenantId, 'stats');
    const stats = await this.cache.get<UsageStats>(key);

    return stats || {
      emailsProcessed: 0,
      aiCallsUsed: 0,
      dailyCost: 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Track email processing (increment counter)
   */
  async trackEmailProcessed(tenantId: string, count: number = 1): Promise<number> {
    const key = this.buildKey(tenantId, 'emails');
    const newCount = await this.incrementCounter(key, count);

    await this.updateStats(tenantId, { emailsProcessed: newCount });
    return newCount;
  }

  /**
   * Track AI call (increment counter + cost)
   */
  async trackAICall(
    tenantId: string,
    operation: keyof typeof OPERATION_COSTS,
    count: number = 1,
  ): Promise<{ aiCallsUsed: number; dailyCost: number }> {
    const aiKey = this.buildKey(tenantId, 'ai');
    const aiCallsUsed = await this.incrementCounter(aiKey, count);

    // Track daily cost
    const cost = OPERATION_COSTS[operation] * count;
    const dailyCost = await this.trackDailyCost(tenantId, cost);

    // Track per-feature usage
    await this.trackFeatureUsage(tenantId, operation, count);

    await this.updateStats(tenantId, { aiCallsUsed, dailyCost });

    return { aiCallsUsed, dailyCost };
  }

  /**
   * Track daily cost for cost protection (atomic INCRBYFLOAT)
   * Prevents race conditions when multiple API calls track costs concurrently
   */
  async trackDailyCost(tenantId: string, cost: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const key = this.buildKey(tenantId, `cost:${today}`);

    // Use atomic INCRBYFLOAT for precise cost tracking
    return this.cache.incrByFloat(key, cost, { ttl: 86400 }); // 24-hour TTL
  }

  /**
   * Get daily cost for a tenant
   */
  async getDailyCost(tenantId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const key = this.buildKey(tenantId, `cost:${today}`);
    return (await this.cache.get<number>(key)) || 0;
  }

  // ==========================================================================
  // Quota Checks
  // ==========================================================================

  /**
   * Check if tenant has email quota remaining
   */
  async checkEmailQuota(tenantId: string, limit: number): Promise<boolean> {
    if (limit === -1) return true; // Unlimited

    const { emailsProcessed } = await this.getUsage(tenantId);
    return emailsProcessed < limit;
  }

  /**
   * Check if tenant has AI quota remaining
   */
  async checkAIQuota(tenantId: string, limit: number): Promise<boolean> {
    if (limit === -1) return true; // Unlimited

    const { aiCallsUsed } = await this.getUsage(tenantId);
    return aiCallsUsed < limit;
  }

  /**
   * Check if tenant is within daily cost cap
   */
  async checkDailyCostCap(tenantId: string, plan: SubscriptionPlan): Promise<boolean> {
    const dailyCost = await this.getDailyCost(tenantId);
    const cap = this.getDailyCostCap(plan);

    if (cap === null) return true; // No cap (enterprise)

    return dailyCost < cap;
  }

  /**
   * Get remaining quota
   */
  async getRemainingQuota(
    tenantId: string,
    emailLimit: number,
    aiLimit: number,
  ): Promise<{ emailsRemaining: number; aiCallsRemaining: number }> {
    const { emailsProcessed, aiCallsUsed } = await this.getUsage(tenantId);

    return {
      emailsRemaining: emailLimit === -1 ? -1 : Math.max(0, emailLimit - emailsProcessed),
      aiCallsRemaining: aiLimit === -1 ? -1 : Math.max(0, aiLimit - aiCallsUsed),
    };
  }

  // ==========================================================================
  // Feature Usage Tracking
  // ==========================================================================

  /**
   * Track per-feature usage for analytics (atomic INCRBY)
   */
  async trackFeatureUsage(
    tenantId: string,
    feature: string,
    count: number = 1,
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const key = this.buildKey(tenantId, `feature:${feature}:${today}`);

    // Use atomic INCRBY for concurrent-safe tracking
    await this.cache.incrBy(key, count, { ttl: 86400 * 7 }); // 7-day retention
  }

  /**
   * Get feature usage breakdown for today
   */
  async getFeatureUsage(tenantId: string): Promise<FeatureUsage> {
    const today = new Date().toISOString().split('T')[0];

    const [smartReplies, summaries, triage, briefings, embeddings] = await Promise.all([
      this.cache.get<number>(this.buildKey(tenantId, `feature:smartReply:${today}`)),
      this.cache.get<number>(this.buildKey(tenantId, `feature:summary:${today}`)),
      this.cache.get<number>(this.buildKey(tenantId, `feature:triage:${today}`)),
      this.cache.get<number>(this.buildKey(tenantId, `feature:briefing:${today}`)),
      this.cache.get<number>(this.buildKey(tenantId, `feature:embedding:${today}`)),
    ]);

    return {
      smartReplies: smartReplies || 0,
      summaries: summaries || 0,
      triage: triage || 0,
      briefings: briefings || 0,
      embeddings: embeddings || 0,
    };
  }

  // ==========================================================================
  // Usage Reset
  // ==========================================================================

  /**
   * Reset all usage counters for a tenant
   */
  async resetUsage(tenantId: string): Promise<void> {
    this.logger.log(`Resetting usage counters for tenant ${tenantId}`);

    const keys = [
      this.buildKey(tenantId, 'stats'),
      this.buildKey(tenantId, 'emails'),
      this.buildKey(tenantId, 'ai'),
    ];

    await Promise.all(keys.map(key => this.cache.del(key)));
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Build cache key with namespace
   */
  private buildKey(tenantId: string, suffix: string): string {
    return `${USAGE_NAMESPACE}:${tenantId}:${suffix}`;
  }

  /**
   * Increment a counter atomically using Redis INCRBY
   * Prevents race conditions in concurrent billing operations
   */
  private async incrementCounter(key: string, amount: number): Promise<number> {
    // Use atomic INCRBY to prevent race conditions
    return this.cache.incrBy(key, amount, { ttl: 86400 * 35 }); // 35-day retention
  }

  /**
   * Update stats cache
   */
  private async updateStats(
    tenantId: string,
    updates: Partial<UsageStats>,
  ): Promise<void> {
    const key = this.buildKey(tenantId, 'stats');
    const current = await this.getUsage(tenantId);

    await this.cache.set(key, {
      ...current,
      ...updates,
      lastUpdated: Date.now(),
    }, { ttl: 86400 * 35 });
  }

  /**
   * Get daily cost cap for plan
   * @see P10 Part 6.1
   */
  private getDailyCostCap(plan: SubscriptionPlan): number | null {
    const caps: Record<SubscriptionPlan, number | null> = {
      FREE: 0.10,
      STARTER: 0.50,
      PROFESSIONAL: 2.00,
      ENTERPRISE: null, // No cap
    };
    return caps[plan];
  }

  // ==========================================================================
  // Convenience Methods (P10: VoltAgent Integration)
  // ==========================================================================

  /**
   * @deprecated Use CostProtectionService.canProceed() instead for subscription-aware checks.
   * Remove by 2026-06-30 - After v2.0 release when CostProtectionService is fully validated
   * @see CostProtectionService.canProceed for replacement
   *
   * This method previously used hardcoded FREE tier limits as a safety net,
   * but this incorrectly blocked ENTERPRISE users with unlimited plans.
   *
   * Proper quota enforcement happens via:
   * - CostProtectionService.canProceed() - daily cost caps per plan
   * - QuotaGuard - HTTP endpoint protection with @RequiresQuota()
   *
   * @param _tenantId - Tenant ID (unused)
   * @param _featureType - Feature type (unused)
   * @returns Always true - actual enforcement via CostProtectionService
   */
  async checkQuota(_tenantId: string, _featureType: 'ai-calls' | 'email-processing'): Promise<boolean> {
    return true;
  }

  /**
   * Track usage for a feature (simplified interface for AI services)
   *
   * @param tenantId - Tenant ID
   * @param featureType - Feature type ('ai-calls' maps to 'smartReply' for costing)
   * @param count - Number of operations
   */
  async trackUsage(
    tenantId: string,
    featureType: 'ai-calls' | 'email-processing',
    count: number = 1,
  ): Promise<void> {
    if (featureType === 'ai-calls') {
      // Use 'smartReply' as default operation for generic AI calls
      await this.trackAICall(tenantId, 'smartReply', count);
    } else {
      await this.trackEmailProcessed(tenantId, count);
    }
  }
}
