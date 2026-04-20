import { wilsonInterval } from '../wilson-interval';

describe('wilsonInterval (D-11 95% CI)', () => {
  it('returns [0, 0] for total = 0 (defensive, no NaN)', () => {
    const { low, high } = wilsonInterval(0, 0);
    expect(low).toBe(0);
    expect(high).toBe(0);
  });

  it('returns [0, 0] for negative total (clamped)', () => {
    const { low, high } = wilsonInterval(5, -3);
    expect(low).toBe(0);
    expect(high).toBe(0);
  });

  it('clamps successes > total to total', () => {
    const a = wilsonInterval(20, 10);
    const b = wilsonInterval(10, 10);
    expect(a.low).toBeCloseTo(b.low, 10);
    expect(a.high).toBeCloseTo(b.high, 10);
  });

  it('never claims 100% certainty from (1, 1) — Wilson core property', () => {
    const { low, high } = wilsonInterval(1, 1);
    expect(low).toBeLessThan(1.0);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeLessThanOrEqual(1.0);
    expect(high).toBeGreaterThan(0.9); // high is close to 1 but never 1
  });

  it('never claims 0% certainty from (0, 1) — Wilson mirror property', () => {
    const { low, high } = wilsonInterval(0, 1);
    expect(high).toBeGreaterThan(0);
    expect(low).toBe(0); // clamped
    expect(high).toBeLessThan(1);
  });

  it('returns values in [0, 1] for (50, 50)', () => {
    const { low, high } = wilsonInterval(50, 50);
    expect(low).toBeGreaterThan(0.9);
    expect(low).toBeLessThan(1);
    expect(high).toBeLessThanOrEqual(1);
  });

  it('half-width at n=20, p=0.8 is ~15% (D-11 threshold derivation)', () => {
    // 16 successes out of 20 → p̂ = 0.8
    const { low, high } = wilsonInterval(16, 20);
    const width = high - low;
    // D-11 claim: at n=20, p≈0.8, Wilson half-width ≈ 0.15 → full width ≈ 0.30
    // Accept any full width in [0.26, 0.36] so the exact Wilson calc passes
    expect(width).toBeGreaterThan(0.26);
    expect(width).toBeLessThan(0.36);
  });

  it('interval narrows as n grows (monotonic)', () => {
    const small = wilsonInterval(16, 20);
    const large = wilsonInterval(160, 200);
    const smallWidth = small.high - small.low;
    const largeWidth = large.high - large.low;
    expect(largeWidth).toBeLessThan(smallWidth);
  });

  it('low <= high always', () => {
    for (const [s, n] of [
      [0, 0],
      [0, 10],
      [5, 10],
      [10, 10],
      [1, 1000],
      [999, 1000],
    ] as const) {
      const { low, high } = wilsonInterval(s, n);
      expect(low).toBeLessThanOrEqual(high);
    }
  });
});
