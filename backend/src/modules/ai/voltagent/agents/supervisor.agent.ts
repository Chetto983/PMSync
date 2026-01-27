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
import { getAgentTranslations, getLocaleInstruction, type SupportedLocale } from '../locales';
// Phase 3: Consolidated agents (10 → 3)
import { createActionsAgent } from './actions.agent';
import { createIntelligenceAgent } from './intelligence.agent';
// Optional lazy-loaded agents (kept for specialized use cases)
import { createWebSearchAgent } from './websearch.agent';
import { createDocumentLibraryAgent } from './document-library.agent';
import { createAnalyticsAgent } from './analytics.agent';
import type { FollowUpService } from '../services/follow-up.service';
import { PiiDetectionService } from '../../guards';
import { EmailInsightsService } from '../../services/email-insights.service';
import { createAskUserTool } from '../tools/ask-user.tool';
// Note: VoltAgent guardrails not used - Sentinel protection applied at service level
// via PromptGuardService and PiiDetectionService in ChatRequestProcessor

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
  /** Optional: UnifiedKnowledgeAgent dependencies (simplified in AI refactor v2.0) */
  followUpService?: FollowUpService;
  /** Optional: PII detection for LLM redaction */
  piiDetectionService?: PiiDetectionService;
  /** Optional: EmailInsightsService for unified email analysis with DB persistence */
  emailInsightsService?: EmailInsightsService;
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
 * Adds locale instruction to force response language.
 * Replaces {{userContext.XXX}} template placeholders with actual values.
 */
export function buildDynamicInstructions(
  baseInstructions: string,
  userContext?: UserContext,
  locale?: string,
): string {
  // FIX Issue #3: Replace {{userContext.XXX}} template placeholders
  let instructions = baseInstructions;
  if (userContext) {
    instructions = instructions
      .replace(/\{\{userContext\.jobRole\}\}/g, userContext.jobRole || userContext.jobTitle || 'professional')
      .replace(/\{\{userContext\.jobTitle\}\}/g, userContext.jobTitle || 'professional')
      .replace(/\{\{userContext\.industry\}\}/g, userContext.industry || 'business')
      .replace(/\{\{userContext\.department\}\}/g, userContext.department || 'general')
      .replace(/\{\{userContext\.firstName\}\}/g, userContext.firstName || '')
      .replace(/\{\{userContext\.lastName\}\}/g, userContext.lastName || '')
      .replace(/\{\{userContext\.email\}\}/g, userContext.email || '')
      .replace(/\{\{userContext\.timezone\}\}/g, userContext.timezone || 'UTC')
      .replace(/\{\{userContext\.communicationStyle\}\}/g, userContext.communicationStyle || 'BALANCED');
  } else {
    // Replace with sensible defaults when no user context
    instructions = instructions
      .replace(/\{\{userContext\.jobRole\}\}/g, 'professional')
      .replace(/\{\{userContext\.jobTitle\}\}/g, 'professional')
      .replace(/\{\{userContext\.industry\}\}/g, 'business')
      .replace(/\{\{userContext\.department\}\}/g, 'general')
      .replace(/\{\{userContext\.firstName\}\}/g, '')
      .replace(/\{\{userContext\.lastName\}\}/g, '')
      .replace(/\{\{userContext\.email\}\}/g, '')
      .replace(/\{\{userContext\.timezone\}\}/g, 'UTC')
      .replace(/\{\{userContext\.communicationStyle\}\}/g, 'BALANCED');
  }

  // Always add current datetime section (even without user context)
  const currentDateTime = formatCurrentDateTime(userContext?.timezone);
  const dateTimeSection = `
## Current Date and Time
The current date and time is: ${currentDateTime}
Use this information when answering questions about "today", "tomorrow", "this week", scheduling, or any time-relative queries.
`;

  // Add locale instruction for response language (consolidated utility)
  const localeInstruction = locale ? getLocaleInstruction(locale as SupportedLocale) : '';

  if (!userContext) {
    return `${instructions}\n${dateTimeSection}${localeInstruction}`;
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
    return `${instructions}\n${dateTimeSection}${localeInstruction}`;
  }

  // Inject user context into instructions
  const userContextSection = userInfo.length > 0 ? `
## Current User Profile
You are assisting this user:
${userInfo.join('\n')}

IMPORTANT: Remember and use this information throughout the conversation. Address the user by name when appropriate.
` : '';

  return `${instructions}\n${dateTimeSection}${userContextSection}${providersSection}${localeInstruction}`;
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
    // followUpService, longTermMemoryService, deadlineService, actionItemService removed - AI refactor v2.0
    piiDetectionService,
    emailInsightsService,
  } = options;
  // Always use English prompts, locale only affects response language
  const t = getAgentTranslations('en');

  // Build dynamic instructions with user context + locale for response language
  const dynamicInstructions = buildDynamicInstructions(t.supervisor.instructions, userContext, locale);

  // Phase 3: Consolidated agents (10 → 3)
  // ActionsAgent handles ALL WRITE operations (send, reply, delete, create, update)
  // IntelligenceAgent handles ALL READ and ANALYSIS operations (search, list, analyze)
  // Optional lazy-loaded agents kept for specialized use cases

  // ActionsAgent - consolidated WRITE operations with HITL approval
  const actionsAgent = createActionsAgent({
    model,
    prisma,
    emailSendService,
    calendarService,
    cacheService,
    locale,
    tenantId,
    hooks,
    memory,
    userContext, // Pass userContext for current date/time awareness
  });

  // IntelligenceAgent - consolidated READ and ANALYSIS operations
  const intelligenceAgent = createIntelligenceAgent({
    model,
    prisma,
    mistral: mistralService ?? null,
    embeddingsService: embeddingsService ?? null,
    cacheService,
    locale,
    tenantId,
    userId,
    hooks,
    memory,
    piiDetectionService,
    emailInsightsService: emailInsightsService ?? null,
    userContext, // Pass userContext for current date/time awareness
  });

  // Start with core consolidated agents
  const subAgents = [actionsAgent, intelligenceAgent];

  if (configService) {
    const webSearchAgent = createWebSearchAgent({
      model,
      configService,
      locale,
      tenantId,
      userId,
      hooks,
      cacheService,
      memory,  // FIX: Pass memory for conversation persistence
      prisma,  // Required for persistent Mistral agent storage
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
      memory,  // FIX: Pass memory for conversation persistence
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
      memory,  // FIX: Pass memory for conversation persistence
      prisma,  // Required for persistent Mistral agent storage
    });
    subAgents.push(analyticsAgent);
  }

  // UnifiedKnowledgeAgent disabled - AI refactor v2.0 removed LongTermMemoryService dependencies
  // Future: Re-implement using EmailAnalysis and ActionQueue models
  console.log('[UnifiedKnowledgeAgent] Disabled - AI refactor v2.0');

  // Create ask_user_clarification tool for structured user input requests
  // This is more reliable than JSON blocks in text for Mistral models
  const askUserTool = createAskUserTool({ locale });

  // Create the supervisor agent with all sub-agents
  // Memory is shared - tenant isolation is handled via userId format: tenantId:userId
  // Instructions include user context for personalization when available
  return new Agent({
    name: 'SupervisorAgent',
    purpose: 'Intelligent email assistant coordinator',
    model,
    instructions: dynamicInstructions,
    tools: [askUserTool], // Supervisor-level tool for user clarification
    subAgents,
    memory,
    hooks,
    maxSteps: 5, // Reduced from 10 - faster responses, less LLM calls
    // NOTE: includeAgentsMemory: true for better performance (faster context, less LLM calls)
    // Internal messages (tool-delegate_task, tool-manage_email) are filtered by parts[].type
    // in ConversationManagementService.hasToolTypeParts() before displaying to users
    supervisorConfig: {
      includeAgentsMemory: true,
    },
    // Note: Guardrails applied at service level via Sentinel-powered
    // PromptGuardService and PiiDetectionService in ChatRequestProcessor
  });
}
