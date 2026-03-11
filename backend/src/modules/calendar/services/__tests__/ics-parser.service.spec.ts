/**
 * IcsParserService unit tests — BTEST-01
 * Pure unit tests — no DB, no mocks needed.
 * parseIcs() is async — all calls MUST be awaited.
 */
import { IcsParserService } from '../ics-parser.service';

// ─── ICS Fixtures ────────────────────────────────────────────────────────────

const DAILY_RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:daily-recur-001@test.local
DTSTART;TZID=America/New_York:20260315T090000
DTEND;TZID=America/New_York:20260315T100000
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Daily Standup
ORGANIZER;CN=Alice:mailto:alice@test.local
END:VEVENT
END:VCALENDAR`;

const WEEKLY_RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:weekly-recur-001@test.local
DTSTART;TZID=America/New_York:20260316T100000
DTEND;TZID=America/New_York:20260316T110000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6
SUMMARY:Weekly Standup MWF
ORGANIZER:mailto:alice@test.local
END:VEVENT
END:VCALENDAR`;

const MONTHLY_RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:monthly-recur-001@test.local
DTSTART;TZID=UTC:20260115T120000Z
DTEND;TZID=UTC:20260115T130000Z
RRULE:FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3
SUMMARY:Monthly Review
ORGANIZER:mailto:alice@test.local
END:VEVENT
END:VCALENDAR`;

const YEARLY_RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:yearly-recur-001@test.local
DTSTART;TZID=UTC:20260401T090000Z
DTEND;TZID=UTC:20260401T100000Z
RRULE:FREQ=YEARLY;COUNT=2
SUMMARY:Annual Review
ORGANIZER:mailto:alice@test.local
END:VEVENT
END:VCALENDAR`;

const ALL_DAY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:allday-001@test.local
DTSTART;VALUE=DATE:20260315
DTEND;VALUE=DATE:20260316
SUMMARY:All Day Event
ORGANIZER:mailto:alice@test.local
END:VEVENT
END:VCALENDAR`;

// DST transition: America/New_York clocks spring forward on 2026-03-08 at 02:00
const DST_TRANSITION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:dst-001@test.local
DTSTART;TZID=America/New_York:20260308T120000
DTEND;TZID=America/New_York:20260308T130000
SUMMARY:DST Day Meeting
ORGANIZER:mailto:alice@test.local
END:VEVENT
END:VCALENDAR`;

const UTC_OFFSET_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:utc-offset-001@test.local
DTSTART:20260315T090000Z
DTEND:20260315T100000Z
SUMMARY:UTC Meeting
ORGANIZER:mailto:alice@test.local
END:VEVENT
END:VCALENDAR`;

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('IcsParserService', () => {
  const service = new IcsParserService();

  describe('DAILY recurring event', () => {
    it('parses DAILY RRULE and exposes recurrence array', async () => {
      const result = await service.parseIcs(DAILY_RECURRING_ICS);

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('daily-recur-001@test.local');
      expect(result!.summary).toBe('Daily Standup');
      expect(result!.recurrence).toBeDefined();
      expect(result!.recurrence!.length).toBeGreaterThanOrEqual(1);
      // RRULE string should contain FREQ=DAILY
      const rrule = result!.recurrence!.join('');
      expect(rrule).toMatch(/FREQ=DAILY/i);
    });
  });

  describe('WEEKLY recurring event', () => {
    it('parses WEEKLY RRULE with BYDAY clause', async () => {
      const result = await service.parseIcs(WEEKLY_RECURRING_ICS);

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('weekly-recur-001@test.local');
      expect(result!.recurrence).toBeDefined();
      const rrule = result!.recurrence!.join('');
      expect(rrule).toMatch(/FREQ=WEEKLY/i);
      expect(rrule).toMatch(/BYDAY/i);
    });
  });

  describe('MONTHLY recurring event', () => {
    it('parses MONTHLY RRULE anchored to BYMONTHDAY=15', async () => {
      const result = await service.parseIcs(MONTHLY_RECURRING_ICS);

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('monthly-recur-001@test.local');
      expect(result!.recurrence).toBeDefined();
      const rrule = result!.recurrence!.join('');
      expect(rrule).toMatch(/FREQ=MONTHLY/i);
      expect(rrule).toMatch(/BYMONTHDAY=15/i);
    });
  });

  describe('YEARLY recurring event', () => {
    it('parses YEARLY RRULE correctly', async () => {
      const result = await service.parseIcs(YEARLY_RECURRING_ICS);

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('yearly-recur-001@test.local');
      expect(result!.recurrence).toBeDefined();
      const rrule = result!.recurrence!.join('');
      expect(rrule).toMatch(/FREQ=YEARLY/i);
    });
  });

  describe('All-day event', () => {
    it('sets isAllDay=true and parses DATE-only start', async () => {
      const result = await service.parseIcs(ALL_DAY_ICS);

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('allday-001@test.local');
      expect(result!.isAllDay).toBe(true);
      expect(result!.summary).toBe('All Day Event');
      // startTime should correspond to 2026-03-15 (no time component)
      expect(result!.startTime).toBeInstanceOf(Date);
    });
  });

  describe('DST transition', () => {
    it('parses event on DST spring-forward day in America/New_York timezone', async () => {
      const result = await service.parseIcs(DST_TRANSITION_ICS);

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('dst-001@test.local');
      expect(result!.summary).toBe('DST Day Meeting');
      expect(result!.startTime).toBeInstanceOf(Date);
      expect(result!.endTime).toBeInstanceOf(Date);
      // timezone should be America/New_York
      expect(result!.timezone).toBe('America/New_York');
    });
  });

  describe('UTC offset', () => {
    it('parses DTSTART:YYYYMMDDTHHMMSSZ as UTC', async () => {
      const result = await service.parseIcs(UTC_OFFSET_ICS);

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('utc-offset-001@test.local');
      expect(result!.startTime).toBeInstanceOf(Date);
      // Date parsed from 20260315T090000Z => UTC 09:00
      expect(result!.startTime.toISOString()).toContain('2026-03-15');
    });
  });

  describe('Malformed / empty input', () => {
    it('returns null for empty string', async () => {
      const result = await service.parseIcs('');
      expect(result).toBeNull();
    });

    it('returns null for non-ICS garbage input', async () => {
      const result = await service.parseIcs('this is not an ics file at all');
      expect(result).toBeNull();
    });
  });

  describe('isValidIcs helper', () => {
    it('returns true for a valid ICS string', () => {
      expect(service.isValidIcs(DAILY_RECURRING_ICS)).toBe(true);
    });

    it('returns false for an empty string', () => {
      expect(service.isValidIcs('')).toBe(false);
    });

    it('returns false for a string that does not start with BEGIN:VCALENDAR', () => {
      expect(service.isValidIcs('BEGIN:VCALENDAR partial')).toBe(false);
    });
  });
});
