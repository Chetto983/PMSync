/**
 * Focus Time Service
 *
 * Suggests focus time blocks based on calendar gap analysis.
 * Pure algorithmic -- NO LLM calls.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────

export interface FocusTimeBlock {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  reason: string;
}

interface FocusTimeOptions {
  date?: Date;
  minDurationMinutes?: number;
}

// ─── Constants ──────────────────────────────────────────────────

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

// ─── Service ────────────────────────────────────────────────────

@Injectable()
export class FocusTimeService {
  private readonly logger = new Logger(FocusTimeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Suggest focus time blocks for a given day.
   * Finds gaps between meetings during working hours (9:00-18:00).
   * Only returns gaps >= minDurationMinutes.
   */
  async suggestFocusBlocks(
    tenantId: string,
    options?: FocusTimeOptions,
  ): Promise<FocusTimeBlock[]> {
    const targetDate = options?.date ?? new Date();
    const minDuration = options?.minDurationMinutes ?? 60;

    // Build working hours boundaries for the target date
    const dayStart = new Date(targetDate);
    dayStart.setHours(WORK_START_HOUR, 0, 0, 0);

    const dayEnd = new Date(targetDate);
    dayEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    // Query events for the target date (within working hours)
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
      },
      select: { startTime: true, endTime: true, title: true },
      orderBy: { startTime: 'asc' },
    });

    // Merge overlapping events into occupied slots
    const occupiedSlots = this.mergeOverlapping(events, dayStart, dayEnd);

    // Find gaps between occupied slots
    const blocks = this.findGaps(occupiedSlots, dayStart, dayEnd, minDuration);

    // Sort by duration descending (best blocks first)
    blocks.sort((a, b) => b.durationMinutes - a.durationMinutes);
    return blocks;
  }

  // ─── Private helpers ────────────────────────────────────────

  /**
   * Merge overlapping event intervals, clamped to working hours.
   */
  private mergeOverlapping(
    events: Array<{ startTime: Date; endTime: Date }>,
    dayStart: Date,
    dayEnd: Date,
  ): Array<{ start: Date; end: Date }> {
    if (events.length === 0) return [];

    // Clamp events to working hours
    const clamped = events.map(e => ({
      start: e.startTime < dayStart ? dayStart : e.startTime,
      end: e.endTime > dayEnd ? dayEnd : e.endTime,
    })).filter(e => e.start < e.end);

    if (clamped.length === 0) return [];

    // Merge overlapping intervals
    const merged: Array<{ start: Date; end: Date }> = [clamped[0]];

    for (let i = 1; i < clamped.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = clamped[i];

      if (curr.start <= prev.end) {
        // Overlapping or adjacent -- extend
        prev.end = curr.end > prev.end ? curr.end : prev.end;
      } else {
        merged.push(curr);
      }
    }

    return merged;
  }

  /**
   * Find gaps between occupied slots that meet minimum duration.
   */
  private findGaps(
    occupiedSlots: Array<{ start: Date; end: Date }>,
    dayStart: Date,
    dayEnd: Date,
    minDuration: number,
  ): FocusTimeBlock[] {
    const blocks: FocusTimeBlock[] = [];
    let cursor = dayStart;

    for (const slot of occupiedSlots) {
      if (slot.start > cursor) {
        const gapMinutes = Math.round(
          (slot.start.getTime() - cursor.getTime()) / (60 * 1000),
        );

        if (gapMinutes >= minDuration) {
          blocks.push({
            startTime: new Date(cursor),
            endTime: new Date(slot.start),
            durationMinutes: gapMinutes,
            reason: this.formatReason(cursor, slot.start),
          });
        }
      }
      // Advance cursor past this slot
      if (slot.end > cursor) {
        cursor = slot.end;
      }
    }

    // Check gap after last event until end of work day
    if (cursor < dayEnd) {
      const gapMinutes = Math.round(
        (dayEnd.getTime() - cursor.getTime()) / (60 * 1000),
      );

      if (gapMinutes >= minDuration) {
        blocks.push({
          startTime: new Date(cursor),
          endTime: new Date(dayEnd),
          durationMinutes: gapMinutes,
          reason: this.formatReason(cursor, dayEnd),
        });
      }
    }

    return blocks;
  }

  private formatReason(start: Date, end: Date): string {
    const startHour = start.getHours();
    const startMin = start.getMinutes();
    const endHour = end.getHours();
    const endMin = end.getMinutes();

    const fmt = (h: number, m: number) =>
      `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    return `No meetings between ${fmt(startHour, startMin)} and ${fmt(endHour, endMin)}`;
  }
}
