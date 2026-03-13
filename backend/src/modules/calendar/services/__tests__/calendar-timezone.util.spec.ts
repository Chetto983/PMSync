import {
  formatDateOnlyForTimeZone,
  formatDateTimeForTimeZone,
  parseDateTimeInTimeZone,
  parseRRuleUntilToDateOnly,
  resolveCalendarTimeZone,
} from '../../utils/calendar-timezone.util';

describe('calendar-timezone.util', () => {
  it('parses Microsoft local dateTime strings using the supplied time zone', () => {
    const parsed = parseDateTimeInTimeZone('2026-03-16T18:00:00.0000000', 'Europe/Rome');

    expect(parsed.toISOString()).toBe('2026-03-16T17:00:00.000Z');
  });

  it('formats UTC instants back into provider-local wall clock strings', () => {
    expect(formatDateTimeForTimeZone('2026-03-16T17:00:00.000Z', 'Europe/Rome')).toBe(
      '2026-03-16T18:00:00',
    );
    expect(formatDateOnlyForTimeZone('2026-03-16T17:00:00.000Z', 'Europe/Rome')).toBe(
      '2026-03-16',
    );
  });

  it('normalizes common Microsoft time zone aliases', () => {
    expect(resolveCalendarTimeZone('W. Europe Standard Time')).toBe('Europe/Berlin');
  });

  it('converts RRULE UNTIL values into Microsoft endDate values', () => {
    expect(parseRRuleUntilToDateOnly('20260320', 'Europe/Rome')).toBe('2026-03-20');
    expect(parseRRuleUntilToDateOnly('20260320T090000Z', 'Europe/Rome')).toBe('2026-03-20');
  });
});
