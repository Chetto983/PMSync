/**
 * CRM Relationship Tools for VoltAgent
 *
 * Provides CRM relationship intelligence data via tool calls.
 * Returns contact relationship scores, interaction counts, and stale indicators.
 *
 * ARTIFACT-06: Frontend renderers display this structured data as CRM cards.
 *
 * Created: 2026-02-11 (Phase 17 - Rich Artifacts UI)
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Logger } from '@nestjs/common';
import type { RelationshipIntelligenceService } from '../services/relationship-intelligence.service';

const logger = new Logger('CrmTools');

/**
 * Creates CRM relationship tools for the VoltAgent unified agent.
 *
 * @param deps - Service dependencies
 * @param deps.relationshipIntelligenceService - CRM relationship intelligence service
 * @param tenantId - Tenant ID for data isolation
 */
export function createCrmTools(
  deps: { relationshipIntelligenceService: RelationshipIntelligenceService },
  tenantId: string,
) {
  return [
    createTool({
      name: 'get_relationship_stats',
      description: `Get CRM relationship statistics for contacts, including relationship scores, interaction frequency, and stale contacts.
Use this when the user asks about their contacts, relationship health, who they haven't talked to, or CRM stats.
Returns top contacts sorted by relationship score with interaction details.`,
      parameters: z.object({
        limit: z.number().optional().describe('Max contacts to return, default 10'),
      }),
      execute: async ({ limit = 10 }) => {
        try {
          const startTime = Date.now();

          // Fetch top contacts and stale contacts in parallel
          const [topContacts, staleContacts] = await Promise.all([
            deps.relationshipIntelligenceService.getTopContacts(tenantId, {
              limit: Math.min(limit, 50),
            }),
            deps.relationshipIntelligenceService.getStaleContacts(tenantId, {
              limit: 10,
            }),
          ]);

          const duration = Date.now() - startTime;
          logger.log(
            `[get_relationship_stats] top=${topContacts.length} stale=${staleContacts.length} duration=${duration}ms`,
          );

          // Calculate aggregate stats
          const scores = topContacts
            .map((c) => c.relationshipScore)
            .filter((s): s is number => s !== null);
          const averageScore =
            scores.length > 0
              ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
              : 0;

          const contacts = topContacts.map((c) => ({
            contactId: c.contactId,
            displayName: c.displayName,
            email: c.primaryEmail,
            relationshipScore: c.relationshipScore,
            lastInteraction: c.lastInteraction?.toISOString() ?? null,
            interactionCount: c.totalInteractions,
            staleDays: c.daysSinceContact,
            isStale: c.isStale,
          }));

          const staleCount = staleContacts.length;
          const summary =
            `${topContacts.length} contacts tracked` +
            (staleCount > 0 ? `, ${staleCount} need attention` : '');

          return {
            success: true,
            contacts,
            totalContacts: topContacts.length,
            averageScore,
            staleCount,
            summary,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`[get_relationship_stats] Failed: ${message}`);
          return { success: false, error: message };
        }
      },
    }),
  ];
}
