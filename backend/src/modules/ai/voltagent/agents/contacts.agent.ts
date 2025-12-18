/**
 * Contacts Agent for VoltAgent
 *
 * Specialized agent for contact management operations.
 * Uses centralized locale system for instructions.
 */
import { Agent, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createContactsTools } from '../tools/contacts.tools';

export interface ContactsAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  cacheService?: CacheService;
  locale: SupportedLocale;
  tenantId: string;
  hooks?: AgentHooks;
}

/**
 * Creates a Contacts Agent with all contact tools.
 */
export function createContactsAgent(options: ContactsAgentOptions): Agent {
  const { model, prisma, cacheService, locale, tenantId, hooks } = options;
  const t = getAgentTranslations(locale);

  return new Agent({
    name: 'ContactsAgent',
    purpose: 'VERIFY recipient emails exist before sending. Search, create, update, delete contacts. ALWAYS check here first when sending email or creating calendar events with attendees.',
    model,
    instructions: t.contacts.instructions,
    tools: createContactsTools(prisma, locale, tenantId, cacheService),
    hooks,
    maxSteps: 5,
  });
}
