/**
 * Supervisor Agent for VoltAgent
 *
 * VoltAgent Simplification 2026-01-29:
 * - Single UnifiedAgent replaces multi-agent routing (5 agents → 1)
 * - 5x faster startup, 60%+ token reduction
 * - Dynamic tool loading based on intent
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
import { getLocaleInstruction, type SupportedLocale } from '../locales';
import { createUnifiedAgent } from './unified.agent';
import { PiiDetectionService } from '../../guards';
import { EmailInsightsService } from '../../services/email-insights.service';
import { AIMemoryService } from '../services/ai-memory.service';

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
  /** Optional: PII detection for LLM redaction */
  piiDetectionService?: PiiDetectionService;
  /** Optional: EmailInsightsService for unified email analysis with DB persistence */
  emailInsightsService?: EmailInsightsService;
  /** Optional: AIMemoryService for semantic search on user memories */
  aiMemoryService?: AIMemoryService | null;
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
    aiMemoryService,
  } = options;
  // VoltAgent Simplification 2026-01-29: Single UnifiedAgent replaces multi-agent routing
  // - Eliminates routing overhead (1 LLM call saved per request)
  // - 5x faster startup (100ms vs 500ms)
  // - 60%+ token reduction via intent-based module loading
  // - Better tool selection accuracy (fewer tools = better choices)
  return createUnifiedAgent({
    model,
    prisma,
    locale,
    tenantId,
    userId,
    memory,
    hooks,
    userContext,
    cacheService,
    emailSendService: emailSendService ?? null,
    calendarService: calendarService ?? null,
    mistralService: mistralService ?? null,
    embeddingsService: embeddingsService ?? null,
    emailInsightsService: emailInsightsService ?? null,
    documentLibraryService: documentLibraryService ?? null,
    aiMemoryService: aiMemoryService ?? null,
    piiDetectionService,
    configService,
    intent: 'unknown', // Will be determined at runtime by TaskComplexityClassifier
  });
}
