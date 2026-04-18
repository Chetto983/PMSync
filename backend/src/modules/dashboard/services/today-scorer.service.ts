import { Injectable } from '@nestjs/common';
import { TodayItemType, TodayStream } from '../dto/today-feed.dto';

/**
 * Phase 145.1 — Deterministic scoring for the Today feed.
 *
 * Pure-function service mapping (type, dueAt, flags) -> { stream, score }.
 * Higher score = appears earlier within a stream.
 *
 * Stream precedence (strict, CONTEXT.md §D-02):
 *   1. replies-needed     — `isAwaitingReply`
 *   2. due-today          — `isOverdue` OR (`dueAt` && isToday(dueAt, now, tz))
 *   3. waiting-on-others  — `isWaitingOnCounterparty`
 *   4. fyi                — everything else
 *
 * Fixes carried:
 * - WR-01: removed the dead hard-deadline branch that duplicated the dueAt/isToday check.
 * - WR-02: `isToday` now respects the caller tz instead of using server-local date methods.
 */
export interface ScoreInput {
  type: TodayItemType;
  dueAt: Date | null;
  isOverdue: boolean;
  /** Email the user received and hasn't replied to yet. */
  isAwaitingReply: boolean;
  /** Email the user sent whose counterparty hasn't replied yet, or equivalent. */
  isWaitingOnCounterparty: boolean;
  sourcePriority?: 'low' | 'medium' | 'high' | 'urgent';
  /** Deal with no activity in 14+ days — feeds `fyi` scoring only. */
  isStuck?: boolean;
}

export interface ScoreOutput {
  stream: TodayStream;
  score: number;
}

@Injectable()
export class TodayScorerService {
  /**
   * Returns { stream, score } for a feed item.
   * Streams are evaluated in precedence order; first match wins.
   */
  scoreItem(
    input: ScoreInput,
    now: Date = new Date(),
    tz: string = 'UTC',
  ): ScoreOutput {
    if (input.isAwaitingReply) {
      return {
        stream: 'replies-needed',
        score: this.scoreRepliesNeeded(input, now),
      };
    }
    if (input.isOverdue || (input.dueAt && this.isToday(input.dueAt, now, tz))) {
      return { stream: 'due-today', score: this.scoreDueToday(input, now) };
    }
    if (input.isWaitingOnCounterparty) {
      return {
        stream: 'waiting-on-others',
        score: this.scoreWaiting(input, now),
      };
    }
    return { stream: 'fyi', score: this.scoreFyi(input, now) };
  }

  /**
   * Replies needed — the more overdue the reply, the higher the score.
   * Caps at 1000.
   */
  scoreRepliesNeeded(i: { dueAt: Date | null }, now: Date): number {
    if (!i.dueAt) return 500;
    const overdueHours = Math.max(
      0,
      (now.getTime() - i.dueAt.getTime()) / 3_600_000,
    );
    return Math.min(1000, 800 + overdueHours);
  }

  /**
   * Due today — closer-in-time scores higher. Overdue items score above
   * upcoming ones within the same stream (inherited from legacy scoreUrgent).
   */
  scoreDueToday(i: { dueAt: Date | null }, now: Date): number {
    if (!i.dueAt) return 400;
    const diffMs = now.getTime() - i.dueAt.getTime();
    if (diffMs > 0) {
      // Overdue: same curve as the old scoreUrgent (capped at 1000).
      const overdueHours = diffMs / 3_600_000;
      return Math.min(1000, 800 + overdueHours);
    }
    // Upcoming today: closer => higher score.
    const minsUntil = (i.dueAt.getTime() - now.getTime()) / 60_000;
    return Math.max(100, 700 - minsUntil);
  }

  /**
   * Waiting on counterparty — deterministic constant tier with a small offset
   * so it sorts below `due-today` but above `fyi`. Exact number isn't
   * contractual; identical inputs must always produce identical output.
   */
  scoreWaiting(i: { dueAt: Date | null }, now: Date): number {
    return this.scoreFyi(i, now) + 50;
  }

  /** Closer (in the future) scores higher within the FYI stream. */
  scoreFyi(i: { dueAt: Date | null }, now: Date): number {
    if (!i.dueAt) return 50;
    const hoursUntil = (i.dueAt.getTime() - now.getTime()) / 3_600_000;
    return Math.max(10, 100 - hoursUntil);
  }

  /**
   * Same calendar date in the caller-provided tz.
   * Pattern mirrors DashboardTodayService.computeWindows — both sides use
   * Intl via `toLocaleDateString('en-CA', { timeZone: tz })` to avoid drift.
   */
  isToday(d: Date, now: Date, tz: string = 'UTC'): boolean {
    const fmt = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz });
    return fmt(d) === fmt(now);
  }
}
