/**
 * LabelAccuracyService — Phase 148 counter engine.
 *
 * applyDelta / sweepTps / rolloverWindows / read / runSweep.
 *
 * Constructor registers TRIAGE_ACCURACY_SWEEP handler SYNCHRONOUSLY (W6). Metric
 * DI tokens are @Optional (B-4 seam); Plan 03 spec passes null, Plan 04 wires
 * real providers. Day offsets derive from TP_IMPLICIT_WINDOW_DAYS (B-1, no bare
 * 14 literals). All Prisma calls filter by tenantId. EventEmitter2.emit fires
 * AFTER $transaction resolves (W-2, Phase 147 D-01 invariant).
 */
import {
  Injectable,
  Inject,
  Optional,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getToken } from '@willsoto/nestjs-prometheus';
import type { Counter, Gauge } from 'prom-client';
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
import { computeDerived } from './label-accuracy.compute';
import {
  ACCURACY_CHANGED_TOPIC,
  type AccuracyDeltaEvent,
  type AccuracyTriageSource,
  type AccuracyWindowKey,
  type LabelAccuracyKind,
} from './label-accuracy.events';

// D-11: learning-state threshold.
const LEARNING_THRESHOLD = 20;
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

export interface ApplyDeltaInput {
  tenantId: string;
  labelId: string;
  kind: LabelAccuracyKind;
  delta: number;
  triageSource?: AccuracyTriageSource;
  signal?: 'edit' | 'correction' | 'system';
}

export interface ReadOptions {
  windows?: AccuracyWindowKey[];
  includeBreakdown?: boolean;
}

export interface ReadWindowCounters {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  tp: number;
  fp: number;
  fn: number;
  sampleSize: number;
  wilsonPrecLow: number | null;
  wilsonPrecHigh: number | null;
  wilsonRecLow: number | null;
  wilsonRecHigh: number | null;
  state: 'learning' | 'ready';
}

type BreakdownCounters = Pick<
  ReadWindowCounters,
  'precision' | 'recall' | 'f1' | 'sampleSize'
> | null;

export interface ReadResult {
  labels: Array<{
    labelId: string;
    labelName: string | null;
    labelSlug: string | null;
    windows: Partial<Record<AccuracyWindowKey, ReadWindowCounters>>;
    triageSourceBreakdown?: Partial<
      Record<AccuracyTriageSource, BreakdownCounters>
    >;
    lastUpdatedAt: string | null;
  }>;
  computedAt: string;
}

@Injectable()
export class LabelAccuracyService implements OnModuleDestroy {
  private readonly logger = new Logger(LabelAccuracyService.name);
  private redisHandle: Redis | null = null;
  private redisAcquired = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduledJobs: ScheduledJobsQueueService,
    private readonly eventEmitter: EventEmitter2,
    // B-4 optional-inject seam. Plan 03 spec passes null; Plan 04 wires real mocks.
    @Optional()
    @Inject(getToken('triage_accuracy_corrections_total'))
    private readonly correctionsCounter: Counter<string> | null = null,
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

  private safeInc(
    metric: Counter<string> | null,
    labels: Record<string, string>,
    value = 1,
  ): void {
    if (!metric) return;
    metric.inc(labels, value);
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
   * D-05 primary counter-mutation entry point. Called by:
   *   1. LabelAccuracyQueueService worker (per-feedback FP/FN)
   *   2. sweepTps (TP credit)
   *   3. rolloverWindows (via decrementSingleWindow / decrementTpAging)
   *   4. Plan 04 backfill script
   * NEVER called by the read controller (Plan 05).
   *
   * W-2: EventEmitter2.emit fires AFTER `await $transaction` resolves.
   */
  async applyDelta(input: ApplyDeltaInput): Promise<void> {
    const { tenantId, labelId, kind, delta, triageSource, signal } = input;
    if (!tenantId || !labelId || !Number.isFinite(delta)) return;

    for (const windowKey of ['7d', '30d', 'all'] as const) {
      const event = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.labelAccuracyProfile.findUnique({
          where: {
            tenantId_labelId_windowKey: { tenantId, labelId, windowKey },
          },
        });
        const prev = existing ?? {
          tp: 0,
          fp: 0,
          fn: 0,
          precision: null as number | null,
          recall: null as number | null,
          f1: null as number | null,
          sampleSize: 0,
        };
        const next = this.applyKindDelta(prev, kind, delta);
        const derived = computeDerived(next);

        await tx.labelAccuracyProfile.upsert({
          where: {
            tenantId_labelId_windowKey: { tenantId, labelId, windowKey },
          },
          create: { tenantId, labelId, windowKey, ...next, ...derived },
          update: { ...next, ...derived },
        });

        if (triageSource) {
          const brk = await tx.labelAccuracySourceBreakdown.findUnique({
            where: {
              tenantId_labelId_triageSource_windowKey: {
                tenantId,
                labelId,
                triageSource,
                windowKey,
              },
            },
          });
          const bPrev = brk ?? { tp: 0, fp: 0, fn: 0 };
          const bNext = this.applyKindDelta(bPrev, kind, delta);
          const bDerived = computeDerived(bNext);
          await tx.labelAccuracySourceBreakdown.upsert({
            where: {
              tenantId_labelId_triageSource_windowKey: {
                tenantId,
                labelId,
                triageSource,
                windowKey,
              },
            },
            create: {
              tenantId,
              labelId,
              triageSource,
              windowKey,
              ...bNext,
              ...bDerived,
            },
            update: { ...bNext, ...bDerived },
          });
        }

        return this.buildEvent({
          tenantId,
          labelId,
          windowKey,
          prev,
          nextDerived: derived,
          triageSource,
        });
      });

      // W-2: emit AFTER the transaction resolves.
      this.eventEmitter.emit(ACCURACY_CHANGED_TOPIC, event);
    }

    // B-4: null-safe counter increment. Plan 04 wires real provider.
    if (delta > 0) {
      this.safeInc(this.correctionsCounter, {
        signal: signal ?? 'unknown',
        triage_source: triageSource ?? 'unknown',
        kind,
      });
    }
  }

  private applyKindDelta(
    prev: { tp: number; fp: number; fn: number },
    kind: LabelAccuracyKind,
    delta: number,
  ): { tp: number; fp: number; fn: number } {
    return {
      tp: kind === 'tp' ? Math.max(0, prev.tp + delta) : prev.tp,
      fp: kind === 'fp' ? Math.max(0, prev.fp + delta) : prev.fp,
      fn: kind === 'fn' ? Math.max(0, prev.fn + delta) : prev.fn,
    };
  }

  private buildEvent(args: {
    tenantId: string;
    labelId: string;
    windowKey: AccuracyWindowKey;
    prev: {
      precision: number | null;
      recall: number | null;
      f1: number | null;
      sampleSize: number;
    };
    nextDerived: {
      precision: number | null;
      recall: number | null;
      f1: number | null;
      sampleSize: number;
    };
    triageSource?: AccuracyTriageSource;
  }): AccuracyDeltaEvent {
    const { prev, nextDerived: d } = args;
    return {
      tenantId: args.tenantId,
      labelId: args.labelId,
      windowKey: args.windowKey,
      before: {
        precision: prev.precision,
        recall: prev.recall,
        f1: prev.f1,
        sampleSize: prev.sampleSize,
      },
      after: {
        precision: d.precision,
        recall: d.recall,
        f1: d.f1,
        sampleSize: d.sampleSize,
      },
      deltaF1:
        prev.sampleSize < LEARNING_THRESHOLD ||
        d.sampleSize < LEARNING_THRESHOLD ||
        prev.f1 == null ||
        d.f1 == null
          ? null
          : d.f1 - prev.f1,
      triageSource: args.triageSource,
      at: new Date().toISOString(),
    };
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

        await this.applyDelta({
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

    for (const row of agedOut) {
      if (row.oldValue) {
        decremented += await this.rolloverOne(
          tenantId,
          row.id,
          row.oldValue,
          'fp',
          windowKey,
          bySlug,
          byName,
          redis,
          setKey,
        );
      }
      if (row.newValue) {
        decremented += await this.rolloverOne(
          tenantId,
          row.id,
          row.newValue,
          'fn',
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
      await tx.labelAccuracyProfile.update({
        where: {
          tenantId_labelId_windowKey: { tenantId, labelId, windowKey },
        },
        data: { ...next, ...derived },
      });
      return this.buildEvent({
        tenantId,
        labelId,
        windowKey,
        prev: {
          precision: existing.precision,
          recall: existing.recall,
          f1: existing.f1,
          sampleSize: existing.sampleSize,
        },
        nextDerived: derived,
      });
    });
    // W-2: emit OUTSIDE the transaction.
    if (event) {
      this.eventEmitter.emit(ACCURACY_CHANGED_TOPIC, event);
    }
  }

  /** D-09 read shape for Plan 05 controller. */
  async read(
    tenantId: string,
    options: ReadOptions = {},
  ): Promise<ReadResult> {
    const windows: AccuracyWindowKey[] =
      options.windows ?? ['7d', '30d', 'all'];
    const includeBreakdown = options.includeBreakdown === true;

    const profiles = await this.prisma.labelAccuracyProfile.findMany({
      where: { tenantId, windowKey: { in: windows } },
    });
    const breakdowns = includeBreakdown
      ? await this.prisma.labelAccuracySourceBreakdown.findMany({
          where: { tenantId, windowKey: { in: windows } },
        })
      : [];

    const labelIds = Array.from(
      new Set([
        ...profiles.map((p) => p.labelId),
        ...breakdowns.map((b) => b.labelId),
      ]),
    );
    const labels = labelIds.length
      ? await this.prisma.userLabel.findMany({
          where: { tenantId, id: { in: labelIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const labelMap = new Map(
      labels.map((l) => [l.id, { name: l.name, slug: l.slug ?? null }]),
    );

    type Bucket = {
      windows: Partial<Record<AccuracyWindowKey, ReadWindowCounters>>;
      breakdown: Partial<Record<AccuracyTriageSource, BreakdownCounters>>;
      lastUpdatedAt: string | null;
    };
    const byLabel = new Map<string, Bucket>();

    for (const p of profiles) {
      let bucket = byLabel.get(p.labelId);
      if (!bucket) {
        bucket = { windows: {}, breakdown: {}, lastUpdatedAt: null };
        byLabel.set(p.labelId, bucket);
      }
      bucket.windows[p.windowKey as AccuracyWindowKey] = {
        precision: p.precision,
        recall: p.recall,
        f1: p.f1,
        tp: p.tp,
        fp: p.fp,
        fn: p.fn,
        sampleSize: p.sampleSize,
        wilsonPrecLow: p.wilsonPrecLow,
        wilsonPrecHigh: p.wilsonPrecHigh,
        wilsonRecLow: p.wilsonRecLow,
        wilsonRecHigh: p.wilsonRecHigh,
        state: p.sampleSize < LEARNING_THRESHOLD ? 'learning' : 'ready',
      };
      const updatedIso =
        p.lastUpdatedAt instanceof Date
          ? p.lastUpdatedAt.toISOString()
          : new Date(p.lastUpdatedAt).toISOString();
      if (
        bucket.lastUpdatedAt == null ||
        new Date(updatedIso) > new Date(bucket.lastUpdatedAt)
      ) {
        bucket.lastUpdatedAt = updatedIso;
      }
    }

    if (includeBreakdown) {
      for (const b of breakdowns) {
        let bucket = byLabel.get(b.labelId);
        if (!bucket) {
          bucket = { windows: {}, breakdown: {}, lastUpdatedAt: null };
          byLabel.set(b.labelId, bucket);
        }
        const ts = b.triageSource as AccuracyTriageSource;
        bucket.breakdown[ts] =
          b.sampleSize === 0
            ? null
            : {
                precision: b.precision,
                recall: b.recall,
                f1: b.f1,
                sampleSize: b.sampleSize,
              };
      }
    }

    return {
      labels: Array.from(byLabel.entries()).map(([labelId, v]) => ({
        labelId,
        labelName: labelMap.get(labelId)?.name ?? null,
        labelSlug: labelMap.get(labelId)?.slug ?? null,
        windows: v.windows,
        triageSourceBreakdown: includeBreakdown ? v.breakdown : undefined,
        lastUpdatedAt: v.lastUpdatedAt,
      })),
      computedAt: new Date().toISOString(),
    };
  }

  /** D-06 cron handler. Per-tenant fan-out with Redis lease + watermark. */
  async runSweep(): Promise<void> {
    const lookback = new Date(Date.now() - DAY_MS);
    const rows = await this.prisma.emailTriageFeedback.findMany({
      where: { createdAt: { gte: lookback } },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });
    this.logger.log(
      `accuracy-sweep fan-out: ${rows.length} tenant(s) with recent feedback`,
    );
    const redis = this.getRedis();
    for (const { tenantId } of rows) {
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * 30_000)),
      );
      if (redis) {
        const acquired = await redis.set(
          LEASE_KEY(tenantId),
          String(Date.now()),
          'EX',
          LEASE_TTL_SECONDS,
          'NX',
        );
        if (acquired !== 'OK') {
          this.logger.debug(
            `accuracy-sweep: lease held elsewhere for tenant=${tenantId}, skipping`,
          );
          continue;
        }
      }
      try {
        const tp = await this.sweepTps(tenantId);
        const dec = await this.rolloverWindows(tenantId);
        if (redis) {
          await redis.set(WATERMARK_KEY(tenantId), new Date().toISOString());
        }
        this.logger.log(
          `accuracy-sweep tenant=${tenantId}: credited=${tp.credited} decremented=${dec.decremented}`,
        );
      } catch (err) {
        this.logger.error(
          `accuracy-sweep failed tenant=${tenantId}: ${String(err)}`,
        );
      }
    }
    // Plan 04 appends the real gauge-refresh block here; Plan 03 safeSet is a no-op.
    this.safeSet(this.precisionGauge, { tenant: 'all' }, 0);
    this.safeSet(this.recallGauge, { tenant: 'all' }, 0);
    this.safeSet(this.f1Gauge, { tenant: 'all' }, 0);
  }
}
