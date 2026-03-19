/**
 * FollowUpToolsService -- Follow-up management tools for the AI chat pipeline.
 *
 * Tools: list_follow_ups, update_follow_up
 *
 * Phase 87 Plan 04: Split from ProductivityToolsService for RULE-3 compliance.
 */
import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { FollowUpStatus } from '@prisma/client';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

const followUpSchemas = {
  list_follow_ups: z.object({
    status: z.enum(['PENDING', 'REMINDED', 'RESOLVED', 'EXPIRED']).optional().describe('Filter by status'),
    limit: z.number().min(1).max(20).optional().describe('Max results (default 10)'),
  }),
  update_follow_up: z.object({
    followUpId: z.string().describe('Follow-up ID'),
    action: z.enum(['resolve', 'snooze', 'reopen']).describe('Action to take'),
    snoozeDays: z.number().min(1).max(30).optional().describe('Days to snooze'),
  }),
};

@Injectable()
export class FollowUpToolsService implements OnModuleInit {
  private readonly logger = new Logger(FollowUpToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      { name: 'list_follow_ups', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: followUpSchemas.list_follow_ups },
      { name: 'update_follow_up', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: followUpSchemas.update_follow_up },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name, description: t.name, parameters: {}, execute: noop,
        domain: 'productivity', riskLevel: t.riskLevel, requiresApproval: t.requiresApproval, inputSchema: t.inputSchema,
      });
    }
  }

  getTools(tenantId: string, userId: string) {
    return {
      list_follow_ups: this.buildListFollowUps(tenantId, userId),
      update_follow_up: this.buildUpdateFollowUp(tenantId, userId),
    };
  }

  private buildListFollowUps(tenantId: string, userId: string) {
    return tool({
      description:
        'List pending follow-ups. Shows emails needing action or waiting for response. ' +
        'Use for "what do I need to follow up on", "my follow-ups", "pending tasks", ' +
        '"what needs my attention", "any overdue items".',
      inputSchema: followUpSchemas.list_follow_ups,
      execute: async (args) => {
        try {
          const limit = args.limit ?? 10;
          const statusFilter = args.status
            ? [args.status as FollowUpStatus]
            : [FollowUpStatus.PENDING, FollowUpStatus.REMINDED];

          const followUps = await this.prisma.emailFollowUp.findMany({
            where: {
              tenantId,
              userId,
              status: { in: statusFilter },
            },
            include: {
              email: {
                select: {
                  id: true,
                  subject: true,
                  from: true,
                  receivedAt: true,
                  aiPriority: true,
                  aiSentiment: true,
                },
              },
            },
            orderBy: { dueDate: 'asc' },
            take: limit,
          });

          const items = followUps.map((followUp) => ({
            followUpId: followUp.id,
            status: followUp.status.toLowerCase(),
            reason: followUp.reason,
            dueDate: followUp.dueDate?.toISOString() ?? null,
            emailType: followUp.followUpType ?? null,
            confidence: followUp.confidence,
            remindCount: followUp.remindCount,
            lastRemindedAt: followUp.lastRemindedAt?.toISOString() ?? null,
            email: {
              id: followUp.email?.id ?? followUp.emailId,
              subject: followUp.email?.subject ?? null,
              from: followUp.email?.from ?? '',
              receivedAt: followUp.email?.receivedAt?.toISOString() ?? null,
              aiPriority: followUp.email?.aiPriority ?? null,
              aiSentiment: followUp.email?.aiSentiment ?? null,
            },
          }));

          return truncateToolResult({
            count: items.length,
            followUps: items,
            message: items.length === 0 ? 'No follow-ups found.' : undefined,
          });
        } catch (error) {
          this.logger.warn(
            `list_follow_ups failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return {
            error: 'Failed to list follow-ups',
            count: 0,
            followUps: [],
          };
        }
      },
    });
  }

  private buildUpdateFollowUp(tenantId: string, userId: string) {
    return tool({
      description:
        'Update a follow-up: resolve, snooze, or reopen. ' +
        'Use when user says "mark as done", "snooze for 3 days", "resolve follow-up", "reopen".',
      inputSchema: followUpSchemas.update_follow_up,
      execute: async ({ followUpId, action, snoozeDays }) => {
        try {
          const where = { id: followUpId, tenantId, userId };

          if (action === 'resolve') {
            const result = await this.prisma.emailFollowUp.updateMany({
              where,
              data: {
                status: FollowUpStatus.RESOLVED,
                resolvedAt: new Date(),
              },
            });

            if (result.count === 0) {
              return { error: 'Follow-up not found' };
            }

            return { success: true, followUpId, action: 'resolved' };
          }

          if (action === 'snooze') {
            const days = snoozeDays ?? 3;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + days);
            dueDate.setHours(9, 0, 0, 0);

            const result = await this.prisma.emailFollowUp.updateMany({
              where,
              data: {
                dueDate,
                status: FollowUpStatus.PENDING,
                remindCount: 0,
              },
            });

            if (result.count === 0) {
              return { error: 'Follow-up not found' };
            }

            return {
              success: true,
              followUpId,
              action: 'snoozed',
              newDueDate: dueDate.toISOString(),
            };
          }

          if (action === 'reopen') {
            const result = await this.prisma.emailFollowUp.updateMany({
              where,
              data: {
                status: FollowUpStatus.PENDING,
                resolvedAt: null,
              },
            });

            if (result.count === 0) {
              return { error: 'Follow-up not found' };
            }

            return { success: true, followUpId, action: 'reopened' };
          }

          return { error: `Unknown action: ${action}` };
        } catch (error) {
          this.logger.warn(
            `update_follow_up failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { error: 'Failed to update follow-up' };
        }
      },
    });
  }
}
