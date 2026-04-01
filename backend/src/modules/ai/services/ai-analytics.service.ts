/**
 * AiAnalyticsService — NeMo-inspired Profiler layer.
 *
 * Provides time-series aggregation, per-model performance breakdown,
 * per-runType distribution, burn rate projection, and quality scoring
 * over the existing AiRunLedger data.
 */
import { Injectable, Logger } from '@nestjs/common';
import { AiRunStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

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

interface QualityScorableRun {
  id: string;
  status: AiRunStatus;
  runType: string;
  latencyMs: number;
  toolCallCount: number;
  totalTokens: number;
  hitlRequired: boolean;
}

// ── Service ─────────────────────────────────────────────────────────

@Injectable()
export class AiAnalyticsService {
  private readonly logger = new Logger(AiAnalyticsService.name);
  private readonly globalDailyCap: number;
  /** Monthly cap derived from daily cap * 30. */
  private readonly monthlyCap: number;
  /** Threshold fraction (0-1) at which to fire cost alert. */
  private readonly costAlertThreshold: number;
  /** 24h cooldown between alerts for the same tenant. */
  private static readonly COST_ALERT_COOLDOWN_S = 86_400;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {
    this.globalDailyCap = this.configService.get<number>('AI_DAILY_COST_CAP') || 50.0;
    this.monthlyCap = this.globalDailyCap * 30;
    this.costAlertThreshold = this.configService.get<number>('AI_COST_ALERT_THRESHOLD') || 0.8;
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
   * Non-chat SUCCESS runs get 1.0 (schema validated).
   * FAILED/TIMEOUT runs get 0.0.
   * SUCCESS chat runs get a heuristic score inferred from runtime signals.
   *
   * The chat score is an inference from telemetry, not a user-verified ground truth.
   */
  async scoreRecentRuns(
    tenantId: string,
    limit = 100,
  ): Promise<{ scored: number }> {
    const runs = await this.prisma.aiRunLedger.findMany({
      where: {
        tenantId,
        qualityScore: null,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        runType: true,
        latencyMs: true,
        toolCallCount: true,
        totalTokens: true,
        hitlRequired: true,
      },
    });

    for (const run of runs) {
      const { score, method } = this.scoreRunQuality(run);
      await this.prisma.aiRunLedger.update({
        where: { id: run.id },
        data: {
          qualityScore: score,
          qualityMethod: method,
        },
      });
    }

    const scored = runs.length;
    this.logger.log(`[tenant:${tenantId}] Scored ${scored} AI runs`);
    return { scored };
  }

  private scoreRunQuality(
    run: QualityScorableRun,
  ): { score: number; method: string } {
    if (run.status !== AiRunStatus.SUCCESS) {
      return {
        score: 0,
        method: 'runtime-outcome-v1',
      };
    }

    if (run.runType !== 'chat') {
      return {
        score: 1,
        method: 'schema-completeness',
      };
    }

    return {
      score: this.computeChatQualityScore(run),
      method: 'runtime-heuristic-v1',
    };
  }

  private computeChatQualityScore(run: QualityScorableRun): number {
    let score = 0.4;

    if (run.toolCallCount > 0) score += 0.25;
    if (run.hitlRequired) score += 0.1;
    if (run.totalTokens > 0) score += 0.1;

    if (run.latencyMs <= 4_000) score += 0.2;
    else if (run.latencyMs <= 8_000) score += 0.1;
    else if (run.latencyMs <= 15_000) score += 0.05;

    return Number(Math.min(1, Math.max(0, score)).toFixed(2));
  }

  // ── Cost Alerting (OBS-M1) ─────────────────────────────────────

  /**
   * Check if a tenant has crossed the AI cost alert threshold this month.
   * Fires a Socket.IO alert to the tenant, with 24h cooldown per tenant.
   * Intended to be called fire-and-forget after ledger writes.
   */
  async checkCostThreshold(tenantId: string): Promise<void> {
    const cooldownKey = `cost-alert:${tenantId}`;
    const alreadyAlerted = await this.cacheService.exists(
      cooldownKey,
      CacheNamespace.AI_COST_ALERT,
    );
    if (alreadyAlerted) return;

    const rows = await this.prisma.$queryRaw<Array<{ total_cost: number }>>`
      SELECT COALESCE(SUM("estimatedCostUsd"), 0) AS total_cost
      FROM ai_run_ledger
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= DATE_TRUNC('month', NOW())
    `;
    const currentCost = Number(rows[0]?.total_cost ?? 0);
    const percentUsed = this.monthlyCap > 0 ? currentCost / this.monthlyCap : 0;

    if (percentUsed < this.costAlertThreshold) return;

    this.logger.warn(
      `[tenant:${tenantId}] AI cost alert: ${(percentUsed * 100).toFixed(1)}% of monthly cap ($${currentCost.toFixed(2)} / $${this.monthlyCap.toFixed(2)})`,
    );

    this.realtimeEvents.emitAiCostAlert(tenantId, {
      currentCost,
      monthlyCap: this.monthlyCap,
      percentUsed: Number(percentUsed.toFixed(3)),
      timestamp: new Date().toISOString(),
    });

    // Set 24h cooldown to prevent alert spam
    await this.cacheService.set(cooldownKey, true, {
      ttl: AiAnalyticsService.COST_ALERT_COOLDOWN_S,
      namespace: CacheNamespace.AI_COST_ALERT,
    });
  }
}
