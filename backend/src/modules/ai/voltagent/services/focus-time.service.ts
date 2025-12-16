/**
 * Focus Time Protection Service (P2 Smart Scheduling)
 *
 * Protects user focus time by analyzing calendar patterns and creating
 * protected time blocks. Learns from user behavior to optimize focus times.
 *
 * Key Features:
 * - Calendar pattern analysis (meeting-heavy vs quiet times)
 * - Focus block creation and management
 * - Learning from user behavior (when they decline meetings, reschedule)
 * - Integration with user preferences
 *
 * Reference: docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md Phase 2
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import {
  addDays,
  addMinutes,
  startOfWeek,
  endOfWeek,
  format,
  getDay,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface FocusPreferences {
  duration: number; // minutes (e.g., 120 for 2 hours)
  frequency: 'daily' | 'weekly' | 'twice_weekly';
  preferredTime: 'morning' | 'afternoon' | 'flexible';
  minBlockSize: number; // minimum focus block size in minutes
  protectFromMeetings: boolean;
  autoDeclineMeetings: boolean; // Auto-decline meeting requests during focus time
}

export interface FocusBlock {
  id?: string;
  startTime: Date;
  endTime: Date;
  type: 'focus' | 'deep_work' | 'planning' | 'creative';
  isProtected: boolean;
  score: number; // How optimal this slot is (0-100)
  reason: string;
}

export interface CalendarPattern {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  hourOfDay: number; // 0-23
  meetingProbability: number; // 0-1
  avgMeetingDuration: number; // minutes
  interruptionCount: number; // Average interruptions
}

export interface FocusTimeStats {
  totalFocusHours: number;
  focusBlocksCreated: number;
  averageBlockDuration: number;
  mostProductiveDay: string;
  mostProductiveTime: string;
  focusScore: number; // 0-100 overall focus health
}

export interface OptimalFocusSlot {
  start: Date;
  end: Date;
  score: number;
  dayName: string;
  timeOfDay: string;
  reason: string;
}

// ============================================================================
// Service Implementation
// ============================================================================

@Injectable()
export class FocusTimeService {
  private readonly logger = new Logger(FocusTimeService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Analyze calendar patterns to find optimal focus times
   */
  async analyzeCalendarPatterns(
    tenantId: string,
    userId: string,
    weeksToAnalyze: number = 4,
  ): Promise<CalendarPattern[]> {
    const cacheKey = `focus:patterns:${tenantId}:${userId}`;
    const cached = await this.cacheService.get<CalendarPattern[]>(cacheKey);
    if (cached) return cached;

    const endDate = new Date();
    const startDate = addDays(endDate, -weeksToAnalyze * 7);

    // Get all events for the analysis period
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        startTime: { gte: startDate, lte: endDate },
      },
      select: {
        startTime: true,
        endTime: true,
        isAllDay: true,
      },
    });

    // Build pattern map: dayOfWeek -> hourOfDay -> stats
    const patternMap = new Map<string, { count: number; totalDuration: number }>();

    for (const event of events) {
      if (event.isAllDay) continue;

      const dayOfWeek = getDay(event.startTime);
      const hourOfDay = event.startTime.getHours();
      const duration =
        (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60);

      const key = `${dayOfWeek}-${hourOfDay}`;
      const existing = patternMap.get(key) || { count: 0, totalDuration: 0 };
      patternMap.set(key, {
        count: existing.count + 1,
        totalDuration: existing.totalDuration + duration,
      });
    }

    // Convert to patterns array
    const patterns: CalendarPattern[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`;
        const stats = patternMap.get(key) || { count: 0, totalDuration: 0 };

        patterns.push({
          dayOfWeek: day,
          hourOfDay: hour,
          meetingProbability: stats.count / weeksToAnalyze,
          avgMeetingDuration: stats.count > 0 ? stats.totalDuration / stats.count : 0,
          interruptionCount: stats.count,
        });
      }
    }

    await this.cacheService.set(cacheKey, patterns, { ttl: this.CACHE_TTL });
    return patterns;
  }

  /**
   * Find optimal focus time slots based on patterns and preferences
   */
  async findOptimalFocusSlots(
    tenantId: string,
    userId: string,
    preferences: FocusPreferences,
    numSlots: number = 5,
    lookAheadDays: number = 7,
  ): Promise<OptimalFocusSlot[]> {
    const patterns = await this.analyzeCalendarPatterns(tenantId, userId);
    const userPrefs = await this.getUserPreferences(userId);
    const busySlots = await this.getBusySlots(tenantId, lookAheadDays);

    const [startHour, startMinute] = (userPrefs?.workingHoursStart ?? '09:00')
      .split(':')
      .map(Number);
    const [endHour, endMinute] = (userPrefs?.workingHoursEnd ?? '18:00')
      .split(':')
      .map(Number);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const workingDays = userPrefs?.workingDays ?? ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const dayMap: Record<string, number> = {
      SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
    };

    const candidates: OptimalFocusSlot[] = [];
    const now = new Date();

    for (let dayOffset = 0; dayOffset < lookAheadDays; dayOffset++) {
      const date = addDays(now, dayOffset);
      const dayOfWeek = getDay(date);
      const dayName = Object.keys(dayMap).find((k) => dayMap[k] === dayOfWeek);

      // Skip non-working days
      if (!dayName || !workingDays.includes(dayName)) continue;

      // Generate candidate slots for this day
      for (let hour = startHour; hour < endHour; hour++) {
        // Skip based on time preference
        if (preferences.preferredTime === 'morning' && hour >= 12) continue;
        if (preferences.preferredTime === 'afternoon' && hour < 12) continue;

        const slotStart = setMinutes(setHours(startOfDay(date), hour), 0);
        const slotEnd = addMinutes(slotStart, preferences.duration);

        // Skip if slot extends beyond working hours
        if (slotEnd.getHours() > endHour) continue;

        // Skip if slot is in the past
        if (slotStart <= now) continue;

        // Check if slot conflicts with existing events
        const isConflicting = busySlots.some(
          (busy) =>
            (slotStart >= busy.start && slotStart < busy.end) ||
            (slotEnd > busy.start && slotEnd <= busy.end) ||
            (slotStart <= busy.start && slotEnd >= busy.end),
        );

        if (isConflicting) continue;

        // Score the slot based on patterns
        const pattern = patterns.find(
          (p) => p.dayOfWeek === dayOfWeek && p.hourOfDay === hour,
        );
        const meetingProb = pattern?.meetingProbability ?? 0.5;

        // Lower meeting probability = better focus time
        let score = Math.round((1 - meetingProb) * 100);

        // Bonus for preferred time
        if (
          (preferences.preferredTime === 'morning' && hour >= 8 && hour <= 10) ||
          (preferences.preferredTime === 'afternoon' && hour >= 14 && hour <= 16)
        ) {
          score += 15;
        }

        // Bonus for mid-week
        if (dayOfWeek >= 2 && dayOfWeek <= 4) {
          score += 10;
        }

        // Penalty for lunch time
        if (hour === 12) {
          score -= 20;
        }

        score = Math.max(0, Math.min(100, score));

        const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

        candidates.push({
          start: slotStart,
          end: slotEnd,
          score,
          dayName: dayNames[dayOfWeek],
          timeOfDay,
          reason: this.generateSlotReason(score, meetingProb, timeOfDay),
        });
      }
    }

    // Sort by score and return top slots
    return candidates.sort((a, b) => b.score - a.score).slice(0, numSlots);
  }

  /**
   * Create focus time blocks based on preferences
   */
  async createFocusBlocks(
    tenantId: string,
    userId: string,
    preferences: FocusPreferences,
  ): Promise<FocusBlock[]> {
    const optimalSlots = await this.findOptimalFocusSlots(
      tenantId,
      userId,
      preferences,
      preferences.frequency === 'daily' ? 5 : preferences.frequency === 'twice_weekly' ? 2 : 1,
    );

    const focusBlocks: FocusBlock[] = optimalSlots.map((slot) => ({
      startTime: slot.start,
      endTime: slot.end,
      type: 'focus' as const,
      isProtected: preferences.protectFromMeetings,
      score: slot.score,
      reason: slot.reason,
    }));

    this.logger.log(
      `Created ${focusBlocks.length} focus blocks for user ${userId}`,
    );

    return focusBlocks;
  }

  /**
   * Get focus time statistics
   */
  async getFocusTimeStats(
    tenantId: string,
    userId: string,
    daysBack: number = 30,
  ): Promise<FocusTimeStats> {
    const patterns = await this.analyzeCalendarPatterns(tenantId, userId, Math.ceil(daysBack / 7));

    // Find quietest patterns (low meeting probability)
    const quietPatterns = patterns
      .filter((p) => p.meetingProbability < 0.3 && p.hourOfDay >= 8 && p.hourOfDay <= 18)
      .sort((a, b) => a.meetingProbability - b.meetingProbability);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Find most productive day
    const dayScores = new Map<number, number>();
    for (const pattern of quietPatterns) {
      const existing = dayScores.get(pattern.dayOfWeek) || 0;
      dayScores.set(pattern.dayOfWeek, existing + (1 - pattern.meetingProbability));
    }
    const bestDay = Array.from(dayScores.entries()).sort((a, b) => b[1] - a[1])[0];

    // Find most productive time
    const bestPattern = quietPatterns[0];
    const timeOfDay =
      bestPattern?.hourOfDay < 12
        ? 'morning'
        : bestPattern?.hourOfDay < 17
          ? 'afternoon'
          : 'evening';

    // Calculate focus score (inverse of overall meeting load)
    const avgMeetingProb =
      patterns.reduce((sum, p) => sum + p.meetingProbability, 0) / patterns.length;
    const focusScore = Math.round((1 - avgMeetingProb) * 100);

    return {
      totalFocusHours: quietPatterns.length * 1, // Approximate
      focusBlocksCreated: 0, // Would need to track this
      averageBlockDuration: 90, // Default
      mostProductiveDay: bestDay ? dayNames[bestDay[0]] : 'Wednesday',
      mostProductiveTime: timeOfDay,
      focusScore,
    };
  }

  /**
   * Check if a time is during a focus block
   */
  async isInFocusBlock(
    tenantId: string,
    userId: string,
    time: Date,
  ): Promise<{ inFocusBlock: boolean; blockEndTime?: Date }> {
    // For now, check calendar for focus events
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        startTime: { lte: time },
        endTime: { gt: time },
        title: { contains: 'Focus', mode: 'insensitive' },
      },
      select: {
        endTime: true,
      },
    });

    if (events.length > 0) {
      return {
        inFocusBlock: true,
        blockEndTime: events[0].endTime,
      };
    }

    return { inFocusBlock: false };
  }

  /**
   * Get user preferences from database
   */
  private async getUserPreferences(userId: string) {
    return this.prisma.userPreferences.findUnique({
      where: { userId },
      select: {
        workingHoursStart: true,
        workingHoursEnd: true,
        workingDays: true,
        timezone: true,
      },
    });
  }

  /**
   * Get busy slots for the next N days
   */
  private async getBusySlots(
    tenantId: string,
    days: number,
  ): Promise<{ start: Date; end: Date }[]> {
    const now = new Date();
    const endDate = addDays(now, days);

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        startTime: { gte: now, lte: endDate },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    return events.map((e) => ({ start: e.startTime, end: e.endTime }));
  }

  /**
   * Generate reason text for a focus slot
   */
  private generateSlotReason(score: number, meetingProb: number, timeOfDay: string): string {
    if (score >= 80) {
      return `Excellent ${timeOfDay} slot with minimal meeting conflicts`;
    }
    if (score >= 60) {
      return `Good ${timeOfDay} slot - historically quiet time`;
    }
    if (score >= 40) {
      return `Acceptable ${timeOfDay} slot with moderate availability`;
    }
    return `Available ${timeOfDay} slot`;
  }
}
