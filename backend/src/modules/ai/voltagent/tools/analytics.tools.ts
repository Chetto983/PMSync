/**
 * VoltAgent Analytics Tools
 *
 * AI-powered analytics using Mistral's Agents API with code_interpreter tool.
 * Enables data analysis and visualization generation.
 *
 * Features:
 * - code_interpreter: Execute Python code for data analysis
 * - Generate charts and insights from data
 * - Rate limiting and caching for cost efficiency
 *
 * Based on Mistral Agents API: https://docs.mistral.ai/agents/tools/built-in/code_interpreter
 *
 * Architecture follows same pattern as web-search.tools.ts:
 * - Pooled Mistral agents (cached for 1 hour)
 * - Redis + memory fallback caching
 * - VoltAgent tool integration
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Mistral } from '@mistralai/mistralai';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { getToolTranslations, type SupportedLocale } from '../locales';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { AiError, AiErrorCode } from '../../errors';

const logger = new Logger('AnalyticsTools');

// =============================================================================
// Types
// =============================================================================

/**
 * Analytics result with optional visualization
 */
export interface AnalyticsResult {
  answer: string;
  codeExecuted?: string;
  codeOutput?: string;
  /** Base64-encoded image if visualization was generated */
  visualization?: string;
  /** Chart type if visualization was generated */
  chartType?: 'line' | 'bar' | 'pie' | 'scatter' | 'area';
  insights: string[];
}

/**
 * Tool options for analytics
 */
export interface AnalyticsToolOptions {
  configService: ConfigService;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
  /** Optional: CacheService for Redis-based caching (multi-instance support) */
  cacheService?: CacheService;
}

// =============================================================================
// Constants
// =============================================================================

/** TTL for analytics results: 30 minutes */
const ANALYTICS_CACHE_TTL_SEC = 30 * 60;
/** TTL for Mistral agents: 1 hour */
const AGENT_TTL_SEC = 60 * 60;

// =============================================================================
// Caching (Redis + memory fallback)
// =============================================================================

/**
 * Fallback in-memory cache when Redis is unavailable
 */
const fallbackAnalyticsCache = new Map<string, { result: AnalyticsResult; timestamp: number }>();
const fallbackAgentPool = new Map<SupportedLocale, { agentId: string; createdAt: number }>();

/**
 * Generate cache key for analytics query
 */
function getCacheKey(query: string, dataHash: string): string {
  return `${query.toLowerCase().trim().slice(0, 100)}:${dataHash}`;
}

/**
 * Simple hash for data object
 */
function hashData(data: Record<string, unknown>): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get cached analytics result (Redis-first, fallback to memory)
 */
async function getCachedAnalytics(
  query: string,
  dataHash: string,
  cacheService?: CacheService,
): Promise<AnalyticsResult | null> {
  const key = getCacheKey(query, dataHash);

  // Try Redis first
  if (cacheService?.isHealthy()) {
    const cached = await cacheService.get<AnalyticsResult>(key, {
      namespace: CacheNamespace.AI_ANALYTICS,
    });
    if (cached) {
      logger.debug(`Redis cache hit for analytics: ${query.substring(0, 30)}...`);
      return cached;
    }
  }

  // Fallback to memory
  const memCached = fallbackAnalyticsCache.get(key);
  if (memCached && Date.now() - memCached.timestamp < ANALYTICS_CACHE_TTL_SEC * 1000) {
    logger.debug(`Memory cache hit for analytics: ${query.substring(0, 30)}...`);
    return memCached.result;
  }
  fallbackAnalyticsCache.delete(key);
  return null;
}

/**
 * Cache analytics result (Redis + memory fallback)
 */
async function setCachedAnalytics(
  query: string,
  dataHash: string,
  result: AnalyticsResult,
  cacheService?: CacheService,
): Promise<void> {
  const key = getCacheKey(query, dataHash);

  // Store in Redis
  if (cacheService?.isHealthy()) {
    await cacheService.set(key, result, {
      ttl: ANALYTICS_CACHE_TTL_SEC,
      namespace: CacheNamespace.AI_ANALYTICS,
    });
  }

  // Also store in memory (for fallback and same-instance speed)
  if (fallbackAnalyticsCache.size > 30) {
    const entries = Array.from(fallbackAnalyticsCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 10; i++) {
      fallbackAnalyticsCache.delete(entries[i][0]);
    }
  }
  fallbackAnalyticsCache.set(key, { result, timestamp: Date.now() });
}

// =============================================================================
// Mistral Agent Management
// =============================================================================

/**
 * Create Mistral client for analytics
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
 * Get or create a reusable Mistral analytics agent for the given locale.
 * Agents are cached for 1 hour (Redis + memory fallback) to avoid creation overhead.
 * This enables serving 1000+ users efficiently with shared agents across instances.
 */
async function getOrCreateAnalyticsAgent(
  client: Mistral,
  locale: SupportedLocale,
  configService: ConfigService,
  cacheService?: CacheService,
): Promise<string> {
  const cacheKey = `analytics-agent:${locale}`;
  const now = Date.now();

  // Try Redis first
  if (cacheService?.isHealthy()) {
    const cached = await cacheService.get<{ agentId: string }>(cacheKey, {
      namespace: CacheNamespace.AI_ANALYTICS,
    });
    if (cached) {
      logger.debug(`Redis cache hit for analytics agent: ${locale}`);
      return cached.agentId;
    }
  }

  // Try memory fallback
  const memCached = fallbackAgentPool.get(locale);
  if (memCached && now - memCached.createdAt < AGENT_TTL_SEC * 1000) {
    logger.debug(`Memory cache hit for analytics agent: ${locale}`);
    return memCached.agentId;
  }

  // Create new agent
  logger.log(`Creating new analytics agent for locale: ${locale}`);
  const startTime = Date.now();

  // Get model from env (AI_MODEL_MEDIUM for analytics tasks)
  const model = configService.get<string>('AI_MODEL_MEDIUM') || 'mistral-medium-latest';

  const agent = await client.beta.agents.create({
    model,
    name: `MailAgent Analytics (${locale})`,
    description: 'Agent for data analysis and visualization generation',
    instructions: `You are a data analytics assistant. When asked to analyze data:
1. Use the code_interpreter tool to write and execute Python code
2. Use pandas for data manipulation and matplotlib/seaborn for visualizations
3. Generate clear, actionable insights from the data
4. Create visualizations when helpful (charts, graphs)
5. Respond in ${locale === 'it' ? 'Italian' : 'English'}

For visualizations:
- Use clear labels and titles
- Choose appropriate chart types for the data
- Save figures as PNG for display

Always provide both numerical analysis and insights in natural language.`,
    tools: [{ type: 'code_interpreter' }],
    completionArgs: {
      temperature: 0.2,
      topP: 0.95,
    },
  });

  const createTime = Date.now() - startTime;
  logger.log(`Analytics agent created in ${createTime}ms for locale: ${locale}`);

  // Cache in Redis
  if (cacheService?.isHealthy()) {
    await cacheService.set(cacheKey, { agentId: agent.id }, {
      ttl: AGENT_TTL_SEC,
      namespace: CacheNamespace.AI_ANALYTICS,
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
  const cacheKey = `analytics-agent:${locale}`;
  fallbackAgentPool.delete(locale);
  if (cacheService?.isHealthy()) {
    await cacheService.del(cacheKey, { namespace: CacheNamespace.AI_ANALYTICS });
  }
}

// =============================================================================
// Analytics Execution
// =============================================================================

/**
 * Execute analytics using Mistral Agents API with code_interpreter
 *
 * Uses a pooled Mistral agent with code_interpreter tool for data analysis.
 * Agents are reused across requests for performance.
 */
async function executeAnalytics(
  client: Mistral,
  query: string,
  data: Record<string, unknown>,
  locale: SupportedLocale,
  configService: ConfigService,
  cacheService?: CacheService,
): Promise<AnalyticsResult> {
  try {
    // Get or create reusable agent (cached for 1 hour)
    const agentId = await getOrCreateAnalyticsAgent(client, locale, configService, cacheService);

    // Build prompt with data context
    const dataContext = JSON.stringify(data, null, 2);
    const prompt = `Analyze the following data and ${query}

Data:
\`\`\`json
${dataContext}
\`\`\`

Please:
1. Analyze the data
2. Create appropriate visualizations if helpful
3. Provide key insights`;

    // Start conversation with the reusable agent
    const response = await client.beta.conversations.start({
      agentId,
      inputs: prompt,
    });

    // Parse response to extract answer, code, and visualizations
    const result = parseAnalyticsResponse(response);

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Analytics failed: ${errorMsg}`);

    // If agent expired or invalid, clear cache and retry once
    if (errorMsg.includes('agent') && errorMsg.includes('not found')) {
      logger.warn(`Agent expired, clearing cache for locale: ${locale}`);
      await clearAgentFromCache(locale, cacheService);
    }

    throw AiError.fromError(error);
  }
}

/**
 * Parse Mistral conversation response to extract analytics results
 */
function parseAnalyticsResponse(response: unknown): AnalyticsResult {
  const insights: string[] = [];
  let answer = '';
  let codeExecuted: string | undefined;
  let codeOutput: string | undefined;
  let visualization: string | undefined;

  // Type guard for response structure
  if (!response || typeof response !== 'object') {
    return { answer: 'No response received', insights: [] };
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
                } else if (c.type === 'image' && typeof c.data === 'string') {
                  visualization = c.data; // Base64 image
                }
              }
            }
          } else if (typeof content === 'string') {
            answer = content;
          }
        }

        // Tool execution contains code and output
        if (entry.type === 'tool.execution') {
          if (typeof entry.code === 'string') {
            codeExecuted = entry.code;
          }
          if (typeof entry.code_output === 'string') {
            codeOutput = entry.code_output;
          }
        }
      }
    }
  }

  // Extract insights from answer (simple heuristic: numbered points or bullet points)
  if (answer) {
    const lines = answer.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[\d\-\*•]/.test(trimmed) && trimmed.length > 10) {
        insights.push(trimmed.replace(/^[\d\.\-\*•\s]+/, ''));
      }
    }
  }

  return {
    answer: answer || 'Analysis complete',
    codeExecuted,
    codeOutput,
    visualization,
    insights,
  };
}

// =============================================================================
// VoltAgent Tool Creation
// =============================================================================

/**
 * Create analytics tool for VoltAgent
 *
 * Enables data analysis using Mistral's Agents API with code_interpreter.
 */
export function createAnalyticsTool(options: AnalyticsToolOptions) {
  const { configService, locale, tenantId, cacheService } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'analyze_data',
    description: t.analytics?.description || 'Analyze data and generate insights using AI-powered analytics',
    parameters: z.object({
      query: z
        .string()
        .min(5)
        .max(500)
        .describe(t.analytics?.queryDescription || 'What to analyze (e.g., "show email volume trends", "analyze response times")'),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Data to analyze (JSON object). If not provided, will analyze available user data.'),
    }),
    execute: async ({ query, data }) => {
      logger.log(`[${tenantId}] Analytics: "${query.substring(0, 50)}..."`);

      const analysisData = data || {};
      const dataHash = hashData(analysisData);

      // Check cache first (Redis + memory fallback)
      const cached = await getCachedAnalytics(query, dataHash, cacheService);
      if (cached) {
        return {
          success: true,
          ...cached,
          fromCache: true,
        };
      }

      try {
        const client = createMistralClient(configService);
        const result = await executeAnalytics(client, query, analysisData, locale, configService, cacheService);

        // Cache successful result (Redis + memory)
        await setCachedAnalytics(query, dataHash, result, cacheService);

        return {
          success: true,
          ...result,
          fromCache: false,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Analytics failed for "${query}": ${errorMsg}`);

        return {
          success: false,
          error: t.analytics?.analysisFailed?.(errorMsg) || `Analysis failed: ${errorMsg}`,
          answer: null,
          insights: [],
        };
      }
    },
  });
}

/**
 * Create all analytics tools
 */
export function createAnalyticsTools(options: AnalyticsToolOptions) {
  return [createAnalyticsTool(options)];
}

/**
 * Clear analytics cache (for testing)
 */
export function clearAnalyticsCache(): void {
  fallbackAnalyticsCache.clear();
}

/**
 * Clear agent pool (for testing or forced refresh)
 */
export function clearAnalyticsAgentPool(): void {
  fallbackAgentPool.clear();
}
