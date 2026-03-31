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

  // =========================================================================
  // T-0604: DST edge case tests
  // =========================================================================

  describe('DST transitions', () => {
    // US Spring Forward: 2026-03-08 02:00 → 03:00 (America/New_York)
    it('handles US spring-forward: 2:30 AM does not exist in America/New_York', () => {
      // 2:30 AM on spring-forward day doesn't exist — should resolve to 3:30 AM EDT (UTC-4)
      const parsed = parseDateTimeInTimeZone('2026-03-08T02:30:00', 'America/New_York');
      // The parser should resolve this to a valid UTC instant.
      // 3:30 AM EDT = 07:30 UTC, or the parser may clamp to 1:30 AM EST = 06:30 UTC
      // Either is acceptable — the key is it doesn't crash or return NaN
      expect(parsed.getTime()).not.toBeNaN();
      expect(parsed instanceof Date).toBe(true);
    });

    it('parses 3:00 AM EDT correctly on spring-forward day', () => {
      // 3:00 AM EDT on 2026-03-08 = UTC-4 = 07:00 UTC
      const parsed = parseDateTimeInTimeZone('2026-03-08T03:00:00', 'America/New_York');
      expect(parsed.toISOString()).toBe('2026-03-08T07:00:00.000Z');
    });

    // US Fall Back: 2026-11-01 02:00 → 01:00 (America/New_York)
    it('handles US fall-back: 1:30 AM is ambiguous in America/New_York', () => {
      // 1:30 AM on fall-back day is ambiguous (EDT or EST)
      // Parser should resolve to a valid instant (typically first occurrence = EDT)
      const parsed = parseDateTimeInTimeZone('2026-11-01T01:30:00', 'America/New_York');
      expect(parsed.getTime()).not.toBeNaN();
      // Should be either 05:30 UTC (EDT) or 06:30 UTC (EST) — both are valid
      const utcHour = parsed.getUTCHours();
      expect([5, 6]).toContain(utcHour);
    });

    // EU Spring Forward: 2026-03-29 02:00 → 03:00 (Europe/Rome, CET → CEST)
    it('handles EU spring-forward: Europe/Rome CET→CEST on 2026-03-29', () => {
      // Before DST: 01:00 CET = UTC+1 = 00:00 UTC
      const before = parseDateTimeInTimeZone('2026-03-29T01:00:00', 'Europe/Rome');
      expect(before.toISOString()).toBe('2026-03-29T00:00:00.000Z');

      // After DST: 03:00 CEST = UTC+2 = 01:00 UTC
      const after = parseDateTimeInTimeZone('2026-03-29T03:00:00', 'Europe/Rome');
      expect(after.toISOString()).toBe('2026-03-29T01:00:00.000Z');

      // 2:30 AM doesn't exist — should still produce a valid date
      const gap = parseDateTimeInTimeZone('2026-03-29T02:30:00', 'Europe/Rome');
      expect(gap.getTime()).not.toBeNaN();
    });

    // Asia/Tokyo does NOT observe DST — should be stable year-round
    it('Asia/Tokyo has no DST transitions', () => {
      // January: JST = UTC+9
      const jan = parseDateTimeInTimeZone('2026-01-15T14:00:00', 'Asia/Tokyo');
      expect(jan.toISOString()).toBe('2026-01-15T05:00:00.000Z');

      // July: still JST = UTC+9 (no DST in Japan)
      const jul = parseDateTimeInTimeZone('2026-07-15T14:00:00', 'Asia/Tokyo');
      expect(jul.toISOString()).toBe('2026-07-15T05:00:00.000Z');
    });

    it('formatDateTimeForTimeZone round-trips through DST transitions', () => {
      // Create event at 18:00 Europe/Rome in summer (CEST, UTC+2)
      const utcInstant = new Date('2026-07-15T16:00:00.000Z'); // 18:00 CEST
      const formatted = formatDateTimeForTimeZone(utcInstant, 'Europe/Rome');
      expect(formatted).toBe('2026-07-15T18:00:00');

      // Parse it back
      const roundTripped = parseDateTimeInTimeZone(formatted, 'Europe/Rome');
      expect(roundTripped.toISOString()).toBe('2026-07-15T16:00:00.000Z');
    });

    it('formatDateTimeForTimeZone round-trips winter time correctly', () => {
      // Create event at 18:00 Europe/Rome in winter (CET, UTC+1)
      const utcInstant = new Date('2026-01-15T17:00:00.000Z'); // 18:00 CET
      const formatted = formatDateTimeForTimeZone(utcInstant, 'Europe/Rome');
      expect(formatted).toBe('2026-01-15T18:00:00');

      const roundTripped = parseDateTimeInTimeZone(formatted, 'Europe/Rome');
      expect(roundTripped.toISOString()).toBe('2026-01-15T17:00:00.000Z');
    });
  });

  describe('Windows timezone alias expansion', () => {
    it('resolves common Windows timezone names', () => {
      expect(resolveCalendarTimeZone('Eastern Standard Time')).toBe('America/New_York');
      expect(resolveCalendarTimeZone('Romance Standard Time')).toBe('Europe/Paris');
      expect(resolveCalendarTimeZone('Tokyo Standard Time')).toBe('Asia/Tokyo');
      expect(resolveCalendarTimeZone('New Zealand Standard Time')).toBe('Pacific/Auckland');
      expect(resolveCalendarTimeZone('Central Standard Time (Mexico)')).toBe('America/Mexico_City');
    });

    it('passes through valid IANA timezone names', () => {
      expect(resolveCalendarTimeZone('America/New_York')).toBe('America/New_York');
      expect(resolveCalendarTimeZone('Europe/Rome')).toBe('Europe/Rome');
    });

    it('falls back to UTC for unknown timezone names', () => {
      expect(resolveCalendarTimeZone('Nonexistent/Timezone')).toBe('UTC');
      expect(resolveCalendarTimeZone(null)).toBe('UTC');
      expect(resolveCalendarTimeZone(undefined)).toBe('UTC');
    });
  });

  describe('all-day event date handling', () => {
    it('formats all-day event dates without timezone offset', () => {
      // All-day events should use date-only format regardless of timezone
      const date = new Date('2026-03-29T00:00:00.000Z');
      expect(formatDateOnlyForTimeZone(date, 'UTC')).toBe('2026-03-29');
    });

    it('all-day event at midnight UTC shows correct date in local timezone', () => {
      // Midnight UTC on 2026-03-29 = 2026-03-29 01:00 CET
      const date = new Date('2026-03-29T00:00:00.000Z');
      expect(formatDateOnlyForTimeZone(date, 'Europe/Rome')).toBe('2026-03-29');
    });

    it('all-day event near midnight boundary shows correct date', () => {
      // 23:00 UTC on 2026-03-28 = 2026-03-29 00:00 CET (next day!)
      const date = new Date('2026-03-28T23:00:00.000Z');
      expect(formatDateOnlyForTimeZone(date, 'Europe/Rome')).toBe('2026-03-29');
    });
  });
});
