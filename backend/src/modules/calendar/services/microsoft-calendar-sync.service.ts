/**
 * Microsoft Calendar Sync Service
 *
 * Extends AbstractCalendarSyncService with Microsoft Graph API implementations.
 * Uses the @microsoft/microsoft-graph-client SDK for better type safety and error handling.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import type { Calendar, Event } from '@microsoft/microsoft-graph-types';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { AbstractCalendarSyncService } from './abstract-calendar-sync.service';
import {
  CalendarProviderType,
  ProviderCalendar,
  NormalizedCalendarEvent,
  FetchEventsResult,
} from '../interfaces/calendar-sync.interface';

// Re-export for backward compatibility
export type { CalendarSyncResult as MicrosoftCalendarSyncResult } from '../interfaces/calendar-sync.interface';

/**
 * Extended Microsoft Event interface with delta query properties
 */
interface MicrosoftDeltaEvent extends Event {
  '@removed'?: { reason: string };
}

/**
 * Microsoft Graph API response for delta queries
 */
interface MicrosoftDeltaResponse {
  value?: MicrosoftDeltaEvent[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

@Injectable()
export class MicrosoftCalendarSyncService extends AbstractCalendarSyncService {
  protected readonly logger = new Logger(MicrosoftCalendarSyncService.name);

  constructor(
    prisma: PrismaService,
    providerTokenService: ProviderTokenService,
    realtimeEvents: RealtimeEventsService,
    configService: ConfigService,
  ) {
    super(prisma, providerTokenService, realtimeEvents, configService);

    if (!this.calendarEnabled) {
      this.logger.warn('MicrosoftCalendarSyncService disabled via CALENDAR_SYNC_ENABLED=false');
    }
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  protected get providerType(): CalendarProviderType {
    return 'microsoft';
  }

  /**
   * Fetch calendar list from Microsoft Graph API
   */
  protected async fetchCalendarList(accessToken: string): Promise<ProviderCalendar[]> {
    const client = this.createGraphClient(accessToken);

    // Use $select to fetch only required fields (2025 best practice)
    const response = await client
      .api('/me/calendars')
      .select('id,name')
      .get();

    const calendars: Calendar[] = response.value || [];

    return calendars
      .filter((cal) => cal.id)
      .map((cal) => ({
        id: cal.id!,
        name: cal.name || cal.id!,
        primary: false, // Microsoft doesn't have a primary flag like Google
      }));
  }

  /**
   * Fetch events from Microsoft Graph API using delta query
   */
  protected async fetchEvents<T = MicrosoftDeltaEvent>(
    accessToken: string,
    calendarId: string,
    deltaLink: string | undefined,
    isFullSync: boolean,
  ): Promise<FetchEventsResult<T>> {
    const client = this.createGraphClient(accessToken);
    const allEvents: MicrosoftDeltaEvent[] = [];
    let nextDeltaLink: string | undefined;

    // Fields to select (2025 best practice: reduce bandwidth)
    const selectFields = [
      'id', 'subject', 'start', 'end', 'location', 'organizer', 'attendees',
      'isAllDay', 'isCancelled', 'recurrence', 'seriesMasterId', 'iCalUId',
      'showAs', 'sensitivity', 'webLink', 'lastModifiedDateTime', 'body', 'bodyPreview',
    ].join(',');

    if (isFullSync) {
      // Full sync: use calendarView/delta with time range
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const sixtyDaysAhead = new Date();
      sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

      let nextLink: string | undefined = `/me/calendars/${calendarId}/calendarView/delta`;

      this.logger.debug(`Fetching initial sync from Microsoft Graph`);

      while (nextLink) {
        let request = client.api(nextLink);

        // Only add query params on first request (nextLink already includes them)
        if (!nextLink.includes('@odata')) {
          request = request
            .query({
              startDateTime: sixtyDaysAgo.toISOString(),
              endDateTime: sixtyDaysAhead.toISOString(),
            })
            .select(selectFields);
        }

        const response: MicrosoftDeltaResponse = await request.get();
        const events = response.value || [];

        // Log event count for debugging (no sensitive data)
        if (allEvents.length === 0 && events.length > 0) {
          this.logger.debug(`Microsoft Calendar sync: fetched ${events.length} events in first page`);
        }

        allEvents.push(...events);

        // Check for more pages or final deltaLink
        if (response['@odata.nextLink']) {
          // Extract the path from the full URL
          const url = new URL(response['@odata.nextLink']);
          nextLink = url.pathname + url.search;
        } else {
          nextLink = undefined;
          nextDeltaLink = response['@odata.deltaLink'];
        }
      }
    } else {
      // Incremental sync: use deltaLink directly
      let currentLink: string | undefined = deltaLink;

      while (currentLink) {
        // For delta links, we need to use the full URL
        const response: MicrosoftDeltaResponse = await client
          .api(currentLink)
          .get();

        const events = response.value || [];
        allEvents.push(...events);

        if (response['@odata.nextLink']) {
          currentLink = response['@odata.nextLink'];
        } else {
          currentLink = undefined;
          nextDeltaLink = response['@odata.deltaLink'];
        }
      }
    }

    return {
      events: allEvents as T[],
      nextDeltaLink,
    };
  }

  /**
   * Extract normalized event data from Microsoft Graph event
   */
  protected extractEventData(
    event: MicrosoftDeltaEvent,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
  ): NormalizedCalendarEvent {
    let title = event.subject;

    // Handle missing title (common for birthday events)
    if ((!title || title.trim() === '') && !event.isCancelled && !event['@removed']) {
      title = this.extractTitleFromEvent(event, calendarName);
    }

    const description = event.body?.content || event.bodyPreview || null;
    const location = event.location?.displayName || null;
    const organizer = event.organizer?.emailAddress?.address || null;
    const attendees = event.attendees || null;

    const isAllDay = event.isAllDay || false;
    const startTime = new Date(event.start!.dateTime!);
    const endTime = new Date(event.end!.dateTime!);
    const timeZone = event.start?.timeZone || event.end?.timeZone || 'UTC';

    const recurrence = event.recurrence ? [JSON.stringify(event.recurrence)] : [];
    const recurringEventId = event.seriesMasterId || null;

    const status = event.isCancelled ? 'cancelled' : 'confirmed';
    const visibility = this.mapMicrosoftSensitivity(event.sensitivity || 'normal');
    const isCancelled = event.isCancelled || false;

    const htmlLink = event.webLink || null;
    const iCalUID = event.iCalUId || null;

    return {
      tenantId,
      providerId,
      externalId: event.id!,
      calendarId,
      calendarName,
      iCalUID,
      title: title || '(No Title)',
      description,
      location,
      organizer,
      attendees: attendees ? (attendees as any) : undefined,
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
      reminders: undefined,
      htmlLink,
      metadata: {
        microsoftCalendarId: calendarId,
        lastModifiedDateTime: event.lastModifiedDateTime,
        showAs: event.showAs,
      } as any,
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Check if a Microsoft event is cancelled/deleted
   */
  protected isEventCancelled(event: MicrosoftDeltaEvent): boolean {
    return !!(event['@removed'] || event.isCancelled);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Create Microsoft Graph client with access token
   */
  private createGraphClient(accessToken: string): GraphClient {
    return GraphClient.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
  }

  /**
   * Map Microsoft sensitivity to visibility
   */
  private mapMicrosoftSensitivity(sensitivity: string): string {
    switch (sensitivity.toLowerCase()) {
      case 'private':
        return 'private';
      case 'confidential':
        return 'confidential';
      case 'personal':
        return 'private';
      default:
        return 'default';
    }
  }

  /**
   * Extract title from event body or context (for birthday events)
   */
  private extractTitleFromEvent(event: MicrosoftDeltaEvent, calendarName: string): string {
    // Try to extract from body content (birthday events often have name in body)
    const bodyContent = event.body?.content || event.bodyPreview || '';
    if (bodyContent) {
      // Look for patterns like "Birthday: Name" or just extract first line
      const birthdayMatch = bodyContent.match(/(?:Birthday|Compleanno|Anniversaire):\s*(.+?)(?:\n|<|$)/i);
      if (birthdayMatch && birthdayMatch[1]) {
        return birthdayMatch[1].trim();
      }

      // Extract first non-empty line from body
      const firstLine = bodyContent
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .split('\n')
        .map((l: string) => l.trim())
        .find((l: string) => l.length > 0 && l.length < 100);
      if (firstLine) {
        return firstLine;
      }
    }

    // Try attendees (birthday events may have person as attendee)
    if (event.attendees && event.attendees.length > 0) {
      const firstAttendee = event.attendees[0];
      if (firstAttendee?.emailAddress?.name) {
        return `${firstAttendee.emailAddress.name}'s Birthday`;
      }
    }

    // Check calendar name for context
    if (calendarName) {
      const isBirthdayCalendar =
        calendarName.toLowerCase().includes('birthday') ||
        calendarName.toLowerCase().includes('compleanno') ||
        calendarName.toLowerCase().includes('anniversaire');

      if (isBirthdayCalendar) {
        const eventDate = new Date(event.start?.dateTime || Date.now());
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[eventDate.getMonth()];
        const day = eventDate.getDate();
        return `Birthday - ${month} ${day}`;
      }
    }

    return '(No Title)';
  }
}
