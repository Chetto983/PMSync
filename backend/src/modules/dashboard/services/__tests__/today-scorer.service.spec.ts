import { Test, TestingModule } from '@nestjs/testing';
import { TodayScorerService } from '../today-scorer.service';

describe('TodayScorerService', () => {
  let service: TodayScorerService;
  // Fixed reference time for determinism — mid-day UTC 2026-04-16
  const now = new Date('2026-04-16T12:00:00Z');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TodayScorerService],
    }).compile();

    service = module.get<TodayScorerService>(TodayScorerService);
  });

  describe('scoreItem — tier classification', () => {
    it('overdue task -> tier urgent', () => {
      const yesterday = new Date('2026-04-15T12:00:00Z');
      const result = service.scoreItem(
        { type: 'task', dueAt: yesterday, isOverdue: true },
        now,
      );
      expect(result.tier).toBe('urgent');
    });

    it('due-today task (later in day) -> tier today', () => {
      const laterToday = new Date('2026-04-16T18:00:00Z');
      const result = service.scoreItem(
        { type: 'task', dueAt: laterToday, isOverdue: false },
        now,
      );
      expect(result.tier).toBe('today');
    });

    it('due-tomorrow event -> tier fyi', () => {
      const tomorrow = new Date('2026-04-17T10:00:00Z');
      const result = service.scoreItem(
        { type: 'event', dueAt: tomorrow, isOverdue: false },
        now,
      );
      expect(result.tier).toBe('fyi');
    });

    it('sourcePriority urgent (no due date) -> tier urgent', () => {
      const result = service.scoreItem(
        { type: 'deal', dueAt: null, isOverdue: false, sourcePriority: 'urgent' },
        now,
      );
      expect(result.tier).toBe('urgent');
    });

    it('isStuck deal (no due date) -> tier fyi', () => {
      const result = service.scoreItem(
        { type: 'deal', dueAt: null, isOverdue: false, isStuck: true },
        now,
      );
      expect(result.tier).toBe('fyi');
    });

    it('item with no dueAt and no flags -> tier fyi', () => {
      const result = service.scoreItem(
        { type: 'task', dueAt: null, isOverdue: false },
        now,
      );
      expect(result.tier).toBe('fyi');
    });
  });

  describe('scoreUrgent — monotonic in overdue duration', () => {
    it('5-hour-overdue scores higher than 1-hour-overdue', () => {
      const fiveHoursAgo = new Date(now.getTime() - 5 * 3_600_000);
      const oneHourAgo = new Date(now.getTime() - 1 * 3_600_000);

      const a = service.scoreItem(
        { type: 'task', dueAt: fiveHoursAgo, isOverdue: true },
        now,
      );
      const b = service.scoreItem(
        { type: 'task', dueAt: oneHourAgo, isOverdue: true },
        now,
      );
      expect(a.score).toBeGreaterThan(b.score);
    });

    it('caps at 1000 even for very-overdue items', () => {
      const longAgo = new Date('2025-01-01T00:00:00Z');
      const result = service.scoreItem(
        { type: 'task', dueAt: longAgo, isOverdue: true },
        now,
      );
      expect(result.score).toBeLessThanOrEqual(1000);
    });
  });

  describe('scoreToday — monotonic in time-until', () => {
    it('event in 30 minutes scores higher than event in 6 hours', () => {
      const in30Min = new Date(now.getTime() + 30 * 60_000);
      const in6Hours = new Date(now.getTime() + 6 * 3_600_000);

      const a = service.scoreItem(
        { type: 'event', dueAt: in30Min, isOverdue: false },
        now,
      );
      const b = service.scoreItem(
        { type: 'event', dueAt: in6Hours, isOverdue: false },
        now,
      );
      expect(a.score).toBeGreaterThan(b.score);
    });
  });

  describe('scoreFyi — monotonic in time-until', () => {
    it('event in 12 hours scores higher than event in 48 hours', () => {
      const in12h = new Date(now.getTime() + 12 * 3_600_000);
      const in48h = new Date(now.getTime() + 48 * 3_600_000);

      const a = service.scoreItem(
        { type: 'event', dueAt: in12h, isOverdue: false },
        now,
      );
      const b = service.scoreItem(
        { type: 'event', dueAt: in48h, isOverdue: false },
        now,
      );
      expect(a.score).toBeGreaterThan(b.score);
    });
  });

  describe('isToday — local date equality', () => {
    // isToday compares local (getFullYear/Month/Date) to mirror BriefingService's
    // tz-aware boundaries. Pick a time that lands on the same local day as `now`
    // (2026-04-16T12:00Z) in every reasonable timezone — mid-day UTC satisfies
    // UTC-10 (02:00 local) through UTC+14 (02:00 next day would be +14, but
    // 12Z+14 = 26:00 = 02:00 next day; UTC+12 puts it at midnight same day).
    it('returns true for same calendar date across common timezones', () => {
      // Noon UTC on the same day — safe for all zones from UTC-12 to UTC+11.
      const sameDayNoon = new Date('2026-04-16T12:00:00Z');
      expect(service.isToday(sameDayNoon, now)).toBe(true);
    });

    it('returns false for clearly different day', () => {
      // Next day noon UTC — one-day offset in every zone.
      const tomorrowNoon = new Date('2026-04-17T12:00:00Z');
      expect(service.isToday(tomorrowNoon, now)).toBe(false);
    });
  });

  describe('tiebreaker stability — score+dueAt determinism', () => {
    // Tiebreaker rules per RESEARCH.md lines 644-648:
    //   1. score desc (handled by scorer)
    //   2. dueAt asc (handled by aggregator sort)
    //   3. type order: email > task > event > deal (handled by aggregator)
    //   4. id asc (handled by aggregator)
    // The scorer's contract: identical inputs -> identical (tier, score).
    it('same input produces same output deterministically', () => {
      const input = { type: 'task' as const, dueAt: now, isOverdue: false };
      const a = service.scoreItem(input, now);
      const b = service.scoreItem(input, now);
      expect(a).toEqual(b);
    });
  });
});
