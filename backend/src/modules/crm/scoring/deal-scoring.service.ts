import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Rule-based deal scoring engine.
 *
 * Evaluates a deal against a fixed set of rules and computes
 * a 0-100 score. The score is persisted on the deal record
 * and recalculated on create/update.
 *
 * Rules (max 100 points total):
 *   - Stage probability:       up to 25 pts (probability / 4)
 *   - Amount filled:           10 pts (non-null amount > 0)
 *   - Amount tier:             up to 10 pts (higher = more)
 *   - Expected close date set: 5 pts
 *   - Close date proximity:    up to 10 pts (closer = more)
 *   - Priority boost:          up to 10 pts (URGENT=10, HIGH=7, MEDIUM=4, LOW=1)
 *   - Source filled:           5 pts
 *   - Account linked:          5 pts
 *   - Contacts linked:         up to 10 pts (min(count, 3) * 3.33)
 *   - Products linked:         up to 10 pts (min(count, 3) * 3.33)
 */
@Injectable()
export class DealScoringService {
  private readonly logger = new Logger(DealScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate and persist the deal score. Returns the new score.
   */
  async scoreDeal(dealId: string): Promise<number> {
    const deal = await this.prisma.crmDeal.findUnique({
      where: { id: dealId },
      include: {
        stage: { select: { probability: true, isWon: true, isLost: true } },
        _count: { select: { dealContacts: true, dealProducts: true } },
      },
    });

    if (!deal) return 0;

    let score = 0;

    // 1. Stage probability (0-25 pts)
    if (deal.stage.isWon) {
      score += 25;
    } else if (deal.stage.isLost) {
      score += 0;
    } else {
      score += Math.round(deal.stage.probability / 4);
    }

    // 2. Amount filled (10 pts)
    const amount = deal.amount ? Number(deal.amount) : 0;
    if (amount > 0) {
      score += 10;
    }

    // 3. Amount tier (0-10 pts)
    if (amount >= 100_000) score += 10;
    else if (amount >= 50_000) score += 8;
    else if (amount >= 10_000) score += 6;
    else if (amount >= 1_000) score += 4;
    else if (amount > 0) score += 2;

    // 4. Expected close date set (5 pts)
    if (deal.expectedCloseDate) {
      score += 5;

      // 5. Close date proximity (0-10 pts) — closer = higher
      const daysUntilClose = Math.max(
        0,
        (deal.expectedCloseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilClose <= 7) score += 10;
      else if (daysUntilClose <= 14) score += 8;
      else if (daysUntilClose <= 30) score += 6;
      else if (daysUntilClose <= 60) score += 4;
      else if (daysUntilClose <= 90) score += 2;
    }

    // 6. Priority (0-10 pts)
    const priorityScores: Record<string, number> = {
      URGENT: 10,
      HIGH: 7,
      MEDIUM: 4,
      LOW: 1,
    };
    score += priorityScores[deal.priority ?? 'MEDIUM'] ?? 4;

    // 7. Source filled (5 pts)
    if (deal.source) score += 5;

    // 8. Account linked (5 pts)
    if (deal.accountId) score += 5;

    // 9. Contacts linked (0-10 pts)
    score += Math.round(Math.min(deal._count.dealContacts, 3) * 3.33);

    // 10. Products linked (0-10 pts)
    score += Math.round(Math.min(deal._count.dealProducts, 3) * 3.33);

    // Clamp to 0-100
    const finalScore = Math.min(100, Math.max(0, score));

    // Persist
    await this.prisma.crmDeal.update({
      where: { id: dealId },
      data: { score: finalScore },
    });

    return finalScore;
  }

  /**
   * Bulk recalculate scores for all open deals in a pipeline.
   * Useful for batch recalculation after stage probability changes.
   */
  async scoreAllDealsInPipeline(tenantId: string, pipelineId: string): Promise<number> {
    const deals = await this.prisma.crmDeal.findMany({
      where: { tenantId, pipelineId, deletedAt: null },
      select: { id: true },
    });

    let updated = 0;
    for (const deal of deals) {
      await this.scoreDeal(deal.id);
      updated++;
    }

    this.logger.log(`Scored ${updated} deals in pipeline ${pipelineId}`);
    return updated;
  }
}
