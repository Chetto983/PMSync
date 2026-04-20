/**
 * LabelAccuracyService — Phase 148 counter engine (applyDelta + read).
 *
 * The cron-driven half (sweepTps, rolloverWindows, runSweep, refreshGauges)
 * lives in LabelAccuracySweeperService. Both files were split from the
 * pre-split 848-LF service to comply with CLAUDE.md's 500-LF cap; external
 * behavior is unchanged. Metric DI tokens are @Optional (B-4 seam). All
 * Prisma calls filter by tenantId. EventEmitter2.emit fires AFTER
 * $transaction resolves (W-2, Phase 147 D-01 invariant).
 */
import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getToken } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildAccuracyEvent,
  computeDerived,
  LEARNING_THRESHOLD,
} from './label-accuracy.compute';
import {
  ACCURACY_CHANGED_TOPIC,
  type AccuracyTriageSource,
  type AccuracyWindowKey,
  type LabelAccuracyKind,
} from './label-accuracy.events';

export interface ApplyDeltaInput {
  tenantId: string;
  labelId: string;
  kind: LabelAccuracyKind;
  delta: number;
  triageSource?: AccuracyTriageSource;
  /**
   * Phase 148 D-13 counter label.
   * 'edit' | 'correction' from user feedback; 'system' reserved for sweeper-internal
   * TP credit and backfill — never exposed via AccuracyDeltaEvent.
   */
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
export class LabelAccuracyService {
  private readonly logger = new Logger(LabelAccuracyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    // B-4 optional-inject seam. Plan 03 spec passes null; Plan 04 wires real mocks.
    @Optional()
    @Inject(getToken('triage_accuracy_corrections_total'))
    private readonly correctionsCounter: Counter<string> | null = null,
  ) {}

  private safeInc(
    metric: Counter<string> | null,
    labels: Record<string, string>,
    value = 1,
  ): void {
    if (!metric) return;
    metric.inc(labels, value);
  }

  /**
   * D-05 primary counter-mutation entry point. Called by:
   *   1. LabelAccuracyQueueService worker (per-feedback FP/FN)
   *   2. LabelAccuracySweeperService.sweepTps (TP credit, signal='system')
   *   3. Plan 04 backfill script
   * NEVER called by the read controller (Plan 05). Rollover decrements do
   * NOT route through here — they live in the sweeper's decrementSingleWindow.
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

        return buildAccuracyEvent({
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
    // D-13: 'tp_credited' label signals a delayed TP credit (sweeper or
    // backfill) — distinguishes from live user-event TPs in dashboards.
    if (delta > 0) {
      const kindLabel =
        kind === 'tp' && signal === 'system' ? 'tp_credited' : kind;
      this.safeInc(this.correctionsCounter, {
        signal: signal ?? 'unknown',
        triage_source: triageSource ?? 'unknown',
        kind: kindLabel,
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
}
