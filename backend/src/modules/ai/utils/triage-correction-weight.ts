/**
 * Phase 149 (D-01): exponential decay weight for correction signals.
 *
 * Returns a weight in [minWeight, 1] based on the formula:
 *   w = max(minWeight, exp(-ln(2) / halfLifeDays * max(0, ageDays)))
 *
 * Defaults:
 *   halfLifeDays = 14  (recent corrections carry double the weight of 14-day-old ones)
 *   minWeight    = 0   (stale corrections asymptotically decay to zero — enables GC)
 *
 * Design notes:
 *   - Pure, DI-free utility (CLAUDE.md "pure util pattern"). Services inject
 *     ConfigService and pass `halfLifeDays` via the opts bag.
 *   - `ageDays <= 0` returns 1 (clock-skew defensive; matches reranking.service.ts).
 *   - D-12 kill switch: setting halfLifeDays to a very large value (e.g., 9999)
 *     makes decay effectively disabled — `weightCorrection(30, { halfLifeDays: 9999 }) ≈ 1`.
 *
 * Call sites (Phase 149):
 *   - TriageFeedbackService.getSuggestions (promotion math — auto-flips via this helper)
 *   - TriageCorrectionService.getFewShotExamples (Plan 02 — unifies 147 D-12 divergence)
 *   - TriageBackfillSchedulerService.processDecayGc (Plan 05 — GC threshold math)
 *   - TriageLearningService.flushSenderSignals (Plan 03 — time-aware EMA dt decay)
 *
 * Canonical analog: backend/src/modules/ai-chat/services/reranking.service.ts
 *   (see computeRecencyFactor — same formula, different domain MIN clamp value).
 */

const DEFAULT_HALF_LIFE_DAYS = 14;
const DEFAULT_MIN_WEIGHT = 0;

export interface WeightCorrectionOpts {
  /** Half-life in days. Default 14. Env-driven: TRIAGE_DECAY_HALF_LIFE_DAYS. */
  halfLifeDays?: number;
  /** Floor clamp. Default 0 (stale corrections fully decay). */
  minWeight?: number;
}

export function weightCorrection(
  ageDays: number,
  opts?: WeightCorrectionOpts,
): number {
  const halfLifeDays = opts?.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const minWeight = opts?.minWeight ?? DEFAULT_MIN_WEIGHT;

  if (ageDays <= 0) return 1;

  const decay = Math.exp(
    (-Math.LN2 / halfLifeDays) * ageDays,
  );
  return Math.max(decay, minWeight);
}

/**
 * Phase 148 D-06 / D-14: the implicit-correct window for the nightly TP sweeper
 * and the 30-day backfill. If an AI-assigned label on an Email.processedAt-dated
 * email has not been corrected within {TP_IMPLICIT_WINDOW_DAYS} days, the sweeper
 * credits it as a true positive (D-06). The 30-day backfill pass (Plan 04)
 * looks back `TP_IMPLICIT_WINDOW_DAYS + 30` days for the same logic.
 *
 * Single source of truth: both the Plan 03 service and the Plan 04 backfill
 * script import this constant directly — no local re-declarations.
 *
 * Consumers (Phase 148):
 *   - backend/src/modules/ai/services/label-accuracy.service.ts
 *       (TP_SLICE_UPPER = TP_IMPLICIT_WINDOW_DAYS, TP_SLICE_LOWER = TP_IMPLICIT_WINDOW_DAYS + 1)
 *   - backend/scripts/148-backfill-label-accuracy.ts
 *       (LOOKBACK_TP_UPPER_DAYS = TP_IMPLICIT_WINDOW_DAYS,
 *        LOOKBACK_TP_LOWER_DAYS = TP_IMPLICIT_WINDOW_DAYS + BACKFILL_LOOKBACK_DAYS)
 *
 * Phase 149 note: this constant is SEPARATE from the decay half-life. Both
 * happen to be 14 days today, but they represent distinct concepts
 * (TP credit window vs decay half-life) and must be tuned independently.
 */
export const TP_IMPLICIT_WINDOW_DAYS = 14;
