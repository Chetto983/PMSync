import { Injectable } from '@nestjs/common';
import { TodayItemType, TodayTier } from '../dto/today-feed.dto';

/**
 * Phase 145 — Deterministic scoring for the Today feed.
 *
 * Pure-function service mapping (type, dueAt, sourcePriority, isOverdue, isStuck,
 * isHardDeadline) -> { tier, score }. Higher score = appears earlier within tier.
 *
 * Rules per RESEARCH.md lines 590-642 (verbatim).
 */
export interface ScoreInput {
  type: TodayItemType;
  dueAt: Date | null;
  sourcePriority?: 'low' | 'medium' | 'high' | 'urgent';
  isOverdue: boolean;
  isHardDeadline?: boolean; // calendar events, ticket SLAs
  isStuck?: boolean; // deals updatedAt > 14d
}

export interface ScoreOutput {
  tier: TodayTier;
  score: number;
}

@Injectable()
export class TodayScorerService {
  /**
   * Returns { tier, score } for a feed item.
   * Tier rules are evaluated in order; first match wins.
   */
  scoreItem(input: ScoreInput, now: Date = new Date()): ScoreOutput {
    if (input.isOverdue) {
      return { tier: 'urgent', score: this.scoreUrgent(input, now) };
    }
    if (input.sourcePriority === 'urgent') {
      return { tier: 'urgent', score: this.scoreUrgent(input, now) };
    }
    if (input.dueAt && this.isToday(input.dueAt, now)) {
      return { tier: 'today', score: this.scoreToday(input, now) };
    }
    if (input.isHardDeadline && input.dueAt && this.isToday(input.dueAt, now)) {
      return { tier: 'today', score: this.scoreToday(input, now) };
    }
    if (input.isStuck) {
      return { tier: 'fyi', score: this.scoreFyi(input, now) };
    }
    return { tier: 'fyi', score: this.scoreFyi(input, now) };
  }

  /** More overdue = higher score. Capped at 1000. */
  scoreUrgent(i: { dueAt: Date | null }, now: Date): number {
    if (!i.dueAt) return 500;
    const overdueHours = Math.max(0, (now.getTime() - i.dueAt.getTime()) / 3_600_000);
    return Math.min(1000, 800 + overdueHours);
  }

  /** Closer events score higher within Today tier. */
  scoreToday(i: { dueAt: Date | null }, now: Date): number {
    if (!i.dueAt) return 400;
    const minsUntil = (i.dueAt.getTime() - now.getTime()) / 60_000;
    return Math.max(100, 700 - minsUntil);
  }

  /** Closer (in the future) scores higher within FYI tier. */
  scoreFyi(i: { dueAt: Date | null }, now: Date): number {
    if (!i.dueAt) return 50;
    const hoursUntil = (i.dueAt.getTime() - now.getTime()) / 3_600_000;
    return Math.max(10, 100 - hoursUntil);
  }

  /** Same calendar date in *local time of the now reference*. */
  isToday(d: Date, now: Date): boolean {
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }
}
