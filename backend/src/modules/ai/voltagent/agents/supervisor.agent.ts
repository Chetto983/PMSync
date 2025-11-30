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
  } = options;
  const t = getAgentTranslations(locale);

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
  return new Agent({
    name: 'SupervisorAgent',
    purpose: 'Intelligent email assistant coordinator',
    model,
    instructions: t.supervisor.instructions,
    subAgents: [emailAgent, calendarAgent, contactsAgent, knowledgeAgent, generalAgent],
    memory,
    hooks,
    maxSteps: 10,
  });
}
