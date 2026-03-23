/**
 * AiAnalyticsService — NeMo-inspired Profiler layer.
 *
 * Provides time-series aggregation, per-model performance breakdown,
 * per-runType distribution, burn rate projection, and quality scoring
 * over the existing AiRunLedger data.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

// ── Response Types ──────────────────────────────────────────────────

export interface DailySeriesEntry {
  date: string;
  totalCost: number;
  totalTokens: number;
  runCount: number;
  errorCount: number;
}

export interface ModelBreakdownEntry {
  model: string;
  runCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  totalCost: number;
}

export interface RunTypeBreakdownEntry {
  runType: string;
  runCount: number;
  totalCost: number;
  avgLatencyMs: number;
}

export interface BurnRate {
  dailyAvgCost: number;
  projectedMonthlyCost: number;
  daysUntilCap: number | null;
}

export interface AnalyticsResponse {
  dailySeries: DailySeriesEntry[];
  modelBreakdown: ModelBreakdownEntry[];
  runTypeBreakdown: RunTypeBreakdownEntry[];
  burnRate: BurnRate;
}

// ── Service ─────────────────────────────────────────────────────────

@Injectable()
export class AiAnalyticsService {
  private readonly logger = new Logger(AiAnalyticsService.name);
  private readonly globalDailyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.globalDailyCap = this.configService.get<number>('AI_DAILY_COST_CAP') || 50.0;
  }

  async getAnalytics(tenantId: string, days = 30): Promise<AnalyticsResponse> {
    const [dailySeries, modelBreakdown, runTypeBreakdown, burnRate] =
      await Promise.all([
        this.getDailyTimeSeries(tenantId, days),
        this.getModelBreakdown(tenantId, days),
        this.getRunTypeBreakdown(tenantId, days),
        this.getBurnRate(tenantId),
      ]);

    return { dailySeries, modelBreakdown, runTypeBreakdown, burnRate };
  }

  // ── Daily Time Series ───────────────────────────────────────────

  private async getDailyTimeSeries(
    tenantId: string,
    days: number,
  ): Promise<DailySeriesEntry[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        date: Date;
        total_cost: number;
        total_tokens: bigint;
        run_count: bigint;
        error_count: bigint;
      }>
    >`
      SELECT DATE_TRUNC('day', "createdAt") AS date,
             COALESCE(SUM("estimatedCostUsd"), 0) AS total_cost,
             COALESCE(SUM("totalTokens"), 0)      AS total_tokens,
             COUNT(*)                              AS run_count,
             COUNT(*) FILTER (WHERE status = 'FAILED') AS error_count
      FROM ai_run_ledger
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY date
      ORDER BY date
    `;

    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      totalCost: Number(r.total_cost),
      totalTokens: Number(r.total_tokens),
      runCount: Number(r.run_count),
      errorCount: Number(r.error_count),
    }));
  }

  // ── Model Breakdown ─────────────────────────────────────────────

  private async getModelBreakdown(
    tenantId: string,
    days: number,
  ): Promise<ModelBreakdownEntry[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        model: string;
        run_count: bigint;
        avg_latency: number;
        p95_latency: number;
        error_rate: number;
        total_cost: number;
      }>
    >`
      SELECT model,
             COUNT(*)                              AS run_count,
             AVG("latencyMs")                      AS avg_latency,
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95_latency,
             COUNT(*) FILTER (WHERE status = 'FAILED')::float
               / NULLIF(COUNT(*), 0)               AS error_rate,
             COALESCE(SUM("estimatedCostUsd"), 0)  AS total_cost
      FROM ai_run_ledger
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY model
      ORDER BY total_cost DESC
    `;

    return rows.map((r) => ({
      model: r.model,
      runCount: Number(r.run_count),
      avgLatencyMs: Math.round(Number(r.avg_latency)),
      p95LatencyMs: Math.round(Number(r.p95_latency)),
      errorRate: Number(r.error_rate) || 0,
      totalCost: Number(r.total_cost),
    }));
  }

  // ── RunType Breakdown ───────────────────────────────────────────

  private async getRunTypeBreakdown(
    tenantId: string,
    days: number,
  ): Promise<RunTypeBreakdownEntry[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        run_type: string;
        run_count: bigint;
        total_cost: number;
        avg_latency: number;
      }>
    >`
      SELECT "runType"                             AS run_type,
             COUNT(*)                              AS run_count,
             COALESCE(SUM("estimatedCostUsd"), 0)  AS total_cost,
             AVG("latencyMs")                      AS avg_latency
      FROM ai_run_ledger
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY "runType"
      ORDER BY run_count DESC
    `;

    return rows.map((r) => ({
      runType: r.run_type,
      runCount: Number(r.run_count),
      totalCost: Number(r.total_cost),
      avgLatencyMs: Math.round(Number(r.avg_latency)),
    }));
  }

  // ── Burn Rate ───────────────────────────────────────────────────

  private async getBurnRate(tenantId: string): Promise<BurnRate> {
    const rows = await this.prisma.$queryRaw<
      Array<{ daily_avg: number }>
    >`
      SELECT COALESCE(SUM("estimatedCostUsd"), 0) / GREATEST(
               EXTRACT(EPOCH FROM (NOW() - MIN("createdAt"))) / 86400, 1
             ) AS daily_avg
      FROM ai_run_ledger
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= NOW() - INTERVAL '7 days'
    `;

    const dailyAvgCost = Number(rows[0]?.daily_avg ?? 0);
    const projectedMonthlyCost = dailyAvgCost * 30;
    const daysUntilCap =
      dailyAvgCost > 0 ? Math.round(this.globalDailyCap / dailyAvgCost) : null;

    return { dailyAvgCost, projectedMonthlyCost, daysUntilCap };
  }

  // ── Quality Scoring ─────────────────────────────────────────────

  /**
   * Score recent un-scored AI runs retroactively.
   * SUCCESS runs get 1.0 (schema validated), FAILED get 0.0.
   * Chat runs are skipped (no objective quality signal).
   */
  async scoreRecentRuns(
    tenantId: string,
    limit = 100,
  ): Promise<{ scored: number }> {
    // Score SUCCESS runs (excluding chat — no objective signal)
    const successResult = await this.prisma.$executeRaw`
      UPDATE ai_run_ledger
      SET "qualityScore" = 1.0,
          "qualityMethod" = 'schema-completeness'
      WHERE "tenantId" = ${tenantId}
        AND "qualityScore" IS NULL
        AND status = 'SUCCESS'
        AND "runType" != 'chat'
        AND id IN (
          SELECT id FROM ai_run_ledger
          WHERE "tenantId" = ${tenantId}
            AND "qualityScore" IS NULL
            AND status = 'SUCCESS'
            AND "runType" != 'chat'
          ORDER BY "createdAt" DESC
          LIMIT ${limit}
        )
    `;

    // Score FAILED runs
    const failedResult = await this.prisma.$executeRaw`
      UPDATE ai_run_ledger
      SET "qualityScore" = 0.0,
          "qualityMethod" = 'schema-completeness'
      WHERE "tenantId" = ${tenantId}
        AND "qualityScore" IS NULL
        AND status = 'FAILED'
        AND id IN (
          SELECT id FROM ai_run_ledger
          WHERE "tenantId" = ${tenantId}
            AND "qualityScore" IS NULL
            AND status = 'FAILED'
          ORDER BY "createdAt" DESC
          LIMIT ${limit}
        )
    `;

    const scored = successResult + failedResult;
    this.logger.log(`[tenant:${tenantId}] Scored ${scored} AI runs`);
    return { scored };
  }
}
