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

  async getAccuracyMetrics(
    tenantId: string,
    range: TimeRange,
  ): Promise<ModelAccuracyPoint[]> {
    const since = this.rangeToDate(range);
    const points: ModelAccuracyPoint[] = [];

    // 1. Forecast MAPE from ForecastSnapshot (real ground-truth accuracy)
    const forecasts = await this.prisma.forecastSnapshot.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        mape: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, mape: true },
    });

    for (const f of forecasts) {
      points.push({
        date: f.createdAt.toISOString().slice(0, 10),
        modelType: 'forecast',
        metric: 'mape',
        value: Math.round((f.mape ?? 0) * 100) / 100,
      });
    }

    // 2. ModelEvaluation metrics (precision, recall, AUC from trained models)
    const evaluations = await this.prisma.modelEvaluation.findMany({
      where: {
        tenantId,
        trainedAt: { gte: since },
      },
      orderBy: { trainedAt: 'asc' },
      select: { modelType: true, metrics: true, trainedAt: true },
    });

    for (const ev of evaluations) {
      const m = ev.metrics as Record<string, number> | null;
      if (!m) continue;
      const date = ev.trainedAt.toISOString().slice(0, 10);
      if (m.aucRoc != null) {
        points.push({ date, modelType: ev.modelType, metric: 'auc', value: m.aucRoc });
      }
      if (m.precision != null) {
        points.push({ date, modelType: ev.modelType, metric: 'precision', value: m.precision });
      }
      if (m.recall != null) {
        points.push({ date, modelType: ev.modelType, metric: 'recall', value: m.recall });
      }
    }

    // 3. AiRunLedger quality scores averaged per day per runType
    const intelligenceTypes = [
      'lead-scoring',
      'churn-prediction',
      'forecast',
      'nba',
    ];

    const ledgerRuns = await this.prisma.aiRunLedger.findMany({
      where: {
        tenantId,
        runType: { in: intelligenceTypes },
        qualityScore: { not: null },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      select: { runType: true, qualityScore: true, createdAt: true },
    });

    // Group by day + runType, compute daily avg
    const dailyMap = new Map<string, { sum: number; count: number }>();
    for (const r of ledgerRuns) {
      const day = r.createdAt.toISOString().slice(0, 10);
      const key = `${day}|${r.runType}`;
      const entry = dailyMap.get(key) ?? { sum: 0, count: 0 };
      entry.sum += r.qualityScore ?? 0;
      entry.count += 1;
      dailyMap.set(key, entry);
    }

    for (const [key, entry] of dailyMap) {
      const [date, modelType] = key.split('|');
      points.push({
        date,
        modelType,
        metric: 'quality',
        value: Math.round((entry.sum / entry.count) * 100) / 100,
      });
    }

    return points.sort((a, b) => a.date.localeCompare(b.date));
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
