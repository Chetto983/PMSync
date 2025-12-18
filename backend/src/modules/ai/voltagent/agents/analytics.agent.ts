/**
 * Analytics Agent for VoltAgent
 *
 * Specialized agent for data analysis and visualization generation.
 * Uses Mistral's Agents API with code_interpreter tool for AI-powered analytics.
 *
 * Features:
 * - Data analysis using Python code execution
 * - Chart and visualization generation
 * - Cache for repeated analyses
 *
 * Architecture follows same pattern as websearch.agent.ts:
 * - Pooled Mistral agents (cached for 1 hour)
 * - VoltAgent tool integration
 */
import { Agent, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { ConfigService } from '@nestjs/config';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createAnalyticsTool } from '../tools/analytics.tools';
import { CacheService } from '../../../../common/services/cache.service';

export interface AnalyticsAgentOptions {
  model: LanguageModel;
  configService: ConfigService;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
  hooks?: AgentHooks;
  /** Optional: CacheService for Redis-based caching (multi-instance support) */
  cacheService?: CacheService;
}

/**
 * Creates an Analytics Agent for data analysis and visualization.
 *
 * This agent uses Mistral's beta Agents API with built-in code_interpreter tool
 * to analyze data and generate visualizations.
 */
export function createAnalyticsAgent(options: AnalyticsAgentOptions): Agent {
  const { model, configService, locale, tenantId, userId, hooks, cacheService } = options;
  const t = getAgentTranslations(locale);

  // Create analytics tool with Redis caching
  const analyticsTool = createAnalyticsTool({
    configService,
    locale,
    tenantId,
    userId,
    cacheService,
  });

  return new Agent({
    name: 'AnalyticsAgent',
    purpose: 'Analyze data, generate charts/visualizations, compute statistics. Use for: trends, graphs, data summaries, numerical analysis.',
    model,
    instructions: t.analytics.instructions,
    tools: [analyticsTool],
    hooks,
    maxSteps: 5, // Allow more steps for complex analyses
  });
}
