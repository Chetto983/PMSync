/**
 * Phase 148 D-07 / D-08 / D-11 pure-math helpers.
 *
 * Extracted from `label-accuracy.service.ts` so the service file stays below
 * the CLAUDE.md 500-line cap after Plan 04 appends the runSweep gauge-refresh
 * block. All functions here are deterministic and side-effect-free — they
 * must NOT call Prisma, Redis, EventEmitter, or Prometheus.
 */
import { wilsonInterval } from '../utils/wilson-interval';

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
