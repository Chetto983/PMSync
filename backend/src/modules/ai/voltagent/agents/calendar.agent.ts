/**
 * Calendar Agent for VoltAgent
 *
 * Specialized agent for calendar operations.
 * Uses centralized locale system for instructions.
 */
import { Agent, type AgentHooks, type Memory } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createCalendarTools } from '../tools/calendar.tools';

export interface CalendarAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  calendarService: CalendarService | null;
  cacheService?: CacheService;
  locale: SupportedLocale;
  tenantId: string;
  hooks?: AgentHooks;
  /** VoltAgent memory for conversation persistence */
  memory?: Memory;
}

/**
 * Creates a Calendar Agent with all calendar tools.
 */
export function createCalendarAgent(options: CalendarAgentOptions): Agent {
  const { model, prisma, calendarService, cacheService, locale, tenantId, hooks, memory } = options;
  // Always use English prompts - locale only affects response language
  const t = getAgentTranslations('en');
  const localeInstruction = locale !== 'en' ? `\n\nIMPORTANT: Respond in ${locale === 'it' ? 'Italian' : locale}.` : '';

  return new Agent({
    name: 'CalendarAgent',
    purpose: 'Handle calendar operations including events, scheduling, and availability. NOTE: For events WITH ATTENDEES, verify via ContactsAgent FIRST.',
    model,
    instructions: t.calendar.instructions + localeInstruction,
    tools: createCalendarTools(prisma, calendarService, locale, tenantId, cacheService),
    hooks,
    memory,
    maxSteps: 5,
  });
}
