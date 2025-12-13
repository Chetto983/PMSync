/**
 * Supervisor Agent for VoltAgent
 *
 * Orchestrates all specialized agents using VoltAgent's built-in supervisor pattern.
 * Analyzes user requests and delegates to the appropriate specialist agent.
 */
import { Agent, type Memory, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createCalendarAgent } from './calendar.agent';
import { createContactsAgent } from './contacts.agent';
import { createEmailAgent } from './email.agent';
import { createGeneralAgent } from './general.agent';
import { createKnowledgeAgent } from './knowledge.agent';

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
}

/**
 * User profile context passed to agent for personalization.
 * Combines user data and preferences for a complete user profile.
 */
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

  if (userInfo.length === 0) {
    return `${baseInstructions}\n${dateTimeSection}`;
  }

  // Inject user context into instructions
  const userContextSection = `
## Current User Profile
You are assisting this user:
${userInfo.join('\n')}

IMPORTANT: Remember and use this information throughout the conversation. Address the user by name when appropriate.
`;

  return `${baseInstructions}\n${dateTimeSection}\n${userContextSection}`;
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
  } = options;
  const t = getAgentTranslations(locale);

  // Build dynamic instructions with user context
  const dynamicInstructions = buildDynamicInstructions(t.supervisor.instructions, userContext);

  // Create all specialist agents with shared hooks for per-agent metrics
  const emailAgent = createEmailAgent({
    model,
    prisma,
    emailSendService,
    locale,
    tenantId,
    hooks,
  });

  const calendarAgent = createCalendarAgent({
    model,
    prisma,
    calendarService,
    locale,
    tenantId,
    hooks,
  });

  const contactsAgent = createContactsAgent({
    model,
    prisma,
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

  // Create the supervisor agent with all sub-agents
  // Memory is shared - tenant isolation is handled via userId format: tenantId:userId
  // Instructions include user context for personalization when available
  return new Agent({
    name: 'SupervisorAgent',
    purpose: 'Intelligent email assistant coordinator',
    model,
    instructions: dynamicInstructions,
    subAgents: [emailAgent, calendarAgent, contactsAgent, knowledgeAgent, generalAgent],
    memory,
    hooks,
    maxSteps: 10,
  });
}
