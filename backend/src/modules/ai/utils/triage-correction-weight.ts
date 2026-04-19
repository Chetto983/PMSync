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
