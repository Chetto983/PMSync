/**
 * Calendar Events Service
 *
 * Handles all calendar event CRUD operations with bidirectional sync
 * to Google Calendar and Microsoft Graph APIs.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { calendar_v3, google } from 'googleapis';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { CalendarEvent, ProviderConfig, Prisma } from '@prisma/client';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { withRetry, getCircuitBreaker } from '../utils';
import {
  formatDateOnlyForTimeZone,
  formatDateTimeForTimeZone,
  parseRRuleUntilToDateOnly,
  resolveCalendarTimeZone,
} from '../utils/calendar-timezone.util';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ReminderOverride {
  method: 'email' | 'popup' | 'sms';
  minutes: number;
}

export interface Reminders {
  useDefault?: boolean;
  overrides?: ReminderOverride[];
}

export interface CreateEventDto {
  providerId: string;
  calendarId?: string;
  calendarName?: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date | string;
  endTime: Date | string;
  isAllDay?: boolean;
  timeZone?: string;
  attendees?: Array<{ email: string; name?: string }>;
  reminders?: Reminders;
  recurrence?: string[];
}

export interface UpdateEventDto {
  title?: string;
  description?: string;
  location?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  isAllDay?: boolean;
  timeZone?: string;
  attendees?: Array<{ email: string; name?: string }>;
  reminders?: Reminders;
  calendarName?: string;
  recurrence?: string[];
}

export interface ListEventsFilters {
  providerId?: string;
  calendarId?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class CalendarEventsService {
  private readonly logger = new Logger(CalendarEventsService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly providerTokenService: ProviderTokenService,
  ) { }

  // ============================================================================
  // PUBLIC METHODS - EVENT CRUD
  // ============================================================================

  /**
   * List calendar events for a tenant
   */
  async listEvents(
    tenantId: string,
    filters: ListEventsFilters = {},
  ): Promise<{ events: CalendarEvent[]; total: number }> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 50;
    const offset = filters.offset && filters.offset >= 0 ? filters.offset : 0;

    const where: Prisma.CalendarEventWhereInput = {
      tenantId,
      isDeleted: false,
    };

    if (filters.providerId) {
      where.providerId = filters.providerId;
    }

    if (filters.calendarId) {
      where.calendarId = filters.calendarId;
    }

    if (filters.startTime || filters.endTime) {
      where.startTime = {};

      if (filters.startTime) {
        where.startTime.gte = new Date(filters.startTime);
      }

      if (filters.endTime) {
        where.startTime.lte = new Date(filters.endTime);
      }
    }

    const [events, total] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where,
        orderBy: { startTime: 'asc' },
        skip: offset,
        take: limit,
        include: {
          provider: {
            select: {
              id: true,
              email: true,
              providerType: true,
              displayName: true,
            },
          },
        },
      }),
      this.prisma.calendarEvent.count({ where }),
    ]);

    return { events, total };
  }

  /**
   * Get a single calendar event by ID
   */
  async getEvent(tenantId: string, eventId: string): Promise<CalendarEvent> {
    const event = await this.prisma.calendarEvent.findFirst({
      where: {
        id: eventId,
        tenantId,
        isDeleted: false,
      },
    });

    if (!event) {
      throw new NotFoundException(`Calendar event ${eventId} not found`);
    }

    return event;
  }

  /**
   * Create a new calendar event (bidirectional sync)
   * Creates the event locally AND in the provider's calendar
   */
  async createEvent(tenantId: string, data: CreateEventDto): Promise<CalendarEvent> {
    this.logger.log(`Creating calendar event for tenant ${tenantId}`);

    // Get provider config
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: data.providerId,
        tenantId,
        supportsCalendar: true,
        isActive: true,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or does not support calendar');
    }

    // Get access token
    const accessToken = await this.getProviderAccessToken(provider);

    // Create event in provider's calendar based on provider type
    let externalId: string;
    let iCalUID: string | null = null;

    if (provider.providerType === 'google') {
      const result = await this.createGoogleEvent(accessToken, data);
      externalId = result.id;
      iCalUID = result.iCalUID;
    } else if (provider.providerType === 'microsoft') {
      const result = await this.createMicrosoftEvent(accessToken, data);
      externalId = result.id;
      iCalUID = result.iCalUId;
    } else {
      throw new BadRequestException(`Provider type ${provider.providerType} not supported for calendar`);
    }

    // Determine calendarId - don't default to 'primary' for Microsoft (it doesn't exist)
    // For Google, 'primary' is valid; for Microsoft, null means default calendar
    const effectiveCalendarId =
      data.calendarId ||
      (provider.providerType === 'google' ? 'primary' : null);

    // Save event to database
    const event = await this.prisma.calendarEvent.create({
      data: {
        tenantId,
        providerId: provider.id,
        externalId,
        calendarId: effectiveCalendarId,
        calendarName: data.calendarName || data.calendarId || (provider.providerType === 'google' ? 'Primary' : 'Calendar'),
        iCalUID,
        title: data.title,
        description: data.description || null,
        location: data.location || null,
        organizer: provider.email,
        attendees: data.attendees ? (data.attendees as unknown as Prisma.InputJsonValue) : undefined,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        isAllDay: data.isAllDay || false,
        timeZone: data.timeZone || 'UTC',
        recurrence: data.recurrence || [],
        status: 'confirmed',
        visibility: 'default',
        reminders: data.reminders ? (data.reminders as unknown as Prisma.InputJsonValue) : undefined,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`Created calendar event ${event.id} with external ID ${externalId}`);

    // Emit WebSocket event
    this.realtimeEvents.emitCalendarEventNew(tenantId, {
      providerId: provider.id,
      eventId: event.id,
      externalId: event.externalId,
      calendarId: event.calendarId || '',
      reason: 'event-created',
    });

    return event;
  }

  /**
   * Update a calendar event (bidirectional sync)
   * Updates the event locally AND in the provider's calendar
   * Uses optimistic locking to prevent concurrent modification conflicts
   */
  async updateEvent(
    tenantId: string,
    eventId: string,
    data: UpdateEventDto,
  ): Promise<CalendarEvent> {
    this.logger.log(`Updating calendar event ${eventId}`);

    // Get existing event
    const event = await this.getEvent(tenantId, eventId);
    const expectedVersion = event.syncVersion;

    // Get provider config
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: event.providerId },
    });

    if (!provider || !provider.supportsCalendar) {
      throw new NotFoundException('Provider not found or does not support calendar');
    }

    // Get access token
    const accessToken = await this.getProviderAccessToken(provider);

    // Update event in provider's calendar (with retry logic)
    const circuitBreaker = getCircuitBreaker(
      provider.providerType as 'google' | 'microsoft',
      'updateEvent',
    );

    await withRetry(
      async () => {
        await circuitBreaker.execute(async () => {
          const providerUpdateData =
            data.timeZone === undefined && (data.startTime !== undefined || data.endTime !== undefined)
              ? { ...data, timeZone: event.timeZone }
              : data;

          if (provider.providerType === 'google') {
            await this.updateGoogleEvent(
              accessToken,
              event.externalId,
              event.calendarId || 'primary',
              providerUpdateData,
            );
          } else if (provider.providerType === 'microsoft') {
            await this.updateMicrosoftEvent(accessToken, event.externalId, providerUpdateData);
          }
        });
      },
      {
        maxRetries: 2,
        provider: provider.providerType as 'google' | 'microsoft',
        operationName: 'updateEvent',
        logger: this.logger,
      },
    );

    // Prepare update data
    const updateFields: Record<string, unknown> = {
      lastSyncedAt: new Date(),
    };

    if (data.title !== undefined) updateFields.title = data.title;
    if (data.description !== undefined) updateFields.description = data.description;
    if (data.location !== undefined) updateFields.location = data.location;
    if (data.startTime !== undefined) updateFields.startTime = new Date(data.startTime);
    if (data.endTime !== undefined) updateFields.endTime = new Date(data.endTime);
    if (data.isAllDay !== undefined) updateFields.isAllDay = data.isAllDay;
    if (data.timeZone !== undefined) updateFields.timeZone = data.timeZone;
    if (data.attendees !== undefined) updateFields.attendees = data.attendees;
    if (data.reminders !== undefined) updateFields.reminders = data.reminders;
    if (data.recurrence !== undefined) updateFields.recurrence = data.recurrence;
    if (data.calendarName !== undefined) updateFields.calendarName = data.calendarName;

    // OPTIMISTIC LOCKING: Update with version check
    const updateResult = await this.prisma.calendarEvent.updateMany({
      where: {
        id: eventId,
        syncVersion: expectedVersion,
      },
      data: {
        ...updateFields,
        syncVersion: { increment: 1 },
      },
    });

    // Check if update succeeded (version matched)
    if (updateResult.count === 0) {
      // Version mismatch - concurrent modification detected
      const currentEvent = await this.prisma.calendarEvent.findUnique({
        where: { id_tenantId: { id: eventId, tenantId } },
        select: { syncVersion: true },
      });

      if (!currentEvent) {
        throw new NotFoundException(`Event ${eventId} was deleted`);
      }

      this.logger.warn(
        `Optimistic lock conflict for event ${eventId}: ` +
        `expected version ${expectedVersion}, current ${currentEvent.syncVersion}`,
      );

      throw new ConflictException(
        `Event was modified by another process. ` +
        `Expected version ${expectedVersion}, current ${currentEvent.syncVersion}. ` +
        `Please refresh and try again.`,
      );
    }

    // Fetch updated event
    const updatedEvent = await this.prisma.calendarEvent.findUnique({
      where: { id_tenantId: { id: eventId, tenantId } },
    });

    if (!updatedEvent) {
      throw new NotFoundException(`Event ${eventId} not found after update`);
    }

    this.logger.log(`Updated calendar event ${eventId} (version ${expectedVersion} → ${updatedEvent.syncVersion})`);

    // Emit WebSocket event
    this.realtimeEvents.emitCalendarEventUpdate(tenantId, {
      providerId: provider.id,
      eventId: updatedEvent.id,
      externalId: updatedEvent.externalId,
      calendarId: updatedEvent.calendarId || '',
      reason: 'event-updated',
    });

    return updatedEvent;
  }

  /**
   * Delete a calendar event (bidirectional sync)
   * Deletes the event locally AND in the provider's calendar
   */
  async deleteEvent(tenantId: string, eventId: string): Promise<void> {
    this.logger.log(`Deleting calendar event ${eventId}`);

    // Get existing event
    const event = await this.getEvent(tenantId, eventId);

    // Get provider config
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: event.providerId },
    });

    if (!provider || !provider.supportsCalendar) {
      throw new NotFoundException('Provider not found or does not support calendar');
    }

    // Get access token
    const accessToken = await this.getProviderAccessToken(provider);

    // Try to delete event from provider's calendar (best effort for read-only calendars)
    let providerDeleteSuccess = true;
    let providerDeleteError: string | null = null;

    try {
      if (provider.providerType === 'google') {
        await this.deleteGoogleEvent(accessToken, event.externalId, event.calendarId || 'primary');
      } else if (provider.providerType === 'microsoft') {
        this.logger.log(`Deleting Microsoft event: ${event.externalId} from calendar ${event.calendarName || event.calendarId}`);
        await this.deleteMicrosoftEvent(accessToken, event.externalId, event.calendarId);
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const errMsg = axiosError.response?.data?.error?.message || axiosError.message || 'Unknown error';

      // Check if this is a read-only calendar error (birthday calendars, etc.)
      if (errMsg.includes('Read-only') || errMsg.includes('read-only') || errMsg.includes('cannot be modified')) {
        this.logger.warn(`Cannot delete from read-only calendar, proceeding with local soft-delete: ${errMsg}`);
        providerDeleteSuccess = false;
        providerDeleteError = errMsg;
      } else {
        // For other errors, re-throw to fail the request
        this.logger.error(`Failed to delete event from provider: ${errMsg}`);
        throw error;
      }
    }

    // Mark event as deleted in database (soft delete)
    const deletedEvent = await this.prisma.calendarEvent.update({
      where: { id_tenantId: { id: eventId, tenantId } },
      data: {
        isDeleted: true,
        isCancelled: true,
        status: 'cancelled',
        lastSyncedAt: new Date(),
        syncVersion: event.syncVersion + 1,
        // Store metadata about why provider delete failed (only if it failed)
        ...(providerDeleteSuccess
          ? {}
          : { metadata: { ...((event.metadata as Record<string, unknown>) || {}), localDeleteOnly: true, providerDeleteError } }),
      },
    });

    this.logger.log(`Deleted calendar event ${eventId} ${providerDeleteSuccess ? '(synced to provider)' : '(local only - read-only calendar)'}`);

    // Emit WebSocket event
    this.realtimeEvents.emitCalendarEventDelete(event.tenantId, {
      providerId: provider.id,
      eventId: deletedEvent.id,
      externalId: deletedEvent.externalId,
      calendarId: deletedEvent.calendarId || '',
      reason: 'event-deleted',
    });
  }

  /**
   * Cancel an event in provider calendar (best effort)
   */
  async cancelEvent(tenantId: string, eventId: string, reason?: string): Promise<void> {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId, isDeleted: false },
      include: { provider: true },
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    const provider = event.provider;
    const accessToken = await this.getProviderAccessToken(provider);

    try {
      if (provider.providerType === 'google') {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        await calendar.events.patch({
          calendarId: event.calendarId || 'primary',
          eventId: event.externalId,
          sendUpdates: 'all',
          requestBody: { status: 'cancelled', description: reason || event.description },
        });
      } else if (provider.providerType === 'microsoft') {
        await axios.post(
          `${this.GRAPH_API_BASE}/me/events/${event.externalId}/cancel`,
          { comment: reason || `Cancelled: ${event.title}` },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'client-request-id': crypto.randomUUID(),
            },
          },
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(`Failed to cancel provider event ${event.externalId}: ${err.message}`);
    }

    await this.prisma.calendarEvent.update({
      where: { id_tenantId: { id: event.id, tenantId: event.tenantId } },
      data: { isCancelled: true, status: 'cancelled' },
    });
  }

  /**
   * List attachments for a calendar event
   */
  async listEventAttachments(tenantId: string, eventId: string) {
    // Verify event belongs to tenant
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id_tenantId: { id: eventId, tenantId } },
      select: { tenantId: true },
    });

    if (!event || event.tenantId !== tenantId) {
      throw new NotFoundException('Calendar event not found');
    }

    // Fetch attachments
    const attachments = await this.prisma.calendarEventAttachment.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      eventId,
      total: attachments.length,
      attachments,
    };
  }

  /**
   * Get a specific attachment for a calendar event
   */
  async getEventAttachment(tenantId: string, eventId: string, attachmentId: string) {
    // Verify event belongs to tenant
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id_tenantId: { id: eventId, tenantId } },
      select: { tenantId: true },
    });

    if (!event || event.tenantId !== tenantId) {
      throw new NotFoundException('Calendar event not found');
    }

    // Fetch attachment
    const attachment = await this.prisma.calendarEventAttachment.findFirst({
      where: {
        id: attachmentId,
        eventId,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
  }

  // ============================================================================
  // PRIVATE METHODS - TOKEN MANAGEMENT
  // ============================================================================

  /**
   * Get provider access token (with auto-refresh)
   */
  async getProviderAccessToken(provider: ProviderConfig): Promise<string> {
    // Delegate to centralized token service which handles distributed locking and refresh
    const { accessToken } = await this.providerTokenService.getProviderWithToken(provider.id);
    return accessToken;
  }

  // ============================================================================
  // PRIVATE METHODS - GOOGLE CALENDAR API
  // ============================================================================

  /**
   * Create event in Google Calendar
   */
  private async createGoogleEvent(
    accessToken: string,
    data: CreateEventDto,
  ): Promise<{ id: string; iCalUID: string | null }> {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event: calendar_v3.Schema$Event = {
      summary: data.title,
      description: data.description,
      location: data.location,
      start: data.isAllDay
        ? { date: new Date(data.startTime).toISOString().split('T')[0] }
        : { dateTime: new Date(data.startTime).toISOString(), timeZone: data.timeZone || 'UTC' },
      end: data.isAllDay
        ? { date: new Date(data.endTime).toISOString().split('T')[0] }
        : { dateTime: new Date(data.endTime).toISOString(), timeZone: data.timeZone || 'UTC' },
      attendees: data.attendees?.map((a) => ({ email: a.email, displayName: a.name })),
      reminders: data.reminders,
      recurrence: data.recurrence,
    };

    const targetCalendarId = data.calendarId || 'primary';

    try {
      const response = await calendar.events.insert({
        calendarId: targetCalendarId,
        requestBody: event,
      });

      return {
        id: response.data.id!,
        iCalUID: response.data.iCalUID || null,
      };
    } catch (error: unknown) {
      const gaxiosError = error as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
      const status = gaxiosError.response?.status;
      const message = gaxiosError.response?.data?.error?.message || gaxiosError.message || 'Unknown error';

      this.logger.error(`Google Calendar API error creating event on ${targetCalendarId}: ${status} - ${message}`);

      if (status === 404) {
        throw new NotFoundException(`Calendar not found: ${targetCalendarId}`);
      }
      if (status === 403) {
        throw new BadRequestException(`Cannot create event on calendar ${targetCalendarId}: ${message}`);
      }
      if (status === 401) {
        throw new BadRequestException('Google authentication expired - please re-authenticate');
      }

      throw new BadRequestException(`Failed to create event: ${message}`);
    }
  }

  /**
   * Update event in Google Calendar
   */
  private async updateGoogleEvent(
    accessToken: string,
    eventId: string,
    calendarId: string,
    data: UpdateEventDto,
  ): Promise<void> {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event: calendar_v3.Schema$Event = {};

    if (data.title !== undefined) event.summary = data.title;
    if (data.description !== undefined) event.description = data.description;
    if (data.location !== undefined) event.location = data.location;
    if (data.startTime !== undefined) {
      event.start = data.isAllDay
        ? { date: new Date(data.startTime).toISOString().split('T')[0] }
        : { dateTime: new Date(data.startTime).toISOString(), timeZone: data.timeZone || 'UTC' };
    }
    if (data.endTime !== undefined) {
      event.end = data.isAllDay
        ? { date: new Date(data.endTime).toISOString().split('T')[0] }
        : { dateTime: new Date(data.endTime).toISOString(), timeZone: data.timeZone || 'UTC' };
    }
    if (data.attendees !== undefined) {
      event.attendees = data.attendees.map((a) => ({ email: a.email, displayName: a.name }));
    }
    if (data.reminders !== undefined) {
      event.reminders = data.reminders;
    }
    if (data.recurrence !== undefined) {
      event.recurrence = data.recurrence;
    }

    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: event,
    });
  }

  /**
   * Delete event from Google Calendar
   */
  private async deleteGoogleEvent(
    accessToken: string,
    eventId: string,
    calendarId: string,
  ): Promise<void> {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId,
      eventId,
    });
  }

  // ============================================================================
  // PRIVATE METHODS - MICROSOFT GRAPH API
  // ============================================================================

  /**
   * Create event in Microsoft Calendar
   * Uses /me/calendars/{calendarId}/events when calendarId is provided,
   * otherwise falls back to /me/events (default calendar)
   */
  private async createMicrosoftEvent(
    accessToken: string,
    data: CreateEventDto,
  ): Promise<{ id: string; iCalUId: string | null }> {
    const timeZone = resolveCalendarTimeZone(data.timeZone);
    const event: Record<string, unknown> = {
      subject: data.title,
      body: {
        contentType: 'HTML',
        content: data.description || '',
      },
      location: data.location ? { displayName: data.location } : undefined,
      start: {
        dateTime: formatDateTimeForTimeZone(data.startTime, timeZone),
        timeZone,
      },
      end: {
        dateTime: formatDateTimeForTimeZone(data.endTime, timeZone),
        timeZone,
      },
      isAllDay: data.isAllDay || false,
      attendees: data.attendees?.map((a) => ({
        emailAddress: { address: a.email, name: a.name || a.email },
        type: 'required',
      })),
    };

    // Add recurrence if provided
    if (data.recurrence && data.recurrence.length > 0) {
      const msRecurrence = this.convertRecurrenceToMicrosoft(
        data.recurrence,
        data.startTime,
        timeZone,
      );
      if (msRecurrence) {
        event.recurrence = msRecurrence;
      }
    }

    // Use calendar-specific endpoint when calendarId is provided (not 'primary')
    // Microsoft doesn't use 'primary' - that's a Google concept
    const targetCalendarId = data.calendarId && data.calendarId !== 'primary' ? data.calendarId : null;
    const endpoint = targetCalendarId
      ? `${this.GRAPH_API_BASE}/me/calendars/${targetCalendarId}/events`
      : `${this.GRAPH_API_BASE}/me/events`;

    try {
      const response = await axios.post(endpoint, event, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'client-request-id': crypto.randomUUID(),
        },
      });

      return {
        id: response.data.id,
        iCalUId: response.data.iCalUId || null,
      };
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: { error?: { message?: string; code?: string } } }; message?: string };
      const status = axiosError.response?.status;
      const message = axiosError.response?.data?.error?.message || axiosError.message || 'Unknown error';
      const code = axiosError.response?.data?.error?.code;

      this.logger.error(`Microsoft Graph API error creating event: ${status} - ${code} - ${message}`);

      if (status === 404) {
        throw new NotFoundException(`Calendar not found: ${targetCalendarId || 'default'}`);
      }
      if (status === 403) {
        throw new BadRequestException(`Cannot create event on calendar: ${message}`);
      }
      if (status === 401) {
        throw new BadRequestException('Microsoft authentication expired - please re-authenticate');
      }

      throw new BadRequestException(`Failed to create event: ${message}`);
    }
  }

  /**
   * Convert RRULE strings to Microsoft Graph recurrence format
   * Basic implementation - supports common patterns
   */
  private convertRecurrenceToMicrosoft(
    rrules: string[],
    startTime: Date | string,
    timeZone?: string,
  ): Record<string, unknown> | undefined {
    if (!rrules || rrules.length === 0) return undefined;

    // Parse first RRULE (most common case)
    const rrule = rrules[0];
    const parts: Record<string, string> = {};
    rrule.split(';').forEach((part) => {
      const [key, value] = part.split('=');
      if (key && value) parts[key.toUpperCase()] = value;
    });

    const freq = parts.FREQ?.toUpperCase();
    if (!freq) return undefined;

    const pattern: Record<string, unknown> = {
      type: freq.toLowerCase(),
      interval: parseInt(parts.INTERVAL || '1', 10),
    };

    // Map BYDAY for weekly recurrence
    if (freq === 'WEEKLY' && parts.BYDAY) {
      const dayMap: Record<string, string> = {
        SU: 'sunday', MO: 'monday', TU: 'tuesday', WE: 'wednesday',
        TH: 'thursday', FR: 'friday', SA: 'saturday',
      };
      pattern.daysOfWeek = parts.BYDAY.split(',').map((d) => dayMap[d]).filter(Boolean);
    }

    const range: Record<string, unknown> = {
      type: 'noEnd',
      startDate: formatDateOnlyForTimeZone(startTime, timeZone),
    };

    if (parts.COUNT) {
      range.type = 'numbered';
      range.numberOfOccurrences = parseInt(parts.COUNT, 10);
    } else if (parts.UNTIL) {
      const endDate = parseRRuleUntilToDateOnly(parts.UNTIL, timeZone);
      if (endDate) {
        range.type = 'endDate';
        range.endDate = endDate;
      }
    }

    return { pattern, range };
  }

  /**
   * Update event in Microsoft Calendar
   */
  private async updateMicrosoftEvent(
    accessToken: string,
    eventId: string,
    data: UpdateEventDto,
  ): Promise<void> {
    const event: Record<string, unknown> = {};
    const timeZone = resolveCalendarTimeZone(data.timeZone);

    if (data.title !== undefined) event.subject = data.title;
    if (data.description !== undefined) {
      event.body = { contentType: 'HTML', content: data.description };
    }
    if (data.location !== undefined) event.location = { displayName: data.location };
    if (data.startTime !== undefined) {
      event.start = {
        dateTime: formatDateTimeForTimeZone(data.startTime, timeZone),
        timeZone,
      };
    }
    if (data.endTime !== undefined) {
      event.end = {
        dateTime: formatDateTimeForTimeZone(data.endTime, timeZone),
        timeZone,
      };
    }
    if (data.isAllDay !== undefined) event.isAllDay = data.isAllDay;
    if (data.attendees !== undefined) {
      event.attendees = data.attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.name || a.email },
        type: 'required',
      }));
    }

    await axios.patch(`${this.GRAPH_API_BASE}/me/events/${eventId}`, event, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'client-request-id': crypto.randomUUID(),
      },
    });
  }

  /**
   * Delete event from Microsoft Calendar
   */
  private async deleteMicrosoftEvent(
    accessToken: string,
    eventId: string,
    calendarId?: string | null,
  ): Promise<void> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'client-request-id': crypto.randomUUID(),
    };

    // Try /me/events/{id} first - this works for most events
    try {
      const endpoint = `${this.GRAPH_API_BASE}/me/events/${eventId}`;
      this.logger.debug(`Attempting delete: ${endpoint}`);
      await axios.delete(endpoint, { headers });
      this.logger.log(`Successfully deleted Microsoft event ${eventId}`);
      return;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
      this.logger.warn(`Delete via /me/events failed: ${axiosError.response?.data?.error?.message || axiosError.message}`);

      // If calendarId is provided, try the calendar-specific endpoint
      if (calendarId) {
        try {
          const calendarEndpoint = `${this.GRAPH_API_BASE}/me/calendars/${calendarId}/events/${eventId}`;
          this.logger.debug(`Retrying delete with calendar: ${calendarEndpoint}`);
          await axios.delete(calendarEndpoint, { headers });
          this.logger.log(`Successfully deleted Microsoft event ${eventId} from calendar ${calendarId}`);
          return;
        } catch (calError: unknown) {
          const calAxiosError = calError as { response?: { data?: { error?: { message?: string } } }; message?: string };
          this.logger.error(`Delete via calendar endpoint also failed: ${calAxiosError.response?.data?.error?.message || calAxiosError.message}`);
          throw calError;
        }
      }
      throw error;
    }
  }
}
