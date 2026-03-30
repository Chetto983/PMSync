import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TimeRange } from './dto/governance.dto';

export interface GovernanceOverview {
  totalPredictions: number;
  averageAccuracy: number;
  monthlyCost: number;
  activeModels: number;
}

export interface ModelAccuracyPoint {
  date: string;
  modelType: string;
  metric: string;
  value: number;
}

export interface CostBreakdown {
  predictionType: string;
  totalCost: number;
  totalTokens: number;
  callCount: number;
}

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId: string): Promise<GovernanceOverview> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Count total AI predictions (runs with runType matching intelligence features)
    const intelligenceTypes = [
      'lead-scoring',
      'churn-prediction',
      'forecast',
      'nba',
      'chat',
    ];

    const [predictionCount, costAgg] = await Promise.all([
      this.prisma.aiRunLedger.count({
        where: { tenantId, runType: { in: intelligenceTypes } },
      }),
      this.prisma.aiRunLedger.aggregate({
        where: {
          tenantId,
          runType: { in: intelligenceTypes },
          createdAt: { gte: monthStart },
        },
        _sum: { estimatedCostUsd: true },
      }),
    ]);

    // Average accuracy from quality scores (non-null only)
    const qualityAgg = await this.prisma.aiRunLedger.aggregate({
      where: {
        tenantId,
        runType: { in: intelligenceTypes },
        qualityScore: { not: null },
      },
      _avg: { qualityScore: true },
    });

    // Count distinct model types used
    const distinctModels = await this.prisma.aiRunLedger.groupBy({
      by: ['model'],
      where: { tenantId, runType: { in: intelligenceTypes } },
    });

    return {
      totalPredictions: predictionCount,
      averageAccuracy: qualityAgg._avg.qualityScore
        ? Math.round(qualityAgg._avg.qualityScore * 100)
        : 0,
      monthlyCost: costAgg._sum.estimatedCostUsd ?? 0,
      activeModels: distinctModels.length,
    };
  }

  async getCostBreakdown(
    tenantId: string,
    range: TimeRange,
  ): Promise<CostBreakdown[]> {
    const since = this.rangeToDate(range);

    const groups = await this.prisma.aiRunLedger.groupBy({
      by: ['runType'],
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      _sum: { estimatedCostUsd: true, totalTokens: true },
      _count: { id: true },
      orderBy: { _sum: { estimatedCostUsd: 'desc' } },
    });

    return groups.map((g) => ({
      predictionType: g.runType,
      totalCost: g._sum.estimatedCostUsd ?? 0,
      totalTokens: g._sum.totalTokens ?? 0,
      callCount: g._count.id,
    }));
  }

  private rangeToDate(range: TimeRange): Date {
    const now = new Date();
    switch (range) {
      case TimeRange.LAST_7D:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case TimeRange.LAST_30D:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case TimeRange.LAST_90D:
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }
  }
}
