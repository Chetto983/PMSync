import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { NBADealContext, NBAContactContext } from './nba-context.types';

@Injectable()
export class NBAContextService {
  private readonly logger = new Logger(NBAContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  async gatherDealContext(
    tenantId: string,
    dealId: string,
  ): Promise<NBADealContext | null> {
    const deal = await this.prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId, deletedAt: null },
      include: {
        stage: true,
        pipeline: { include: { stages: { orderBy: { position: 'asc' } } } },
        account: true,
        dealContacts: {
          include: {
            contact: {
              select: { id: true, displayName: true, tenantId: true },
            },
          },
        },
      },
    });

    if (!deal) return null;

    const now = new Date();

    // Days in current stage — from last stage-change activity or deal creation
    const lastStageChange = await this.prisma.crmActivity.findFirst({
      where: { tenantId, dealId, type: 'STAGE_CHANGE' },
      orderBy: { createdAt: 'desc' },
    });
    const stageEnteredAt = lastStageChange?.createdAt ?? deal.createdAt;
    const daysInCurrentStage = Math.floor(
      (now.getTime() - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Expected close date
    const daysUntilExpectedClose = deal.expectedCloseDate
      ? Math.floor(
          (deal.expectedCloseDate.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;
    const isOverdue =
      daysUntilExpectedClose !== null && daysUntilExpectedClose < 0;

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentActivities = await this.prisma.crmActivity.findMany({
      where: { tenantId, dealId, createdAt: { gte: thirtyDaysAgo } },
      select: { type: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const lastActivity = recentActivities[0];
    const daysSinceLastActivity = lastActivity
      ? Math.floor(
          (now.getTime() - lastActivity.createdAt.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    const activityTypes = new Set(recentActivities.map((a) => a.type));

    // Gather contact signals
    const contactIds = deal.dealContacts.map((dc) => dc.contactId);
    const contacts = await this.gatherContactSignals(
      tenantId,
      contactIds,
      deal.dealContacts,
    );

    // Aggregate engagement/churn from contacts (use best/worst signal)
    const bestEngagement = contacts.reduce<number | null>(
      (best, c) =>
        c.engagementScore !== null
          ? best === null
            ? c.engagementScore
            : Math.max(best, c.engagementScore)
          : best,
      null,
    );
    const worstChurn = contacts.reduce<{
      risk: number | null;
      level: string | null;
    }>(
      (worst, c) => {
        if (c.churnRisk === null) return worst;
        if (worst.risk === null || c.churnRisk > worst.risk) {
          return {
            risk: c.churnRisk,
            level:
              c.churnRisk >= 0.7
                ? 'HIGH'
                : c.churnRisk >= 0.4
                  ? 'MEDIUM'
                  : 'LOW',
          };
        }
        return worst;
      },
      { risk: null, level: null },
    );

    const stageOrder =
      deal.pipeline.stages.findIndex((s) => s.id === deal.stageId) + 1;

    return {
      dealId: deal.id,
      dealName: deal.name,
      amount: deal.amount ? Number(deal.amount) : null,
      currency: deal.currency,
      priority: deal.priority,
      source: deal.source,
      score: deal.score,
      stageName: deal.stage.name,
      stageOrder,
      totalStages: deal.pipeline.stages.length,
      daysInCurrentStage,
      pipelineName: deal.pipeline.name,
      pipelineId: deal.pipelineId,
      expectedCloseDate: deal.expectedCloseDate,
      daysUntilExpectedClose,
      isOverdue,
      contacts,
      accountName: deal.account?.name ?? null,
      accountIndustry: deal.account?.industry ?? null,
      engagementScore: bestEngagement,
      churnRisk: worstChurn.risk,
      churnLevel: worstChurn.level,
      daysSinceLastActivity,
      recentActivityCount: recentActivities.length,
      hasRecentEmail: activityTypes.has('EMAIL'),
      hasRecentMeeting: activityTypes.has('MEETING'),
      hasRecentCall: activityTypes.has('CALL'),
    };
  }

  private async gatherContactSignals(
    tenantId: string,
    contactIds: string[],
    dealContacts: Array<{
      contactId: string;
      role: string | null;
      contact: { id: string; displayName: string | null; tenantId: string };
    }>,
  ): Promise<NBAContactContext[]> {
    if (contactIds.length === 0) return [];

    // Fetch latest lead scores (unique per tenantId+contactId)
    const leadScores = await this.prisma.leadScore.findMany({
      where: { tenantId, contactId: { in: contactIds } },
      select: { contactId: true, score: true },
    });
    const scoreMap = new Map(
      leadScores.map((s) => [s.contactId, s.score]),
    );

    // Fetch latest churn signals (unique per tenantId+contactId)
    const churnSignals = await this.prisma.churnSignal.findMany({
      where: { tenantId, contactId: { in: contactIds } },
      select: { contactId: true, probability: true },
    });
    const churnMap = new Map(
      churnSignals.map((s) => [s.contactId!, Number(s.probability)]),
    );

    return dealContacts.map((dc) => ({
      contactId: dc.contactId,
      displayName: dc.contact.displayName,
      role: dc.role,
      engagementScore: scoreMap.get(dc.contactId) ?? null,
      churnRisk: churnMap.get(dc.contactId) ?? null,
    }));
  }
}
