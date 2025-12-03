/**
 * Contacts Agent for VoltAgent
 *
 * Specialized agent for contact management operations.
 * Uses centralized locale system for instructions.
 */
import { Agent, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createContactsTools } from '../tools/contacts.tools';

export interface ContactsAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  locale: SupportedLocale;
  tenantId: string;
  hooks?: AgentHooks;
}

/**
 * Creates a Contacts Agent with all contact tools.
 */
export function createContactsAgent(options: ContactsAgentOptions): Agent {
  const { model, prisma, locale, tenantId, hooks } = options;
  const t = getAgentTranslations(locale);

  return new Agent({
    name: 'ContactsAgent',
    purpose: 'Handle contact operations including search, create, update, and delete',
    model,
    instructions: t.contacts.instructions,
    tools: createContactsTools(prisma, locale, tenantId),
    hooks,
    maxSteps: 5,
  });
}
