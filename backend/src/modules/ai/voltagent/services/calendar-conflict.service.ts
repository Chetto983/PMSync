/**
 * Calendar Conflict Detection Service (P2 Smart Scheduling)
 *
 * Detects calendar conflicts and suggests alternative time slots.
 * Uses user working hours preferences and existing calendar events.
 *
 * Key Features:
 * - Conflict detection for proposed events
 * - Alternative slot suggestions within working hours
 * - Smart slot scoring based on user preferences
 * - Buffer time awareness between meetings
 *
 * Reference: docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md Phase 2
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { addDays, addMinutes, startOfDay, endOfDay } from 'date-fns';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ProposedEvent {
  title: string;
  startTime: Date;
  endTime: Date;
  duration: number; // minutes
  attendees?: string[];
  isFlexible?: boolean; // Can be moved if conflicts exist
}

export interface TimeSlot {
  start: Date;
  end: Date;
  duration: number; // minutes
  score: number; // 0-100 ranking score
  reason?: string; // Why this slot was suggested
}

export interface ConflictInfo {
  eventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  organizer?: string;
  overlapMinutes: number;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: ConflictInfo[];
  suggestions: TimeSlot[];
  message?: string;
}

export interface UserSchedulingPreferences {
  workingHoursStart: string; // "09:00"
  workingHoursEnd: string; // "18:00"
  workingDays: string[]; // ["MON", "TUE", "WED", "THU", "FRI"]
  timezone: string;
  preferredMeetingDuration: number; // minutes
  bufferBetweenMeetings: number; // minutes
  preferMornings: boolean;
  avoidLunchHour: boolean; // 12:00-13:00
}

export interface DetectConflictsOptions {
  includeSuggestions?: boolean;
  numSuggestions?: number;
  lookAheadDays?: number;
  bufferMinutes?: number;
}

// ============================================================================
// Service Implementation
// ============================================================================

@Injectable()
export class CalendarConflictService {
  private readonly logger = new Logger(CalendarConflictService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detect conflicts for a proposed event
   */
  async detectConflicts(
    tenantId: string,
    userId: string,
    proposedEvent: ProposedEvent,
    options: DetectConflictsOptions = {},
  ): Promise<ConflictResult> {
    const {
      includeSuggestions = true,
      numSuggestions = 3,
      lookAheadDays = 7,
      bufferMinutes = 5,
    } = options;

    this.logger.debug(
      `Checking conflicts for event: ${proposedEvent.title} at ${proposedEvent.startTime}`,
    );

    // Get all events that overlap with the proposed time (with buffer)
    const bufferedStart = addMinutes(proposedEvent.startTime, -bufferMinutes);
    const bufferedEnd = addMinutes(proposedEvent.endTime, bufferMinutes);

    const existingEvents = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        status: { not: 'cancelled' },
        OR: [
          // Event starts during proposed time
          {
            startTime: { gte: bufferedStart, lt: bufferedEnd },
          },
          // Event ends during proposed time
          {
            endTime: { gt: bufferedStart, lte: bufferedEnd },
          },
          // Event spans the entire proposed time
          {
            startTime: { lte: bufferedStart },
            endTime: { gte: bufferedEnd },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        organizer: true,
      },
      orderBy: { startTime: 'asc' },
    });

    if (existingEvents.length === 0) {
      return {
        hasConflict: false,
        conflicts: [],
        suggestions: [],
        message: 'No conflicts detected. The time slot is available.',
      };
    }

    // Calculate overlap for each conflict
    const conflicts: ConflictInfo[] = existingEvents.map((event) => ({
      eventId: event.id,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      organizer: event.organizer ?? undefined,
      overlapMinutes: this.calculateOverlap(
        proposedEvent.startTime,
        proposedEvent.endTime,
        event.startTime,
        event.endTime,
      ),
    }));

    let suggestions: TimeSlot[] = [];

    if (includeSuggestions && proposedEvent.isFlexible !== false) {
      suggestions = await this.findAlternativeSlots(
        tenantId,
        userId,
        proposedEvent,
        numSuggestions,
        lookAheadDays,
      );
    }

    return {
      hasConflict: true,
      conflicts,
      suggestions,
      message: `Found ${conflicts.length} conflicting event(s). ${suggestions.length > 0 ? `${suggestions.length} alternative slots suggested.` : ''}`,
    };
  }

  /**
   * Find alternative time slots for an event
   */
  async findAlternativeSlots(
    tenantId: string,
    userId: string,
    event: ProposedEvent,
    numSuggestions: number = 3,
    lookAheadDays: number = 7,
  ): Promise<TimeSlot[]> {
    const userPrefs = await this.getUserSchedulingPreferences(userId);
    const busySlots = await this.getBusySlots(tenantId, lookAheadDays);

    // Generate all possible slots within working hours
    const possibleSlots = this.generatePossibleSlots(
      event.duration,
      lookAheadDays,
      userPrefs,
    );

    // Filter out busy slots
    const freeSlots = possibleSlots.filter((slot) => !this.isSlotBusy(slot, busySlots));

    // Score and rank slots
    const scoredSlots = freeSlots.map((slot) => ({
      ...slot,
      score: this.scoreSlot(slot, userPrefs, event),
    }));

    // Sort by score (descending) and return top suggestions
    return scoredSlots
      .sort((a, b) => b.score - a.score)
      .slice(0, numSuggestions)
      .map((slot) => ({
        start: slot.start,
        end: slot.end,
        duration: event.duration,
        score: slot.score,
        reason: this.getSlotReason(slot, userPrefs),
      }));
  }

  /**
   * Get user scheduling preferences
   */
  async getUserSchedulingPreferences(userId: string): Promise<UserSchedulingPreferences> {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: {
        workingHoursStart: true,
        workingHoursEnd: true,
        workingDays: true,
        timezone: true,
      },
    });

    return {
      workingHoursStart: prefs?.workingHoursStart ?? '09:00',
      workingHoursEnd: prefs?.workingHoursEnd ?? '18:00',
      workingDays: prefs?.workingDays ?? ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      timezone: prefs?.timezone ?? 'UTC',
      preferredMeetingDuration: 30,
      bufferBetweenMeetings: 5,
      preferMornings: false,
      avoidLunchHour: true,
    };
  }

  /**
   * Get all busy time slots for the next N days
   */
  async getBusySlots(tenantId: string, days: number): Promise<{ start: Date; end: Date }[]> {
    const now = new Date();
    const endDate = addDays(now, days);

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        status: { not: 'cancelled' },
        startTime: { gte: now },
        endTime: { lte: endDate },
      },
      select: {
        startTime: true,
        endTime: true,
      },
      orderBy: { startTime: 'asc' },
    });

    return events.map((e) => ({ start: e.startTime, end: e.endTime }));
  }

  /**
   * Generate all possible time slots within working hours
   */
  private generatePossibleSlots(
    durationMinutes: number,
    lookAheadDays: number,
    prefs: UserSchedulingPreferences,
  ): { start: Date; end: Date }[] {
    const slots: { start: Date; end: Date }[] = [];
    const now = new Date();
    const dayMap: Record<string, number> = {
      SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
    };

    const [startHour, startMinute] = prefs.workingHoursStart.split(':').map(Number);
    const [endHour, endMinute] = prefs.workingHoursEnd.split(':').map(Number);

    for (let dayOffset = 0; dayOffset < lookAheadDays; dayOffset++) {
      const date = addDays(now, dayOffset);
      const dayOfWeek = date.getDay();

      // Check if this is a working day
      const dayName = Object.keys(dayMap).find((k) => dayMap[k] === dayOfWeek);
      if (!dayName || !prefs.workingDays.includes(dayName)) {
        continue;
      }

      // Generate slots for this day
      const dayStart = new Date(date);
      dayStart.setHours(startHour, startMinute, 0, 0);

      const dayEnd = new Date(date);
      dayEnd.setHours(endHour, endMinute, 0, 0);

      // Generate slots every 30 minutes
      let slotStart = new Date(dayStart);
      while (addMinutes(slotStart, durationMinutes) <= dayEnd) {
        // Skip if slot is in the past
        if (slotStart > now) {
          // Skip lunch hour if preference is set
          const slotHour = slotStart.getHours();
          if (prefs.avoidLunchHour && slotHour >= 12 && slotHour < 13) {
            slotStart = addMinutes(slotStart, 30);
            continue;
          }

          slots.push({
            start: new Date(slotStart),
            end: addMinutes(slotStart, durationMinutes),
          });
        }
        slotStart = addMinutes(slotStart, 30);
      }
    }

    return slots;
  }

  /**
   * Check if a slot overlaps with any busy slot
   */
  private isSlotBusy(
    slot: { start: Date; end: Date },
    busySlots: { start: Date; end: Date }[],
  ): boolean {
    return busySlots.some(
      (busy) =>
        (slot.start >= busy.start && slot.start < busy.end) ||
        (slot.end > busy.start && slot.end <= busy.end) ||
        (slot.start <= busy.start && slot.end >= busy.end),
    );
  }

  /**
   * Score a time slot based on preferences (0-100)
   */
  private scoreSlot(
    slot: { start: Date; end: Date },
    prefs: UserSchedulingPreferences,
    _event: ProposedEvent,
  ): number {
    let score = 50; // Base score

    const slotHour = slot.start.getHours();
    const slotDay = slot.start.getDay();

    // Prefer mornings if set
    if (prefs.preferMornings && slotHour < 12) {
      score += 15;
    }

    // Penalize early morning (before 9am)
    if (slotHour < 9) {
      score -= 10;
    }

    // Penalize late afternoon (after 4pm)
    if (slotHour >= 16) {
      score -= 5;
    }

    // Prefer mid-week days
    if (slotDay >= 2 && slotDay <= 4) {
      score += 10;
    }

    // Penalize Monday morning
    if (slotDay === 1 && slotHour < 10) {
      score -= 15;
    }

    // Penalize Friday afternoon
    if (slotDay === 5 && slotHour >= 14) {
      score -= 10;
    }

    // Prefer sooner dates (within reason)
    const daysAway = Math.floor(
      (slot.start.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysAway <= 1) {
      score += 10;
    } else if (daysAway >= 5) {
      score -= 5;
    }

    // Normalize to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate a human-readable reason for slot suggestion
   */
  private getSlotReason(
    slot: { start: Date; end: Date; score: number },
    _prefs: UserSchedulingPreferences,
  ): string {
    const slotHour = slot.start.getHours();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[slot.start.getDay()];

    if (slot.score >= 70) {
      if (slotHour < 12) {
        return `Optimal ${dayName} morning slot`;
      }
      return `Good ${dayName} slot within working hours`;
    }

    if (slot.score >= 50) {
      return `Available ${dayName} slot`;
    }

    return `Alternative slot on ${dayName}`;
  }

  /**
   * Calculate overlap in minutes between two time ranges
   */
  private calculateOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date,
  ): number {
    const overlapStart = new Date(Math.max(start1.getTime(), start2.getTime()));
    const overlapEnd = new Date(Math.min(end1.getTime(), end2.getTime()));

    if (overlapStart >= overlapEnd) {
      return 0;
    }

    return Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60));
  }

  /**
   * Get all events for a specific day
   */
  async getDayEvents(
    tenantId: string,
    date: Date,
  ): Promise<
    {
      id: string;
      title: string;
      startTime: Date;
      endTime: Date;
      isAllDay: boolean;
    }[]
  > {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    return this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        status: { not: 'cancelled' },
        startTime: { gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        isAllDay: true,
      },
      orderBy: { startTime: 'asc' },
    });
  }

  /**
   * Get busy percentage for a day
   */
  async getDayBusyPercentage(tenantId: string, date: Date, userId: string): Promise<number> {
    const prefs = await this.getUserSchedulingPreferences(userId);
    const events = await this.getDayEvents(tenantId, date);

    const [startHour] = prefs.workingHoursStart.split(':').map(Number);
    const [endHour] = prefs.workingHoursEnd.split(':').map(Number);
    const totalWorkMinutes = (endHour - startHour) * 60;

    let busyMinutes = 0;
    for (const event of events) {
      if (!event.isAllDay) {
        const duration =
          (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60);
        busyMinutes += duration;
      }
    }

    return Math.round((busyMinutes / totalWorkMinutes) * 100);
  }
}
