import { weightCorrection } from '../triage-correction-weight';

describe('weightCorrection', () => {
  it('returns 1 for age 0 (fresh correction)', () => {
    expect(weightCorrection(0)).toBe(1);
  });

  it('returns 1 for age exactly 30 days (inclusive boundary)', () => {
    expect(weightCorrection(30)).toBe(1);
  });

  it('returns 0 for age 31 days (just past boundary)', () => {
    expect(weightCorrection(31)).toBe(0);
  });

  it('returns 0 for very old corrections', () => {
    expect(weightCorrection(100)).toBe(0);
  });

  it('returns 1 for negative age (defensive — clock skew)', () => {
    expect(weightCorrection(-1)).toBe(1);
  });

  it('handles fractional age values correctly', () => {
    expect(weightCorrection(29.9)).toBe(1);
    expect(weightCorrection(30.0)).toBe(1);
    expect(weightCorrection(30.1)).toBe(0);
  });
});
