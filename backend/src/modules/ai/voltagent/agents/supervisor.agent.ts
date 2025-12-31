/**
 * Supervisor Agent for VoltAgent
 *
 * Orchestrates all specialized agents using VoltAgent's built-in supervisor pattern.
 * Analyzes user requests and delegates to the appropriate specialist agent.
 */
import { Agent, type Memory, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { CacheService } from '../../../../common/services/cache.service';
import { DocumentLibraryService } from '../services/document-library.service';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createCalendarAgent } from './calendar.agent';
import { createContactsAgent } from './contacts.agent';
import { createEmailAgent } from './email.agent';
import { createGeneralAgent } from './general.agent';
import { createKnowledgeAgent } from './knowledge.agent';
import { createWebSearchAgent } from './websearch.agent';
import { createDocumentLibraryAgent } from './document-library.agent';
import { createAnalyticsAgent } from './analytics.agent';
import { createUnifiedKnowledgeAgent } from './unified-knowledge.agent';
import type { LongTermMemoryService } from '../memory/long-term-memory.service';
import type { DeadlineExtractorService } from '../services/deadline-extractor.service';
import type { FollowUpService } from '../services/follow-up.service';
import type { ActionItemService } from '../services/action-item.service';

export interface SupervisorAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  emailSendService: EmailSendService | null;
  calendarService: CalendarService | null;
  locale: SupportedLocale;
  tenantId: string;
  memory?: Memory;
  hooks?: AgentHooks;
  /** Optional: MistralService for RAG embeddings */
  mistralService?: MistralService;
  /** Optional: EmbeddingsService for RAG vector search */
  embeddingsService?: EmbeddingsService;
  /** Optional: User context for personalization */
  userContext?: UserContext;
  /** Optional: ConfigService for web search agent */
  configService?: ConfigService;
  /** Optional: User ID for web search context */
  userId?: string;
  /** Optional: CacheService for Redis-based caching (multi-instance support) */
  cacheService?: CacheService;
  /** Optional: DocumentLibraryService for document RAG */
  documentLibraryService?: DocumentLibraryService;
  /** Optional: UnifiedKnowledgeAgent dependencies */
  longTermMemoryService?: LongTermMemoryService;
  deadlineService?: DeadlineExtractorService;
  followUpService?: FollowUpService;
  actionItemService?: ActionItemService;
}

/**
 * User profile context passed to agent for personalization.
 * Combines user data and preferences for a complete user profile.
 */
/**
 * Connected email/calendar provider info for AI context.
 */
export interface ConnectedProvider {
  providerType: string; // 'GOOGLE', 'MICROSOFT', 'IMAP'
  email: string;
  displayName?: string; // Custom name like 'Work Gmail', 'Personal Outlook'
  scope?: string; // Purpose: 'WORK', 'PERSONAL', 'LEGAL', 'INFO', etc.
  supportsEmail: boolean;
  supportsCalendar: boolean;
  supportsContacts: boolean;
  isDefault: boolean;
}

export interface UserContext {
  // Basic user info
  firstName?: string;
  lastName?: string;
  email: string;
  role?: string;
  // Work context from user_preferences
  jobTitle?: string;
  jobRole?: string;
  department?: string;
  industry?: string;
  companySize?: string;
  // Communication preferences
  communicationStyle?: string;
  responseLength?: string;
  language?: string;
  timezone?: string;
  // Connected providers (email/calendar accounts)
  connectedProviders?: ConnectedProvider[];
}

/**
 * Format current datetime for a specific timezone.
 * Returns a human-readable date/time string.
 */
function formatCurrentDateTime(timezone?: string): string {
  const now = new Date();
  const tz = timezone || 'UTC';

  try {
    // Format date in user's timezone
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const formattedDate = dateFormatter.format(now);
    const formattedTime = timeFormatter.format(now);

    return `${formattedDate} at ${formattedTime} (${tz})`;
  } catch {
    // Fallback if timezone is invalid
    return now.toISOString();
  }
}

/**
 * Builds dynamic instructions with user context injected.
 * Includes current datetime in the user's timezone for temporal awareness.
 */
export function buildDynamicInstructions(
  baseInstructions: string,
  userContext?: UserContext,
): string {
  // Always add current datetime section (even without user context)
  const currentDateTime = formatCurrentDateTime(userContext?.timezone);
  const dateTimeSection = `
## Current Date and Time
The current date and time is: ${currentDateTime}
Use this information when answering questions about "today", "tomorrow", "this week", scheduling, or any time-relative queries.
`;

  if (!userContext) {
    return `${baseInstructions}\n${dateTimeSection}`;
  }

  // Build user profile section
  const userInfo: string[] = [];

  // Name
  if (userContext.firstName || userContext.lastName) {
    const fullName = [userContext.firstName, userContext.lastName].filter(Boolean).join(' ');
    userInfo.push(`- Name: ${fullName}`);
  }

  // Email
  if (userContext.email) {
    userInfo.push(`- Email: ${userContext.email}`);
  }

  // Job info
  if (userContext.jobTitle) {
    userInfo.push(`- Job Title: ${userContext.jobTitle}`);
  }
  if (userContext.department) {
    userInfo.push(`- Department: ${userContext.department}`);
  }
  if (userContext.industry) {
    userInfo.push(`- Industry: ${userContext.industry}`);
  }

  // Communication style
  if (userContext.communicationStyle) {
    const styleMap: Record<string, string> = {
      'CASUAL': 'casual and friendly',
      'FORMAL': 'formal and professional',
      'BALANCED': 'balanced mix of formal and casual',
    };
    userInfo.push(`- Preferred communication style: ${styleMap[userContext.communicationStyle] || userContext.communicationStyle}`);
  }

  // Response length
  if (userContext.responseLength) {
    const lengthMap: Record<string, string> = {
      'CONCISE': 'brief and to the point',
      'MODERATE': 'moderate detail',
      'DETAILED': 'comprehensive and detailed',
    };
    userInfo.push(`- Preferred response length: ${lengthMap[userContext.responseLength] || userContext.responseLength}`);
  }

  // Timezone
  if (userContext.timezone) {
    userInfo.push(`- Timezone: ${userContext.timezone}`);
  }

  // Build connected providers section
  let providersSection = '';
  if (userContext.connectedProviders && userContext.connectedProviders.length > 0) {
    const providerLines: string[] = [];
    for (const provider of userContext.connectedProviders) {
      const providerLabel = provider.displayName || provider.email;
      const typeLabel = provider.providerType === 'GOOGLE' ? 'Gmail' :
        provider.providerType === 'MICROSOFT' ? 'Outlook/Microsoft 365' :
          provider.providerType === 'IMAP' ? 'IMAP' : provider.providerType;
      const capabilities: string[] = [];
      if (provider.supportsEmail) capabilities.push('email');
      if (provider.supportsCalendar) capabilities.push('calendar');
      if (provider.supportsContacts) capabilities.push('contacts');
      const defaultLabel = provider.isDefault ? ' (default)' : '';
      const scopeLabel = provider.scope ? ` [${provider.scope}]` : '';
      providerLines.push(`- ${providerLabel}${defaultLabel}${scopeLabel}: ${typeLabel} (${capabilities.join(', ')})`);
    }
    providersSection = `
## Connected Email Accounts
The user has the following email/calendar accounts connected:
${providerLines.join('\n')}

Use this information when the user asks about their email accounts, mentions specific providers (Gmail, Outlook), or references accounts by name or scope (Work, Personal, Legal, Info, etc.).
`;
  }

  if (userInfo.length === 0 && !providersSection) {
    return `${baseInstructions}\n${dateTimeSection}`;
  }

  // Inject user context into instructions
  const userContextSection = userInfo.length > 0 ? `
## Current User Profile
You are assisting this user:
${userInfo.join('\n')}

IMPORTANT: Remember and use this information throughout the conversation. Address the user by name when appropriate.
` : '';

  return `${baseInstructions}\n${dateTimeSection}${userContextSection}${providersSection}`;
}

/**
 * Creates a Supervisor Agent that coordinates all specialized agents.
 *
 * The supervisor uses VoltAgent's built-in delegation pattern:
 * - Analyzes the user's request
 * - Delegates to the appropriate specialist agent
 * - Combines results when multiple agents are needed
 */
export function createSupervisorAgent(options: SupervisorAgentOptions): Agent {
  const {
    model,
    prisma,
    emailSendService,
    calendarService,
    locale,
    tenantId,
    memory,
    hooks,
    mistralService,
    embeddingsService,
    userContext,
    configService,
    userId,
    cacheService,
    documentLibraryService,
    longTermMemoryService,
    deadlineService,
    followUpService,
    actionItemService,
  } = options;
  const t = getAgentTranslations(locale);

  // Build dynamic instructions with user context
  const dynamicInstructions = buildDynamicInstructions(t.supervisor.instructions, userContext);

  // Create all specialist agents with shared hooks for per-agent metrics
  // Pass cacheService for Redis-based metadata caching (multi-instance support)
  const emailAgent = createEmailAgent({
    model,
    prisma,
    emailSendService,
    mistral: mistralService,
    embeddingsService,  // Enable semantic email search via RAG
    cacheService,
    locale,
    tenantId,
    userId,
    hooks,
  });

  const calendarAgent = createCalendarAgent({
    model,
    prisma,
    calendarService,
    cacheService,
    locale,
    tenantId,
    hooks,
  });

  const contactsAgent = createContactsAgent({
    model,
    prisma,
    cacheService,
    locale,
    tenantId,
    hooks,
  });

  // Knowledge agent with optional RAG services for HybridRetriever
  const knowledgeAgent = createKnowledgeAgent({
    model,
    prisma,
    locale,
    tenantId,
    hooks,
    mistralService,
    embeddingsService,
  });

  const generalAgent = createGeneralAgent({
    model,
    locale,
    hooks,
  });

  // Web Search agent - only create if configService is provided
  const subAgents = [emailAgent, calendarAgent, contactsAgent, knowledgeAgent, generalAgent];

  if (configService) {
    const webSearchAgent = createWebSearchAgent({
      model,
      configService,
      locale,
      tenantId,
      userId,
      hooks,
      cacheService,
    });
    subAgents.push(webSearchAgent);

  }

  // Document Library agent - only create if documentLibraryService is provided
  if (documentLibraryService) {
    const documentLibraryAgent = createDocumentLibraryAgent({
      model,
      documentLibraryService,
      locale,
      tenantId,
      userId,
      hooks,
    });
    subAgents.push(documentLibraryAgent);
  }

  // Analytics agent - only create if configService is provided (uses Mistral Agents API)
  if (configService) {
    const analyticsAgent = createAnalyticsAgent({
      model,
      configService,
      locale,
      tenantId,
      userId,
      hooks,
      cacheService,
    });
    subAgents.push(analyticsAgent);
  }

  // UnifiedKnowledgeAgent - only create if all required services are available
  // Debug: Log dependency availability for troubleshooting
  console.debug('[UnifiedKnowledgeAgent] Dependencies check:', {
    longTermMemoryService: !!longTermMemoryService,
    deadlineService: !!deadlineService,
    followUpService: !!followUpService,
    actionItemService: !!actionItemService,
    userId: !!userId,
    mistralService: !!mistralService,
    embeddingsService: !!embeddingsService,
  });
  // UnifiedKnowledgeAgent - only create if long-term memory service is enabled
  const memoryEnabled = longTermMemoryService?.isEnabled?.() ?? false;
  console.log('[UnifiedKnowledgeAgent] memoryEnabled=' + memoryEnabled + ', longTermMemoryService=' + !!longTermMemoryService);
  if (userId && memoryEnabled && mistralService && embeddingsService) {
    // Create placeholder services if not provided (graceful degradation)
    const safeDeadlineService = deadlineService ?? {
      getUpcomingDeadlines: async () => [],
      extractDeadlines: async () => [],
    };
    const safeFollowUpService = followUpService ?? {
      getPendingFollowUps: async () => [],
      getOverdueFollowUps: async () => [],
    };
    const safeActionItemService = actionItemService ?? {
      getOpenActionItems: async () => [],
      getActionItems: async () => [],
    };

    const unifiedKnowledgeAgent = createUnifiedKnowledgeAgent({
      model,
      prisma,
      locale,
      tenantId,
      userId,
      hooks,
      longTermMemory: longTermMemoryService!,
      deadlineService: (deadlineService ?? safeDeadlineService) as DeadlineExtractorService,
      followUpService: (followUpService ?? safeFollowUpService) as FollowUpService,
      actionItemService: (actionItemService ?? safeActionItemService) as ActionItemService,
      mistralService,
      embeddingsService,
    });
    subAgents.push(unifiedKnowledgeAgent);
    console.debug('[UnifiedKnowledgeAgent] Created successfully');
  } else {
    console.warn('[UnifiedKnowledgeAgent] Not created - memoryEnabled=' + memoryEnabled + ', userId=' + !!userId + ' (requires MISTRAL_API_KEY)');
  }

  // Create the supervisor agent with all sub-agents
  // Memory is shared - tenant isolation is handled via userId format: tenantId:userId
  // Instructions include user context for personalization when available
  return new Agent({
    name: 'SupervisorAgent',
    purpose: 'Intelligent email assistant coordinator',
    model,
    instructions: dynamicInstructions,
    subAgents,
    memory,
    hooks,
    maxSteps: 10,
  });
}
