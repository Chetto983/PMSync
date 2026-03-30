import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { NBAService } from '../../crm/nba/nba.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

// ---- Schemas ----

const schemas = {
  get_deals_by_pipeline: z.object({
    pipelineId: z.string().describe('Pipeline ID to filter deals'),
    status: z
      .enum(['open', 'won', 'lost', 'all'])
      .optional()
      .describe('Filter by deal status (default: open)'),
    minAmount: z.number().optional().describe('Minimum deal amount'),
    maxAmount: z.number().optional().describe('Maximum deal amount'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max results (default: 20)'),
  }),
  move_deal_stage: z.object({
    dealId: z.string().describe('Deal ID to move'),
    targetStageId: z.string().describe('Target stage ID'),
  }),
  get_deal_timeline: z.object({
    dealId: z.string().describe('Deal ID to get timeline for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max activities (default: 20)'),
  }),
  get_next_best_action: z.object({
    dealId: z.string().describe('Deal ID to get recommended actions for'),
  }),
};

@Injectable()
export class CrmToolsService implements OnModuleInit {
  private readonly logger = new Logger(CrmToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nbaService: NBAService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      {
        name: 'get_deals_by_pipeline',
        description:
          'Search deals in a specific pipeline with optional filters',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.get_deals_by_pipeline,
      },
      {
        name: 'move_deal_stage',
        description:
          'Move a deal to a different stage within its pipeline',
        riskLevel: 'MEDIUM' as const,
        requiresApproval: true,
        inputSchema: schemas.move_deal_stage,
      },
      {
        name: 'get_deal_timeline',
        description:
          'Get the complete activity timeline for a deal',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.get_deal_timeline,
      },
      {
        name: 'get_next_best_action',
        description:
          'Get AI-recommended next best actions for a CRM deal',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.get_next_best_action,
      },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name,
        description: t.description,
        parameters: {},
        execute: noop,
        domain: 'productivity',
        riskLevel: t.riskLevel,
        requiresApproval: t.requiresApproval,
        inputSchema: t.inputSchema,
      });
    }
  }

  getTools(tenantId: string, _piiResolve: PiiResolveFn) {
    return {
      get_deals_by_pipeline: this.buildGetDealsByPipeline(tenantId),
      move_deal_stage: this.buildMoveDealStage(tenantId),
      get_deal_timeline: this.buildGetDealTimeline(tenantId),
      get_next_best_action: this.buildGetNextBestAction(tenantId),
    };
  }

  // ---- T-1007: getDealsByPipeline ----

  private buildGetDealsByPipeline(tenantId: string) {
    return tool({
      description:
        'Search deals in a specific CRM pipeline. ' +
        'Filter by status (open/won/lost/all) and amount range. ' +
        'Returns deal name, amount, stage, account, score, and dates.',
      inputSchema: schemas.get_deals_by_pipeline,
      execute: async (args) => {
        const {
          pipelineId,
          status = 'open',
          minAmount,
          maxAmount,
          limit = 20,
        } = args;

        // Verify pipeline exists for tenant
        const pipeline = await this.prisma.crmPipeline.findFirst({
          where: { id: pipelineId, tenantId },
          select: { id: true, name: true },
        });
        if (!pipeline) {
          return truncateToolResult({
            error: 'Pipeline not found or access denied',
          });
        }

        // Build where clause
        const where: Record<string, unknown> = {
          tenantId,
          pipelineId,
          deletedAt: null,
        };

        if (status === 'won') {
          where.stage = { isWon: true };
        } else if (status === 'lost') {
          where.stage = { isLost: true };
        } else if (status === 'open') {
          where.stage = { isWon: false, isLost: false };
        }

        if (minAmount !== undefined || maxAmount !== undefined) {
          const amountFilter: Record<string, unknown> = {};
          if (minAmount !== undefined) amountFilter.gte = minAmount;
          if (maxAmount !== undefined) amountFilter.lte = maxAmount;
          where.amount = amountFilter;
        }

        const deals = await this.prisma.crmDeal.findMany({
          where: where as any,
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            amount: true,
            currency: true,
            score: true,
            priority: true,
            expectedCloseDate: true,
            createdAt: true,
            stage: { select: { name: true, probability: true } },
            account: { select: { name: true } },
          },
        });

        return truncateToolResult({
          pipeline: pipeline.name,
          deals: deals.map((d) => ({
            id: d.id,
            name: d.name,
            amount: d.amount ? Number(d.amount) : null,
            currency: d.currency,
            stage: d.stage.name,
            probability: d.stage.probability,
            account: d.account?.name ?? null,
            score: d.score,
            priority: d.priority,
            expectedClose: d.expectedCloseDate?.toISOString() ?? null,
            created: d.createdAt.toISOString(),
          })),
          count: deals.length,
        });
      },
    });
  }

  // ---- T-1008: moveDealStage ----

  private buildMoveDealStage(tenantId: string) {
    return tool({
      description:
        'Move a CRM deal to a different stage within the same pipeline. ' +
        'Validates the target stage belongs to the same pipeline. ' +
        'Logs a STAGE_CHANGE activity. Requires user approval.',
      inputSchema: schemas.move_deal_stage,
      needsApproval: () => true,
      execute: async (args) => {
        const { dealId, targetStageId } = args;

        // Load deal with current stage
        const deal = await this.prisma.crmDeal.findFirst({
          where: { id: dealId, tenantId, deletedAt: null },
          select: {
            id: true,
            name: true,
            pipelineId: true,
            stageId: true,
            stage: { select: { name: true } },
          },
        });
        if (!deal) {
          return truncateToolResult({
            error: 'Deal not found or access denied',
          });
        }

        // Validate target stage is in same pipeline
        const targetStage = await this.prisma.crmStage.findFirst({
          where: { id: targetStageId, pipelineId: deal.pipelineId },
          select: { id: true, name: true, probability: true },
        });
        if (!targetStage) {
          return truncateToolResult({
            error: `Stage "${targetStageId}" not found in this pipeline. Use get_deals_by_pipeline first to see available stages.`,
          });
        }

        if (deal.stageId === targetStageId) {
          return truncateToolResult({
            message: `Deal "${deal.name}" is already in stage "${targetStage.name}"`,
          });
        }

        const fromStageName = deal.stage.name;

        // Move deal
        await this.prisma.crmDeal.update({
          where: { id: dealId },
          data: { stageId: targetStageId },
        });

        // Log activity
        await this.prisma.crmActivity.create({
          data: {
            tenantId,
            dealId,
            type: 'STAGE_CHANGE',
            content: `Moved from "${fromStageName}" to "${targetStage.name}"`,
            metadata: {
              fromStageId: deal.stageId,
              fromStageName,
              toStageId: targetStageId,
              toStageName: targetStage.name,
              source: 'ai_chat',
            },
          },
        });

        return truncateToolResult({
          status: 'moved',
          deal: deal.name,
          from: fromStageName,
          to: targetStage.name,
          probability: targetStage.probability,
        });
      },
    });
  }

  // ---- T-1308: getNextBestAction ----

  private buildGetNextBestAction(tenantId: string) {
    return tool({
      description:
        'Get AI-recommended next best actions for a CRM deal. ' +
        'Analyzes deal context (stage, engagement, churn risk, activity) ' +
        'and returns top 3 recommended actions with reasoning and impact scores.',
      inputSchema: schemas.get_next_best_action,
      execute: async (args) => {
        try {
          const result = await this.nbaService.getRecommendations(
            tenantId,
            args.dealId,
          );
          return truncateToolResult({
            deal: result.dealName,
            stage: result.stageName,
            recommendations: result.actions.map((a) => ({
              type: a.actionType,
              title: a.title,
              reasoning: a.reasoning,
              impact: `${a.expectedImpact}%`,
              confidence: `${Math.round(a.confidence * 100)}%`,
            })),
            count: result.actions.length,
          });
        } catch (err: any) {
          return truncateToolResult({
            error: err.message ?? 'Failed to get recommendations',
          });
        }
      },
    });
  }

  // ---- T-1009: getDealTimeline ----

  private buildGetDealTimeline(tenantId: string) {
    return tool({
      description:
        'Get the complete activity timeline for a CRM deal. ' +
        'Shows stage changes, notes, emails, calls, meetings, and tasks ' +
        'in chronological order.',
      inputSchema: schemas.get_deal_timeline,
      execute: async (args) => {
        const { dealId, limit = 20 } = args;

        // Verify deal access
        const deal = await this.prisma.crmDeal.findFirst({
          where: { id: dealId, tenantId, deletedAt: null },
          select: {
            id: true,
            name: true,
            stage: { select: { name: true } },
            createdAt: true,
          },
        });
        if (!deal) {
          return truncateToolResult({
            error: 'Deal not found or access denied',
          });
        }

        const activities = await this.prisma.crmActivity.findMany({
          where: { dealId },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            type: true,
            content: true,
            metadata: true,
            createdAt: true,
          },
        });

        return truncateToolResult({
          deal: deal.name,
          currentStage: deal.stage.name,
          created: deal.createdAt.toISOString(),
          activities: activities.map((a) => ({
            type: a.type,
            content: a.content,
            metadata: a.metadata,
            date: a.createdAt.toISOString(),
          })),
          count: activities.length,
        });
      },
    });
  }
}
