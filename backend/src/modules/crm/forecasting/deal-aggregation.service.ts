import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface MonthlyAggregate {
  /** ISO month string: "2026-01" */
  month: string;
  /** Total revenue from won deals closed in this month */
  wonRevenue: number;
  /** Number of won deals */
  wonCount: number;
  /** Number of lost deals */
  lostCount: number;
  /** Total value of deals created in this month */
  createdValue: number;
  /** Number of deals created */
  createdCount: number;
  /** Win rate for deals closed this month (0-1) */
  closeRate: number;
  /** Average deal value of won deals */
  avgDealValue: number;
}

@Injectable()
export class DealAggregationService {
  private readonly logger = new Logger(DealAggregationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate deal history by month for a given pipeline and tenant.
   * Returns monthly metrics: won revenue, close rate, avg deal value, etc.
   */
  async aggregateMonthly(
    tenantId: string,
    pipelineId: string,
    monthsBack = 24,
  ): Promise<MonthlyAggregate[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const deals = await this.prisma.crmDeal.findMany({
      where: {
        tenantId,
        pipelineId,
        deletedAt: null,
        createdAt: { gte: since },
      },
      select: {
        id: true,
        amount: true,
        closedAt: true,
        createdAt: true,
        stage: { select: { isWon: true, isLost: true } },
      },
    });

    // Build month buckets
    const buckets = new Map<
      string,
      {
        wonRevenue: number;
        wonCount: number;
        lostCount: number;
        createdValue: number;
        createdCount: number;
      }
    >();

    const toMonthKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    // Initialize all month buckets from since to now
    const cursor = new Date(since);
    const now = new Date();
    while (cursor <= now) {
      const key = toMonthKey(cursor);
      buckets.set(key, {
        wonRevenue: 0,
        wonCount: 0,
        lostCount: 0,
        createdValue: 0,
        createdCount: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    for (const deal of deals) {
      const amount = deal.amount ? Number(deal.amount) : 0;

      // Track creation
      const createdMonth = toMonthKey(deal.createdAt);
      const createdBucket = buckets.get(createdMonth);
      if (createdBucket) {
        createdBucket.createdValue += amount;
        createdBucket.createdCount += 1;
      }

      // Track closure
      if (deal.closedAt) {
        const closedMonth = toMonthKey(deal.closedAt);
        const closedBucket = buckets.get(closedMonth);
        if (closedBucket) {
          if (deal.stage.isWon) {
            closedBucket.wonRevenue += amount;
            closedBucket.wonCount += 1;
          } else if (deal.stage.isLost) {
            closedBucket.lostCount += 1;
          }
        }
      }
    }

    // Convert to sorted array
    const result: MonthlyAggregate[] = [];
    const sortedKeys = [...buckets.keys()].sort();

    for (const month of sortedKeys) {
      const b = buckets.get(month)!;
      const closedTotal = b.wonCount + b.lostCount;
      result.push({
        month,
        wonRevenue: b.wonRevenue,
        wonCount: b.wonCount,
        lostCount: b.lostCount,
        createdValue: b.createdValue,
        createdCount: b.createdCount,
        closeRate: closedTotal > 0 ? b.wonCount / closedTotal : 0,
        avgDealValue: b.wonCount > 0 ? b.wonRevenue / b.wonCount : 0,
      });
    }

    this.logger.debug(
      `Aggregated ${deals.length} deals into ${result.length} months for pipeline ${pipelineId}`,
    );

    return result;
  }
}
