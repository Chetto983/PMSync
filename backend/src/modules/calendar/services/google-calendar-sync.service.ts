import { Injectable, Logger } from '@nestjs/common';
import { calendar_v3, google } from 'googleapis';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { ConfigService } from '@nestjs/config';

export interface GoogleCalendarSyncResult {
  success: boolean;
  providerId: string;
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  deletedEvents: number;
  syncDuration: number;
}

@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);
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
      this.logger.warn('GoogleCalendarSyncService disabled via CALENDAR_SYNC_ENABLED=false');
    }
  }

  /**
   * Sync calendar events from Google Calendar
   * Syncs events from last 60 days to next 60 days (120 days total)
   */
  async syncCalendar(providerId: string): Promise<GoogleCalendarSyncResult> {
    if (!this.calendarEnabled) {
      this.logger.warn(
        `Skipping Google calendar sync for ${providerId} (CALENDAR_SYNC_ENABLED=false)`,
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
    this.logger.log(`Starting Google Calendar sync for provider ${providerId}`);

    try {
      // Get provider and access token (handles refresh automatically)
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      if (!provider.supportsCalendar) {
        throw new Error('Provider does not support calendar');
      }

      // Create Google Calendar client
      const calendar = this.createCalendarClient(accessToken);

      // Calculate time range: last 60 days to next 60 days
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const sixtyDaysAhead = new Date();
      sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

      this.logger.debug(
        `Fetching Google Calendar events from ${sixtyDaysAgo.toISOString()} to ${sixtyDaysAhead.toISOString()}`,
      );

      let eventsProcessed = 0;
      let newEvents = 0;
      let updatedEvents = 0;
      let deletedEvents = 0;

      // Get list of calendars
      const calendarList = await calendar.calendarList.list();
      const calendars = calendarList.data.items || [];

      this.logger.debug(`Found ${calendars.length} calendars for provider ${providerId}`);

      await this.backfillCalendarNames(providerId, calendars);

      // Sync events from each calendar
      for (const cal of calendars) {
        if (!cal.id) {
          continue;
        }

        try {
          const result = await this.syncCalendarEvents(
            calendar,
            cal.id,
            providerId,
            provider.tenantId,
            sixtyDaysAgo.toISOString(),
            sixtyDaysAhead.toISOString(),
            cal.summaryOverride || cal.summary || cal.description || cal.id,
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
        `Google Calendar sync completed for provider ${providerId}: ${eventsProcessed} events processed, ${newEvents} new, ${updatedEvents} updated, ${deletedEvents} deleted in ${syncDuration}ms`,
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
      this.logger.error(`Google Calendar sync failed for provider ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Sync events from a specific calendar (BULK OPTIMIZED)
   * Uses batch operations to reduce database queries from O(n) to O(1)
   */
  private async syncCalendarEvents(
    calendar: calendar_v3.Calendar,
    calendarId: string,
    providerId: string,
    tenantId: string,
    timeMin: string,
    timeMax: string,
    calendarName?: string | null,
  ): Promise<{
    eventsProcessed: number;
    newEvents: number;
    updatedEvents: number;
    deletedEvents: number;
  }> {
    // STEP 1: Fetch ALL events from Google Calendar API (collect all pages)
    const allGoogleEvents: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;

    do {
      const eventsResponse = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        maxResults: 2500, // Max allowed by Google API
        singleEvents: true,
        orderBy: 'startTime',
        pageToken,
      });

      const events = eventsResponse.data.items || [];
      allGoogleEvents.push(...events.filter((e) => e.id));
      pageToken = eventsResponse.data.nextPageToken || undefined;
    } while (pageToken);

    if (allGoogleEvents.length === 0) {
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
    const allAttachments: { eventExternalId: string; attachments: calendar_v3.Schema$EventAttachment[] }[] = [];
    const allGoogleEventIds = new Set<string>();

    for (const event of allGoogleEvents) {
      const eventId = event.id!;
      allGoogleEventIds.add(eventId);

      const eventData = this.extractEventData(event, calendarId, providerId, tenantId, calendarName ?? calendarId);
      const existing = existingByExternalId.get(eventId);

      if (existing) {
        updateEvents.push({ externalId: eventId, id: existing.id });
      } else {
        newEvents.push(eventData);
      }

      // Collect attachments for bulk processing later
      if (event.attachments && event.attachments.length > 0) {
        allAttachments.push({ eventExternalId: eventId, attachments: event.attachments });
      }
    }

    // STEP 4: Execute bulk operations in transaction
    let createdCount = 0;
    let updatedCount = 0;

    await this.prisma.$transaction(
      async (tx) => {
        // 4a. Bulk create new events using createManyAndReturn (Prisma 5.14+)
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
      .filter((e) => !allGoogleEventIds.has(e.externalId))
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

    // STEP 6: Bulk process attachments
    if (allAttachments.length > 0) {
      await this.processBulkAttachments(providerId, allAttachments);
    }

    return {
      eventsProcessed: allGoogleEvents.length,
      newEvents: createdCount,
      updatedEvents: updatedCount,
      deletedEvents: deletedCount,
    };
  }

  /**
   * Extract event data from Google Calendar event
   */
  private extractEventData(
    event: calendar_v3.Schema$Event,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
  ): any {
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
      reminders: reminders ? (reminders as any) : undefined,
      htmlLink,
      metadata: {
        googleCalendarId: calendarId,
        etag: event.etag,
      } as any,
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Process attachments for multiple events in bulk
   */
  private async processBulkAttachments(
    providerId: string,
    allAttachments: { eventExternalId: string; attachments: calendar_v3.Schema$EventAttachment[] }[],
  ): Promise<void> {
    try {
      // Get all event IDs for attachment processing
      const externalIds = allAttachments.map((a) => a.eventExternalId);
      const events = await this.prisma.calendarEvent.findMany({
        where: { providerId, externalId: { in: externalIds } },
        select: { id: true, externalId: true },
      });
      const eventIdMap = new Map(events.map((e) => [e.externalId, e.id]));

      // Delete all existing attachments for these events in bulk
      const eventIds = events.map((e) => e.id);
      if (eventIds.length > 0) {
        await this.prisma.calendarEventAttachment.deleteMany({
          where: { eventId: { in: eventIds } },
        });
      }

      // Prepare all attachment records for bulk insert
      const attachmentRecords: any[] = [];
      for (const { eventExternalId, attachments } of allAttachments) {
        const eventId = eventIdMap.get(eventExternalId);
        if (!eventId) continue;

        for (const attachment of attachments) {
          if (!attachment.fileUrl) continue;

          attachmentRecords.push({
            eventId,
            filename: attachment.title || 'Untitled',
            mimeType: attachment.mimeType || 'application/octet-stream',
            size: 0,
            storageType: 'reference',
            fileUrl: attachment.fileUrl,
            fileId: attachment.fileId || null,
            iconLink: attachment.iconLink || null,
            isGoogleDrive: true,
            isOneDrive: false,
          });
        }
      }

      // Bulk insert all attachments
      if (attachmentRecords.length > 0) {
        await this.prisma.calendarEventAttachment.createMany({
          data: attachmentRecords,
          skipDuplicates: true,
        });
        this.logger.debug(`Bulk created ${attachmentRecords.length} calendar attachments`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process bulk attachments: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create Google Calendar client
   */
  private createCalendarClient(accessToken: string): calendar_v3.Calendar {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Ensure existing events have user-friendly calendar names after schema change.
   * This updates historical rows so the UI stops showing raw calendar IDs.
   */
  private async backfillCalendarNames(
    providerId: string,
    calendars: calendar_v3.Schema$CalendarListEntry[],
  ): Promise<void> {
    const updates = calendars
      .filter((cal): cal is calendar_v3.Schema$CalendarListEntry & { id: string } => !!cal.id)
      .map((cal) =>
        this.prisma.calendarEvent.updateMany({
          where: {
            providerId,
            calendarId: cal.id,
          },
          data: {
            calendarName: cal.summaryOverride || cal.summary || cal.description || cal.id,
          },
        }),
      );

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }
  }
}
