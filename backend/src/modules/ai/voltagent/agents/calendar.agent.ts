/**
 * Calendar Agent for VoltAgent
 *
 * Specialized agent for calendar operations.
 * Uses centralized locale system for instructions.
 */
import { Agent, type AgentHooks } from '@voltagent/core';
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
}

/**
 * Creates a Calendar Agent with all calendar tools.
 */
export function createCalendarAgent(options: CalendarAgentOptions): Agent {
  const { model, prisma, calendarService, cacheService, locale, tenantId, hooks } = options;
  const t = getAgentTranslations(locale);

  return new Agent({
    name: 'CalendarAgent',
    purpose: 'Handle calendar operations including events, scheduling, and availability',
    model,
    instructions: t.calendar.instructions,
    tools: createCalendarTools(prisma, calendarService, locale, tenantId, cacheService),
    hooks,
    maxSteps: 5,
  });
}
