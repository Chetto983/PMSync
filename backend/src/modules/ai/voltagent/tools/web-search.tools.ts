/**
 * VoltAgent Web Search Tools
 *
 * AI-powered web search using Mistral's Agents API with web_search tool.
 * Enables real-time information retrieval from the web.
 *
 * Features:
 * - web_search: Search the web for current information
 * - Automatic citation extraction from sources
 * - Rate limiting and caching for cost efficiency
 *
 * Based on Mistral Agents API: https://docs.mistral.ai/agents/tools/built-in/websearch
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Mistral } from '@mistralai/mistralai';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { getToolTranslations, type SupportedLocale } from '../locales';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { AiError, AiErrorCode } from '../../errors';
import { MistralAgentType } from './agent-types';

const logger = new Logger('WebSearchTools');

/**
 * Web search result with citations
 */
interface WebSearchResult {
  answer: string;
  citations: Array<{
    title: string;
    url: string;
    source?: string;
  }>;
}

/**
 * Tool options for web search
 */
export interface WebSearchToolOptions {
  configService: ConfigService;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
  /** Optional: CacheService for Redis-based caching (multi-instance support) */
  cacheService?: CacheService;
  /** Required: PrismaClient for persistent agent storage */
  prisma: PrismaClient;
}

/** TTL for web search results: 15 minutes */
const WEB_CACHE_TTL_SEC = 15 * 60;

/**
 * Fallback in-memory cache when Redis is unavailable
 * Keys include tenantId:userId for GDPR isolation
 */
const fallbackSearchCache = new Map<string, { result: WebSearchResult; timestamp: number }>();
/** Agent pool keyed by locale:tenantId for tenant isolation (with TTL and max size) */
const fallbackAgentPool = new Map<string, { agentId: string; createdAt: number }>();

import { getAgentFromPool, setAgentInPool, clearAgentFromPool } from './agent-pool-cache';

/**
 * Build GDPR-compliant cache key with tenant and user isolation
 */
function buildSearchCacheKey(tenantId: string, userId: string | undefined, query: string): string {
  // Include userId when available for user-level isolation
  const userPart = userId || 'anonymous';
  return `${tenantId}:${userPart}:${query.toLowerCase().trim()}`;
}

/**
 * Get cached search result (Redis-first, fallback to memory)
 * GDPR: Cache keys include tenantId:userId for data isolation
 */
async function getCachedSearch(
  tenantId: string,
  userId: string | undefined,
  query: string,
  cacheService?: CacheService,
): Promise<WebSearchResult | null> {
  const key = buildSearchCacheKey(tenantId, userId, query);

  // Try Redis first
  if (cacheService?.isHealthy()) {
    const cached = await cacheService.get<WebSearchResult>(key, {
      namespace: CacheNamespace.WEB_SEARCH_RESULT,
    });
    if (cached) {
      logger.debug(`Redis cache hit for web search: ${query.substring(0, 30)}...`);
      return cached;
    }
  }

  // Fallback to memory
  const memCached = fallbackSearchCache.get(key);
  if (memCached && Date.now() - memCached.timestamp < WEB_CACHE_TTL_SEC * 1000) {
    logger.debug(`Memory cache hit for web search: ${query.substring(0, 30)}...`);
    return memCached.result;
  }
  fallbackSearchCache.delete(key);
  return null;
}

/**
 * Cache search result (Redis + memory fallback)
 * GDPR: Cache keys include tenantId:userId for data isolation
 */
async function setCachedSearch(
  tenantId: string,
  userId: string | undefined,
  query: string,
  result: WebSearchResult,
  cacheService?: CacheService,
): Promise<void> {
  const key = buildSearchCacheKey(tenantId, userId, query);

  // Store in Redis
  if (cacheService?.isHealthy()) {
    await cacheService.set(key, result, {
      ttl: WEB_CACHE_TTL_SEC,
      namespace: CacheNamespace.WEB_SEARCH_RESULT,
    });
  }

  // Also store in memory (for fallback and same-instance speed)
  if (fallbackSearchCache.size > 50) {
    const entries = Array.from(fallbackSearchCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 10; i++) {
      fallbackSearchCache.delete(entries[i][0]);
    }
  }
  fallbackSearchCache.set(key, { result, timestamp: Date.now() });
}

/**
 * Create Mistral client for web search
 */
function createMistralClient(configService: ConfigService): Mistral {
  const apiKey = configService.get<string>('MISTRAL_API_KEY');
  if (!apiKey) {
    throw new AiError('MISTRAL_API_KEY not configured', AiErrorCode.PROVIDER_ERROR, {
      retryable: false,
    });
  }
  return new Mistral({ apiKey });
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { status?: number; statusCode?: number; response?: { status?: number }; message?: string };
  const status = err.status ?? err.statusCode ?? err.response?.status;
  if (status === 404) return true;
  if (typeof err.message === 'string') {
    const msg = err.message.toLowerCase();
    return msg.includes('not found') || msg.includes('404');
  }
  return false;
}

async function safeDeleteRemoteAgent(client: Mistral, agentId: string, context: string): Promise<void> {
  try {
    await client.beta.agents.delete({ agentId });
  } catch (error) {
    if (!isNotFoundError(error)) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`[${context}] Failed to delete orphaned agent ${agentId}: ${msg}`);
    }
  }
}

async function persistAgentRecord(params: {
  prisma: PrismaClient;
  client: Mistral;
  tenantId: string;
  agentType: string;
  locale: SupportedLocale;
  agentId: string;
  model: string;
}): Promise<string> {
  const { prisma, client, tenantId, agentType, locale, agentId, model } = params;
  try {
    await prisma.mistralAgent.create({
      data: {
        tenantId,
        agentType,
        locale,
        agentId,
        model,
      },
    });
    return agentId;
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const existing = await prisma.mistralAgent.findUnique({
        where: {
          tenantId_agentType_locale: { tenantId, agentType, locale },
        },
      });
      if (existing) {
        await safeDeleteRemoteAgent(client, agentId, 'web-search');
        return existing.agentId;
      }
      await safeDeleteRemoteAgent(client, agentId, 'web-search');
    }
    throw error;
  }
}

/**
 * Build agent pool key with tenant isolation
 * GDPR: Each tenant gets their own agent to prevent cross-tenant context leakage
 */
function buildAgentPoolKey(locale: SupportedLocale, tenantId: string): string {
  return `${locale}:${tenantId}`;
}

/**
 * Verify an agent still exists in Mistral.
 * Returns the agent ID if valid, null if not found or error.
 */
async function verifyAgentExists(client: Mistral, agentId: string): Promise<boolean> {
  try {
    await client.beta.agents.get({ agentId });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.debug(`Agent ${agentId} no longer exists in Mistral, will create new`);
      return false;
    }
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Agent verification failed for ${agentId}, assuming it exists: ${msg}`);
    return true;
  }
}

/**
 * Get or create a reusable Mistral web search agent for the given locale and tenant.
 * Agents are PERSISTED in PostgreSQL (survives restarts) with verification.
 * GDPR: Agents are isolated per tenant to prevent cross-tenant context leakage.
 *
 * Storage hierarchy:
 * 1. PostgreSQL (primary, persistent) - survives restarts
 * 2. Memory cache (fast, per-instance) - avoids DB query on hot path
 *
 * IMPORTANT: This function VERIFIES cached agents still exist in Mistral before reusing.
 * This prevents orphaned agent IDs and unnecessary agent creation.
 */
async function getOrCreateWebSearchAgent(
  client: Mistral,
  locale: SupportedLocale,
  tenantId: string,
  configService: ConfigService,
  prisma: PrismaClient,
): Promise<string> {
  const cacheKey = buildAgentPoolKey(locale, tenantId);
  const agentType = MistralAgentType.WEB_SEARCH;

  // 1. Check memory cache first (fast path) - with TTL check
  const cachedAgentId = getAgentFromPool(fallbackAgentPool, cacheKey);
  if (cachedAgentId) {
    const exists = await verifyAgentExists(client, cachedAgentId);
    if (exists) {
      logger.debug(`Reusing memory-cached web search agent: ${cachedAgentId}`);
      return cachedAgentId;
    }
    // Agent gone from Mistral, clear memory cache
    clearAgentFromPool(fallbackAgentPool, cacheKey);
  }

  // 2. Check PostgreSQL (persistent storage)
  const dbAgent = await prisma.mistralAgent.findUnique({
    where: {
      tenantId_agentType_locale: { tenantId, agentType, locale },
    },
  });

  if (dbAgent) {
    const exists = await verifyAgentExists(client, dbAgent.agentId);
    if (exists) {
      logger.debug(`Reusing DB-stored web search agent: ${dbAgent.agentId} for ${locale}:${tenantId}`);
      // Update memory cache with TTL enforcement
      setAgentInPool(fallbackAgentPool, cacheKey, dbAgent.agentId);
      return dbAgent.agentId;
    }
    // Agent gone from Mistral, delete from DB
    logger.warn(`DB agent ${dbAgent.agentId} no longer exists in Mistral, deleting record`);
    await prisma.mistralAgent.delete({
      where: { id: dbAgent.id },
    });
  }

  // 3. Create new agent in Mistral
  logger.log(`Creating new web search agent for locale: ${locale}, tenant: ${tenantId}`);
  const startTime = Date.now();

  // Use fast model for web search (mistral-small-3-1)
  const model = configService.get<string>('AI_MODEL_SIMPLE') || 'mistral-small-latest';

  const agent = await client.beta.agents.create({
    model,
    name: `MailAgent Web Search (${locale})`,
    description: 'Agent for searching current information from the web',
    instructions: `You are a web search specialist for MailAgent, an AI-powered email management application.

<DOMAIN_CONTEXT>
You help users find current information relevant to their email workflow:
- Business contacts and company information
- Professional etiquette and email best practices
- Meeting scheduling, time zones, and calendar coordination
- Industry news and trends relevant to business communications
- Technical information for professional correspondence
</DOMAIN_CONTEXT>

<GROUNDING_RULES>
1. ONLY provide information found in search results - never fabricate
2. If no reliable source exists, explicitly state "I couldn't find verified information"
3. Always provide source URLs for verification
4. Indicate when information was published (if available)
5. For time-sensitive topics, warn if data may be outdated
</GROUNDING_RULES>

<OUTPUT_FORMAT>
- Keep answers concise and actionable
- Use bullet points for multiple findings
- Always cite sources with [Source: URL]
- Respond in ${locale === 'it' ? 'Italian' : 'English'}
</OUTPUT_FORMAT>`,
    tools: [{ type: 'web_search' }],
    completionArgs: {
      temperature: 0.3,
      topP: 0.95,
    },
  });

  const createTime = Date.now() - startTime;
  logger.log(`Web search agent created in ${createTime}ms: ${agent.id} for locale: ${locale}`);

  // 4. Save to PostgreSQL (persistent) with concurrency-safe create
  const persistedAgentId = await persistAgentRecord({
    prisma,
    client,
    tenantId,
    agentType,
    locale,
    agentId: agent.id,
    model,
  });

  // 5. Update memory cache with TTL and max size enforcement
  setAgentInPool(fallbackAgentPool, cacheKey, persistedAgentId);

  return persistedAgentId;
}

/**
 * Clear agent from cache (Redis + memory)
 * GDPR: Uses tenant-isolated cache key
 */
async function clearAgentFromCache(
  locale: SupportedLocale,
  tenantId: string,
  cacheService?: CacheService,
): Promise<void> {
  const cacheKey = buildAgentPoolKey(locale, tenantId);
  clearAgentFromPool(fallbackAgentPool, cacheKey);
  if (cacheService?.isHealthy()) {
    await cacheService.del(cacheKey, { namespace: CacheNamespace.WEB_SEARCH_AGENT });
  }
}

/**
 * Execute web search using Mistral Agents API
 *
 * Uses a pooled Mistral agent with web_search tool for real-time web information.
 * Agents are reused across requests for performance (~8s vs ~11s per request).
 * GDPR: Agent pool is tenant-isolated and agents are deleted on subscription cancellation.
 */
async function executeWebSearch(
  client: Mistral,
  query: string,
  locale: SupportedLocale,
  tenantId: string,
  configService: ConfigService,
  prisma: PrismaClient,
  cacheService?: CacheService,
): Promise<WebSearchResult> {
  try {
    // Get or create reusable agent (persisted in PostgreSQL, tenant-isolated)
    const agentId = await getOrCreateWebSearchAgent(client, locale, tenantId, configService, prisma);

    // Start conversation with the reusable agent
    const response = await client.beta.conversations.start({
      agentId,
      inputs: query,
    });

    // Parse response to extract answer and citations
    const result = parseWebSearchResponse(response);

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Web search failed: ${errorMsg}`);

    // If agent expired or invalid, clear cache and retry once
    if (isNotFoundError(error)) {
      logger.warn(`Agent expired, clearing cache for locale: ${locale}, tenant: ${tenantId}`);
      await clearAgentFromCache(locale, tenantId, cacheService);
    }

    throw AiError.fromError(error);
  }
}

/**
 * Parse Mistral conversation response to extract answer and citations
 */
function parseWebSearchResponse(response: unknown): WebSearchResult {
  const citations: WebSearchResult['citations'] = [];
  let answer = '';

  // Type guard for response structure
  if (!response || typeof response !== 'object') {
    return { answer: 'No response received', citations: [] };
  }

  const resp = response as Record<string, unknown>;

  // Handle different response formats from Mistral API
  if ('outputs' in resp && Array.isArray(resp.outputs)) {
    for (const output of resp.outputs) {
      if (output && typeof output === 'object') {
        const entry = output as Record<string, unknown>;

        // Message output contains the answer
        if (entry.type === 'message.output' && 'content' in entry) {
          const content = entry.content;
          if (Array.isArray(content)) {
            for (const chunk of content) {
              if (chunk && typeof chunk === 'object') {
                const c = chunk as Record<string, unknown>;
                if (c.type === 'text' && typeof c.text === 'string') {
                  answer += c.text;
                } else if (c.type === 'tool_reference') {
                  // Extract citation
                  citations.push({
                    title: typeof c.title === 'string' ? c.title : 'Unknown',
                    url: typeof c.url === 'string' ? c.url : '',
                    source: typeof c.source === 'string' ? c.source : undefined,
                  });
                }
              }
            }
          } else if (typeof content === 'string') {
            answer = content;
          }
        }
      }
    }
  }

  // Fallback: try to extract from simpler response format
  if (!answer && 'message' in resp && typeof resp.message === 'object' && resp.message) {
    const msg = resp.message as Record<string, unknown>;
    if (typeof msg.content === 'string') {
      answer = msg.content;
    }
  }

  return {
    answer: answer || 'No results found',
    citations: citations.filter((c) => c.url), // Only include citations with URLs
  };
}

/**
 * Format citations for display
 */
function formatCitations(
  citations: WebSearchResult['citations'],
  sourcesLabel: string,
): string {
  if (citations.length === 0) return '';

  const header = `\n\n📚 ${sourcesLabel}`;
  const formatted = citations.map((c, i) => `${i + 1}. [${c.title}](${c.url})`).join('\n');

  return `${header}\n${formatted}`;
}

/**
 * Create web search tool for VoltAgent
 *
 * Enables searching the web for current information using Mistral's Agents API.
 * GDPR: All caches are tenant/user isolated.
 */
export function createWebSearchTool(options: WebSearchToolOptions) {
  const { configService, locale, tenantId, userId, cacheService, prisma } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'web_search',
    description: t.webSearch.description,
    parameters: z.object({
      query: z
        .string()
        .min(3)
        .max(500)
        .describe(t.webSearch.queryDescription),
    }),
    execute: async ({ query }) => {
      logger.log(`[${tenantId}] Web search: "${query.substring(0, 50)}..."`);

      // Check cache first (Redis + memory fallback) - GDPR: tenant/user isolated
      const cached = await getCachedSearch(tenantId, userId, query, cacheService);
      if (cached) {
        return {
          success: true,
          answer: cached.answer,
          citations: cached.citations,
          fromCache: true,
        };
      }

      try {
        const client = createMistralClient(configService);
        // GDPR: Pass tenantId for agent pool isolation, prisma for persistent storage
        const result = await executeWebSearch(client, query, locale, tenantId, configService, prisma, cacheService);

        // Cache successful result (Redis + memory) - GDPR: tenant/user isolated
        await setCachedSearch(tenantId, userId, query, result, cacheService);

        // Format response with citations
        const formattedAnswer = result.answer + formatCitations(result.citations, t.webSearch.sources);

        return {
          success: true,
          answer: formattedAnswer,
          citations: result.citations,
          fromCache: false,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Web search failed for "${query}": ${errorMsg}`);

        return {
          success: false,
          error: t.webSearch.searchFailed(errorMsg),
          answer: null,
          citations: [],
        };
      }
    },
  });
}

/**
 * Create all web search tools
 */
export function createWebSearchTools(options: WebSearchToolOptions) {
  return [createWebSearchTool(options)];
}

/**
 * GDPR: Delete all Mistral agents for a tenant
 * Call this when subscription is cancelled or tenant is deleted.
 * This deletes agents from both Mistral API and PostgreSQL.
 */
export async function deleteTenantAgents(
  tenantId: string,
  configService: ConfigService,
  prisma: PrismaClient,
): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = [];
  let deleted = 0;
  const deletedIds: string[] = [];

  // 1. Get all agents for this tenant from PostgreSQL
  const agents = await prisma.mistralAgent.findMany({
    where: { tenantId, agentType: 'web-search' },
  });

  if (agents.length === 0) {
    logger.log(`[GDPR] No web-search agents found for tenant ${tenantId}`);
    return { deleted: 0, errors: [] };
  }

  // 2. Delete each agent from Mistral API
  const client = createMistralClient(configService);
  for (const agent of agents) {
    try {
      await client.beta.agents.delete({ agentId: agent.agentId });
      deleted++;
      deletedIds.push(agent.id);
      logger.log(`[GDPR] Deleted Mistral agent ${agent.agentId} for tenant ${tenantId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // 404 means already deleted - that's OK
      if (!msg.includes('404') && !msg.includes('not found')) {
        errors.push(`Failed to delete agent ${agent.agentId}: ${msg}`);
        logger.error(`[GDPR] Failed to delete Mistral agent ${agent.agentId}: ${msg}`);
      } else {
        deleted++; // Count as deleted if already gone
        deletedIds.push(agent.id);
      }
    }

    // Clear from memory cache
    const cacheKey = buildAgentPoolKey(agent.locale as SupportedLocale, tenantId);
    clearAgentFromPool(fallbackAgentPool, cacheKey);
  }

  // 3. Delete records from PostgreSQL for successfully deleted agents
  if (deletedIds.length > 0) {
    await prisma.mistralAgent.deleteMany({
      where: { id: { in: deletedIds } },
    });
  }

  logger.log(`[GDPR] Cleanup complete for tenant ${tenantId}: ${deleted} agents deleted, ${errors.length} errors`);
  return { deleted, errors };
}
