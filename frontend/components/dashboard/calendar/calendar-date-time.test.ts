import { formatDateTimeLocalInput } from './calendar-date-time';

describe('formatDateTimeLocalInput', () => {
  it('formats a Date using local date-time parts instead of UTC ISO output', () => {
    const date = new Date(2026, 2, 14, 11, 0, 0, 0);

    expect(formatDateTimeLocalInput(date)).toBe('2026-03-14T11:00');
  });

  it('formats ISO strings into datetime-local compatible values', () => {
    expect(formatDateTimeLocalInput('2026-03-14T10:00:00.000Z')).toMatch(
      /^2026-03-14T\d{2}:00$/,
    );
  });

  it('returns an empty string for invalid values', () => {
    expect(formatDateTimeLocalInput('not-a-date')).toBe('');
  });
});
