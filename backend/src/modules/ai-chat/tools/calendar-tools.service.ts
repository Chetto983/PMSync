import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarEventsService } from '../../calendar/services/calendar-events.service';

/**
 * PII resolve function type -- provided by AiChatService closure.
 */
type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * CalendarToolsService -- 4 calendar tools for the AI chat pipeline.
 *
 * Tools: view_calendar, create_event, update_event, delete_event
 *
 * Phase 25: Tools & RAG
 */
@Injectable()
export class CalendarToolsService {
  private readonly logger = new Logger(CalendarToolsService.name);

  constructor(
    private readonly calendarEventsService: CalendarEventsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Returns all calendar tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    _conversationId: string,
    piiResolve: PiiResolveFn,
  ) {
    return {
      view_calendar: this.buildViewCalendar(tenantId, piiResolve),
      create_event: this.buildCreateEvent(tenantId, piiResolve),
      update_event: this.buildUpdateEvent(tenantId, piiResolve),
      delete_event: this.buildDeleteEvent(tenantId, piiResolve),
    };
  }

  private buildViewCalendar(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'View calendar events within a date range. Returns event titles, times, and locations. ' +
        'Dates should be ISO 8601 format (e.g., "2025-01-15T00:00:00Z"). ' +
        'Example: view_calendar({ startDate: "2025-01-15T00:00:00Z", endDate: "2025-01-16T23:59:59Z" })',
      inputSchema: z.object({
        startDate: z
          .string()
          .optional()
          .describe('Start of date range in ISO 8601 format'),
        endDate: z
          .string()
          .optional()
          .describe('End of date range in ISO 8601 format'),
        limit: z
          .number()
          .optional()
          .describe('Max events to return (default 20, max 50)'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;
        const limit = Math.min(resolved.limit ?? 20, 50);

        const { events } = await this.calendarEventsService.listEvents(
          tenantId,
          {
            startTime: resolved.startDate
              ? new Date(resolved.startDate)
              : undefined,
            endTime: resolved.endDate
              ? new Date(resolved.endDate)
              : undefined,
            limit,
          },
        );

        const mapped = events.map((e) => ({
          id: e.id,
          title: e.title,
          start: e.startTime,
          end: e.endTime,
          location: e.location,
          isAllDay: e.isAllDay,
          attendees: e.attendees,
          calendarName: e.calendarName,
        }));

        return { events: mapped, count: mapped.length };
      },
    });
  }

  private buildCreateEvent(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Create a new calendar event. Provide title and start/end times at minimum. ' +
        'Times should be ISO 8601 format. ' +
        'Example: create_event({ title: "Team Standup", startDate: "2025-01-15T09:00:00Z", endDate: "2025-01-15T09:30:00Z" })',
      inputSchema: z.object({
        title: z.string().describe('Event title'),
        startDate: z.string().describe('Start time in ISO 8601 format'),
        endDate: z.string().describe('End time in ISO 8601 format'),
        description: z.string().optional().describe('Event description'),
        location: z.string().optional().describe('Event location'),
        attendees: z
          .array(z.string())
          .optional()
          .describe('Attendee email addresses'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        const provider = await this.getCalendarProvider(tenantId);
        const attendeesFormatted = resolved.attendees?.map((email) => ({
          email,
        }));

        const event = await this.calendarEventsService.createEvent(tenantId, {
          providerId: provider.id,
          title: resolved.title,
          startTime: new Date(resolved.startDate),
          endTime: new Date(resolved.endDate),
          description: resolved.description,
          location: resolved.location,
          attendees: attendeesFormatted,
        });

        return {
          id: event.id,
          title: event.title,
          start: event.startTime,
          end: event.endTime,
          location: event.location,
          attendees: event.attendees,
          status: 'created',
        };
      },
    });
  }

  private buildUpdateEvent(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Update an existing calendar event. Provide the event ID and fields to change. ' +
        'Example: update_event({ eventId: "clx123abc", title: "Updated Standup", location: "Room B" })',
      inputSchema: z.object({
        eventId: z.string().describe('The ID of the event to update'),
        title: z.string().optional().describe('New event title'),
        startDate: z
          .string()
          .optional()
          .describe('New start time in ISO 8601 format'),
        endDate: z
          .string()
          .optional()
          .describe('New end time in ISO 8601 format'),
        description: z.string().optional().describe('New event description'),
        location: z.string().optional().describe('New event location'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        const event = await this.calendarEventsService.updateEvent(
          tenantId,
          resolved.eventId,
          {
            title: resolved.title,
            startTime: resolved.startDate
              ? new Date(resolved.startDate)
              : undefined,
            endTime: resolved.endDate
              ? new Date(resolved.endDate)
              : undefined,
            description: resolved.description,
            location: resolved.location,
          },
        );

        return {
          id: event.id,
          title: event.title,
          start: event.startTime,
          end: event.endTime,
          location: event.location,
          status: 'updated',
        };
      },
    });
  }

  private buildDeleteEvent(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Delete a calendar event. This action cannot be undone. ' +
        'Example: delete_event({ eventId: "clx123abc" })',
      inputSchema: z.object({
        eventId: z.string().describe('The ID of the event to delete'),
      }),
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        await this.calendarEventsService.deleteEvent(
          tenantId,
          resolved.eventId,
        );

        return { id: resolved.eventId, deleted: true };
      },
    });
  }

  /**
   * Get the user's default active calendar provider.
   */
  private async getCalendarProvider(tenantId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        tenantId,
        isActive: true,
        supportsCalendar: true,
      },
    });

    if (!provider) {
      throw new Error('No active calendar provider found for tenant');
    }

    return provider;
  }
}
