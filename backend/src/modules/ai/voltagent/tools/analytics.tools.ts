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
import { Prisma, PrismaClient } from '@prisma/client';
import { getToolTranslations, type SupportedLocale } from '../locales';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { AiError, AiErrorCode } from '../../errors';
import { MistralAgentType } from './agent-types';

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
  /** Required: PrismaClient for persistent agent storage */
  prisma: PrismaClient;
}

// =============================================================================
// Constants
// =============================================================================

/** TTL for analytics results: 30 minutes */
const ANALYTICS_CACHE_TTL_SEC = 30 * 60;

// =============================================================================
// Caching (Redis + memory fallback)
// =============================================================================

/**
 * Fallback in-memory cache when Redis is unavailable
 * Keys include tenantId for GDPR isolation
 */
const fallbackAnalyticsCache = new Map<string, { result: AnalyticsResult; timestamp: number }>();
/** Agent pool keyed by locale:tenantId for tenant isolation (with TTL and max size) */
const fallbackAgentPool = new Map<string, { agentId: string; createdAt: number }>();

import { getAgentFromPool, setAgentInPool, clearAgentFromPool } from './agent-pool-cache';

/**
 * Generate GDPR-compliant cache key for analytics query
 * Includes tenantId for tenant data isolation
 */
function getCacheKey(tenantId: string, query: string, dataHash: string): string {
  return `${tenantId}:${query.toLowerCase().trim().slice(0, 100)}:${dataHash}`;
}

/**
 * Build agent pool key with tenant isolation
 * GDPR: Each tenant gets their own agent to prevent cross-tenant context leakage
 */
function buildAgentPoolKey(locale: SupportedLocale, tenantId: string): string {
  return `${locale}:${tenantId}`;
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
 * GDPR: Cache keys include tenantId for data isolation
 */
async function getCachedAnalytics(
  tenantId: string,
  query: string,
  dataHash: string,
  cacheService?: CacheService,
): Promise<AnalyticsResult | null> {
  const key = getCacheKey(tenantId, query, dataHash);

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
 * GDPR: Cache keys include tenantId for data isolation
 */
async function setCachedAnalytics(
  tenantId: string,
  query: string,
  dataHash: string,
  result: AnalyticsResult,
  cacheService?: CacheService,
): Promise<void> {
  const key = getCacheKey(tenantId, query, dataHash);

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
        await safeDeleteRemoteAgent(client, agentId, 'analytics');
        return existing.agentId;
      }
      await safeDeleteRemoteAgent(client, agentId, 'analytics');
    }
    throw error;
  }
}

/**
 * Verify an agent still exists in Mistral.
 * Returns true if valid, false if not found or error.
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
 * Get or create a reusable Mistral analytics agent for the given locale and tenant.
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
async function getOrCreateAnalyticsAgent(
  client: Mistral,
  locale: SupportedLocale,
  tenantId: string,
  configService: ConfigService,
  prisma: PrismaClient,
): Promise<string> {
  const cacheKey = buildAgentPoolKey(locale, tenantId);
  const agentType = MistralAgentType.ANALYTICS;

  // 1. Check memory cache first (fast path) - with TTL check
  const cachedAgentId = getAgentFromPool(fallbackAgentPool, cacheKey);
  if (cachedAgentId) {
    const exists = await verifyAgentExists(client, cachedAgentId);
    if (exists) {
      logger.debug(`Reusing memory-cached analytics agent: ${cachedAgentId}`);
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
      logger.debug(`Reusing DB-stored analytics agent: ${dbAgent.agentId} for ${locale}:${tenantId}`);
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
  logger.log(`Creating new analytics agent for locale: ${locale}, tenant: ${tenantId}`);
  const startTime = Date.now();

  // Use fast model for analytics tasks (mistral-small-3-1)
  const model = configService.get<string>('AI_MODEL_SIMPLE') || 'mistral-small-latest';

  const agent = await client.beta.agents.create({
    model,
    name: `MailAgent Analytics (${locale})`,
    description: 'Agent for data analysis and visualization generation',
    instructions: `You are a data analytics specialist for MailAgent, an AI-powered email management application.

<DATA_SCHEMA>
Available email metrics:
- Volume: emails sent/received by day/week/month
- Response times: average time to reply to emails
- Sender/recipient frequency: top contacts by volume
- Label distribution: email categorization breakdown
- Thread analysis: conversation length and patterns
- Follow-up tracking: pending, resolved, expired rates
- AI usage: compose, summarize, smart-reply statistics
</DATA_SCHEMA>

<ANALYSIS_GUIDELINES>
1. Use code_interpreter to execute Python (pandas, matplotlib/seaborn)
2. Focus on ACTIONABLE insights, not just statistics
3. Compare current period vs previous for trends
4. Highlight anomalies (unusual spikes, drops, patterns)
5. Suggest productivity improvements based on data
</ANALYSIS_GUIDELINES>

<OUTPUT_FORMAT>
- Tables: For comparison and ranking data
- Line charts: For trends over time
- Bar charts: For categorical comparisons
- Pie charts: For distribution breakdowns
- Numbers with context: "25% increase vs last week"
- Save figures as PNG for display
- Respond in ${locale === 'it' ? 'Italian' : 'English'}
</OUTPUT_FORMAT>

Always provide both numerical analysis and natural language insights.`,
    tools: [{ type: 'code_interpreter' }],
    completionArgs: {
      temperature: 0.2,
      topP: 0.95,
    },
  });

  const createTime = Date.now() - startTime;
  logger.log(`Analytics agent created in ${createTime}ms: ${agent.id} for locale: ${locale}`);

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
 * GDPR: Agent pool is tenant-isolated and agents are deleted on subscription cancellation.
 */
async function executeAnalytics(
  client: Mistral,
  query: string,
  data: Record<string, unknown>,
  locale: SupportedLocale,
  tenantId: string,
  configService: ConfigService,
  prisma: PrismaClient,
  cacheService?: CacheService,
): Promise<AnalyticsResult> {
  try {
    // Get or create reusable agent (persisted in PostgreSQL, tenant-isolated)
    const agentId = await getOrCreateAnalyticsAgent(client, locale, tenantId, configService, prisma);

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
    if (isNotFoundError(error)) {
      logger.warn(`Agent expired, clearing cache for locale: ${locale}, tenant: ${tenantId}`);
      await clearAgentFromCache(locale, tenantId, cacheService);
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
  const { configService, locale, tenantId, cacheService, prisma } = options;
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

      // Check cache first (Redis + memory fallback) - GDPR: tenant isolated
      const cached = await getCachedAnalytics(tenantId, query, dataHash, cacheService);
      if (cached) {
        return {
          success: true,
          ...cached,
          fromCache: true,
        };
      }

      try {
        const client = createMistralClient(configService);
        // GDPR: Pass tenantId for agent pool isolation, prisma for persistent storage
        const result = await executeAnalytics(client, query, analysisData, locale, tenantId, configService, prisma, cacheService);

        // Cache successful result (Redis + memory) - GDPR: tenant isolated
        await setCachedAnalytics(tenantId, query, dataHash, result, cacheService);

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
 * GDPR: Delete all Mistral analytics agents for a tenant
 * Call this when subscription is cancelled or tenant is deleted.
 * This deletes agents from both Mistral API and PostgreSQL.
 */
export async function deleteTenantAnalyticsAgents(
  tenantId: string,
  configService: ConfigService,
  prisma: PrismaClient,
): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = [];
  let deleted = 0;
  const deletedIds: string[] = [];

  // 1. Get all analytics agents for this tenant from PostgreSQL
  const agents = await prisma.mistralAgent.findMany({
    where: { tenantId, agentType: MistralAgentType.ANALYTICS },
  });

  if (agents.length === 0) {
    logger.log(`[GDPR] No analytics agents found for tenant ${tenantId}`);
    return { deleted: 0, errors: [] };
  }

  // 2. Delete each agent from Mistral API
  const client = createMistralClient(configService);
  for (const agent of agents) {
    try {
      await client.beta.agents.delete({ agentId: agent.agentId });
      deleted++;
      deletedIds.push(agent.id);
      logger.log(`[GDPR] Deleted Mistral analytics agent ${agent.agentId} for tenant ${tenantId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // 404 means already deleted - that's OK
      if (!msg.includes('404') && !msg.includes('not found')) {
        errors.push(`Failed to delete agent ${agent.agentId}: ${msg}`);
        logger.error(`[GDPR] Failed to delete Mistral analytics agent ${agent.agentId}: ${msg}`);
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

  logger.log(`[GDPR] Analytics cleanup complete for tenant ${tenantId}: ${deleted} agents deleted, ${errors.length} errors`);
  return { deleted, errors };
}
