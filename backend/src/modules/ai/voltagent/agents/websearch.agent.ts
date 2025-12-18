/**
 * Web Search Agent for VoltAgent
 *
 * Specialized agent for searching current information from the web.
 * Uses Mistral's Agents API with web_search tool for real-time information.
 *
 * Features:
 * - Real-time web search via Mistral Agents API
 * - Automatic source citation
 * - Cache for repeated queries
 */
import { Agent, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { ConfigService } from '@nestjs/config';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createWebSearchTool } from '../tools/web-search.tools';
import { CacheService } from '../../../../common/services/cache.service';

export interface WebSearchAgentOptions {
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
 * Creates a Web Search Agent for finding current information online.
 *
 * This agent uses Mistral's beta Agents API with built-in web_search tool
 * to retrieve up-to-date information from the web.
 */
export function createWebSearchAgent(options: WebSearchAgentOptions): Agent {
  const { model, configService, locale, tenantId, userId, hooks, cacheService } = options;
  const t = getAgentTranslations(locale);

  // Create web search tool with Redis caching
  const webSearchTool = createWebSearchTool({
    configService,
    locale,
    tenantId,
    userId,
    cacheService,
  });

  return new Agent({
    name: 'WebSearchAgent',
    purpose: 'Search CURRENT/REAL-TIME information from the web. Use ONLY for: news, weather, live data, public facts. NEVER use for people names (Borello, Mario, etc.) - those are email correspondents, use EmailAgent instead!',
    model,
    instructions: t.webSearch.instructions,
    tools: [webSearchTool],
    hooks,
    maxSteps: 3,
  });
}
