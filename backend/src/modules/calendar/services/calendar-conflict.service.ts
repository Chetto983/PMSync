/**
 * Calendar Conflict Detection Service
 *
 * Detects scheduling overlaps via Prisma queries.
 * Pure algorithmic -- NO LLM calls.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────

export interface CalendarConflict {
  eventA: { id: string; title: string; startTime: Date; endTime: Date };
  eventB: { id: string; title: string; startTime: Date; endTime: Date };
  overlapMinutes: number;
  severity: 'hard' | 'soft'; // hard = one event fully within another, soft = partial
}

interface ConflictDetectionOptions {
  startDate?: Date;
  endDate?: Date;
}

interface CalendarEventRow {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
}

interface CalendarEventWithRecurrence extends CalendarEventRow {
  recurrence: string[];
}

// ─── Service ────────────────────────────────────────────────────

@Injectable()
export class CalendarConflictService {
  private readonly logger = new Logger(CalendarConflictService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detect scheduling conflicts in a date range.
   * Default: next 7 days from now.
   *
   * Algorithm: sort events by startTime, then check pairwise overlaps.
   * Two events overlap when: eventA.endTime > eventB.startTime && eventA.startTime < eventB.endTime
   */
  async detectConflicts(
    tenantId: string,
    options?: ConflictDetectionOptions,
  ): Promise<CalendarConflict[]> {
    const now = new Date();
    const startDate = options?.startDate ?? now;
    const endDate = options?.endDate ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Query non-deleted events in range (concrete instances)
    const concreteEvents = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        startTime: { lt: endDate },
        endTime: { gt: startDate },
      },
      select: { id: true, title: true, startTime: true, endTime: true, recurrence: true },
      orderBy: { startTime: 'asc' },
    });

    // Also query recurring events that START before the range but may have instances within it
    const recurringEvents = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        recurrence: { isEmpty: false },
        startTime: { lt: endDate }, // started before range end
      },
      select: { id: true, title: true, startTime: true, endTime: true, recurrence: true },
    });

    // Merge and deduplicate by id
    const allEventsMap = new Map<string, CalendarEventWithRecurrence>();
    for (const ev of [...concreteEvents, ...recurringEvents]) {
      allEventsMap.set(ev.id, ev);
    }

    // Expand recurring events into instances within the date range
    const expanded: CalendarEventRow[] = [];
    for (const ev of allEventsMap.values()) {
      if (ev.recurrence.length > 0) {
        const instances = this.expandRecurrence(ev, startDate, endDate);
        expanded.push(...instances);
      } else {
        expanded.push(ev);
      }
    }

    if (expanded.length < 2) {
      return [];
    }

    // Sort by startTime before overlap detection
    expanded.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return this.findOverlaps(expanded);
  }

  // ─── Private helpers ────────────────────────────────────────

  private findOverlaps(events: CalendarEventRow[]): CalendarConflict[] {
    const conflicts: CalendarConflict[] = [];

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i];
        const b = events[j];

        // Events are sorted by startTime; if b starts after a ends, no more overlaps for a
        if (b.startTime >= a.endTime) break;

        // Overlap exists: a.endTime > b.startTime (guaranteed) && a.startTime < b.endTime
        if (a.startTime < b.endTime) {
          const overlapStart = b.startTime; // b starts later (sorted)
          const overlapEnd = a.endTime < b.endTime ? a.endTime : b.endTime;
          const overlapMs = overlapEnd.getTime() - overlapStart.getTime();
          const overlapMinutes = Math.round(overlapMs / (60 * 1000));

          if (overlapMinutes <= 0) continue;

          const severity = this.classifySeverity(a, b);

          conflicts.push({
            eventA: { id: a.id, title: a.title, startTime: a.startTime, endTime: a.endTime },
            eventB: { id: b.id, title: b.title, startTime: b.startTime, endTime: b.endTime },
            overlapMinutes,
            severity,
          });
        }
      }
    }

    // Sort by overlapMinutes descending
    conflicts.sort((a, b) => b.overlapMinutes - a.overlapMinutes);
    return conflicts;
  }

  /**
   * Classify conflict severity:
   * - hard: one event is fully contained within the other
   * - soft: partial overlap
   */
  private classifySeverity(
    a: CalendarEventRow,
    b: CalendarEventRow,
  ): 'hard' | 'soft' {
    const aContainsB = a.startTime <= b.startTime && a.endTime >= b.endTime;
    const bContainsA = b.startTime <= a.startTime && b.endTime >= a.endTime;
    return aContainsB || bContainsA ? 'hard' : 'soft';
  }

  /**
   * Expand a recurring event into individual instances within [rangeStart, rangeEnd).
   * Supports FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY.
   * Max 365 instances to prevent runaway expansion.
   */
  private expandRecurrence(
    event: CalendarEventWithRecurrence,
    rangeStart: Date,
    rangeEnd: Date,
  ): CalendarEventRow[] {
    const rrule = event.recurrence[0];
    if (!rrule) return [event];

    const parts = this.parseRRule(rrule);
    if (!parts.freq) return [event];

    const durationMs = event.endTime.getTime() - event.startTime.getTime();
    const instances: CalendarEventRow[] = [];
    const maxInstances = 365;
    let count = 0;

    const cursor = new Date(event.startTime);
    const until = parts.until ? new Date(parts.until) : rangeEnd;
    const interval = parts.interval || 1;
    const byDay = parts.byday; // e.g. ['MO', 'WE', 'FR']

    while (cursor < rangeEnd && cursor <= until && count < maxInstances) {
      if (parts.count !== undefined && count >= parts.count) break;

      const instanceStart = new Date(cursor);
      const instanceEnd = new Date(cursor.getTime() + durationMs);

      // Check if instance falls within range
      if (instanceEnd > rangeStart && instanceStart < rangeEnd) {
        if (!byDay || parts.freq !== 'WEEKLY' || this.matchesByDay(cursor, byDay)) {
          instances.push({
            id: event.id,
            title: event.title,
            startTime: instanceStart,
            endTime: instanceEnd,
          });
        }
      }

      // Advance cursor
      switch (parts.freq) {
        case 'DAILY':
          cursor.setDate(cursor.getDate() + interval);
          break;
        case 'WEEKLY':
          if (byDay && byDay.length > 0) {
            // Advance day-by-day within the week, then jump by interval weeks
            cursor.setDate(cursor.getDate() + 1);
          } else {
            cursor.setDate(cursor.getDate() + 7 * interval);
          }
          break;
        case 'MONTHLY':
          cursor.setMonth(cursor.getMonth() + interval);
          break;
        case 'YEARLY':
          cursor.setFullYear(cursor.getFullYear() + interval);
          break;
        default:
          return [event]; // unsupported freq, return original
      }

      count++;
    }

    return instances.length > 0 ? instances : [event];
  }

  private parseRRule(rrule: string): {
    freq?: string;
    interval?: number;
    count?: number;
    until?: string;
    byday?: string[];
  } {
    const clean = rrule.replace(/^RRULE:/i, '');
    const result: ReturnType<typeof this.parseRRule> = {};

    for (const part of clean.split(';')) {
      const [key, value] = part.split('=');
      if (!key || !value) continue;
      switch (key.toUpperCase()) {
        case 'FREQ':
          result.freq = value.toUpperCase();
          break;
        case 'INTERVAL':
          result.interval = parseInt(value, 10);
          break;
        case 'COUNT':
          result.count = parseInt(value, 10);
          break;
        case 'UNTIL':
          result.until = value;
          break;
        case 'BYDAY':
          result.byday = value.toUpperCase().split(',');
          break;
      }
    }

    return result;
  }

  private matchesByDay(date: Date, byDay: string[]): boolean {
    const dayMap: Record<number, string> = {
      0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA',
    };
    return byDay.includes(dayMap[date.getDay()]);
  }
}
