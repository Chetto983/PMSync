/**
 * Calendar Action Executor - Handles calendar event CRUD operations.
 * Phase 9b: Extracted from action-executor.service.ts (2026-01-23)
 *
 * Static methods to avoid additional DI complexity.
 * Dependencies passed via CalendarExecutorDeps interface.
 */
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { CalendarService } from '../../../../calendar/services/calendar.service';
import { AgentAction } from '../../interfaces/agent-action.interface';
import { AgentContext } from '../../interfaces/agent-context.interface';
import { ActionExecutionResult } from '../action-executor.service';
import { getLocale, actionSummaries as t, formatDateForLocale } from '../../locales/action-summaries';
import { AiError, AiErrorCode } from '../../../errors';

/** Dependencies required for calendar executor methods */
export interface CalendarExecutorDeps {
  calendarService: CalendarService | null;
  prisma: PrismaService;
  logger: Logger;
  resolveProviderId: (
    tenantId: string,
    providerId: string | undefined,
    type: 'email' | 'calendar',
  ) => Promise<string>;
}

/**
 * Static executor for calendar-related actions.
 * Keeps ActionExecutorService as thin orchestrator.
 */
export class CalendarExecutor {
  /**
   * Create a new calendar event.
   */
  static async executeCreateEvent(
    action: AgentAction,
    context: AgentContext,
    deps: CalendarExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { title, startTime, endTime, description, location, attendees, providerId, calendarId, isAllDay, timeZone } = action.payload;

    if (!deps.calendarService) {
      deps.logger.error('CalendarService not available');
      throw new AiError('Calendar service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Resolve provider (use provided or find default)
    const actualProviderId = await deps.resolveProviderId(context.tenantId, providerId, 'calendar');

    // Create event via CalendarService
    const event = await deps.calendarService.createEvent(context.tenantId, {
      providerId: actualProviderId,
      calendarId: calendarId || 'primary',
      title,
      description,
      location,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      isAllDay: isAllDay || false,
      timeZone: timeZone || 'UTC',
      attendees: attendees?.map((a: string | { email: string }) => typeof a === 'string' ? { email: a } : a),
    });

    deps.logger.log(`Created calendar event ${event.id}`);

    const lang = getLocale(context.preferences?.language);
    const dateStr = formatDateForLocale(new Date(startTime), lang);

    return {
      success: true,
      data: { eventId: event.id, externalId: event.externalId, title, startTime, endTime },
      summary: t.eventCreated[lang](title, dateStr),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Update an existing calendar event.
   */
  static async executeUpdateEvent(
    action: AgentAction,
    context: AgentContext,
    deps: CalendarExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { eventId, title, description, location, startTime, endTime, attendees } = action.payload;

    if (!deps.calendarService) {
      deps.logger.error('CalendarService not available');
      throw new AiError('Calendar service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Update event via CalendarService
    const event = await deps.calendarService.updateEvent(context.tenantId, eventId, {
      title,
      description,
      location,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      attendees: attendees?.map((a: string | { email: string }) => typeof a === 'string' ? { email: a } : a),
    });

    deps.logger.log(`Updated calendar event ${eventId}`);

    const lang = getLocale(context.preferences?.language);
    const eventTitle = title || event.title || t.event[lang];

    return {
      success: true,
      data: { eventId, updated: true, event },
      summary: t.eventUpdated[lang](eventTitle),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Delete a calendar event.
   */
  static async executeDeleteEvent(
    action: AgentAction,
    context: AgentContext,
    deps: CalendarExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { eventId } = action.payload;

    if (!deps.calendarService) {
      deps.logger.error('CalendarService not available');
      throw new AiError('Calendar service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Get event info for summary before deleting
    const event = await deps.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId: context.tenantId },
      select: { title: true },
    });

    // Delete event via CalendarService
    await deps.calendarService.deleteEvent(context.tenantId, eventId);

    deps.logger.log(`Deleted calendar event ${eventId}`);

    const lang = getLocale(context.preferences?.language);
    const eventTitle = event?.title || t.event[lang];

    return {
      success: true,
      data: { eventId, deleted: true },
      summary: t.eventDeleted[lang](eventTitle),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Get calendar events within a date range.
   */
  static async executeGetEvents(
    action: AgentAction,
    context: AgentContext,
    deps: CalendarExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { startDate, endDate } = action.payload;

    const events = await deps.prisma.calendarEvent.findMany({
      where: {
        tenantId: context.tenantId,
        startTime: startDate ? { gte: new Date(startDate) } : undefined,
        endTime: endDate ? { lte: new Date(endDate) } : undefined,
      },
      orderBy: { startTime: 'asc' },
      take: 50,
    });

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { events, count: events.length },
      summary: t.eventsFound[lang](events.length),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Check availability for a given date range.
   */
  static async executeCheckAvailability(
    action: AgentAction,
    context: AgentContext,
    deps: CalendarExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { date, startDate, endDate } = action.payload;

    const checkStart = new Date(startDate || date);
    const checkEnd = new Date(endDate || date);
    checkEnd.setHours(23, 59, 59);

    const busySlots = await deps.prisma.calendarEvent.findMany({
      where: {
        tenantId: context.tenantId,
        startTime: { lte: checkEnd },
        endTime: { gte: checkStart },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
      },
      orderBy: { startTime: 'asc' },
    });

    const lang = getLocale(context.preferences?.language);
    const hasFreeTime = busySlots.length < 8;

    return {
      success: true,
      data: { busySlots, hasFreeTime },
      summary: hasFreeTime
        ? t.availabilityFree[lang](busySlots.length)
        : t.availabilityBusy[lang](busySlots.length),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Reschedule a calendar event to a new time.
   */
  static async executeRescheduleEvent(
    action: AgentAction,
    context: AgentContext,
    deps: CalendarExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { eventId, newStartTime, newEndTime, reason } = action.payload;

    if (!deps.calendarService) {
      deps.logger.error('CalendarService not available');
      throw new AiError('Calendar service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Get the event to verify ownership and get provider info
    const event = await deps.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId: context.tenantId },
      include: { provider: true },
    });

    if (!event) {
      throw new AiError('Event not found', AiErrorCode.INVALID_INPUT);
    }

    // Calculate duration if only newStartTime is provided
    let endTime = newEndTime;
    if (!endTime && event.startTime && event.endTime) {
      const duration = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
      endTime = new Date(new Date(newStartTime).getTime() + duration).toISOString();
    }

    // Build update description with reschedule reason
    let newDescription = event.description || '';
    if (reason) {
      newDescription = newDescription
        ? `${newDescription}\n\n[Rescheduled: ${reason}]`
        : `[Rescheduled: ${reason}]`;
    }

    // Update event via CalendarService
    const updatedEvent = await deps.calendarService.updateEvent(
      context.tenantId,
      eventId,
      {
        startTime: new Date(newStartTime),
        endTime: endTime ? new Date(endTime) : undefined,
        description: newDescription,
      },
    );

    deps.logger.log(`Rescheduled event ${eventId} to ${newStartTime}`);

    const lang = getLocale(context.preferences?.language);
    const dateStr = formatDateForLocale(new Date(newStartTime), lang);
    const eventTitle = event.title || t.event[lang];

    return {
      success: true,
      data: {
        eventId,
        rescheduled: true,
        newStartTime,
        newEndTime: endTime,
        reason,
        event: updatedEvent,
      },
      summary: t.eventRescheduled[lang](eventTitle, dateStr),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }
}
