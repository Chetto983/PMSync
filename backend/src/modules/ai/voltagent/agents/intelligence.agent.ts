/**
 * Intelligence Agent for VoltAgent
 *
 * Consolidated agent handling ALL READ operations and AI-powered analysis
 * across email, calendar, contacts, and knowledge sources.
 * Non-destructive operations - no HITL approval required.
 *
 * Part of Phase 3: Agent Consolidation (10 → 3 agents)
 * Created: 2026-01-10
 */
import { Agent, type AgentHooks, type Memory } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { EmailInsightsService } from '../../services/email-insights.service';
import { WritingStyleService } from '../services/writing-style.service';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { buildDynamicInstructions, type UserContext } from './supervisor.agent';
import { createEmailTools } from '../tools/email.tools';
import { createFolderTools } from '../tools/folder.tools';
import { createContactsTools } from '../tools/contacts.tools';
import { createCalendarTools } from '../tools/calendar.tools';
import { createInsightTools } from '../tools/insights.tools';
import { PiiDetectionService } from '../../guards';

/**
 * Tool names that IntelligenceAgent uses (READ operations only)
 */
const INTELLIGENCE_TOOLS = [
  // Email read operations
  'list_emails',
  'search_emails',
  'count_emails',
  // Folder read operations
  'list_folders',
  // Contact read operations (includes manage_contact for 'get' action)
  'search_contacts',
  'manage_contact', // for 'get' action only - instructions guide usage
  // Calendar read operations (includes manage_event for 'check_availability')
  'get_events',
  'manage_event', // for 'check_availability' action only - instructions guide usage
  // AI analysis tools
  'analyze_email',
  'compose_reply',
  'semantic_search_emails',
] as const;

export interface IntelligenceAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  mistral: MistralService | null;
  embeddingsService?: EmbeddingsService | null;
  writingStyle?: WritingStyleService | null;
  cacheService?: CacheService;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
  hooks?: AgentHooks;
  /** VoltAgent memory for conversation persistence */
  memory?: Memory;
  /** Optional PII detection for LLM redaction */
  piiDetectionService?: PiiDetectionService;
  /** EmailInsightsService for unified email analysis with DB persistence */
  emailInsightsService?: EmailInsightsService | null;
  /** User context for personalization and current date/time */
  userContext?: UserContext;
}

/**
 * Creates an Intelligence Agent with all READ and ANALYSIS tools consolidated.
 * Handles: email search/list/count, folder list, contact search, calendar view, AI analysis.
 * Non-destructive operations - no HITL approval required.
 */
export function createIntelligenceAgent(options: IntelligenceAgentOptions): Agent {
  const {
    model,
    prisma,
    mistral,
    embeddingsService,
    writingStyle,
    cacheService,
    locale,
    tenantId,
    userId,
    hooks,
    memory,
    piiDetectionService,
    emailInsightsService,
    userContext,
  } = options;

  // Always use English prompts - locale only affects response language
  const t = getAgentTranslations('en');
  // Build instructions with current date/time for temporal queries
  const dynamicInstructions = buildDynamicInstructions(t.intelligence.instructions, userContext, locale);

  // Create tools from factories
  // Pass RAG services for semantic search in search_emails
  const emailTools = createEmailTools(prisma, null, locale, tenantId, cacheService, {
    userId,
    mistralService: mistral ?? undefined,
    embeddingsService: embeddingsService ?? undefined,
  });
  const folderTools = createFolderTools(prisma, locale, tenantId, cacheService);
  const contactsTools = createContactsTools(prisma, locale, tenantId, cacheService);
  const calendarTools = createCalendarTools(prisma, null, locale, tenantId, cacheService);

  // Add insight tools if mistral service is available (for AI analysis)
  const insightTools = mistral
    ? createInsightTools({
        prisma,
        mistral,
        embeddingsService: embeddingsService ?? undefined,
        writingStyle: writingStyle ?? undefined,
        cacheService,
        locale,
        tenantId,
        userId,
        piiDetectionService,
        emailInsightsService: emailInsightsService ?? undefined,
      })
    : [];

  // Combine all tools and filter to READ operations only
  const allTools = [...emailTools, ...folderTools, ...contactsTools, ...calendarTools, ...insightTools];
  const readTools = allTools.filter((tool) =>
    INTELLIGENCE_TOOLS.includes(tool.name as (typeof INTELLIGENCE_TOOLS)[number]),
  );

  return new Agent({
    name: 'IntelligenceAgent',
    purpose:
      'Search, read, and analyze: emails, contacts, calendar, folders. AI-powered analysis: summarization, sentiment, smart replies. For PEOPLE searches, use this agent - they are email correspondents!',
    model,
    instructions: dynamicInstructions,
    tools: readTools,
    hooks,
    memory,
    maxSteps: 4, // Analysis ops may need 3-4 steps for multi-source queries
  });
}
