/**
 * ReminderRecurrenceService — computes next occurrence from RRULE strings.
 *
 * Uses the `rrule` library (RFC 5545) to parse recurrence rules and
 * calculate the next date after a given reference point.
 */
import { Injectable, Logger } from '@nestjs/common';
import { RRule } from 'rrule';

/** Maximum number of future instances a recurring reminder can generate */
const MAX_RECURRENCE_INSTANCES = 365;

@Injectable()
export class ReminderRecurrenceService {
  private readonly logger = new Logger(ReminderRecurrenceService.name);

  /**
   * Parse an RRULE string and return the next occurrence after `after`.
   * Returns null if the rule is exhausted (past UNTIL/COUNT limit).
   */
  getNextOccurrence(rule: string, after: Date): Date | null {
    try {
      const rrule = RRule.fromString(rule);
      const next = rrule.after(after, false); // false = exclusive (strictly after)
      if (!next) return null;

      // Safety: if rule has no UNTIL/COUNT, enforce a hard cap
      if (!rule.includes('UNTIL') && !rule.includes('COUNT')) {
        const allBefore = rrule.between(new Date(0), next, true);
        if (allBefore.length >= MAX_RECURRENCE_INSTANCES) {
          this.logger.warn(`Recurrence cap reached (${MAX_RECURRENCE_INSTANCES}) for rule: ${rule}`);
          return null;
        }
      }

      return next;
    } catch (err) {
      this.logger.error(`Failed to parse RRULE: ${rule}`, (err as Error).stack);
      return null;
    }
  }

  /**
   * Validate an RRULE string. Returns true if parseable.
   */
  isValidRule(rule: string): boolean {
    try {
      RRule.fromString(rule);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build common RRULE strings for preset recurrence patterns.
   */
  buildPresetRule(preset: 'daily' | 'weekly' | 'monthly'): string {
    switch (preset) {
      case 'daily':
        return 'FREQ=DAILY;INTERVAL=1';
      case 'weekly':
        return 'FREQ=WEEKLY;INTERVAL=1';
      case 'monthly':
        return 'FREQ=MONTHLY;INTERVAL=1';
    }
  }

  /**
   * Get a human-readable description of an RRULE.
   */
  describeRule(rule: string): string | null {
    try {
      const rrule = RRule.fromString(rule);
      return rrule.toText();
    } catch {
      return null;
    }
  }
}
