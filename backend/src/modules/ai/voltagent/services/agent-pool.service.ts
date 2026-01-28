/**
 * Agent Pool Service - Manages VoltAgent lifecycle with Redis-backed caching.
 *
 * ARCHITECTURE (Redis-backed for horizontal scaling):
 * - Agent metadata stored in Redis (tenant-scoped keys)
 * - Agents recreated on demand (stateless)
 * - GDPR-compliant: supports tenant/user-scoped invalidation
 *
 * Created: 2026-01-22 (Refactored from VoltAgentService)
 * Updated: 2026-01-27 (Migrated from in-memory Map to Redis for horizontal scaling + GDPR)
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Agent, Memory, AgentHooks } from '@voltagent/core';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { WritingStyleService } from './writing-style.service';
import { DocumentLibraryService } from './document-library.service';
import { FollowUpService } from './follow-up.service';
import { PiiDetectionService } from '../../guards';
import { EmailInsightsService } from '../../services/email-insights.service';
import { AIMemoryService } from './ai-memory.service';
import { createActionsAgent } from '../agents/actions.agent';
import { createIntelligenceAgent } from '../agents/intelligence.agent';
import { createSupervisorAgent, type UserContext } from '../agents/supervisor.agent';
import { getMistralModel, type MistralModel } from '../providers/mistral.provider';
import type { SupportedLocale } from '../locales';
import type { AgentType } from '../types';

/** Agent metadata stored in Redis (agents are stateless, only config is cached) */
export interface CachedAgentMeta {
  agentType: string;
  locale: string;
  modelType: string;
  tenantId: string;
  userId?: string;
  createdAt: number;
}

export interface GetOrCreateAgentParams {
  tenantId: string;
  locale: SupportedLocale;
  modelType?: MistralModel;
  userContext?: UserContext | null;
  userId?: string;
  agentType?: AgentType;
  memory?: Memory | null;
  hooks?: AgentHooks;
  /** RLM: Detected intent for loading minimal prompt */
  intent?: import('../services/task-complexity-classifier.service').TaskIntent;
}

@Injectable()
export class AgentPoolService {
  private readonly logger = new Logger(AgentPoolService.name);

  /** TTL for cached agent metadata in seconds (default 5 minutes) */
  private readonly AGENT_CACHE_TTL_SECONDS = parseInt(
    process.env.AGENT_CACHE_TTL_SECONDS || '300',
    10,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(CacheService) private readonly cacheService?: CacheService,
    @Optional() @Inject(EmailSendService) private readonly emailSendService?: EmailSendService,
    @Optional() @Inject(CalendarService) private readonly calendarService?: CalendarService,
    @Optional() @Inject(MistralService) private readonly mistralService?: MistralService,
    @Optional() @Inject(EmbeddingsService) private readonly embeddingsService?: EmbeddingsService,
    @Optional() @Inject(WritingStyleService) private readonly writingStyleService?: WritingStyleService,
    @Optional() @Inject(DocumentLibraryService) private readonly documentLibraryService?: DocumentLibraryService,
    @Optional() @Inject(FollowUpService) private readonly followUpService?: FollowUpService,
    @Optional() @Inject(PiiDetectionService) private readonly piiDetectionService?: PiiDetectionService,
    @Optional() @Inject(EmailInsightsService) private readonly emailInsightsService?: EmailInsightsService,
    @Optional() @Inject(AIMemoryService) private readonly aiMemoryService?: AIMemoryService,
  ) {
    this.logger.log(`[INIT] AgentPoolService: cache=${!!this.cacheService}, email=${!!this.emailSendService}, mistral=${!!this.mistralService}`);
  }

  /**
   * Build tenant-isolated cache key for Redis
   * Format: {tenantId}:{userId}:{locale}:{modelType}:{agentType}
   */
  private buildCacheKey(params: GetOrCreateAgentParams): string {
    const userKey = params.userContext?.email ?? params.userId ?? 'anonymous';
    return `${params.tenantId}:${userKey}:${params.locale}:${params.modelType || 'small'}:${params.agentType || 'Supervisor'}`;
  }

  /**
   * Get cached agent metadata from Redis
   */
  private async getCachedMeta(cacheKey: string): Promise<CachedAgentMeta | null> {
    if (!this.cacheService) return null;
    return this.cacheService.get<CachedAgentMeta>(cacheKey, {
      namespace: CacheNamespace.AGENT_POOL,
    });
  }

  /**
   * Cache agent metadata in Redis
   */
  private async cacheMeta(cacheKey: string, meta: CachedAgentMeta): Promise<void> {
    if (!this.cacheService) return;
    await this.cacheService.set(cacheKey, meta, {
      namespace: CacheNamespace.AGENT_POOL,
      ttl: this.AGENT_CACHE_TTL_SECONDS,
    });
  }

  /**
   * Get or create agent with Redis-backed metadata caching.
   * Agents are stateless and recreated on demand for horizontal scaling.
   * Metadata in Redis ensures consistent config across all instances.
   */
  async getOrCreateAgent(params: GetOrCreateAgentParams): Promise<Agent> {
    const {
      tenantId,
      locale,
      modelType = 'small',
      userContext,
      userId,
      agentType = 'Supervisor',
      memory,
      hooks,
    } = params;

    const cacheKey = this.buildCacheKey(params);
    const now = Date.now();

    // Check Redis for cached metadata (validates this config exists)
    const cached = await this.getCachedMeta(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT for agent ${cacheKey}`);
    }

    // Create agent (stateless - always recreated for consistency)
    const model = getMistralModel(modelType);
    let agent: Agent;

    const commonOptions = {
      model,
      prisma: this.prisma,
      locale,
      tenantId,
      hooks: hooks ?? undefined,
      userId,
      cacheService: this.cacheService,
    };

    // Phase 3: Agent Consolidation (10 -> 3)
    switch (agentType) {
      case 'Actions':
        agent = createActionsAgent({
          ...commonOptions,
          emailSendService: this.emailSendService ?? null,
          calendarService: this.calendarService ?? null,
          memory: memory ?? undefined,
          userContext: userContext ?? undefined,
          intent: params.intent, // RLM: Pass intent for minimal prompt loading
        });
        break;
      case 'Intelligence':
        agent = createIntelligenceAgent({
          ...commonOptions,
          mistral: this.mistralService ?? null,
          embeddingsService: this.embeddingsService ?? null,
          writingStyle: this.writingStyleService ?? null,
          memory: memory ?? undefined,
          piiDetectionService: this.piiDetectionService,
          emailInsightsService: this.emailInsightsService ?? null,
          userContext: userContext ?? undefined,
          aiMemoryService: this.aiMemoryService ?? null,
          intent: params.intent, // RLM: Pass intent for minimal prompt loading
        });
        break;
      case 'Supervisor':
      default:
        agent = createSupervisorAgent({
          ...commonOptions,
          emailSendService: this.emailSendService ?? null,
          calendarService: this.calendarService ?? null,
          memory: memory ?? undefined,
          mistralService: this.mistralService,
          embeddingsService: this.embeddingsService,
          userContext: userContext ?? undefined,
          configService: this.configService,
          documentLibraryService: this.documentLibraryService,
          followUpService: this.followUpService,
          piiDetectionService: this.piiDetectionService,
          emailInsightsService: this.emailInsightsService,
          aiMemoryService: this.aiMemoryService ?? null,
        });
        break;
    }

    // Cache metadata in Redis (not the agent instance)
    if (!cached) {
      await this.cacheMeta(cacheKey, {
        agentType,
        locale,
        modelType,
        tenantId,
        userId,
        createdAt: now,
      });
      this.logger.debug(`Created and cached agent metadata: ${cacheKey}`);
    }

    return agent;
  }

  /**
   * Clear all agent cache (admin only)
   * Invalidates entire AGENT_POOL namespace in Redis
   */
  async clearAgentCache(): Promise<number> {
    if (!this.cacheService) {
      this.logger.warn('CacheService not available, cannot clear agent cache');
      return 0;
    }
    const count = await this.cacheService.invalidateNamespace(CacheNamespace.AGENT_POOL);
    this.logger.log(`Cleared all agent cache: ${count} keys`);
    return count;
  }

  /**
   * Clear agent cache for a specific tenant (GDPR-compliant)
   * Uses SCAN for production safety (non-blocking)
   *
   * @param tenantId - Tenant ID to clear cache for
   * @returns Number of keys deleted
   */
  async clearAgentCacheForTenant(tenantId: string): Promise<number> {
    if (!this.cacheService) {
      this.logger.warn('CacheService not available, cannot clear tenant cache');
      return 0;
    }
    const count = await this.cacheService.invalidateTenantPattern(
      tenantId,
      CacheNamespace.AGENT_POOL,
    );
    this.logger.log(`[GDPR] Cleared agent cache for tenant ${tenantId}: ${count} keys`);
    return count;
  }

  /**
   * Clear agent cache for a specific user (GDPR Art. 17 - Right to Erasure)
   * Uses SCAN for production safety (non-blocking)
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID (email) to clear cache for
   * @returns Number of keys deleted
   */
  async clearAgentCacheForUser(tenantId: string, userId: string): Promise<number> {
    if (!this.cacheService) {
      this.logger.warn('CacheService not available, cannot clear user cache');
      return 0;
    }
    const count = await this.cacheService.invalidateUserPattern(
      tenantId,
      userId,
      CacheNamespace.AGENT_POOL,
    );
    this.logger.log(`[GDPR Art.17] Cleared agent cache for user ${userId} in tenant ${tenantId}: ${count} keys`);
    return count;
  }

  /**
   * Get cache statistics (for monitoring/debugging)
   * Note: With Redis-backed cache, we return config only (actual size requires SCAN)
   */
  getCacheStats(): { ttlSeconds: number; namespace: string } {
    return {
      ttlSeconds: this.AGENT_CACHE_TTL_SECONDS,
      namespace: CacheNamespace.AGENT_POOL,
    };
  }
}
