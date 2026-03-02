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

    // Query all non-deleted events in range
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        startTime: { lt: endDate },
        endTime: { gt: startDate },
      },
      select: { id: true, title: true, startTime: true, endTime: true },
      orderBy: { startTime: 'asc' },
    });

    if (events.length < 2) {
      return [];
    }

    return this.findOverlaps(events);
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
}
