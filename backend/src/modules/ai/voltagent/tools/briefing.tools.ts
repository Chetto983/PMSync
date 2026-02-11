/**
 * Daily Briefing Tools for VoltAgent
 *
 * Provides structured daily briefing data via tool calls.
 * Returns email stats, follow-ups, deadlines, action items, and calendar overview.
 *
 * ARTIFACT-05: Frontend renderers display this structured data as interactive cards.
 *
 * Created: 2026-02-11 (Phase 17 - Rich Artifacts UI)
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Logger } from '@nestjs/common';
import type { DailyBriefingService } from '../services/daily-briefing.service';

const logger = new Logger('BriefingTools');

/**
 * Creates briefing tools for the VoltAgent unified agent.
 *
 * @param deps - Service dependencies
 * @param deps.dailyBriefingService - Daily briefing service for generating briefings
 * @param tenantId - Tenant ID for data isolation
 * @param userId - User ID for briefing generation
 */
export function createBriefingTools(
  deps: { dailyBriefingService: DailyBriefingService },
  tenantId: string,
  userId?: string,
) {
  return [
    createTool({
      name: 'get_daily_briefing',
      description: `Get the user's daily briefing with email summary, follow-up status, deadlines, action items, and calendar overview.
Returns a structured briefing object with stats, highlights, urgent items, and aggregated AI secretary data.
Use this when the user asks for their briefing, daily summary, inbox overview, or "what's new today".`,
      parameters: z.object({}),
      execute: async () => {
        if (!userId) {
          return { success: false, error: 'User context required for daily briefing.' };
        }

        try {
          const startTime = Date.now();
          const briefing = await deps.dailyBriefingService.generateBriefingOnDemand(
            tenantId,
            userId,
          );
          const duration = Date.now() - startTime;
          logger.log(`[get_daily_briefing] Generated in ${duration}ms for user ${userId}`);

          return {
            success: true,
            ...briefing,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`[get_daily_briefing] Failed: ${message}`);
          return { success: false, error: message };
        }
      },
    }),
  ];
}
