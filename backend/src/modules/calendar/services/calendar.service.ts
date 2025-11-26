import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { calendar_v3, google } from 'googleapis';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { CalendarEvent, ProviderConfig } from '@prisma/client';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from './microsoft-calendar-sync.service';

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
  reminders?: any;
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
  reminders?: any;
  calendarName?: string;
}

export interface ListEventsFilters {
  providerId?: string;
  calendarId?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly googleCalendarSync: GoogleCalendarSyncService,
    private readonly microsoftCalendarSync: MicrosoftCalendarSyncService,
  ) {}

  /**
   * List all calendars from all providers for a tenant
   * Extracts unique calendars from existing calendar events
   */
  async listCalendars(tenantId: string): Promise<{
    calendars: Array<{
      id: string;
      calendarId: string;
      calendarName: string;
      providerId: string;
      providerEmail: string;
      providerType: string;
      eventCount: number;
      backgroundColor?: string;
      primary?: boolean;
    }>;
    total: number;
  }> {
    // Get all providers for this tenant that support calendar
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        tenantId,
        supportsCalendar: true,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        providerType: true,
      },
    });

    // Create provider lookup map for O(1) access
    const providerMap = new Map(providers.map((p) => [p.id, p]));
    const providerIds = providers.map((p) => p.id);

    // Single aggregation query - fixes N+1 problem
    const calendarEvents = await this.prisma.calendarEvent.groupBy({
      by: ['calendarId', 'calendarName', 'providerId'],
      where: {
        tenantId,
        providerId: { in: providerIds },
        isDeleted: false,
        calendarId: { not: null },
      },
      _count: {
        id: true,
      },
    });

    // Build calendars map from single query result
    const calendarsMap = new Map<
      string,
      {
        calendarId: string;
        calendarName: string;
        providerId: string;
        providerEmail: string;
        providerType: string;
        eventCount: number;
        primary: boolean;
      }
    >();

    for (const cal of calendarEvents) {
      if (!cal.calendarId) continue;

      const provider = providerMap.get(cal.providerId);
      if (!provider) continue;

      const key = `${cal.providerId}:${cal.calendarId}`;
      calendarsMap.set(key, {
        calendarId: cal.calendarId,
        calendarName: cal.calendarName || cal.calendarId,
        providerId: cal.providerId,
        providerEmail: provider.email || '',
        providerType: provider.providerType,
        eventCount: cal._count.id,
        primary: cal.calendarId === 'primary',
      });
    }

    // Add default "primary" calendar for providers without events
    for (const provider of providers) {
      const key = `${provider.id}:primary`;
      if (!calendarsMap.has(key)) {
        calendarsMap.set(key, {
          calendarId: 'primary',
          calendarName: 'Primary Calendar',
          providerId: provider.id,
          providerEmail: provider.email || '',
          providerType: provider.providerType,
          eventCount: 0,
          primary: true,
        });
      }
    }

    const calendars = Array.from(calendarsMap.values()).map((cal) => ({
      id: `${cal.providerId}:${cal.calendarId}`,
      ...cal,
    }));

    // Sort: primary first, then by name
    calendars.sort((a, b) => {
      if (a.primary && !b.primary) return -1;
      if (!a.primary && b.primary) return 1;
      return a.calendarName.localeCompare(b.calendarName);
    });

    return {
      calendars,
      total: calendars.length,
    };
  }

  /**
   * Create a new calendar for a provider
   */
  async createCalendar(
    tenantId: string,
    data: { providerId: string; name: string; description?: string; color?: string },
  ): Promise<{
    id: string;
    calendarId: string;
    calendarName: string;
    providerId: string;
    color?: string;
  }> {
    // Verify provider belongs to tenant
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

    // Generate a unique calendar ID
    const calendarId = `custom-${data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;

    // Check if calendar name already exists for this provider
    const existing = await this.prisma.calendarEvent.findFirst({
      where: {
        providerId: data.providerId,
        calendarName: data.name,
      },
    });

    if (existing) {
      throw new BadRequestException('Calendar with this name already exists');
    }

    // Store calendar preferences (we use a metadata approach via CalendarEvent for now)
    // In a full implementation, we'd have a dedicated CalendarPreferences table
    this.logger.log(`Created calendar "${data.name}" (${calendarId}) for provider ${data.providerId}`);

    // Emit real-time event
    this.realtimeEvents.emitCalendarListUpdate(tenantId, {
      calendarId,
      calendarName: data.name,
      providerId: data.providerId,
      providerEmail: provider.email || undefined,
      color: data.color,
      reason: 'calendar-created',
      timestamp: new Date().toISOString(),
    });

    return {
      id: `${data.providerId}:${calendarId}`,
      calendarId,
      calendarName: data.name,
      providerId: data.providerId,
      color: data.color,
    };
  }

  /**
   * Update calendar preferences (color, name)
   * Stores preferences in user settings or a dedicated table
   */
  async updateCalendarPreferences(
    tenantId: string,
    providerId: string,
    calendarId: string,
    data: { name?: string; color?: string },
  ): Promise<{ success: boolean; calendarId: string; providerId: string; color?: string }> {
    // Verify provider belongs to tenant
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    // For now, we'll update the calendarName on all events with this calendarId
    // In a production system, you'd have a dedicated CalendarPreferences table
    if (data.name) {
      await this.prisma.calendarEvent.updateMany({
        where: {
          providerId,
          calendarId,
          tenantId,
        },
        data: {
          calendarName: data.name,
        },
      });
    }

    this.logger.log(`Updated calendar preferences for ${calendarId} on provider ${providerId}`);

    // Emit real-time event
    this.realtimeEvents.emitCalendarListUpdate(tenantId, {
      calendarId,
      calendarName: data.name || calendarId,
      providerId,
      providerEmail: provider.email || undefined,
      color: data.color,
      reason: 'calendar-updated',
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      calendarId,
      providerId,
      color: data.color,
    };
  }

  /**
   * List calendar events for a tenant
   */
  async listEvents(
    tenantId: string,
    filters: ListEventsFilters = {},
  ): Promise<{ events: CalendarEvent[]; total: number }> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 50;
    const offset = filters.offset && filters.offset >= 0 ? filters.offset : 0;

    const where: any = {
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

    // Save event to database
    const event = await this.prisma.calendarEvent.create({
      data: {
        tenantId,
        providerId: provider.id,
        externalId,
        calendarId: data.calendarId || 'primary',
        calendarName: data.calendarName || data.calendarId || 'primary',
        iCalUID,
        title: data.title,
        description: data.description || null,
        location: data.location || null,
        organizer: provider.email,
        attendees: data.attendees ? (data.attendees as any) : undefined,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        isAllDay: data.isAllDay || false,
        timeZone: data.timeZone || 'UTC',
        recurrence: [],
        status: 'confirmed',
        visibility: 'default',
        reminders: data.reminders ? (data.reminders) : undefined,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`Created calendar event ${event.id} with external ID ${externalId}`);

    // Emit WebSocket event
    this.realtimeEvents.emitCalendarEventNew(tenantId, {
      providerId: provider.id,
      eventId: event.id,
      externalId: event.externalId,
      calendarId: event.calendarId || 'primary',
      reason: 'event-created',
    });

    return event;
  }

  /**
   * Update a calendar event (bidirectional sync)
   * Updates the event locally AND in the provider's calendar
   */
  async updateEvent(
    tenantId: string,
    eventId: string,
    data: UpdateEventDto,
  ): Promise<CalendarEvent> {
    this.logger.log(`Updating calendar event ${eventId}`);

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

    // Update event in provider's calendar
    if (provider.providerType === 'google') {
      await this.updateGoogleEvent(accessToken, event.externalId, event.calendarId!, data);
    } else if (provider.providerType === 'microsoft') {
      await this.updateMicrosoftEvent(accessToken, event.externalId, data);
    }

    // Update event in database
    const updateData: any = {
      lastSyncedAt: new Date(),
      syncVersion: event.syncVersion + 1,
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.startTime !== undefined) updateData.startTime = new Date(data.startTime);
    if (data.endTime !== undefined) updateData.endTime = new Date(data.endTime);
    if (data.isAllDay !== undefined) updateData.isAllDay = data.isAllDay;
    if (data.timeZone !== undefined) updateData.timeZone = data.timeZone;
    if (data.attendees !== undefined) updateData.attendees = data.attendees;
    if (data.reminders !== undefined) updateData.reminders = data.reminders;
    if (data.calendarName !== undefined) {
      updateData.calendarName = data.calendarName;
    }

    const updatedEvent = await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: updateData,
    });

    this.logger.log(`Updated calendar event ${eventId}`);

    // Emit WebSocket event
    this.realtimeEvents.emitCalendarEventUpdate(tenantId, {
      providerId: provider.id,
      eventId: updatedEvent.id,
      externalId: updatedEvent.externalId,
      calendarId: updatedEvent.calendarId || 'primary',
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

    // Delete event from provider's calendar
    if (provider.providerType === 'google') {
      await this.deleteGoogleEvent(accessToken, event.externalId, event.calendarId!);
    } else if (provider.providerType === 'microsoft') {
      await this.deleteMicrosoftEvent(accessToken, event.externalId);
    }

    // Mark event as deleted in database (soft delete)
    const deletedEvent = await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        isDeleted: true,
        isCancelled: true,
        status: 'cancelled',
        lastSyncedAt: new Date(),
        syncVersion: event.syncVersion + 1,
      },
    });

    this.logger.log(`Deleted calendar event ${eventId}`);

    // Emit WebSocket event
    this.realtimeEvents.emitCalendarEventDelete(event.tenantId, {
      providerId: provider.id,
      eventId: deletedEvent.id,
      externalId: deletedEvent.externalId,
      calendarId: deletedEvent.calendarId || 'primary',
      reason: 'event-deleted',
    });
  }

  /**
   * Get provider access token (with auto-refresh)
   */
  private async getProviderAccessToken(provider: ProviderConfig): Promise<string> {
    if (!provider.accessToken || !provider.tokenEncryptionIv) {
      throw new BadRequestException('Provider missing access token');
    }

    let accessToken = this.crypto.decrypt(provider.accessToken, provider.tokenEncryptionIv);

    const expiresSoon =
      !provider.tokenExpiresAt || provider.tokenExpiresAt.getTime() <= Date.now() + 60 * 1000;

    if (!expiresSoon) {
      return accessToken;
    }

    if (!provider.refreshToken || !provider.refreshTokenEncryptionIv) {
      this.logger.warn(
        `Access token expired for provider ${provider.id} but no refresh token is available`,
      );
      return accessToken;
    }

    const refreshToken = this.crypto.decrypt(
      provider.refreshToken,
      provider.refreshTokenEncryptionIv,
    );

    try {
      let refreshed:
        | Awaited<ReturnType<typeof this.googleOAuth.refreshAccessToken>>
        | Awaited<ReturnType<typeof this.microsoftOAuth.refreshAccessToken>>;

      if (provider.providerType === 'google') {
        refreshed = await this.googleOAuth.refreshAccessToken(refreshToken);
      } else if (provider.providerType === 'microsoft') {
        refreshed = await this.microsoftOAuth.refreshAccessToken(refreshToken);
      } else {
        return accessToken;
      }

      accessToken = refreshed.accessToken;

      const updateData: Record<string, any> = {
        tokenExpiresAt: refreshed.expiresAt,
      };

      const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);
      updateData.accessToken = encryptedAccess.encrypted;
      updateData.tokenEncryptionIv = encryptedAccess.iv;

      const refreshedToken = 'refreshToken' in refreshed ? refreshed.refreshToken : undefined;
      if (refreshedToken) {
        const encryptedRefresh = this.crypto.encrypt(refreshedToken);
        updateData.refreshToken = encryptedRefresh.encrypted;
        updateData.refreshTokenEncryptionIv = encryptedRefresh.iv;
      }

      await this.prisma.providerConfig.update({
        where: { id: provider.id },
        data: updateData,
      });

      return accessToken;
    } catch (error) {
      this.logger.error(
        `Failed to refresh calendar access token for provider ${provider.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return accessToken;
    }
  }

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
    };

    const response = await calendar.events.insert({
      calendarId: data.calendarId || 'primary',
      requestBody: event,
    });

    return {
      id: response.data.id!,
      iCalUID: response.data.iCalUID || null,
    };
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

  /**
   * Create event in Microsoft Calendar
   */
  private async createMicrosoftEvent(
    accessToken: string,
    data: CreateEventDto,
  ): Promise<{ id: string; iCalUId: string | null }> {
    const event = {
      subject: data.title,
      body: {
        contentType: 'HTML',
        content: data.description || '',
      },
      location: data.location ? { displayName: data.location } : undefined,
      start: {
        dateTime: new Date(data.startTime).toISOString(),
        timeZone: data.timeZone || 'UTC',
      },
      end: {
        dateTime: new Date(data.endTime).toISOString(),
        timeZone: data.timeZone || 'UTC',
      },
      isAllDay: data.isAllDay || false,
      attendees: data.attendees?.map((a) => ({
        emailAddress: { address: a.email, name: a.name || a.email },
        type: 'required',
      })),
    };

    const response = await axios.post(`${this.GRAPH_API_BASE}/me/events`, event, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    return {
      id: response.data.id,
      iCalUId: response.data.iCalUId || null,
    };
  }

  /**
   * Update event in Microsoft Calendar
   */
  private async updateMicrosoftEvent(
    accessToken: string,
    eventId: string,
    data: UpdateEventDto,
  ): Promise<void> {
    const event: any = {};

    if (data.title !== undefined) event.subject = data.title;
    if (data.description !== undefined) {
      event.body = { contentType: 'HTML', content: data.description };
    }
    if (data.location !== undefined) event.location = { displayName: data.location };
    if (data.startTime !== undefined) {
      event.start = {
        dateTime: new Date(data.startTime).toISOString(),
        timeZone: data.timeZone || 'UTC',
      };
    }
    if (data.endTime !== undefined) {
      event.end = {
        dateTime: new Date(data.endTime).toISOString(),
        timeZone: data.timeZone || 'UTC',
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
      },
    });
  }

  /**
   * Delete event from Microsoft Calendar
   */
  private async deleteMicrosoftEvent(accessToken: string, eventId: string): Promise<void> {
    await axios.delete(`${this.GRAPH_API_BASE}/me/events/${eventId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

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
        throw new BadRequestException('Calendar sync is not supported for this provider type');
    }
  }

  /**
   * List attachments for a calendar event
   */
  async listEventAttachments(tenantId: string, eventId: string) {
    // Verify event belongs to tenant
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
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
      where: { id: eventId },
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
}
