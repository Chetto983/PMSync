/**
 * Phase 148 D-11: Wilson score interval at 95% confidence.
 *
 * Wilson is the standard binomial proportion CI for small-n, middling-p
 * classifier accuracy reporting (Wikipedia "Binomial proportion confidence
 * interval" §Wilson score interval; also referenced by Evidently AI for
 * multi-label precision/recall). Normal-approximation (z * sqrt(p(1-p)/n))
 * is worse at small n and near the boundaries — don't use it.
 *
 * At n=20, p=0.8 the half-width is ~0.15 (15%), which is the point where
 * the number stops being pure noise. That's why consumers gate the
 * "Learning…" state at sampleSize < 20 (see LabelAccuracyBadge).
 *
 * Contract:
 *   - Returns { low, high } ∈ [0, 1] × [0, 1]
 *   - total === 0 → { low: 0, high: 0 } (defensive: upstream should gate)
 *   - successes > total → treated as successes = total (clamp)
 *   - Negative inputs → treated as 0 (clamp)
 *
 * @param successes TP (for precision) or TP (for recall)
 * @param total     TP + FP (for precision) or TP + FN (for recall)
 */
export function wilsonInterval(
  successes: number,
  total: number,
): { low: number; high: number } {
  const s = Math.max(0, successes);
  const n = Math.max(0, total);
  if (n === 0) return { low: 0, high: 0 };
  const sClamped = Math.min(s, n);

  const z = 1.96;
  const z2 = z * z;
  const p = sClamped / n;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  const low = (center - margin) / denom;
  const high = (center + margin) / denom;

  return {
    low: Math.max(0, Math.min(1, low)),
    high: Math.max(0, Math.min(1, high)),
  };
}
