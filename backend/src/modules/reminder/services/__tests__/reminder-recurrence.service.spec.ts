import { ReminderRecurrenceService } from '../reminder-recurrence.service';

describe('ReminderRecurrenceService', () => {
  let service: ReminderRecurrenceService;

  beforeEach(() => {
    service = new ReminderRecurrenceService();
  });

  describe('getNextOccurrence', () => {
    it('should return next daily occurrence after the reference date', () => {
      const rule = 'DTSTART:20260401T100000Z\nRRULE:FREQ=DAILY;INTERVAL=1';
      const after = new Date('2026-04-01T10:00:00Z');
      const next = service.getNextOccurrence(rule, after);
      expect(next).not.toBeNull();
      expect(next!.getTime()).toBeGreaterThan(after.getTime());
      expect(next!.toISOString().slice(0, 10)).toBe('2026-04-02');
    });

    it('should return next weekly occurrence', () => {
      const rule = 'DTSTART:20260401T100000Z\nRRULE:FREQ=WEEKLY;INTERVAL=1';
      const after = new Date('2026-04-01T10:00:00Z');
      const next = service.getNextOccurrence(rule, after);
      expect(next).not.toBeNull();
      expect(next!.toISOString().slice(0, 10)).toBe('2026-04-08');
    });

    it('should return next monthly occurrence', () => {
      const rule = 'DTSTART:20260401T100000Z\nRRULE:FREQ=MONTHLY;INTERVAL=1';
      const after = new Date('2026-04-01T10:00:00Z');
      const next = service.getNextOccurrence(rule, after);
      expect(next).not.toBeNull();
      expect(next!.toISOString().slice(0, 10)).toBe('2026-05-01');
    });

    it('should return a future date for bare RRULE without DTSTART', () => {
      // Without DTSTART, rrule anchors to current time — just verify it returns something after `after`
      const rule = 'FREQ=DAILY;INTERVAL=1';
      const after = new Date();
      const next = service.getNextOccurrence(rule, after);
      expect(next).not.toBeNull();
      expect(next!.getTime()).toBeGreaterThan(after.getTime());
    });

    it('should return null for exhausted COUNT rule', () => {
      const rule = 'DTSTART:20260401T100000Z\nRRULE:FREQ=DAILY;INTERVAL=1;COUNT=3';
      // 3 occurrences: Apr 1, 2, 3. After Apr 3 there should be nothing.
      const after = new Date('2026-04-03T10:00:00Z');
      const next = service.getNextOccurrence(rule, after);
      expect(next).toBeNull();
    });

    it('should return null for past UNTIL date', () => {
      const rule = 'DTSTART:20260401T100000Z\nRRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20260402T100000Z';
      const after = new Date('2026-04-03T10:00:00Z');
      const next = service.getNextOccurrence(rule, after);
      expect(next).toBeNull();
    });

    it('should return null for invalid RRULE', () => {
      const next = service.getNextOccurrence('INVALID_RULE', new Date());
      expect(next).toBeNull();
    });
  });

  describe('isValidRule', () => {
    it('should return true for valid RRULE', () => {
      expect(service.isValidRule('FREQ=DAILY;INTERVAL=1')).toBe(true);
      expect(service.isValidRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO')).toBe(true);
    });

    it('should return false for invalid RRULE', () => {
      expect(service.isValidRule('NOT_AN_RRULE')).toBe(false);
    });
  });

  describe('buildPresetRule', () => {
    it('should build daily rule', () => {
      expect(service.buildPresetRule('daily')).toBe('FREQ=DAILY;INTERVAL=1');
    });

    it('should build weekly rule', () => {
      expect(service.buildPresetRule('weekly')).toBe('FREQ=WEEKLY;INTERVAL=1');
    });

    it('should build monthly rule', () => {
      expect(service.buildPresetRule('monthly')).toBe('FREQ=MONTHLY;INTERVAL=1');
    });
  });

  describe('describeRule', () => {
    it('should return human-readable description', () => {
      const desc = service.describeRule('FREQ=DAILY;INTERVAL=1');
      expect(desc).not.toBeNull();
      expect(typeof desc).toBe('string');
    });

    it('should return null for invalid rule', () => {
      expect(service.describeRule('INVALID')).toBeNull();
    });
  });
});
