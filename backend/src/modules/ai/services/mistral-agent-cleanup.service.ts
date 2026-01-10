/**
 * Mistral Agent Cleanup Service
 *
 * GDPR-compliant cleanup of Mistral agents for tenant data deletion.
 * Consolidates deletion from both Mistral API and PostgreSQL.
 *
 * Called when:
 * - Tenant is deleted
 * - Subscription is cancelled
 * - GDPR erasure request is processed
 *
 * @see web-search.tools.ts - deleteTenantAgents()
 * @see analytics.tools.ts - deleteTenantAnalyticsAgents()
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { Mistral } from '@mistralai/mistralai';
import { ALL_MISTRAL_AGENT_TYPES, MistralAgentType } from '../voltagent/tools/agent-types';

interface CleanupResult {
  deleted: number;
  errors: string[];
  agentType: string;
}

interface TenantCleanupResult {
  tenantId: string;
  totalDeleted: number;
  totalErrors: number;
  results: CleanupResult[];
}

@Injectable()
export class MistralAgentCleanupService {
  private readonly logger = new Logger(MistralAgentCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create Mistral client for agent operations
   */
  private createMistralClient(): Mistral | null {
    const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
    if (!apiKey) {
      this.logger.warn('MISTRAL_API_KEY not configured, skipping Mistral API cleanup');
      return null;
    }
    return new Mistral({ apiKey });
  }

  /**
   * Delete all Mistral agents for a specific tenant and agent type.
   * Deletes from both Mistral API and PostgreSQL.
   *
   * @param tenantId - Tenant ID to cleanup
   * @param agentType - Type of agent (web-search, analytics)
   */
  async deleteAgentsByType(tenantId: string, agentType: string): Promise<CleanupResult> {
    const errors: string[] = [];
    let deleted = 0;

    // 1. Get all agents for this tenant and type from PostgreSQL
    const agents = await this.prisma.mistralAgent.findMany({
      where: { tenantId, agentType },
    });

    if (agents.length === 0) {
      this.logger.debug(`[GDPR] No ${agentType} agents found for tenant ${tenantId}`);
      return { deleted: 0, errors: [], agentType };
    }

    // 2. Delete each agent from Mistral API
    const client = this.createMistralClient();
    if (client) {
      for (const agent of agents) {
        try {
          await client.beta.agents.delete({ agentId: agent.agentId });
          deleted++;
          this.logger.log(`[GDPR] Deleted Mistral ${agentType} agent ${agent.agentId} for tenant ${tenantId}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          // 404 means already deleted - that's OK
          if (!msg.includes('404') && !msg.includes('not found')) {
            errors.push(`Failed to delete ${agentType} agent ${agent.agentId}: ${msg}`);
            this.logger.error(`[GDPR] Failed to delete Mistral ${agentType} agent ${agent.agentId}: ${msg}`);
          } else {
            deleted++; // Count as deleted if already gone
          }
        }
      }
    } else {
      // If no Mistral client, we can still clean up the DB records
      deleted = agents.length;
      this.logger.warn(`[GDPR] No Mistral client available, will only cleanup DB records for ${agentType}`);
    }

    // 3. Delete all records from PostgreSQL
    await this.prisma.mistralAgent.deleteMany({
      where: { tenantId, agentType },
    });

    this.logger.log(`[GDPR] ${agentType} cleanup complete for tenant ${tenantId}: ${deleted} agents deleted, ${errors.length} errors`);
    return { deleted, errors, agentType };
  }

  /**
   * GDPR: Delete ALL Mistral agents for a tenant (all types).
   * Call this when tenant is deleted or subscription is cancelled.
   *
   * @param tenantId - Tenant ID to cleanup
   * @returns Aggregated cleanup result
   */
  async deleteAllTenantAgents(tenantId: string): Promise<TenantCleanupResult> {
    this.logger.log(`[GDPR] Starting full Mistral agent cleanup for tenant ${tenantId}`);
    const results: CleanupResult[] = [];

    // Delete all agent types
    for (const agentType of ALL_MISTRAL_AGENT_TYPES) {
      const result = await this.deleteAgentsByType(tenantId, agentType);
      results.push(result);
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    this.logger.log(`[GDPR] Full Mistral cleanup complete for tenant ${tenantId}: ${totalDeleted} total agents deleted, ${totalErrors} errors`);

    return {
      tenantId,
      totalDeleted,
      totalErrors,
      results,
    };
  }

  /**
   * Convenience method: Delete only web-search agents
   */
  async deleteWebSearchAgents(tenantId: string): Promise<CleanupResult> {
    return this.deleteAgentsByType(tenantId, MistralAgentType.WEB_SEARCH);
  }

  /**
   * Convenience method: Delete only analytics agents
   */
  async deleteAnalyticsAgents(tenantId: string): Promise<CleanupResult> {
    return this.deleteAgentsByType(tenantId, MistralAgentType.ANALYTICS);
  }
}
