/**
 * Phase 148 D-07 / D-08 / D-11 pure-math helpers.
 *
 * Extracted from `label-accuracy.service.ts` so the service file stays below
 * the CLAUDE.md 500-line cap after Plan 04 appends the runSweep gauge-refresh
 * block. All functions here are deterministic and side-effect-free — they
 * must NOT call Prisma, Redis, EventEmitter, or Prometheus.
 */
import { wilsonInterval } from '../utils/wilson-interval';
import type {
  AccuracyDeltaEvent,
  AccuracyTriageSource,
  AccuracyWindowKey,
} from './label-accuracy.events';

/**
 * D-11 learning-state threshold. Shared by LabelAccuracyService.buildEvent
 * (applyDelta path) and LabelAccuracySweeperService.buildEvent (rollover
 * path) — both must honor the same cutoff so deltaF1 is emitted null under
 * identical conditions regardless of which service produced the event.
 */
export const LEARNING_THRESHOLD = 20;

export interface RawCounters {
  tp: number;
  fp: number;
  fn: number;
}

export interface DerivedCounters {
  sampleSize: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  wilsonPrecLow: number | null;
  wilsonPrecHigh: number | null;
  wilsonRecLow: number | null;
  wilsonRecHigh: number | null;
}

interface EventInput {
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
}

/**
 * D-15 downstream event constructor. Pure — no Prisma, Redis, EventEmitter,
 * Prometheus. Extracted from LabelAccuracyService so both the service
 * (applyDelta path) and the sweeper (rollover path) reuse identical event
 * construction without duplication.
 *
 * `deltaF1` obeys the D-11 learning-state rule: null when either side is
 * below LEARNING_THRESHOLD OR either f1 is null; otherwise `d.f1 - prev.f1`.
 */
export function buildAccuracyEvent(args: EventInput): AccuracyDeltaEvent {
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
 * D-13 micro-average across raw counters. Unlike `computeDerived` this returns
 * 0 (not null) for zero-denominator cases because the result flows straight
 * into a Prometheus Gauge.set(), which cannot represent null.
 *
 * Used by LabelAccuracySweeperService.refreshGauges for both the global
 * aggregate branch (TRIAGE_METRICS_PER_TENANT=false) and the per-tenant
 * branch. Keeping it here preserves the "pure math, no side effects" rule
 * for this file and keeps the sweeper under the 500-LF cap.
 */
export function microAverage(c: RawCounters): {
  precision: number;
  recall: number;
  f1: number;
} {
  const precision = c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : 0;
  const recall = c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : 0;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

/**
 * D-07 materialized derivation. F1 is null when either precision or recall
 * is null OR when p + r === 0 (which catches the all-zero case). Wilson
 * bounds are null when the denominator is 0 (no data points).
 */
export function computeDerived(counters: RawCounters): DerivedCounters {
  const { tp, fp, fn } = counters;
  const sampleSize = tp + fp + fn;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 =
    precision != null && recall != null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  const wPrec = wilsonInterval(tp, tp + fp);
  const wRec = wilsonInterval(tp, tp + fn);
  return {
    sampleSize,
    precision,
    recall,
    f1,
    wilsonPrecLow: tp + fp > 0 ? wPrec.low : null,
    wilsonPrecHigh: tp + fp > 0 ? wPrec.high : null,
    wilsonRecLow: tp + fn > 0 ? wRec.low : null,
    wilsonRecHigh: tp + fn > 0 ? wRec.high : null,
  };
}
