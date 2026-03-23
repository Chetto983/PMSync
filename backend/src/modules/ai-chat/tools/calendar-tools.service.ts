import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarEventsService } from '../../calendar/services/calendar-events.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

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
/** Zod schemas for calendar tools */
const schemas = {
  view_calendar: z.object({
    startDate: z.string().optional().describe('Start of date range in ISO 8601 format'),
    endDate: z.string().optional().describe('End of date range in ISO 8601 format'),
    limit: z.number().optional().describe('Max events to return (default 20, max 50)'),
  }),
  create_event: z.object({
    title: z.string().describe('Event title'),
    startDate: z.string().describe('Start time in ISO 8601 format'),
    endDate: z.string().describe('End time in ISO 8601 format'),
    description: z.string().optional().describe('Event description'),
    location: z.string().optional().describe('Event location'),
    attendees: z.array(z.string()).optional().describe('Attendee email addresses'),
  }),
  update_event: z.object({
    eventId: z.string().describe('The ID of the event to update'),
    title: z.string().optional().describe('New event title'),
    startDate: z.string().optional().describe('New start time in ISO 8601 format'),
    endDate: z.string().optional().describe('New end time in ISO 8601 format'),
    description: z.string().optional().describe('New event description'),
    location: z.string().optional().describe('New event location'),
  }),
  delete_event: z.object({
    eventId: z.string().describe('The ID of the event to delete'),
  }),
};

@Injectable()
export class CalendarToolsService implements OnModuleInit {
  private readonly logger = new Logger(CalendarToolsService.name);

  constructor(
    private readonly calendarEventsService: CalendarEventsService,
    private readonly prisma: PrismaService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      { name: 'view_calendar', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: schemas.view_calendar },
      { name: 'create_event', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.create_event },
      { name: 'update_event', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.update_event },
      { name: 'delete_event', riskLevel: 'HIGH' as const, requiresApproval: true, inputSchema: schemas.delete_event },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name,
        description: t.name,
        parameters: {},
        execute: noop,
        domain: 'calendar',
        riskLevel: t.riskLevel,
        requiresApproval: t.requiresApproval,
        inputSchema: t.inputSchema,
      });
    }
  }

  /**
   * Returns all calendar tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
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
        'View calendar events within a date range. ' +
        'If no dates are provided, returns events for today. For a weekly view, pass start and end of the week. ' +
        'Dates must be ISO 8601 format (e.g., "2026-03-15T00:00:00Z"). ' +
        'ALWAYS check this before creating new events to avoid conflicts. ' +
        'Returns: array of { id, title, start, end, location, isAllDay, attendees, calendarName }.',
      inputSchema: schemas.view_calendar,
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

        return truncateToolResult({ events: mapped, count: mapped.length });
      },
    });
  }

  private buildCreateEvent(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Create a new calendar event. Provide title and start/end times at minimum. ' +
        'ALWAYS call view_calendar first to check for conflicts in the time range. ' +
        'Use search_contacts to resolve attendee names to email addresses. ' +
        'Times must be ISO 8601 format (e.g., "2026-03-15T09:00:00Z"). ' +
        'Returns: { id, title, start, end, location, attendees, status: "created" }.',
      inputSchema: schemas.create_event,
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

        return truncateToolResult({
          id: event.id,
          title: event.title,
          start: event.startTime,
          end: event.endTime,
          location: event.location,
          attendees: event.attendees,
          status: 'created',
        });
      },
    });
  }

  private buildUpdateEvent(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Update an existing calendar event. Provide the event ID and only the fields to change. ' +
        'ALWAYS call view_calendar first to confirm the event exists and get its current details. ' +
        'Returns: { id, title, start, end, location, status: "updated" }.',
      inputSchema: schemas.update_event,
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

        return truncateToolResult({
          id: event.id,
          title: event.title,
          start: event.startTime,
          end: event.endTime,
          location: event.location,
          status: 'updated',
        });
      },
    });
  }

  private buildDeleteEvent(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Delete a calendar event permanently. This action cannot be undone. ' +
        'Use ONLY when the user explicitly asks to cancel or delete an event. ' +
        'Returns: { id, deleted: true }. Requires user approval before execution.',
      inputSchema: schemas.delete_event,
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        await this.calendarEventsService.deleteEvent(
          tenantId,
          resolved.eventId,
        );

        return truncateToolResult({ id: resolved.eventId, deleted: true });
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
      orderBy: { createdAt: 'asc' },
    });

    if (!provider) {
      throw new Error('No active calendar provider found for tenant');
    }

    return provider;
  }
}
