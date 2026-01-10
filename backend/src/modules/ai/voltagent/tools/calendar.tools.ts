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
    // ========================================================================
    // TOOL #1: get_events (read-only, kept as-is)
    // ========================================================================
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

    // ========================================================================
    // CONSOLIDATED TOOL #2: manage_event
    // Combines: create_event, update_event, delete_event, check_availability
    // Create/update/delete require HITL approval
    // ========================================================================
    createTool({
      name: 'manage_event',
      description: `Manage calendar events. CONSOLIDATED TOOL - handles create, update, delete, and check availability.

Actions:
- "create": Create new event (requires title, startTime, endTime)
- "update": Update event (requires eventId; optional fields to update)
- "delete": Delete event (requires eventId)
- "check_availability": Check if time slot is free (requires startTime, endTime)

Create/update/delete require user approval (HITL). Check_availability is read-only.`,
      parameters: z.object({
        action: z.enum(['create', 'update', 'delete', 'check_availability']).describe('Action to perform'),
        eventId: z.string().optional().describe('Event ID (for update/delete)'),
        // Event params
        title: z.string().optional().describe('Event title'),
        startTime: z.string().optional().describe('Start time in ISO format'),
        endTime: z.string().optional().describe('End time in ISO format'),
        description: z.string().optional().describe('Event description'),
        location: z.string().optional().describe('Event location'),
        attendees: z.array(z.string()).optional().describe('Email addresses of attendees'),
        isAllDay: z.boolean().optional().describe('All-day event'),
      }),
      execute: async (params) => {
        const { action, eventId, title, startTime, endTime, description, location, attendees, isAllDay } = params;

        switch (action) {
          case 'create': {
            if (!calendarService) {
              return { success: false, error: t.calendar.serviceUnavailable };
            }

            if (!title || !startTime || !endTime) {
              return { success: false, error: 'create requires title, startTime, and endTime' };
            }

            return {
              success: true,
              requiresApproval: true,
              actionType: 'CREATE_EVENT',
              severity: 'MEDIUM',
              payload: { title, startTime, endTime, description, location, attendees, isAllDay: isAllDay ?? false },
              summary: t.calendar.eventCreated(title, formatDate(new Date(startTime))),
            };
          }

          case 'update': {
            if (!calendarService) {
              return { success: false, error: t.calendar.serviceUnavailable };
            }

            if (!eventId) {
              return { success: false, error: 'update requires eventId' };
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
          }

          case 'delete': {
            if (!calendarService) {
              return { success: false, error: t.calendar.serviceUnavailable };
            }

            if (!eventId) {
              return { success: false, error: 'delete requires eventId' };
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
          }

          case 'check_availability': {
            if (!startTime || !endTime) {
              return { success: false, error: 'check_availability requires startTime and endTime' };
            }

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
          }

          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      },
    }),

    // ========================================================================
    // DEPRECATED TOOLS - Now consolidated into manage_event
    // ========================================================================
    // - create_event → manage_event(action='create')
    // - update_event → manage_event(action='update')
    // - delete_event → manage_event(action='delete')
    // - check_availability → manage_event(action='check_availability')
  ];
}
