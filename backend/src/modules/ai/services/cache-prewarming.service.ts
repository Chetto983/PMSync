import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { QueryEmbeddingCacheService } from './query-embedding-cache.service';
import { MistralService } from './mistral.service';
import { getAllQueries } from '../config/search-queries.config';

/**
 * Cache Pre-Warming Service
 *
 * Proactively warms the query embedding cache with common search patterns.
 * Queries are defined in config/search-queries.config.ts for maintainability.
 *
 * Benefits:
 * - First search is fast (cache hit instead of 312ms Mistral call)
 * - Reduces API costs during peak hours
 * - Improves perceived performance for new users
 */
@Injectable()
export class CachePrewarmingService implements OnModuleInit {
  private readonly logger = new Logger(CachePrewarmingService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cacheService: QueryEmbeddingCacheService,
    private readonly mistralService: MistralService,
  ) {
    this.enabled = this.config.get<string>('CACHE_PREWARMING_ENABLED', 'true') !== 'false';
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Cache pre-warming disabled via CACHE_PREWARMING_ENABLED=false');
      return;
    }
    this.logger.log('Cache pre-warming service initialized');

    // Initial warm-up after short delay (let other services start)
    setTimeout(() => this.warmCommonQueries(), 10000);
  }

  /**
   * Warm cache with common queries (runs at 6 AM daily)
   * Early morning to have cache ready for workday
   */
  @Cron('0 6 * * *')
  async warmCommonQueries(): Promise<{ warmed: number; skipped: number }> {
    if (!this.enabled) return { warmed: 0, skipped: 0 };

    this.logger.log('Starting cache pre-warming for common queries...');
    let warmed = 0;
    let skipped = 0;

    const commonQueries = getAllQueries();
    for (const query of commonQueries) {
      try {
        // Check if already cached
        const cached = await this.cacheService.getCachedEmbedding(query);
        if (cached) {
          skipped++;
          continue;
        }

        // Generate embedding
        const embedding = await this.mistralService.generateEmbedding(query);
        if (embedding && embedding.length > 0) {
          await this.cacheService.setCachedEmbedding(query, embedding);
          warmed++;
        }

        // Rate limit: 100ms between calls to avoid hitting API limits
        await this.delay(100);
      } catch (error) {
        this.logger.warn(`Failed to warm cache for "${query}": ${error}`);
      }
    }

    this.logger.log(`Cache pre-warming complete: ${warmed} warmed, ${skipped} already cached`);
    return { warmed, skipped };
  }

  /**
   * Warm cache with tenant-specific frequent queries (runs every 4 hours)
   * Analyzes recent search patterns and pre-caches popular queries
   */
  @Cron(CronExpression.EVERY_4_HOURS)
  async warmTenantQueries(): Promise<{ warmed: number; tenants: number }> {
    if (!this.enabled) return { warmed: 0, tenants: 0 };

    this.logger.log('Warming tenant-specific frequent queries...');
    let totalWarmed = 0;
    let tenantsProcessed = 0;

    try {
      // Get active tenants (those with recent email activity)
      const activeTenants = await this.prisma.tenant.findMany({
        where: {
          emails: {
            some: {
              receivedAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
              },
            },
          },
        },
        select: { id: true },
        take: 50, // Limit to prevent overload
      });

      for (const tenant of activeTenants) {
        const warmed = await this.warmTenantSpecificQueries(tenant.id);
        totalWarmed += warmed;
        tenantsProcessed++;
      }
    } catch (error) {
      this.logger.error(`Tenant query warming failed: ${error}`);
    }

    this.logger.log(`Tenant warming complete: ${totalWarmed} queries for ${tenantsProcessed} tenants`);
    return { warmed: totalWarmed, tenants: tenantsProcessed };
  }

  /**
   * Warm cache with queries specific to a tenant
   * Extracts common senders, subjects, and terms from their emails
   */
  private async warmTenantSpecificQueries(tenantId: string): Promise<number> {
    let warmed = 0;

    try {
      // Get frequent senders (top 10)
      const frequentSenders = await this.prisma.email.groupBy({
        by: ['from'],
        where: {
          tenantId,
          receivedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        _count: { from: true },
        orderBy: { _count: { from: 'desc' } },
        take: 10,
      });

      // Pre-warm sender queries
      for (const sender of frequentSenders) {
        if (!sender.from) continue;

        // Extract sender name/domain for cache
        const senderQuery = this.extractSenderQuery(sender.from);
        if (!senderQuery) continue;

        const cached = await this.cacheService.getCachedEmbedding(senderQuery);
        if (!cached) {
          const embedding = await this.mistralService.generateEmbedding(senderQuery);
          if (embedding && embedding.length > 0) {
            await this.cacheService.setCachedEmbedding(senderQuery, embedding);
            warmed++;
          }
          await this.delay(100);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to warm tenant ${tenantId}: ${error}`);
    }

    return warmed;
  }

  /**
   * Extract a searchable query from sender email/name
   */
  private extractSenderQuery(from: string): string | null {
    // Format: "Name <email@domain.com>" or just "email@domain.com"
    const match = from.match(/^([^<]+)\s*</) || from.match(/([^@]+)@/);
    if (match) {
      return match[1].trim().toLowerCase();
    }
    return null;
  }

  /**
   * Manually trigger cache warming (for testing/admin)
   */
  async forceWarmup(): Promise<{ common: number; tenant: number }> {
    const commonResult = await this.warmCommonQueries();
    const tenantResult = await this.warmTenantQueries();
    return {
      common: commonResult.warmed,
      tenant: tenantResult.warmed,
    };
  }

  /**
   * Get cache warming statistics
   */
  async getWarmingStats(): Promise<{
    enabled: boolean;
    commonQueries: number;
    cacheStats: { totalKeys: number; memoryUsed: string };
  }> {
    const cacheStats = await this.cacheService.getCacheStats();
    return {
      enabled: this.enabled,
      commonQueries: getAllQueries().length,
      cacheStats,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
