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
 * Builds dynamic instructions with user context injected.
 */
export function buildDynamicInstructions(
  baseInstructions: string,
  userContext?: UserContext,
): string {
  if (!userContext) {
    return baseInstructions;
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
    return baseInstructions;
  }

  // Inject user context into instructions
  const userContextSection = `
## Current User Profile
You are assisting this user:
${userInfo.join('\n')}

IMPORTANT: Remember and use this information throughout the conversation. Address the user by name when appropriate.
`;

  return `${baseInstructions}\n${userContextSection}`;
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
