/**
 * Calendar Service (Coordinator)
 *
 * Thin coordinator layer that delegates to specialized services.
 * Follows 2025 NestJS patterns with single-responsibility design.
 *
 * @see CalendarListService - Calendar listing and management
 * @see CalendarEventsService - Event CRUD operations
 * @see GoogleCalendarSyncService - Google Calendar sync
 * @see MicrosoftCalendarSyncService - Microsoft Calendar sync
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarEvent } from '@prisma/client';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from './microsoft-calendar-sync.service';
import { CalendarListService, CalendarInfo, CreateCalendarDto, UpdateCalendarPreferencesDto } from './calendar-list.service';
import { CalendarEventsService, CreateEventDto, UpdateEventDto, ListEventsFilters } from './calendar-events.service';

// Re-export interfaces for backward compatibility
export type { CreateEventDto, UpdateEventDto, ListEventsFilters } from './calendar-events.service';
export type { ReminderOverride, Reminders } from './calendar-events.service';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly listService: CalendarListService,
    private readonly eventsService: CalendarEventsService,
    private readonly googleCalendarSync: GoogleCalendarSyncService,
    private readonly microsoftCalendarSync: MicrosoftCalendarSyncService,
  ) { }

  // ============================================================================
  // CALENDAR LISTING (delegated to CalendarListService)
  // ============================================================================

  /**
   * List all calendars from all providers for a tenant
   */
  async listCalendars(tenantId: string): Promise<{
    calendars: CalendarInfo[];
    total: number;
  }> {
    return this.listService.listCalendars(tenantId);
  }

  /**
   * Create a new calendar for a provider
   */
  async createCalendar(
    tenantId: string,
    data: CreateCalendarDto,
  ): Promise<{
    id: string;
    calendarId: string;
    calendarName: string;
    providerId: string;
    color?: string;
  }> {
    return this.listService.createCalendar(tenantId, data);
  }

  /**
   * Update calendar preferences (color, name)
   */
  async updateCalendarPreferences(
    tenantId: string,
    providerId: string,
    calendarId: string,
    data: UpdateCalendarPreferencesDto,
  ): Promise<{ success: boolean; calendarId: string; providerId: string; color?: string }> {
    return this.listService.updateCalendarPreferences(tenantId, providerId, calendarId, data);
  }

  // ============================================================================
  // EVENT CRUD (delegated to CalendarEventsService)
  // ============================================================================

  /**
   * List calendar events for a tenant
   */
  async listEvents(
    tenantId: string,
    filters: ListEventsFilters = {},
  ): Promise<{ events: CalendarEvent[]; total: number }> {
    return this.eventsService.listEvents(tenantId, filters);
  }

  /**
   * Get a single calendar event by ID
   */
  async getEvent(tenantId: string, eventId: string): Promise<CalendarEvent> {
    return this.eventsService.getEvent(tenantId, eventId);
  }

  /**
   * Create a new calendar event (bidirectional sync)
   */
  async createEvent(tenantId: string, data: CreateEventDto): Promise<CalendarEvent> {
    return this.eventsService.createEvent(tenantId, data);
  }

  /**
   * Update a calendar event (bidirectional sync)
   */
  async updateEvent(
    tenantId: string,
    eventId: string,
    data: UpdateEventDto,
  ): Promise<CalendarEvent> {
    return this.eventsService.updateEvent(tenantId, eventId, data);
  }

  /**
   * Delete a calendar event (bidirectional sync)
   */
  async deleteEvent(tenantId: string, eventId: string): Promise<void> {
    return this.eventsService.deleteEvent(tenantId, eventId);
  }

  /**
   * Cancel an event in provider calendar
   */
  async cancelEvent(tenantId: string, eventId: string, reason?: string): Promise<void> {
    return this.eventsService.cancelEvent(tenantId, eventId, reason);
  }

  // ============================================================================
  // ATTACHMENTS (delegated to CalendarEventsService)
  // ============================================================================

  /**
   * List attachments for a calendar event
   */
  async listEventAttachments(tenantId: string, eventId: string) {
    return this.eventsService.listEventAttachments(tenantId, eventId);
  }

  /**
   * Get a specific attachment for a calendar event
   */
  async getEventAttachment(tenantId: string, eventId: string, attachmentId: string) {
    return this.eventsService.getEventAttachment(tenantId, eventId, attachmentId);
  }

  // ============================================================================
  // SYNC OPERATIONS
  // ============================================================================

  /**
   * Manually trigger a sync for a provider's calendars.
   */
  async syncProvider(tenantId: string, providerId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
        supportsCalendar: true,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or does not belong to this tenant');
    }

    switch (provider.providerType) {
      case 'google':
        return this.googleCalendarSync.syncCalendar(providerId);
      case 'microsoft':
        return this.microsoftCalendarSync.syncCalendar(providerId);
      default:
        this.logger.warn(`Calendar sync not supported for provider type: ${provider.providerType}`);
        throw new BadRequestException(`Calendar sync is not supported for provider type: ${provider.providerType}`);
    }
  }
}
