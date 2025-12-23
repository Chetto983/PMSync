/**
 * Google Calendar Sync Service
 *
 * Extends AbstractCalendarSyncService with Google-specific API implementations.
 * Uses the googleapis library for Google Calendar API access.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calendar_v3, google } from 'googleapis';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { AbstractCalendarSyncService } from './abstract-calendar-sync.service';
import {
  CalendarProviderType,
  ProviderCalendar,
  NormalizedCalendarEvent,
  FetchEventsResult,
  CalendarEventAttachmentData,
} from '../interfaces/calendar-sync.interface';

// Re-export for backward compatibility
export type { CalendarSyncResult as GoogleCalendarSyncResult } from '../interfaces/calendar-sync.interface';

@Injectable()
export class GoogleCalendarSyncService extends AbstractCalendarSyncService {
  protected readonly logger = new Logger(GoogleCalendarSyncService.name);

  /** Max events to fetch per API call (Google API max: 2500) */
  private readonly maxEventsPerRequest: number;

  constructor(
    prisma: PrismaService,
    providerTokenService: ProviderTokenService,
    realtimeEvents: RealtimeEventsService,
    configService: ConfigService,
  ) {
    super(prisma, providerTokenService, realtimeEvents, configService);
    this.maxEventsPerRequest = configService.get<number>('GOOGLE_CALENDAR_MAX_EVENTS', 2500);

    if (!this.calendarEnabled) {
      this.logger.warn('GoogleCalendarSyncService disabled via CALENDAR_SYNC_ENABLED=false');
    }
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  protected get providerType(): CalendarProviderType {
    return 'google';
  }

  /**
   * Fetch calendar list from Google Calendar API
   */
  protected async fetchCalendarList(accessToken: string): Promise<ProviderCalendar[]> {
    const calendar = this.createCalendarClient(accessToken);
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items || [];

    return calendars
      .filter((cal) => cal.id)
      .map((cal) => ({
        id: cal.id!,
        name: cal.summaryOverride || cal.summary || cal.description || cal.id!,
        description: cal.description || undefined,
        accessRole: cal.accessRole || undefined,
        primary: cal.primary || false,
        deleted: cal.deleted || false,
      }));
  }

  /**
   * Fetch events from Google Calendar API
   */
  protected async fetchEvents<T = calendar_v3.Schema$Event>(
    accessToken: string,
    calendarId: string,
    syncToken: string | undefined,
    isFullSync: boolean,
  ): Promise<FetchEventsResult<T>> {
    const calendar = this.createCalendarClient(accessToken);
    const allEvents: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    if (isFullSync) {
      // Full sync: fetch all events without time filter to get syncToken
      // NOTE: To get syncToken for incremental sync, we MUST NOT use:
      // - singleEvents: true (prevents syncToken from being returned)
      // - timeMin/timeMax (prevents syncToken from being returned)
      do {
        const eventsResponse = await calendar.events.list({
          calendarId,
          maxResults: this.maxEventsPerRequest,
          showDeleted: true, // Required for incremental sync to detect deletions
          pageToken,
        });

        const events = eventsResponse.data.items || [];

        // Filter to time window client-side (last 60 days to next 60 days)
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const sixtyDaysAhead = new Date();
        sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

        const filtered = events.filter((e) => {
          if (!e.id) return false;
          // Include cancelled events for deletion tracking
          if (e.status === 'cancelled') return true;
          // Check if event falls within our time window
          const startDate = e.start?.dateTime || e.start?.date;
          if (!startDate) return false;
          const eventStart = new Date(startDate);
          const endDate = e.end?.dateTime || e.end?.date;
          const eventEnd = endDate ? new Date(endDate) : eventStart;
          // Include if event overlaps with our window
          return eventEnd >= sixtyDaysAgo && eventStart <= sixtyDaysAhead;
        });

        allEvents.push(...filtered);
        pageToken = eventsResponse.data.nextPageToken || undefined;
        nextSyncToken = eventsResponse.data.nextSyncToken || undefined;
      } while (pageToken);
    } else {
      // Incremental sync: fetch only changed events using syncToken
      do {
        const eventsResponse = await calendar.events.list({
          calendarId,
          syncToken,
          maxResults: this.maxEventsPerRequest,
          showDeleted: true, // Required to detect event deletions
          pageToken,
        });

        const events = eventsResponse.data.items || [];
        allEvents.push(...events.filter((e) => e.id));
        pageToken = eventsResponse.data.nextPageToken || undefined;
        nextSyncToken = eventsResponse.data.nextSyncToken || undefined;
      } while (pageToken);
    }

    return {
      events: allEvents as T[],
      nextSyncToken,
    };
  }

  /**
   * Extract normalized event data from Google Calendar event
   */
  protected extractEventData(
    event: calendar_v3.Schema$Event,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
  ): NormalizedCalendarEvent {
    const title = event.summary || '(No Title)';
    const description = event.description || null;
    const location = event.location || null;
    const organizer = event.organizer?.email || null;
    const attendees = event.attendees || null;

    const isAllDay = !!(event.start?.date && !event.start?.dateTime);
    const startTime = isAllDay
      ? new Date(event.start!.date!)
      : new Date(event.start!.dateTime!);
    const endTime = isAllDay
      ? new Date(event.end!.date!)
      : new Date(event.end!.dateTime!);
    const timeZone = event.start?.timeZone || event.end?.timeZone || 'UTC';

    const recurrence = event.recurrence || [];
    const recurringEventId = event.recurringEventId || null;
    const status = event.status || 'confirmed';
    const visibility = event.visibility || 'default';
    const isCancelled = status === 'cancelled';
    const reminders = event.reminders || null;
    const htmlLink = event.htmlLink || null;
    const iCalUID = event.iCalUID || null;

    return {
      tenantId,
      providerId,
      externalId: event.id!,
      calendarId,
      calendarName,
      iCalUID,
      title,
      description,
      location,
      organizer,
      attendees: attendees ? (attendees as unknown as Prisma.InputJsonValue) : undefined,
      startTime,
      endTime,
      isAllDay,
      timeZone,
      recurrence,
      recurringEventId,
      status,
      visibility,
      isCancelled,
      isDeleted: isCancelled,
      reminders: reminders ? (reminders as unknown as Prisma.InputJsonValue) : undefined,
      htmlLink,
      metadata: {
        googleCalendarId: calendarId,
        etag: event.etag,
      },
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Check if a Google Calendar event is cancelled
   */
  protected isEventCancelled(event: calendar_v3.Schema$Event): boolean {
    return event.status === 'cancelled';
  }

  /**
   * Extract attachments from Google Calendar events
   */
  protected extractAttachments(events: calendar_v3.Schema$Event[]): CalendarEventAttachmentData[] {
    const attachments: CalendarEventAttachmentData[] = [];

    for (const event of events) {
      if (event.id && event.attachments && event.attachments.length > 0) {
        attachments.push({
          eventExternalId: event.id,
          attachments: event.attachments.map((att) => ({
            title: att.title || undefined,
            mimeType: att.mimeType || undefined,
            fileUrl: att.fileUrl || undefined,
            fileId: att.fileId || undefined,
            iconLink: att.iconLink || undefined,
          })),
        });
      }
    }

    return attachments;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Create Google Calendar client
   */
  private createCalendarClient(accessToken: string): calendar_v3.Calendar {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }
}
