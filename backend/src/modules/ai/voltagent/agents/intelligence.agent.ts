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
import { getIntelligencePrompt } from '../prompts/intelligence.prompt';
import type { TaskIntent } from '../services/task-complexity-classifier.service';
import { createEmailTools } from '../tools/email.tools';
import { createEmailRLMTools } from '../tools/email-rlm.tools';
import { createFolderTools } from '../tools/folder.tools';
import { createContactsTools } from '../tools/contacts.tools';
import { createCalendarTools } from '../tools/calendar.tools';
import { createInsightTools } from '../tools/insights.tools';
import { createAskUserTool } from '../tools/ask-user.tool';
import { createMemoryTools } from '../tools/memory.tools';
import { PiiDetectionService } from '../../guards';
import { AIMemoryService } from '../services/ai-memory.service';

/**
 * Tool names that IntelligenceAgent uses (READ operations only)
 */
const INTELLIGENCE_TOOLS = [
  // Email read operations
  'list_emails',
  'search_emails',
  'count_emails',
  // RLM-style email tools (efficient two-step retrieval)
  'list_email_index',
  'get_email_content',
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
  /** AI Memory service for semantic search on user memories */
  aiMemoryService?: AIMemoryService | null;
  /** RLM: Detected intent for loading minimal prompt */
  intent?: TaskIntent;
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
    aiMemoryService,
    intent,
  } = options;

  // RLM Pattern: Load ONLY the relevant prompt based on detected intent
  // This reduces tokens by 60-80% compared to loading everything
  const basePrompt = getIntelligencePrompt(intent);
  // Add user context (date/time) for temporal queries
  const dynamicInstructions = buildDynamicInstructions(basePrompt, userContext, locale);

  // Create tools from factories
  // Pass RAG services for semantic search in search_emails
  const emailTools = createEmailTools(prisma, null, locale, tenantId, cacheService, {
    userId,
    mistralService: mistral ?? undefined,
    embeddingsService: embeddingsService ?? undefined,
  });
  // RLM-style email tools for efficient two-step retrieval (see plan for details)
  // Pass RAG services for semantic search in list_email_index(mode='search')
  const emailRLMTools = createEmailRLMTools(
    prisma,
    locale,
    tenantId,
    // Only pass RAG options if all services are available
    userId && mistral && embeddingsService
      ? { userId, mistralService: mistral, embeddingsService }
      : undefined,
  );
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
  const allTools = [...emailTools, ...emailRLMTools, ...folderTools, ...contactsTools, ...calendarTools, ...insightTools];
  const readTools = allTools.filter((tool) =>
    INTELLIGENCE_TOOLS.includes(tool.name as (typeof INTELLIGENCE_TOOLS)[number]),
  );

  // Add ask_user_clarification tool so sub-agent can request user input when needed
  const askUserTool = createAskUserTool({ locale });

  // Add memory tools for semantic search on user facts/notes
  const memoryTools = aiMemoryService
    ? createMemoryTools({ aiMemoryService, tenantId, userId })
    : [];

  return new Agent({
    name: 'IntelligenceAgent',
    purpose:
      'Search, read, and analyze: emails, contacts, calendar, folders. AI-powered analysis: summarization, sentiment, smart replies. For PEOPLE searches, use this agent - they are email correspondents!',
    model,
    instructions: dynamicInstructions,
    tools: [...readTools, ...memoryTools, askUserTool],
    hooks,
    memory,
    maxSteps: 4, // Analysis ops may need 3-4 steps for multi-source queries
  });
}
