import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { ForecastService } from '../../crm/forecasting/forecast.service';
import { GovernanceService } from '../../crm/governance/governance.service';
import { ModelRetrainService } from '../../crm/governance/model-retrain.service';
import { TimeRange } from '../../crm/governance/dto/governance.dto';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

// ---- Schemas ----

const schemas = {
  get_lead_score: z.object({
    contactId: z.string().describe('Contact ID to fetch lead score for'),
  }),
  list_top_leads: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max results (default: 10)'),
    minScore: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Minimum score filter'),
  }),
  get_revenue_forecast: z.object({
    pipelineId: z.string().describe('Pipeline ID to forecast'),
    period: z
      .enum(['monthly', 'quarterly'])
      .optional()
      .describe('Forecast period (default: quarterly)'),
  }),
  get_churn_risk: z.object({
    contactId: z.string().optional().describe('Contact ID to check'),
    accountId: z.string().optional().describe('Account ID to check'),
  }),
  list_churn_at_risk: z.object({
    level: z
      .enum(['high', 'medium', 'low'])
      .optional()
      .describe('Filter by risk level'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max results (default: 10)'),
  }),
  get_ai_costs: z.object({
    range: z
      .enum(['7d', '30d', '90d'])
      .optional()
      .describe('Time range (default: 30d)'),
  }),
  get_model_performance: z.object({
    modelType: z
      .string()
      .optional()
      .describe('Filter by model type (e.g. lead_scoring, churn_prediction, forecast)'),
  }),
};

function scoreTier(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

@Injectable()
export class CrmIntelligenceToolsService implements OnModuleInit {
  private readonly logger = new Logger(CrmIntelligenceToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly forecastService: ForecastService,
    private readonly governanceService: GovernanceService,
    private readonly modelRetrainService: ModelRetrainService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      {
        name: 'get_lead_score',
        description: 'Get lead score and breakdown for a contact',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.get_lead_score,
      },
      {
        name: 'list_top_leads',
        description: 'List contacts ranked by lead score',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.list_top_leads,
      },
      {
        name: 'get_revenue_forecast',
        description: 'Get revenue forecast for a pipeline',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.get_revenue_forecast,
      },
      {
        name: 'get_churn_risk',
        description: 'Get churn risk assessment for a contact or account',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.get_churn_risk,
      },
      {
        name: 'list_churn_at_risk',
        description: 'List contacts/accounts at churn risk',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.list_churn_at_risk,
      },
      {
        name: 'get_ai_costs',
        description: 'Show AI cost breakdown by feature',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.get_ai_costs,
      },
      {
        name: 'get_model_performance',
        description: 'Get model accuracy and performance metrics',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        inputSchema: schemas.get_model_performance,
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

  getTools(tenantId: string) {
    return {
      get_lead_score: this.buildGetLeadScore(tenantId),
      list_top_leads: this.buildListTopLeads(tenantId),
      get_revenue_forecast: this.buildGetRevenueForecast(tenantId),
      get_churn_risk: this.buildGetChurnRisk(tenantId),
      list_churn_at_risk: this.buildListChurnAtRisk(tenantId),
      get_ai_costs: this.buildGetAiCosts(tenantId),
      get_model_performance: this.buildGetModelPerformance(tenantId),
    };
  }

  // ---- T-1411: getLeadScore ----

  private buildGetLeadScore(tenantId: string) {
    return tool({
      description:
        'Get the lead score, tier (hot/warm/cold), and scoring factors ' +
        'for a specific contact. Returns score (0-100), confidence, ' +
        'top contributing features, and when it was last computed.',
      inputSchema: schemas.get_lead_score,
      execute: async ({ contactId }) => {
        const score = await this.prisma.leadScore.findUnique({
          where: { tenantId_contactId: { tenantId, contactId } },
          include: {
            contact: {
              select: { displayName: true, firstName: true, lastName: true },
            },
          },
        });
        if (!score) {
          return truncateToolResult({
            error: `No lead score found for contact ${contactId}`,
          });
        }
        return truncateToolResult({
          contactId: score.contactId,
          contactName:
            score.contact?.displayName ||
            [score.contact?.firstName, score.contact?.lastName]
              .filter(Boolean)
              .join(' ') ||
            'Unknown',
          score: score.score,
          tier: scoreTier(score.score),
          confidence: score.confidence,
          features: score.features,
          computedAt: score.computedAt.toISOString(),
        });
      },
    });
  }

  // ---- T-1412: listTopLeads ----

  private buildListTopLeads(tenantId: string) {
    return tool({
      description:
        'List contacts ranked by their lead score, highest first. ' +
        'Optionally filter by minimum score. Returns contact name, ' +
        'email, score, and tier.',
      inputSchema: schemas.list_top_leads,
      execute: async ({ limit = 10, minScore }) => {
        const where: Record<string, unknown> = { tenantId };
        if (minScore !== undefined) {
          where.score = { gte: minScore };
        }
        const leads = await this.prisma.leadScore.findMany({
          where: where as any,
          orderBy: { score: 'desc' },
          take: limit,
          include: {
            contact: {
              select: {
                displayName: true,
                firstName: true,
                lastName: true,
                emails: true,
              },
            },
          },
        });
        return truncateToolResult({
          leads: leads.map((l) => ({
            contactId: l.contactId,
            name:
              l.contact?.displayName ||
              [l.contact?.firstName, l.contact?.lastName]
                .filter(Boolean)
                .join(' ') ||
              'Unknown',
            email: (l.contact?.emails as string[] | null)?.[0] ?? null,
            score: l.score,
            tier: scoreTier(l.score),
            confidence: l.confidence,
          })),
          count: leads.length,
        });
      },
    });
  }

  // ---- T-1413: getRevenueForecast ----

  private buildGetRevenueForecast(tenantId: string) {
    return tool({
      description:
        'Get revenue forecast for a pipeline. Returns predicted values ' +
        'per period with confidence intervals and forecast accuracy (MAE).',
      inputSchema: schemas.get_revenue_forecast,
      execute: async ({ pipelineId, period = 'quarterly' }) => {
        try {
          const mapped = period === 'monthly' ? 'month' : 'quarter';
          const result = await this.forecastService.getForecast(
            tenantId,
            pipelineId,
            mapped,
          );
          return truncateToolResult({
            pipeline: result.pipelineName,
            period: result.period,
            method: result.method,
            mae: result.mae,
            forecasts: result.forecasts.map((f: any) => ({
              label: f.label,
              predicted: Math.round(f.predicted),
              confidenceLow: f.confidenceLow
                ? Math.round(f.confidenceLow)
                : null,
              confidenceHigh: f.confidenceHigh
                ? Math.round(f.confidenceHigh)
                : null,
              actual: f.actual != null ? Math.round(f.actual) : null,
            })),
          });
        } catch (err: any) {
          return truncateToolResult({
            error: err.message ?? 'Failed to generate forecast',
          });
        }
      },
    });
  }

  // ---- T-1414: getChurnRisk ----

  private buildGetChurnRisk(tenantId: string) {
    return tool({
      description:
        'Get churn risk assessment for a specific contact or account. ' +
        'Returns risk level (HIGH/MEDIUM/LOW), probability, contributing ' +
        'signals, and reasoning.',
      inputSchema: schemas.get_churn_risk,
      execute: async ({ contactId, accountId }) => {
        if (!contactId && !accountId) {
          return truncateToolResult({
            error: 'Provide either contactId or accountId',
          });
        }
        const where: Record<string, unknown> = {
          tenantId,
          acknowledgedAt: null,
        };
        if (contactId) where.contactId = contactId;
        if (accountId) where.accountId = accountId;

        const signal = await this.prisma.churnSignal.findFirst({
          where: where as any,
          orderBy: { computedAt: 'desc' },
          include: {
            contact: {
              select: { displayName: true, firstName: true, lastName: true },
            },
            account: { select: { name: true } },
          },
        });
        if (!signal) {
          return truncateToolResult({
            message: 'No churn risk signal found for this entity',
          });
        }
        return truncateToolResult({
          contactId: signal.contactId,
          accountId: signal.accountId,
          contactName:
            signal.contact?.displayName ||
            [signal.contact?.firstName, signal.contact?.lastName]
              .filter(Boolean)
              .join(' ') ||
            null,
          accountName: signal.account?.name ?? null,
          riskLevel: signal.riskLevel,
          probability: signal.probability,
          signals: signal.signals,
          reasoning: signal.reasoning,
          computedAt: signal.computedAt.toISOString(),
        });
      },
    });
  }

  // ---- T-1415: listChurnAtRisk ----

  private buildListChurnAtRisk(tenantId: string) {
    return tool({
      description:
        'List contacts and accounts at risk of churn, ordered by ' +
        'probability. Optionally filter by risk level (high/medium/low).',
      inputSchema: schemas.list_churn_at_risk,
      execute: async ({ level, limit = 10 }) => {
        const where: Record<string, unknown> = {
          tenantId,
          acknowledgedAt: null,
        };
        if (level) where.riskLevel = level.toUpperCase();

        const signals = await this.prisma.churnSignal.findMany({
          where: where as any,
          orderBy: { probability: 'desc' },
          take: limit,
          include: {
            contact: {
              select: { displayName: true, firstName: true, lastName: true },
            },
            account: { select: { name: true } },
          },
        });
        return truncateToolResult({
          atRisk: signals.map((s) => ({
            contactId: s.contactId,
            accountId: s.accountId,
            name:
              s.contact?.displayName ||
              [s.contact?.firstName, s.contact?.lastName]
                .filter(Boolean)
                .join(' ') ||
              s.account?.name ||
              'Unknown',
            riskLevel: s.riskLevel,
            probability: s.probability,
            topSignal: Array.isArray(s.signals)
              ? (s.signals as any[])[0] ?? null
              : null,
          })),
          count: signals.length,
        });
      },
    });
  }

  // ---- T-1416: getAiCosts ----

  private buildGetAiCosts(tenantId: string) {
    return tool({
      description:
        'Show AI cost breakdown by feature. Returns per-feature costs, ' +
        'total token counts, and call counts for the specified time range.',
      inputSchema: schemas.get_ai_costs,
      execute: async ({ range = '30d' }) => {
        try {
          const breakdown = await this.governanceService.getCostBreakdown(
            tenantId,
            range as TimeRange,
          );
          const total = breakdown.reduce((s, b) => s + b.totalCost, 0);
          const totalTokens = breakdown.reduce(
            (s, b) => s + b.totalTokens,
            0,
          );
          return truncateToolResult({
            range,
            features: breakdown.map((b) => ({
              feature: b.predictionType,
              cost: `$${b.totalCost.toFixed(4)}`,
              tokens: b.totalTokens,
              calls: b.callCount,
            })),
            totalCost: `$${total.toFixed(4)}`,
            totalTokens,
          });
        } catch (err: any) {
          return truncateToolResult({
            error: err.message ?? 'Failed to get cost breakdown',
          });
        }
      },
    });
  }

  // ---- T-1417: getModelPerformance ----

  private buildGetModelPerformance(tenantId: string) {
    return tool({
      description:
        'Get model accuracy and performance metrics. Returns per-model ' +
        'accuracy, last trained date, active status, and version.',
      inputSchema: schemas.get_model_performance,
      execute: async ({ modelType }) => {
        try {
          const [registry, accuracy] = await Promise.all([
            this.modelRetrainService.getModelRegistry(tenantId),
            this.governanceService.getAccuracyMetrics(
              tenantId,
              TimeRange.LAST_90D,
            ),
          ]);

          let models = registry;
          if (modelType) {
            models = models.filter((m) => m.modelType === modelType);
          }

          return truncateToolResult({
            models: models.map((m) => ({
              modelType: m.modelType,
              version: m.version,
              isActive: m.isActive,
              lastTrained: m.lastTrained,
              accuracy: m.accuracy,
            })),
            recentAccuracy: accuracy.slice(-10).map((a) => ({
              date: a.date,
              modelType: a.modelType,
              metric: a.metric,
              value: a.value,
            })),
          });
        } catch (err: any) {
          return truncateToolResult({
            error: err.message ?? 'Failed to get model performance',
          });
        }
      },
    });
  }
}
