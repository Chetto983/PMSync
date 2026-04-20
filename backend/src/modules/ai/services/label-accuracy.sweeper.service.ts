/**
 * LabelAccuracySweeperService — Phase 148 cron-driven batch work. Split out of
 * `label-accuracy.service.ts` (pre-split 848 LF) for the 500-LF cap. Owns the
 * D-06 nightly TP sweeper, D-08 window rollover (7d/30d FP/FN aging + B-6 TP
 * aging), and the runSweep cron orchestrator. External behavior is identical:
 * TP credit still flows through LabelAccuracyService.applyDelta (so the D-13
 * corrections counter fires with kind='tp_credited'); rollover decrement uses
 * a direct Prisma update + post-transaction EventEmitter2.emit (W-2, Phase
 * 147 D-01); constructor registers TRIAGE_ACCURACY_SWEEP SYNCHRONOUSLY (W6);
 * day offsets derive from TP_IMPLICIT_WINDOW_DAYS (B-1); every Prisma call
 * filters by tenantId. Metric DI tokens are @Optional (B-4 seam).
 */
import { Injectable, Inject, Optional, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getToken } from '@willsoto/nestjs-prometheus';
import type { Gauge } from 'prom-client';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  getSharedRedisConnection,
  releaseSharedRedisConnection,
} from '../../../common/config/queue.config';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';
import { TP_IMPLICIT_WINDOW_DAYS } from '../utils/triage-correction-weight';
import {
  buildAccuracyEvent,
  computeDerived,
  microAverage,
} from './label-accuracy.compute';
import {
  ACCURACY_CHANGED_TOPIC,
  type AccuracyWindowKey,
  type LabelAccuracyKind,
} from './label-accuracy.events';
import { LabelAccuracyService } from './label-accuracy.service';

// D-06: 1-day slice for the sweeper derived from B-1 single source of truth.
const TP_SLICE_UPPER = TP_IMPLICIT_WINDOW_DAYS;
const TP_SLICE_LOWER = TP_IMPLICIT_WINDOW_DAYS + 1;
const WINDOW_DAYS: Record<AccuracyWindowKey, number | null> = {
  '7d': 7,
  '30d': 30,
  all: null,
};
const ROLLOVER_SLICE_DAYS = 1;
const WATERMARK_KEY = (tenantId: string) =>
  `triage:accuracy-sweep:last-processed:${tenantId}`;
const LEASE_KEY = (tenantId: string) =>
  `triage:accuracy-sweep:lease:${tenantId}`;
const ROLLOVER_SET_KEY = (tenantId: string, windowKey: AccuracyWindowKey) =>
  `triage:accuracy-rollover:decremented:${tenantId}:${windowKey}`;
const LEASE_TTL_SECONDS = 600;
const ROLLOVER_SET_TTL_SECONDS = 7 * 24 * 3600;
const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class LabelAccuracySweeperService implements OnModuleDestroy {
  private readonly logger = new Logger(LabelAccuracySweeperService.name);
  private redisHandle: Redis | null = null;
  private redisAcquired = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduledJobs: ScheduledJobsQueueService,
    private readonly eventEmitter: EventEmitter2,
    private readonly accuracyService: LabelAccuracyService,
    // B-4 optional-inject seam for the 3 gauges refreshed after runSweep.
    @Optional()
    @Inject(getToken('triage_accuracy_precision'))
    private readonly precisionGauge: Gauge<string> | null = null,
    @Optional()
    @Inject(getToken('triage_accuracy_recall'))
    private readonly recallGauge: Gauge<string> | null = null,
    @Optional()
    @Inject(getToken('triage_accuracy_f1'))
    private readonly f1Gauge: Gauge<string> | null = null,
  ) {
    // W6: register cron handler SYNCHRONOUSLY in constructor to close the race
    // window between ScheduledJobsQueueService dispatch and onModuleInit.
    this.scheduledJobs.registerHandler(
      ScheduledJobType.TRIAGE_ACCURACY_SWEEP,
      () => this.runSweep(),
    );
  }

  async onModuleDestroy() {
    if (this.redisAcquired) {
      releaseSharedRedisConnection();
      this.redisAcquired = false;
      this.redisHandle = null;
    }
  }

  private getRedis(): Redis | null {
    if (this.redisAcquired) return this.redisHandle;
    try {
      this.redisHandle = getSharedRedisConnection();
      this.redisAcquired = true;
      return this.redisHandle;
    } catch (err) {
      this.logger.warn(`Redis unavailable for accuracy sweep: ${String(err)}`);
      return null;
    }
  }

  private safeSet(
    metric: Gauge<string> | null,
    labels: Record<string, string>,
    value: number,
  ): void {
    if (!metric) return;
    metric.set(labels, value);
  }

  /**
   * D-06 TP sweeper: 1-day slice of aiLabels with no correction = TP credit.
   * Day offsets derived from TP_IMPLICIT_WINDOW_DAYS (B-1).
   */
  async sweepTps(tenantId: string): Promise<{ credited: number }> {
    // DEVIATION (Rule 1 — plan bug): plan specifies `Email.processedAt` but
    // that column lives on `EmailAnalysis`, not `Email`. Using `Email.autoTriagedAt`
    // (semantically identical per schema comment: "When auto-triage ran") keeps
    // the D-06 intent intact: "14 days since AI applied the label".
    const upper = new Date(Date.now() - TP_SLICE_UPPER * DAY_MS);
    const lower = new Date(Date.now() - TP_SLICE_LOWER * DAY_MS);
    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        autoTriagedAt: { gte: lower, lte: upper },
        aiLabels: { isEmpty: false },
      },
      select: { id: true, autoTriagedAt: true, aiLabels: true },
    });
    if (emails.length === 0) return { credited: 0 };

    const { bySlug, byName } = await this.loadLabelMaps(tenantId);
    let credited = 0;
    for (const email of emails) {
      for (const labelName of email.aiLabels ?? []) {
        const labelId = this.resolveLabelId(labelName, bySlug, byName);
        if (!labelId) continue;

        const hasCorrection = await this.prisma.emailTriageFeedback.count({
          where: {
            tenantId,
            emailId: email.id,
            OR: [{ oldValue: labelName }, { newValue: labelName }],
            createdAt: {
              gte: email.autoTriagedAt ?? lower,
              lte: new Date(),
            },
          },
        });
        if (hasCorrection > 0) continue;

        await this.accuracyService.applyDelta({
          tenantId,
          labelId,
          kind: 'tp',
          delta: 1,
          signal: 'system',
        });
        credited++;
      }
    }
    return { credited };
  }

  private async loadLabelMaps(tenantId: string): Promise<{
    bySlug: Map<string, string>;
    byName: Map<string, string>;
  }> {
    const labels = await this.prisma.userLabel.findMany({
      where: { tenantId },
      select: { id: true, slug: true, name: true },
    });
    return {
      bySlug: new Map(labels.map((l) => [l.slug, l.id])),
      byName: new Map(labels.map((l) => [l.name.toLowerCase(), l.id])),
    };
  }

  private resolveLabelId(
    name: string,
    bySlug: Map<string, string>,
    byName: Map<string, string>,
  ): string | undefined {
    return bySlug.get(name) ?? byName.get(name.toLowerCase());
  }

  /**
   * D-08 rollover: decrement 7d/30d FP/FN aged out this slice. B-6: also
   * decrement TP for pairs whose processedAt + 14d ages out of the window.
   * 'all' is monotonic (untouched).
   */
  async rolloverWindows(
    tenantId: string,
  ): Promise<{ decremented: number }> {
    let decremented = 0;
    const redis = this.getRedis();

    for (const windowKey of ['7d', '30d'] as const) {
      decremented += await this.rolloverFpFn(tenantId, windowKey, redis);
      decremented += await this.decrementTpAging(tenantId, windowKey, redis);
    }
    return { decremented };
  }

  private async rolloverFpFn(
    tenantId: string,
    windowKey: '7d' | '30d',
    redis: Redis | null,
  ): Promise<number> {
    const windowDays = WINDOW_DAYS[windowKey]!;
    const setKey = ROLLOVER_SET_KEY(tenantId, windowKey);
    const fpLower = new Date(
      Date.now() - (windowDays + ROLLOVER_SLICE_DAYS + 1) * DAY_MS,
    );
    const fpUpper = new Date(
      Date.now() - (windowDays + ROLLOVER_SLICE_DAYS) * DAY_MS,
    );
    const agedOut = await this.prisma.emailTriageFeedback.findMany({
      where: {
        tenantId,
        type: 'label_correction',
        createdAt: { gte: fpLower, lt: fpUpper },
      },
      select: { id: true, oldValue: true, newValue: true },
    });
    if (agedOut.length === 0) return 0;

    const { bySlug, byName } = await this.loadLabelMaps(tenantId);
    let decremented = 0;

    // Old label → FP+1 rollover (aged out); new label → FN+1 rollover (same).
    // Two passes per row share everything except (labelName, kind), so iterate.
    const sides: Array<['fp' | 'fn', 'oldValue' | 'newValue']> = [
      ['fp', 'oldValue'],
      ['fn', 'newValue'],
    ];
    for (const row of agedOut) {
      for (const [kind, field] of sides) {
        const labelName = row[field];
        if (!labelName) continue;
        decremented += await this.rolloverOne(
          tenantId,
          row.id,
          labelName,
          kind,
          windowKey,
          bySlug,
          byName,
          redis,
          setKey,
        );
      }
    }
    return decremented;
  }

  private async rolloverOne(
    tenantId: string,
    feedbackId: string,
    labelName: string,
    kind: 'fp' | 'fn',
    windowKey: AccuracyWindowKey,
    bySlug: Map<string, string>,
    byName: Map<string, string>,
    redis: Redis | null,
    setKey: string,
  ): Promise<number> {
    const labelId = this.resolveLabelId(labelName, bySlug, byName);
    if (!labelId) return 0;
    const dedupKey = `${feedbackId}:${labelId}:${kind}`;
    const alreadyDone = redis ? await redis.sismember(setKey, dedupKey) : 0;
    if (alreadyDone !== 0) return 0;
    await this.decrementSingleWindow(tenantId, labelId, windowKey, kind);
    if (redis) {
      await redis.sadd(setKey, dedupKey);
      await redis.expire(setKey, ROLLOVER_SET_TTL_SECONDS);
    }
    return 1;
  }

  /**
   * B-6 TP-aging pass. Decrements TP for pairs where
   * `processedAt + TP_IMPLICIT_WINDOW_DAYS` falls outside the window.
   * Idempotent via Redis set; per-pair key `${emailId}:${labelId}:tp`.
   */
  private async decrementTpAging(
    tenantId: string,
    windowKey: '7d' | '30d',
    redis: Redis | null,
  ): Promise<number> {
    const windowDays = WINDOW_DAYS[windowKey]!;
    const tpLower = new Date(
      Date.now() -
        (windowDays + TP_IMPLICIT_WINDOW_DAYS + ROLLOVER_SLICE_DAYS) * DAY_MS,
    );
    const tpUpper = new Date(
      Date.now() - (windowDays + TP_IMPLICIT_WINDOW_DAYS) * DAY_MS,
    );
    // Same Rule 1 deviation as sweepTps — plan's `processedAt` is on EmailAnalysis;
    // use `autoTriagedAt` on Email (identical D-06 semantics).
    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        autoTriagedAt: { gte: tpLower, lt: tpUpper },
        aiLabels: { isEmpty: false },
      },
      select: { id: true, autoTriagedAt: true, aiLabels: true },
    });
    if (emails.length === 0) return 0;

    const { bySlug, byName } = await this.loadLabelMaps(tenantId);
    const setKey = ROLLOVER_SET_KEY(tenantId, windowKey);
    let decremented = 0;

    for (const email of emails) {
      for (const labelName of email.aiLabels ?? []) {
        const labelId = this.resolveLabelId(labelName, bySlug, byName);
        if (!labelId) continue;

        const hasCorrection = await this.prisma.emailTriageFeedback.count({
          where: {
            tenantId,
            emailId: email.id,
            OR: [{ oldValue: labelName }, { newValue: labelName }],
          },
        });
        if (hasCorrection > 0) continue;

        const dedupKey = `${email.id}:${labelId}:tp`;
        const alreadyDone = redis
          ? await redis.sismember(setKey, dedupKey)
          : 0;
        if (alreadyDone === 1) continue;

        await this.decrementSingleWindow(tenantId, labelId, windowKey, 'tp');
        if (redis) {
          await redis.sadd(setKey, dedupKey);
          await redis.expire(setKey, ROLLOVER_SET_TTL_SECONDS);
        }
        decremented++;
      }
    }
    return decremented;
  }

  /** Window-scoped delta used by rolloverWindows. */
  private async decrementSingleWindow(
    tenantId: string,
    labelId: string,
    windowKey: AccuracyWindowKey,
    kind: LabelAccuracyKind,
  ): Promise<void> {
    const event = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.labelAccuracyProfile.findUnique({
        where: {
          tenantId_labelId_windowKey: { tenantId, labelId, windowKey },
        },
      });
      if (!existing) return null;
      const next = {
        tp: kind === 'tp' ? Math.max(0, existing.tp - 1) : existing.tp,
        fp: kind === 'fp' ? Math.max(0, existing.fp - 1) : existing.fp,
        fn: kind === 'fn' ? Math.max(0, existing.fn - 1) : existing.fn,
      };
      const derived = computeDerived(next);
      const whereKey = { tenantId_labelId_windowKey: { tenantId, labelId, windowKey } };
      await tx.labelAccuracyProfile.update({ where: whereKey, data: { ...next, ...derived } });
      return buildAccuracyEvent({
        tenantId,
        labelId,
        windowKey,
        prev: existing,
        nextDerived: derived,
      });
    });
    // W-2: emit OUTSIDE the transaction.
    if (event) {
      this.eventEmitter.emit(ACCURACY_CHANGED_TOPIC, event);
    }
  }

  /** D-06 cron handler. Per-tenant fan-out with Redis lease + watermark. */
  async runSweep(): Promise<void> {
    const lookback = new Date(Date.now() - DAY_MS);
    const rows = await this.prisma.emailTriageFeedback.findMany({
      where: { createdAt: { gte: lookback } },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });
    this.logger.log(`accuracy-sweep fan-out: ${rows.length} tenant(s) with recent feedback`);
    const redis = this.getRedis();
    for (const { tenantId } of rows) {
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 30_000)));
      if (redis) {
        const acquired = await redis.set(
          LEASE_KEY(tenantId), String(Date.now()), 'EX', LEASE_TTL_SECONDS, 'NX',
        );
        if (acquired !== 'OK') {
          this.logger.debug(`accuracy-sweep: lease held elsewhere for tenant=${tenantId}, skipping`);
          continue;
        }
      }
      try {
        const tp = await this.sweepTps(tenantId);
        const dec = await this.rolloverWindows(tenantId);
        if (redis) await redis.set(WATERMARK_KEY(tenantId), new Date().toISOString());
        this.logger.log(
          `accuracy-sweep tenant=${tenantId}: credited=${tp.credited} decremented=${dec.decremented}`,
        );
      } catch (err) {
        this.logger.error(`accuracy-sweep failed tenant=${tenantId}: ${String(err)}`);
      }
    }
    // D-13 gauge refresh after rollover settles (per-tenant or global, env-gated).
    await this.refreshGauges();
  }

  /**
   * D-13 gauge refresh. Per-tenant labels when TRIAGE_METRICS_PER_TENANT=true,
   * global aggregate otherwise (default OFF per Prometheus cardinality cap).
   */
  private async refreshGauges(): Promise<void> {
    const perTenant = process.env.TRIAGE_METRICS_PER_TENANT === 'true';
    for (const windowKey of ['7d', '30d', 'all'] as const) {
      const buckets = perTenant
        ? await this.perTenantBuckets(windowKey)
        : [{ tenantId: null, counters: await this.globalCounters(windowKey) }];
      for (const { tenantId, counters } of buckets) {
        const { precision, recall, f1 } = microAverage(counters);
        const l: Record<string, string> = { window: windowKey };
        if (tenantId) l.tenant_id = tenantId;
        this.safeSet(this.precisionGauge, l, precision);
        this.safeSet(this.recallGauge, l, recall);
        this.safeSet(this.f1Gauge, l, f1);
      }
    }
  }

  private async perTenantBuckets(windowKey: AccuracyWindowKey) {
    const rows = await this.prisma.labelAccuracyProfile.findMany({
      where: { windowKey },
      select: { tenantId: true, tp: true, fp: true, fn: true },
    });
    const by = new Map<string, { tp: number; fp: number; fn: number }>();
    for (const r of rows) {
      const a = by.get(r.tenantId) ?? { tp: 0, fp: 0, fn: 0 };
      a.tp += r.tp;
      a.fp += r.fp;
      a.fn += r.fn;
      by.set(r.tenantId, a);
    }
    return Array.from(by, ([tenantId, counters]) => ({ tenantId, counters }));
  }

  private async globalCounters(windowKey: AccuracyWindowKey) {
    const agg = await this.prisma.labelAccuracyProfile.aggregate({
      where: { windowKey },
      _sum: { tp: true, fp: true, fn: true },
    });
    return { tp: agg._sum.tp ?? 0, fp: agg._sum.fp ?? 0, fn: agg._sum.fn ?? 0 };
  }
}
