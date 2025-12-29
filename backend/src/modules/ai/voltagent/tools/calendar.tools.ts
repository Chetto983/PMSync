/**
 * Calendar Tools for VoltAgent
 *
 * Provides calendar operations as VoltAgent tools with Zod schemas.
 * Uses centralized locale system for translations.
 *
 * Performance optimizations (2025-12-14):
 * - Redis caching for event metadata lookups (tenant-scoped)
 * - Memory fallback when Redis unavailable
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { getToolTranslations, type SupportedLocale } from '../locales';

/**
 * Event metadata for caching
 */
interface EventMetadata {
  id: string;
  title: string;
}

/**
 * Cache configuration
 */
const EVENT_METADATA_CACHE_TTL = 300; // 5 minutes

/**
 * Get event metadata with Redis caching
 */
async function getEventMetadata(
  prisma: PrismaService,
  tenantId: string,
  eventId: string,
  cacheService?: CacheService,
): Promise<EventMetadata | null> {
  const cacheKey = `${tenantId}:event:${eventId}`;

  // Try Redis cache first
  if (cacheService?.isHealthy()) {
    try {
      const cached = await cacheService.get<EventMetadata>(cacheKey, {
        namespace: CacheNamespace.CALENDAR_EVENT,
      });
      if (cached) return cached;
    } catch {
      // Fall through to DB
    }
  }

  // Query database
  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, tenantId },
    select: { id: true, title: true },
  });

  // Cache the result
  if (event && cacheService?.isHealthy()) {
    try {
      await cacheService.set(cacheKey, event, {
        namespace: CacheNamespace.CALENDAR_EVENT,
        ttl: EVENT_METADATA_CACHE_TTL,
      });
    } catch {
      // Ignore cache errors
    }
  }

  return event;
}

/**
 * Creates all calendar-related tools for VoltAgent.
 *
 * @param prisma - Prisma service for database access
 * @param calendarService - Calendar service (nullable)
 * @param locale - User's locale for translations
 * @param tenantId - Tenant ID for data isolation
 * @param cacheService - Optional cache service for Redis caching
 */
export function createCalendarTools(
  prisma: PrismaService,
  calendarService: CalendarService | null,
  locale: SupportedLocale = 'en',
  tenantId: string,
  cacheService?: CacheService,
) {
  const t = getToolTranslations(locale);
  const dateLocale = locale === 'it' ? 'it-IT' : 'en-US';

  const formatDate = (date: Date) =>
    date.toLocaleDateString(dateLocale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return [
    // ========== GET EVENTS ==========
    createTool({
      name: 'get_events',
      description:
        'Get calendar events for a date range. Use this to check schedule, find free time, or list upcoming events.',
      parameters: z.object({
        startDate: z.string().describe('Start date in ISO format (YYYY-MM-DD or full ISO datetime)'),
        endDate: z.string().describe('End date in ISO format (YYYY-MM-DD or full ISO datetime)'),
        calendarId: z.string().optional().describe('Specific calendar ID (optional)'),
      }),
      execute: async ({ startDate, endDate, calendarId }) => {
        const events = await prisma.calendarEvent.findMany({
          where: {
            tenantId,
            ...(calendarId ? { calendarId } : {}),
            startTime: { gte: new Date(startDate) },
            endTime: { lte: new Date(endDate) },
            isDeleted: false,
            isCancelled: false,
          },
          orderBy: { startTime: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            startTime: true,
            endTime: true,
            location: true,
            isAllDay: true,
          },
        });

        // Convert Date objects to ISO strings for AI SDK JSON schema compatibility
        return {
          success: true,
          data: events.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            location: e.location,
            isAllDay: e.isAllDay,
            startTime: e.startTime?.toISOString() ?? null,
            endTime: e.endTime?.toISOString() ?? null,
            startTimeFormatted: formatDate(e.startTime),
            endTimeFormatted: formatDate(e.endTime),
          })),
          summary: t.calendar.eventsFound(events.length),
        };
      },
    }),

    // ========== CREATE EVENT ==========
    createTool({
      name: 'create_event',
      description:
        'Create a new calendar event. Use when user wants to schedule a meeting, appointment, or reminder.',
      parameters: z.object({
        title: z.string().describe('Event title'),
        startTime: z.string().describe('Start time in ISO format'),
        endTime: z.string().describe('End time in ISO format'),
        description: z.string().optional().describe('Event description'),
        location: z.string().optional().describe('Event location'),
        attendees: z.array(z.string()).optional().describe('Email addresses of attendees'),
        isAllDay: z.boolean().optional().describe('All-day event'),
      }),
      execute: async ({ title, startTime, endTime, description, location, attendees, isAllDay }) => {
        if (!calendarService) {
          return { success: false, error: t.calendar.serviceUnavailable };
        }

        return {
          success: true,
          requiresApproval: true,
          actionType: 'CREATE_EVENT',
          severity: 'MEDIUM',
          payload: { title, startTime, endTime, description, location, attendees, isAllDay: isAllDay ?? false },
          summary: t.calendar.eventCreated(title, formatDate(new Date(startTime))),
        };
      },
    }),

    // ========== UPDATE EVENT ==========
    createTool({
      name: 'update_event',
      description: 'Update an existing calendar event.',
      parameters: z.object({
        eventId: z.string().describe('ID of the event to update'),
        title: z.string().optional().describe('New title'),
        startTime: z.string().optional().describe('New start time'),
        endTime: z.string().optional().describe('New end time'),
        description: z.string().optional().describe('New description'),
        location: z.string().optional().describe('New location'),
      }),
      execute: async ({ eventId, title, startTime, endTime, description, location }) => {
        if (!calendarService) {
          return { success: false, error: t.calendar.serviceUnavailable };
        }

        const event = await getEventMetadata(prisma, tenantId, eventId, cacheService);

        if (!event) {
          return { success: false, error: t.calendar.notFound };
        }

        return {
          success: true,
          requiresApproval: true,
          actionType: 'UPDATE_EVENT',
          severity: 'MEDIUM',
          payload: { eventId, title, startTime, endTime, description, location },
          summary: t.calendar.eventUpdated(event.title),
        };
      },
    }),

    // ========== DELETE EVENT ==========
    createTool({
      name: 'delete_event',
      description: 'Delete a calendar event.',
      parameters: z.object({
        eventId: z.string().describe('ID of the event to delete'),
      }),
      execute: async ({ eventId }) => {
        if (!calendarService) {
          return { success: false, error: t.calendar.serviceUnavailable };
        }

        const event = await getEventMetadata(prisma, tenantId, eventId, cacheService);

        if (!event) {
          return { success: false, error: t.calendar.notFound };
        }

        return {
          success: true,
          requiresApproval: true,
          actionType: 'DELETE_EVENT',
          severity: 'HIGH',
          payload: { eventId },
          summary: t.calendar.eventDeleted(event.title),
        };
      },
    }),

    // ========== CHECK AVAILABILITY ==========
    createTool({
      name: 'check_availability',
      description: 'Check if a time slot is available (no conflicting events).',
      parameters: z.object({
        startTime: z.string().describe('Start time to check'),
        endTime: z.string().describe('End time to check'),
      }),
      execute: async ({ startTime, endTime }) => {
        const conflictingEvents = await prisma.calendarEvent.findMany({
          where: {
            tenantId,
            isDeleted: false,
            isCancelled: false,
            OR: [
              {
                startTime: { lte: new Date(startTime) },
                endTime: { gt: new Date(startTime) },
              },
              {
                startTime: { lt: new Date(endTime) },
                endTime: { gte: new Date(endTime) },
              },
              {
                startTime: { gte: new Date(startTime) },
                endTime: { lte: new Date(endTime) },
              },
            ],
          },
          select: { title: true, startTime: true, endTime: true },
        });

        const isAvailable = conflictingEvents.length === 0;

        return {
          success: true,
          data: {
            isAvailable,
            conflictingEvents: conflictingEvents.map((e) => ({
              title: e.title,
              startTime: e.startTime.toISOString(),
              endTime: e.endTime.toISOString(),
            })),
          },
          summary: isAvailable
            ? t.calendar.slotAvailable
            : t.calendar.slotConflict(conflictingEvents.length),
        };
      },
    }),
  ];
}
