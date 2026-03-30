import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NBAContextService } from './nba-context.service';
import { NBARankingService } from './nba-ranking.service';
import { NBAActionStatus } from './dto/nba.dto';

@Injectable()
export class NBAService {
  private readonly logger = new Logger(NBAService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: NBAContextService,
    private readonly rankingService: NBARankingService,
  ) {}

  /**
   * Get top recommended actions for a deal.
   * Generates fresh candidates from context, persists as SUGGESTED.
   */
  async getRecommendations(tenantId: string, dealId: string) {
    const ctx = await this.contextService.gatherDealContext(tenantId, dealId);
    if (!ctx) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    const candidates = this.rankingService.generateCandidates(ctx);

    // Persist new suggestions (upsert to avoid duplicates of same type for same deal)
    const actions = await Promise.all(
      candidates.map(async (c) => {
        // Check for existing SUGGESTED action of same type for this deal
        const existing = await this.prisma.nBAAction.findFirst({
          where: {
            tenantId,
            dealId,
            actionType: c.actionType,
            status: 'SUGGESTED',
          },
        });

        if (existing) {
          // Update existing suggestion with fresh data
          return this.prisma.nBAAction.update({
            where: { id: existing.id },
            data: {
              title: c.title,
              reasoning: c.reasoning,
              expectedImpact: c.expectedImpact,
              confidence: c.confidence,
              contactId: c.contactId,
            },
          });
        }

        return this.prisma.nBAAction.create({
          data: {
            tenantId,
            dealId,
            contactId: c.contactId,
            actionType: c.actionType,
            title: c.title,
            reasoning: c.reasoning,
            expectedImpact: c.expectedImpact,
            confidence: c.confidence,
          },
        });
      }),
    );

    return {
      dealId,
      dealName: ctx.dealName,
      stageName: ctx.stageName,
      actions: actions.map((a) => ({
        id: a.id,
        actionType: a.actionType,
        title: a.title,
        reasoning: a.reasoning,
        expectedImpact: a.expectedImpact,
        confidence: a.confidence,
        status: a.status,
        contactId: a.contactId,
        createdAt: a.createdAt,
      })),
    };
  }

  /**
   * Update action status (accept, dismiss, execute).
   */
  async updateStatus(tenantId: string, actionId: string, status: NBAActionStatus) {
    const action = await this.prisma.nBAAction.findFirst({
      where: { id: actionId, tenantId },
    });

    if (!action) {
      throw new NotFoundException(`NBA action ${actionId} not found`);
    }

    const data: any = { status };
    if (status === NBAActionStatus.EXECUTED) {
      data.executedAt = new Date();
    } else if (status === NBAActionStatus.DISMISSED) {
      data.dismissedAt = new Date();
    }

    return this.prisma.nBAAction.update({
      where: { id: actionId },
      data,
    });
  }

  /**
   * Get effectiveness stats for NBA actions.
   */
  async getEffectiveness(tenantId: string) {
    const stats = await this.prisma.nBAAction.groupBy({
      by: ['actionType', 'status'],
      where: { tenantId },
      _count: true,
    });

    // Reshape into per-actionType breakdown
    const byType = new Map<string, Record<string, number>>();
    for (const row of stats) {
      const existing = byType.get(row.actionType) ?? {};
      existing[row.status] = row._count;
      byType.set(row.actionType, existing);
    }

    return Array.from(byType.entries()).map(([actionType, counts]) => {
      const total =
        (counts.ACCEPTED ?? 0) +
        (counts.DISMISSED ?? 0) +
        (counts.EXECUTED ?? 0);
      const accepted = (counts.ACCEPTED ?? 0) + (counts.EXECUTED ?? 0);
      return {
        actionType,
        suggested: counts.SUGGESTED ?? 0,
        accepted: counts.ACCEPTED ?? 0,
        executed: counts.EXECUTED ?? 0,
        dismissed: counts.DISMISSED ?? 0,
        acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
      };
    });
  }
}
