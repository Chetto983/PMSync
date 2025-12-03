import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { URLSearchParams } from 'url';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

interface MicrosoftEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  location?: { displayName: string };
  organizer?: { emailAddress: { address: string; name: string } };
  attendees?: Array<{
    emailAddress: { address: string; name: string };
    status: { response: string; time: string };
    type: string;
  }>;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  recurrence?: any;
  seriesMasterId?: string;
  iCalUId?: string;
  showAs?: string;
  sensitivity?: string;
  isCancelled?: boolean;
  webLink?: string;
  lastModifiedDateTime?: string;
}

interface MicrosoftEventsResponse {
  value?: MicrosoftEvent[];
  '@odata.nextLink'?: string;
}

export interface MicrosoftCalendarSyncResult {
  success: boolean;
  providerId: string;
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  deletedEvents: number;
  syncDuration: number;
}

@Injectable()
export class MicrosoftCalendarSyncService {
  private readonly logger = new Logger(MicrosoftCalendarSyncService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private readonly calendarEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerTokenService: ProviderTokenService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly configService: ConfigService,
  ) {
    this.calendarEnabled =
      (this.configService.get<string>('CALENDAR_SYNC_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.calendarEnabled) {
      this.logger.warn('MicrosoftCalendarSyncService disabled via CALENDAR_SYNC_ENABLED=false');
    }
  }

  /**
   * Sync calendar events from Microsoft Calendar
   * Syncs events from last 60 days to next 60 days (120 days total)
   */
  async syncCalendar(providerId: string): Promise<MicrosoftCalendarSyncResult> {
    if (!this.calendarEnabled) {
      this.logger.warn(
        `Skipping Microsoft calendar sync for ${providerId} (CALENDAR_SYNC_ENABLED=false)`,
      );
      return {
        success: true,
        providerId,
        eventsProcessed: 0,
        newEvents: 0,
        updatedEvents: 0,
        deletedEvents: 0,
        syncDuration: 0,
      };
    }
    const startTime = Date.now();
    this.logger.log(`Starting Microsoft Calendar sync for provider ${providerId}`);

    try {
      // Get provider and access token (handles refresh automatically)
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      if (!provider.supportsCalendar) {
        throw new Error('Provider does not support calendar');
      }

      // Calculate time range: last 60 days to next 60 days
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const sixtyDaysAhead = new Date();
      sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

      this.logger.debug(
        `Fetching Microsoft Calendar events from ${sixtyDaysAgo.toISOString()} to ${sixtyDaysAhead.toISOString()}`,
      );

      let eventsProcessed = 0;
      let newEvents = 0;
      let updatedEvents = 0;
      let deletedEvents = 0;

      // Get list of calendars
      const calendarsUrl = `${this.GRAPH_API_BASE}/me/calendars`;
      const calendarsResponse = await axios.get<{ value: Array<{ id: string; name: string }> }>(
        calendarsUrl,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const calendars = calendarsResponse.data.value || [];
      this.logger.debug(`Found ${calendars.length} calendars for provider ${providerId}`);

      await this.backfillCalendarNames(providerId, calendars);

      // Sync events from each calendar
      for (const cal of calendars) {
        try {
          const result = await this.syncCalendarEvents(
            accessToken,
            cal.id,
            providerId,
            provider.tenantId,
            sixtyDaysAgo.toISOString(),
            sixtyDaysAhead.toISOString(),
            cal.name,
          );

          eventsProcessed += result.eventsProcessed;
          newEvents += result.newEvents;
          updatedEvents += result.updatedEvents;
          deletedEvents += result.deletedEvents;
        } catch (calError) {
          this.logger.warn(
            `Failed to sync calendar ${cal.id}: ${calError instanceof Error ? calError.message : String(calError)}`,
          );
        }
      }

      const syncDuration = Date.now() - startTime;

      this.logger.log(
        `Microsoft Calendar sync completed for provider ${providerId}: ${eventsProcessed} events processed, ${newEvents} new, ${updatedEvents} updated, ${deletedEvents} deleted in ${syncDuration}ms`,
      );

      if (newEvents > 0 || updatedEvents > 0 || deletedEvents > 0) {
        // WebSocket events
        this.realtimeEvents.emitSyncStatus(provider.tenantId, {
          providerId,
          status: 'completed',
        });
      }

      return {
        success: true,
        providerId,
        eventsProcessed,
        newEvents,
        updatedEvents,
        deletedEvents,
        syncDuration,
      };
    } catch (error) {
      this.logger.error(`Microsoft Calendar sync failed for provider ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Sync events from a specific calendar (BULK OPTIMIZED)
   * Uses batch operations to reduce database queries from O(n) to O(1)
   */
  private async syncCalendarEvents(
    accessToken: string,
    calendarId: string,
    providerId: string,
    tenantId: string,
    startDateTime: string,
    endDateTime: string,
    calendarName?: string | null,
  ): Promise<{
    eventsProcessed: number;
    newEvents: number;
    updatedEvents: number;
    deletedEvents: number;
  }> {
    // STEP 1: Fetch ALL events from Microsoft Graph API (collect all pages)
    const allMsEvents: MicrosoftEvent[] = [];

    const params = new URLSearchParams({
      startDateTime,
      endDateTime,
      $top: '999', // Max for better efficiency
      $orderby: 'start/dateTime',
    });

    let eventsUrl: string | undefined = `${this.GRAPH_API_BASE}/me/calendars/${calendarId}/calendarView?${params.toString()}`;

    while (eventsUrl) {
      const eventsResponse: AxiosResponse<MicrosoftEventsResponse> = await axios.get(eventsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const events = eventsResponse.data.value || [];
      allMsEvents.push(...events);
      eventsUrl = eventsResponse.data['@odata.nextLink'];
    }

    if (allMsEvents.length === 0) {
      return { eventsProcessed: 0, newEvents: 0, updatedEvents: 0, deletedEvents: 0 };
    }

    // STEP 2: Fetch ALL existing events for this calendar in ONE query
    const existingEvents = await this.prisma.calendarEvent.findMany({
      where: { providerId, calendarId },
      select: { id: true, externalId: true, syncVersion: true },
    });
    const existingByExternalId = new Map(existingEvents.map((e) => [e.externalId, e]));

    // STEP 3: Prepare bulk operations
    const newEvents: any[] = [];
    const updateEvents: { externalId: string; id: string }[] = [];
    const allMsEventIds = new Set<string>();

    for (const event of allMsEvents) {
      const eventId = event.id;
      allMsEventIds.add(eventId);

      const eventData = this.extractEventData(event, calendarId, providerId, tenantId, calendarName ?? calendarId);
      const existing = existingByExternalId.get(eventId);

      if (existing) {
        updateEvents.push({ externalId: eventId, id: existing.id });
      } else {
        newEvents.push(eventData);
      }
    }

    // STEP 4: Execute bulk operations in transaction
    let createdCount = 0;
    let updatedCount = 0;

    await this.prisma.$transaction(
      async (tx) => {
        // 4a. Bulk create new events
        if (newEvents.length > 0) {
          await tx.calendarEvent.createMany({
            data: newEvents,
            skipDuplicates: true,
          });
          createdCount = newEvents.length;
        }

        // 4b. Bulk update existing events using raw SQL
        if (updateEvents.length > 0) {
          const now = new Date();
          const externalIds = updateEvents.map((e) => e.externalId);

          await tx.$executeRaw`
            UPDATE "calendar_events"
            SET "lastSyncedAt" = ${now},
                "syncVersion" = "syncVersion" + 1
            WHERE "providerId" = ${providerId}
              AND "externalId" = ANY(${externalIds}::text[])
          `;
          updatedCount = updateEvents.length;
        }
      },
      { timeout: 60000 },
    );

    // STEP 5: Handle deleted events using bulk updateMany
    let deletedCount = 0;
    const deletedExternalIds = existingEvents
      .filter((e) => !allMsEventIds.has(e.externalId))
      .map((e) => e.externalId);

    if (deletedExternalIds.length > 0) {
      const result = await this.prisma.calendarEvent.updateMany({
        where: {
          providerId,
          calendarId,
          externalId: { in: deletedExternalIds },
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
      deletedCount = result.count;
    }

    return {
      eventsProcessed: allMsEvents.length,
      newEvents: createdCount,
      updatedEvents: updatedCount,
      deletedEvents: deletedCount,
    };
  }

  /**
   * Extract event data from Microsoft event
   */
  private extractEventData(
    event: MicrosoftEvent,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
  ): any {
    const title = event.subject || '(No Title)';
    const description = event.body?.content || event.bodyPreview || null;
    const location = event.location?.displayName || null;
    const organizer = event.organizer?.emailAddress?.address || null;
    const attendees = event.attendees || null;

    const isAllDay = event.isAllDay || false;
    const startTime = new Date(event.start.dateTime);
    const endTime = new Date(event.end.dateTime);
    const timeZone = event.start.timeZone || event.end.timeZone || 'UTC';
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
      externalId: event.id,
      calendarId,
      calendarName,
      iCalUID,
      title,
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
   * Map Microsoft sensitivity to Google visibility
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
   * Populate calendar names for historical events so the UI displays friendly labels.
   */
  private async backfillCalendarNames(
    providerId: string,
    calendars: Array<{ id: string; name?: string | null }>,
  ): Promise<void> {
    const updates = calendars
      .filter((cal) => !!cal.id)
      .map((cal) =>
        this.prisma.calendarEvent.updateMany({
          where: {
            providerId,
            calendarId: cal.id,
          },
          data: {
            calendarName: cal.name || cal.id,
          },
        }),
      );

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }
  }
}
