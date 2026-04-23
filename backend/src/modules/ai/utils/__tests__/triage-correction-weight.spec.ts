import { weightCorrection } from '../triage-correction-weight';

describe('weightCorrection (Phase 149 — exponential decay)', () => {
  it('returns 1 at age 0', () => {
    expect(weightCorrection(0)).toBe(1);
  });

  it('returns ~0.5 at the default half-life (14 days)', () => {
    expect(weightCorrection(14)).toBeCloseTo(0.5, 5);
  });

  it('returns ~0.25 at 2x the default half-life (28 days)', () => {
    expect(weightCorrection(28)).toBeCloseTo(0.25, 5);
  });

  it('is monotonically non-increasing in ageDays', () => {
    let prev = weightCorrection(0);
    for (const age of [1, 5, 10, 14, 20, 30, 50, 100]) {
      const w = weightCorrection(age);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });

  it('is bounded in [0, 1] with default opts', () => {
    for (const age of [0, 1, 14, 100, 1000]) {
      const w = weightCorrection(age);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it('respects custom halfLifeDays', () => {
    expect(weightCorrection(7, { halfLifeDays: 7 })).toBeCloseTo(0.5, 5);
    expect(weightCorrection(28, { halfLifeDays: 7 })).toBeCloseTo(0.0625, 5);
  });

  it('clamps to minWeight opt', () => {
    const w = weightCorrection(1000, { minWeight: 0.1 });
    expect(w).toBe(0.1);
  });

  it('returns 1 for negative/zero age (clock-skew defensive)', () => {
    expect(weightCorrection(-1)).toBe(1);
    expect(weightCorrection(0)).toBe(1);
  });

  it('D-12 kill switch: large halfLifeDays keeps weight ~1', () => {
    // TRIAGE_DECAY_HALF_LIFE_DAYS=9999 rollback switch invariant.
    // weightCorrection(30, { halfLifeDays: 9999 }) = exp(-LN2/9999 * 30) ~= 0.99792,
    // which differs from 1 by ~0.00208. precision=2 (threshold 0.005) expresses
    // "kill switch keeps weight essentially 1" without false precision.
    // Deviation from plan body (which specified precision=3): plan's precision
    // value was off-by-one; the D-12 invariant itself holds.
    expect(weightCorrection(30, { halfLifeDays: 9999 })).toBeCloseTo(1, 2);
  });
});
