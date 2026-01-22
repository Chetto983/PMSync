/**
 * Agent Pool Service - Manages VoltAgent lifecycle with TTL caching and LRU eviction.
 * MEMORY OPTIMIZATION: 1000 tenants share 5 agents = ~25MB instead of 500MB.
 * Created: 2026-01-22 (Refactored from VoltAgentService)
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Agent, Memory, AgentHooks } from '@voltagent/core';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { WritingStyleService } from './writing-style.service';
import { DocumentLibraryService } from './document-library.service';
import { FollowUpService } from './follow-up.service';
import { PiiDetectionService } from '../../guards';
import { createActionsAgent } from '../agents/actions.agent';
import { createIntelligenceAgent } from '../agents/intelligence.agent';
import { createSupervisorAgent, type UserContext } from '../agents/supervisor.agent';
import { getMistralModel, type MistralModel } from '../providers/mistral.provider';
import type { SupportedLocale } from '../locales';
import type { AgentType } from './model-router.service';

/** Cached agent with creation timestamp for TTL-based expiration */
export interface CachedAgent {
  agent: Agent;
  createdAt: number;
  lastUsed: number; // For LRU eviction
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
}

@Injectable()
export class AgentPoolService {
  private readonly logger = new Logger(AgentPoolService.name);
  private agents: Map<string, CachedAgent> = new Map();

  /** TTL for cached agents (5 minutes) - balances memory vs code reload */
  private readonly AGENT_CACHE_TTL_MS = 5 * 60 * 1000;

  /** Max agents (reduced from 100 to 5 for memory optimization) */
  private readonly MAX_CACHED_AGENTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly emailSendService?: EmailSendService,
    @Optional() private readonly calendarService?: CalendarService,
    @Optional() private readonly mistralService?: MistralService,
    @Optional() private readonly embeddingsService?: EmbeddingsService,
    @Optional() private readonly writingStyleService?: WritingStyleService,
    @Optional() private readonly documentLibraryService?: DocumentLibraryService,
    @Optional() private readonly followUpService?: FollowUpService,
    @Optional() private readonly piiDetectionService?: PiiDetectionService,
  ) {}

  /** Get or create agent with TTL caching. RAG services included when available. */
  getOrCreateAgent(params: GetOrCreateAgentParams): Agent {
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

    // Cache key includes userId if userContext is provided (personalized agents)
    // Fall back to locale+model for anonymous/system calls
    const userKey = userContext?.email ?? 'anonymous';
    // Use agentType in cache key to separate Supervisors from specialized agents
    const cacheKey = `${tenantId}:${userKey}:${locale}:${modelType}:${agentType}`;
    const now = Date.now();

    // Check if cached agent exists and is not expired
    const cached = this.agents.get(cacheKey);
    if (cached && (now - cached.createdAt) < this.AGENT_CACHE_TTL_MS) {
      // Update lastUsed for LRU tracking
      cached.lastUsed = now;
      return cached.agent;
    }

    // LRU eviction if at capacity
    if (this.agents.size >= this.MAX_CACHED_AGENTS) {
      this.evictLeastRecentlyUsedAgent();
    }

    // Create new agent (or replace expired one)
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
        });
        break;
    }

    // Cache with timestamps for TTL and LRU
    this.agents.set(cacheKey, { agent, createdAt: now, lastUsed: now });

    this.logger.debug(
      `Created ${agentType} agent for ${cacheKey}, cache size: ${this.agents.size}/${this.MAX_CACHED_AGENTS}`,
    );

    return agent;
  }

  /** Evict the least recently used agent from cache */
  private evictLeastRecentlyUsedAgent(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, cached] of this.agents.entries()) {
      if (cached.lastUsed < oldestTime) {
        oldestTime = cached.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.agents.delete(oldestKey);
      this.logger.debug(`Evicted LRU agent: ${oldestKey}`);
    }
  }

  /** Clear cached agents (useful for testing or config changes) */
  clearAgentCache(): void {
    this.agents.clear();
    this.logger.debug('Cleared agent cache');
  }

  /** Get current cache size (for monitoring/debugging) */
  getCacheSize(): number {
    return this.agents.size;
  }

  /** Get cache statistics (for monitoring/debugging) */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.agents.size,
      maxSize: this.MAX_CACHED_AGENTS,
      ttlMs: this.AGENT_CACHE_TTL_MS,
    };
  }
}
