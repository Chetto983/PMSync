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
import { getToolTranslations, type SupportedLocale } from '../locales';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { AiError, AiErrorCode } from '../../errors';

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
}

/** TTL for web search results: 15 minutes */
const WEB_CACHE_TTL_SEC = 15 * 60;
/** TTL for Mistral agents: 1 hour */
const AGENT_TTL_SEC = 60 * 60;

/**
 * Fallback in-memory cache when Redis is unavailable
 */
const fallbackSearchCache = new Map<string, { result: WebSearchResult; timestamp: number }>();
const fallbackAgentPool = new Map<SupportedLocale, { agentId: string; createdAt: number }>();

/**
 * Get cached search result (Redis-first, fallback to memory)
 */
async function getCachedSearch(
  query: string,
  cacheService?: CacheService,
): Promise<WebSearchResult | null> {
  const key = query.toLowerCase().trim();

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
 */
async function setCachedSearch(
  query: string,
  result: WebSearchResult,
  cacheService?: CacheService,
): Promise<void> {
  const key = query.toLowerCase().trim();

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

/**
 * Get or create a reusable Mistral web search agent for the given locale.
 * Agents are cached for 1 hour (Redis + memory fallback) to avoid creation overhead.
 * This enables serving 1000+ users efficiently with shared agents across instances.
 */
async function getOrCreateWebSearchAgent(
  client: Mistral,
  locale: SupportedLocale,
  configService: ConfigService,
  cacheService?: CacheService,
): Promise<string> {
  const cacheKey = `agent:${locale}`;
  const now = Date.now();

  // Try Redis first
  if (cacheService?.isHealthy()) {
    const cached = await cacheService.get<{ agentId: string }>(cacheKey, {
      namespace: CacheNamespace.WEB_SEARCH_AGENT,
    });
    if (cached) {
      logger.debug(`Redis cache hit for web search agent: ${locale}`);
      return cached.agentId;
    }
  }

  // Try memory fallback
  const memCached = fallbackAgentPool.get(locale);
  if (memCached && now - memCached.createdAt < AGENT_TTL_SEC * 1000) {
    logger.debug(`Memory cache hit for web search agent: ${locale}`);
    return memCached.agentId;
  }

  // Create new agent
  logger.log(`Creating new web search agent for locale: ${locale}`);
  const startTime = Date.now();

  // Get model from env (AI_MODEL_MEDIUM for web search tasks)
  const model = configService.get<string>('AI_MODEL_MEDIUM') || 'mistral-medium-latest';

  const agent = await client.beta.agents.create({
    model,
    name: `MailAgent Web Search (${locale})`,
    description: 'Agent for searching current information from the web',
    instructions: `You are a helpful search assistant. When asked a question:
1. Search the web for relevant, current information
2. Provide a clear, concise answer based on the search results
3. Always cite your sources
4. If the information is time-sensitive, mention when it was last updated
5. Respond in ${locale === 'it' ? 'Italian' : 'English'}`,
    tools: [{ type: 'web_search' }],
    completionArgs: {
      temperature: 0.3,
      topP: 0.95,
    },
  });

  const createTime = Date.now() - startTime;
  logger.log(`Web search agent created in ${createTime}ms for locale: ${locale}`);

  // Cache in Redis
  if (cacheService?.isHealthy()) {
    await cacheService.set(cacheKey, { agentId: agent.id }, {
      ttl: AGENT_TTL_SEC,
      namespace: CacheNamespace.WEB_SEARCH_AGENT,
    });
  }

  // Cache in memory fallback
  fallbackAgentPool.set(locale, {
    agentId: agent.id,
    createdAt: now,
  });

  return agent.id;
}

/**
 * Clear agent from cache (Redis + memory)
 */
async function clearAgentFromCache(
  locale: SupportedLocale,
  cacheService?: CacheService,
): Promise<void> {
  const cacheKey = `agent:${locale}`;
  fallbackAgentPool.delete(locale);
  if (cacheService?.isHealthy()) {
    await cacheService.del(cacheKey, { namespace: CacheNamespace.WEB_SEARCH_AGENT });
  }
}

/**
 * Execute web search using Mistral Agents API
 *
 * Uses a pooled Mistral agent with web_search tool for real-time web information.
 * Agents are reused across requests for performance (~8s vs ~11s per request).
 */
async function executeWebSearch(
  client: Mistral,
  query: string,
  locale: SupportedLocale,
  configService: ConfigService,
  cacheService?: CacheService,
): Promise<WebSearchResult> {
  try {
    // Get or create reusable agent (cached for 1 hour)
    const agentId = await getOrCreateWebSearchAgent(client, locale, configService, cacheService);

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
    if (errorMsg.includes('agent') && errorMsg.includes('not found')) {
      logger.warn(`Agent expired, clearing cache for locale: ${locale}`);
      await clearAgentFromCache(locale, cacheService);
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
 */
export function createWebSearchTool(options: WebSearchToolOptions) {
  const { configService, locale, tenantId, cacheService } = options;
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

      // Check cache first (Redis + memory fallback)
      const cached = await getCachedSearch(query, cacheService);
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
        const result = await executeWebSearch(client, query, locale, configService, cacheService);

        // Cache successful result (Redis + memory)
        await setCachedSearch(query, result, cacheService);

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
 * Clear web search cache (for testing)
 */
export function clearWebSearchCache(): void {
  fallbackSearchCache.clear();
}

/**
 * Clear agent pool (for testing or forced refresh)
 */
export function clearAgentPool(): void {
  fallbackAgentPool.clear();
}
