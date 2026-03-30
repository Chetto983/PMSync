import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DealAggregationService, MonthlyAggregate } from './deal-aggregation.service';
import { forecast, ForecastPoint } from './time-series.engine';

export interface ForecastResponse {
  pipelineId: string;
  pipelineName: string;
  period: 'month' | 'quarter';
  /** Historical monthly aggregates */
  history: MonthlyAggregate[];
  /** Forecasted periods */
  forecasts: ForecastPeriod[];
  /** Forecast method used */
  method: string;
  /** In-sample MAE */
  mae: number;
}

export interface ForecastPeriod {
  /** Period label: "2026-Q2" or "2026-04" */
  label: string;
  periodStart: string;
  predicted: number;
  p20: number;
  p50: number;
  p80: number;
  /** Actual revenue if period has passed and snapshot exists */
  actual: number | null;
}

@Injectable()
export class ForecastService {
  private readonly logger = new Logger(ForecastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregation: DealAggregationService,
  ) {}

  async getForecast(
    tenantId: string,
    pipelineId: string,
    period: 'month' | 'quarter' = 'quarter',
  ): Promise<ForecastResponse> {
    // Verify pipeline exists
    const pipeline = await this.prisma.crmPipeline.findFirst({
      where: { id: pipelineId, tenantId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    // Get monthly aggregated history
    const monthlyHistory = await this.aggregation.aggregateMonthly(
      tenantId,
      pipelineId,
      24,
    );

    let data: number[];
    let horizonPeriods: number;

    if (period === 'quarter') {
      // Aggregate months into quarters
      data = this.monthsToQuarters(monthlyHistory);
      horizonPeriods = 4; // 4 quarters ahead
    } else {
      data = monthlyHistory.map((m) => m.wonRevenue);
      horizonPeriods = 6; // 6 months ahead
    }

    // Run forecast engine
    const seasonLength = period === 'quarter' ? 4 : 12;
    const result = forecast(data, horizonPeriods, seasonLength);

    // Build forecast periods with labels
    const forecastPeriods = this.buildForecastPeriods(
      result.forecasts,
      monthlyHistory,
      period,
    );

    // Load existing snapshots for actual revenue
    await this.enrichWithActuals(tenantId, pipelineId, forecastPeriods);

    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      period,
      history: monthlyHistory,
      forecasts: forecastPeriods,
      method: result.method,
      mae: Math.round(result.mae * 100) / 100,
    };
  }

  /**
   * Save a forecast snapshot to the database.
   */
  async saveSnapshot(
    tenantId: string,
    pipelineId: string,
    period: 'month' | 'quarter',
    forecastPeriods: ForecastPeriod[],
  ): Promise<number> {
    let count = 0;
    for (const fp of forecastPeriods) {
      await this.prisma.forecastSnapshot.create({
        data: {
          tenantId,
          pipelineId,
          period,
          periodStart: new Date(fp.periodStart),
          predictedRevenue: fp.predicted,
          p20Revenue: fp.p20,
          p50Revenue: fp.p50,
          p80Revenue: fp.p80,
        },
      });
      count++;
    }
    this.logger.log(`Saved ${count} forecast snapshots for pipeline ${pipelineId}`);
    return count;
  }

  /**
   * Update actual revenue on past snapshots and compute MAPE.
   */
  async updateActuals(tenantId: string, pipelineId: string): Promise<number> {
    const now = new Date();

    // Find snapshots where the period has passed but actual is still null
    const pendingSnapshots = await this.prisma.forecastSnapshot.findMany({
      where: {
        tenantId,
        pipelineId,
        actualRevenue: null,
        periodStart: { lt: now },
      },
    });

    let updated = 0;
    for (const snap of pendingSnapshots) {
      const periodEnd = this.getPeriodEnd(snap.periodStart, snap.period);
      if (periodEnd > now) continue; // Period hasn't fully closed yet

      // Calculate actual revenue for that period
      const actualRevenue = await this.calculateActualRevenue(
        tenantId,
        pipelineId,
        snap.periodStart,
        periodEnd,
      );

      const predicted = Number(snap.predictedRevenue);
      const mape =
        actualRevenue > 0
          ? Math.abs(predicted - actualRevenue) / actualRevenue
          : null;

      await this.prisma.forecastSnapshot.update({
        where: { id: snap.id },
        data: {
          actualRevenue: actualRevenue,
          mape,
        },
      });
      updated++;
    }

    return updated;
  }

  /**
   * Get accuracy metrics for past forecasts.
   */
  async getAccuracy(tenantId: string, pipelineId: string) {
    const snapshots = await this.prisma.forecastSnapshot.findMany({
      where: {
        tenantId,
        pipelineId,
        mape: { not: null },
      },
      select: {
        periodStart: true,
        period: true,
        predictedRevenue: true,
        actualRevenue: true,
        mape: true,
        createdAt: true,
      },
      orderBy: { periodStart: 'asc' },
    });

    const mapeValues = snapshots
      .map((s) => s.mape)
      .filter((m): m is number => m !== null);

    const avgMape =
      mapeValues.length > 0
        ? mapeValues.reduce((a, b) => a + b, 0) / mapeValues.length
        : null;

    return {
      snapshots: snapshots.map((s) => ({
        periodStart: s.periodStart.toISOString(),
        period: s.period,
        predicted: Number(s.predictedRevenue),
        actual: s.actualRevenue ? Number(s.actualRevenue) : null,
        mape: s.mape,
      })),
      avgMape: avgMape !== null ? Math.round(avgMape * 10000) / 100 : null, // As percentage
    };
  }

  // ---- Private helpers ----

  private monthsToQuarters(months: MonthlyAggregate[]): number[] {
    const quarters: number[] = [];
    for (let i = 0; i < months.length; i += 3) {
      const chunk = months.slice(i, i + 3);
      const sum = chunk.reduce((s, m) => s + m.wonRevenue, 0);
      quarters.push(sum);
    }
    return quarters;
  }

  private buildForecastPeriods(
    forecasts: ForecastPoint[],
    history: MonthlyAggregate[],
    period: 'month' | 'quarter',
  ): ForecastPeriod[] {
    const lastMonth = history.length > 0 ? history[history.length - 1].month : null;
    const baseDate = lastMonth
      ? new Date(lastMonth + '-01')
      : new Date();

    return forecasts.map((fp, i) => {
      const offsetMonths = period === 'quarter' ? (i + 1) * 3 : i + 1;
      const periodDate = new Date(baseDate);
      periodDate.setMonth(periodDate.getMonth() + offsetMonths);

      const label =
        period === 'quarter'
          ? `${periodDate.getFullYear()}-Q${Math.ceil((periodDate.getMonth() + 1) / 3)}`
          : `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;

      // Align to start of quarter/month
      const periodStart = new Date(periodDate);
      if (period === 'quarter') {
        const qMonth = (Math.ceil((periodDate.getMonth() + 1) / 3) - 1) * 3;
        periodStart.setMonth(qMonth, 1);
      } else {
        periodStart.setDate(1);
      }
      periodStart.setHours(0, 0, 0, 0);

      return {
        label,
        periodStart: periodStart.toISOString(),
        predicted: Math.round(fp.predicted * 100) / 100,
        p20: Math.round(fp.p20 * 100) / 100,
        p50: Math.round(fp.p50 * 100) / 100,
        p80: Math.round(fp.p80 * 100) / 100,
        actual: null,
      };
    });
  }

  private async enrichWithActuals(
    tenantId: string,
    pipelineId: string,
    periods: ForecastPeriod[],
  ): Promise<void> {
    const snapshots = await this.prisma.forecastSnapshot.findMany({
      where: { tenantId, pipelineId },
      select: {
        periodStart: true,
        actualRevenue: true,
        mape: true,
      },
    });

    for (const period of periods) {
      const match = snapshots.find(
        (s) => s.periodStart.toISOString() === period.periodStart,
      );
      if (match?.actualRevenue != null) {
        period.actual = Number(match.actualRevenue);
      }
    }
  }

  private getPeriodEnd(start: Date, period: string): Date {
    const end = new Date(start);
    if (period === 'quarter') {
      end.setMonth(end.getMonth() + 3);
    } else {
      end.setMonth(end.getMonth() + 1);
    }
    return end;
  }

  private async calculateActualRevenue(
    tenantId: string,
    pipelineId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const result = await this.prisma.crmDeal.aggregate({
      where: {
        tenantId,
        pipelineId,
        deletedAt: null,
        closedAt: { gte: periodStart, lt: periodEnd },
        stage: { isWon: true },
      },
      _sum: { amount: true },
    });

    return result._sum.amount ? Number(result._sum.amount) : 0;
  }
}
