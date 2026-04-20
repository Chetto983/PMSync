/**
 * Phase 149 pre-stage helper. Phase 147 implementation is a flat 30-day TTL;
 * Phase 149 will swap this for exponential decay (14-day half-life) without
 * changing call sites.
 *
 * Call sites (Phase 147):
 *   - TriageFeedbackService.getSuggestions (promotion math, D-03 + D-04)
 *
 * NOT called by (Phase 147):
 *   - TriageCorrectionService.getFewShotExamples — uses `Math.exp(-ageDays / 14)`
 *     directly in this phase (see D-09b / D-12 divergence note in 147-CONTEXT.md).
 *     Phase 149 unifies both paths behind this helper.
 */
export function weightCorrection(ageDays: number): number {
  return ageDays <= 30 ? 1 : 0;
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
 */
export const TP_IMPLICIT_WINDOW_DAYS = 14;
