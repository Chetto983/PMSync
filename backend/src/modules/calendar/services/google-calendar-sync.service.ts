import { Injectable, Logger } from '@nestjs/common';
import { calendar_v3, google } from 'googleapis';
import { Prisma } from '@prisma/client';
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
  syncType: 'full' | 'incremental';
}

@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);
  private readonly calendarEnabled: boolean;
  /** Max events to fetch per API call (Google API max: 2500) */
  private readonly maxEventsPerRequest: number;
  /** Max consecutive errors before forcing full sync */
  private readonly maxErrorsBeforeFullSync: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerTokenService: ProviderTokenService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly configService: ConfigService,
  ) {
    this.calendarEnabled =
      (this.configService.get<string>('CALENDAR_SYNC_ENABLED') || 'true').toLowerCase() !== 'false';
    this.maxEventsPerRequest = this.configService.get<number>('GOOGLE_CALENDAR_MAX_EVENTS', 2500);
    this.maxErrorsBeforeFullSync = this.configService.get<number>('CALENDAR_SYNC_MAX_ERRORS', 3);
    if (!this.calendarEnabled) {
      this.logger.warn('GoogleCalendarSyncService disabled via CALENDAR_SYNC_ENABLED=false');
    }
  }

  /**
   * Sync calendar events from Google Calendar
   * Uses incremental sync (syncToken) when available, falls back to full sync
   */
  async syncCalendar(providerId: string, forceFullSync = false): Promise<GoogleCalendarSyncResult> {
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
        syncType: 'full',
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

      let eventsProcessed = 0;
      let newEvents = 0;
      let updatedEvents = 0;
      let deletedEvents = 0;
      let syncType: 'full' | 'incremental' = 'incremental';

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
          const result = await this.syncCalendarWithState(
            calendar,
            cal.id,
            providerId,
            provider.tenantId,
            cal.summaryOverride || cal.summary || cal.description || cal.id,
            forceFullSync,
          );

          eventsProcessed += result.eventsProcessed;
          newEvents += result.newEvents;
          updatedEvents += result.updatedEvents;
          deletedEvents += result.deletedEvents;
          if (result.syncType === 'full') {
            syncType = 'full';
          }
        } catch (calError) {
          this.logger.warn(
            `Failed to sync calendar ${cal.id}: ${calError instanceof Error ? calError.message : String(calError)}`,
          );
          // Record error in sync state
          await this.recordSyncError(providerId, cal.id, calError);
        }
      }

      const syncDuration = Date.now() - startTime;

      this.logger.log(
        `Google Calendar sync completed for provider ${providerId}: ${eventsProcessed} events (${syncType}), ${newEvents} new, ${updatedEvents} updated, ${deletedEvents} deleted in ${syncDuration}ms`,
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
        syncType,
      };
    } catch (error) {
      this.logger.error(`Google Calendar sync failed for provider ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Sync a single calendar using sync state (incremental when possible)
   */
  private async syncCalendarWithState(
    calendar: calendar_v3.Calendar,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
    forceFullSync: boolean,
  ): Promise<{
    eventsProcessed: number;
    newEvents: number;
    updatedEvents: number;
    deletedEvents: number;
    syncType: 'full' | 'incremental';
  }> {
    // Get or create sync state for this calendar
    const syncState = await this.prisma.calendarSyncState.findUnique({
      where: {
        providerId_calendarId: { providerId, calendarId },
      },
    });

    // Determine if we need full sync
    const needsFullSync =
      forceFullSync ||
      !syncState ||
      syncState.fullSyncRequired ||
      !syncState.syncToken ||
      syncState.consecutiveErrors >= this.maxErrorsBeforeFullSync;

    if (needsFullSync) {
      this.logger.debug(`Running FULL sync for calendar ${calendarId}`);
      return this.runFullSync(calendar, calendarId, providerId, tenantId, calendarName);
    }

    // Try incremental sync
    this.logger.debug(`Running INCREMENTAL sync for calendar ${calendarId} with syncToken`);
    try {
      return await this.runIncrementalSync(
        calendar,
        calendarId,
        providerId,
        tenantId,
        calendarName,
        syncState.syncToken!,
      );
    } catch (error: any) {
      // Handle sync token invalidation (410 Gone)
      if (error?.code === 410 || error?.response?.status === 410) {
        this.logger.warn(`Sync token expired for calendar ${calendarId}, falling back to full sync`);
        // Invalidate the sync token
        await this.prisma.calendarSyncState.update({
          where: { providerId_calendarId: { providerId, calendarId } },
          data: {
            syncToken: null,
            fullSyncRequired: true,
            lastError: 'Sync token expired (410 Gone)',
            lastErrorAt: new Date(),
          },
        });
        // Run full sync
        return this.runFullSync(calendar, calendarId, providerId, tenantId, calendarName);
      }
      throw error;
    }
  }

  /**
   * Run full calendar sync (fetches all events in time window)
   */
  private async runFullSync(
    calendar: calendar_v3.Calendar,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
  ): Promise<{
    eventsProcessed: number;
    newEvents: number;
    updatedEvents: number;
    deletedEvents: number;
    syncType: 'full' | 'incremental';
  }> {
    // Calculate time range: last 60 days to next 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const sixtyDaysAhead = new Date();
    sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

    // Fetch ALL events from Google Calendar API
    const allGoogleEvents: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    // NOTE: To get syncToken for incremental sync, we MUST NOT use:
    // - singleEvents: true (prevents syncToken from being returned)
    // - timeMin/timeMax (prevents syncToken from being returned)
    // Instead, we fetch ALL events and filter client-side for the display window
    do {
      const eventsResponse = await calendar.events.list({
        calendarId,
        maxResults: this.maxEventsPerRequest,
        showDeleted: true, // Required for incremental sync to detect deletions
        pageToken,
      });

      const events = eventsResponse.data.items || [];
      // Filter to time window client-side
      const filtered = events.filter((e) => {
        if (!e.id) return false;
        // Include cancelled events for deletion tracking
        if (e.status === 'cancelled') return true;
        // Check if event falls within our time window
        const startDate = e.start?.dateTime || e.start?.date;
        const endDate = e.end?.dateTime || e.end?.date;
        if (!startDate) return false;
        const eventStart = new Date(startDate);
        const eventEnd = endDate ? new Date(endDate) : eventStart;
        // Include if event overlaps with our window
        return eventEnd >= sixtyDaysAgo && eventStart <= sixtyDaysAhead;
      });
      allGoogleEvents.push(...filtered);
      pageToken = eventsResponse.data.nextPageToken || undefined;
      nextSyncToken = eventsResponse.data.nextSyncToken || undefined;
    } while (pageToken);

    // Process events in bulk
    const result = await this.processEvents(
      allGoogleEvents,
      calendarId,
      providerId,
      tenantId,
      calendarName,
      true, // isFullSync - mark deleted events
    );

    // Save sync state with new syncToken
    await this.prisma.calendarSyncState.upsert({
      where: {
        providerId_calendarId: { providerId, calendarId },
      },
      create: {
        providerId,
        calendarId,
        calendarName,
        syncToken: nextSyncToken,
        fullSyncRequired: false,
        lastFullSyncAt: new Date(),
        consecutiveErrors: 0,
      },
      update: {
        calendarName,
        syncToken: nextSyncToken,
        fullSyncRequired: false,
        lastFullSyncAt: new Date(),
        consecutiveErrors: 0,
        lastError: null,
        lastErrorAt: null,
      },
    });

    this.logger.debug(
      `Full sync saved syncToken for calendar ${calendarId}: ${nextSyncToken ? 'yes' : 'no'}`,
    );

    return {
      ...result,
      syncType: 'full',
    };
  }

  /**
   * Run incremental calendar sync using syncToken
   * Only fetches changes since last sync
   */
  private async runIncrementalSync(
    calendar: calendar_v3.Calendar,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
    syncToken: string,
  ): Promise<{
    eventsProcessed: number;
    newEvents: number;
    updatedEvents: number;
    deletedEvents: number;
    syncType: 'full' | 'incremental';
  }> {
    // Fetch only changed events using syncToken
    const changedEvents: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    do {
      const eventsResponse = await calendar.events.list({
        calendarId,
        syncToken,
        maxResults: this.maxEventsPerRequest,
        showDeleted: true, // Required to detect event deletions
        pageToken,
      });

      const events = eventsResponse.data.items || [];
      changedEvents.push(...events.filter((e) => e.id));
      pageToken = eventsResponse.data.nextPageToken || undefined;
      nextSyncToken = eventsResponse.data.nextSyncToken || undefined;
    } while (pageToken);

    this.logger.debug(
      `Incremental sync found ${changedEvents.length} changed events for calendar ${calendarId}`,
    );

    // Process only changed events
    const result = await this.processEvents(
      changedEvents,
      calendarId,
      providerId,
      tenantId,
      calendarName,
      false, // isFullSync - don't mark other events as deleted
    );

    // Update sync state with new syncToken
    await this.prisma.calendarSyncState.update({
      where: {
        providerId_calendarId: { providerId, calendarId },
      },
      data: {
        syncToken: nextSyncToken,
        lastIncrementalAt: new Date(),
        consecutiveErrors: 0,
        lastError: null,
        lastErrorAt: null,
      },
    });

    return {
      ...result,
      syncType: 'incremental',
    };
  }

  /**
   * Process events (shared between full and incremental sync)
   */
  private async processEvents(
    events: calendar_v3.Schema$Event[],
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
    isFullSync: boolean,
  ): Promise<{
    eventsProcessed: number;
    newEvents: number;
    updatedEvents: number;
    deletedEvents: number;
  }> {
    if (events.length === 0) {
      return { eventsProcessed: 0, newEvents: 0, updatedEvents: 0, deletedEvents: 0 };
    }

    // Fetch ALL existing events for this calendar in ONE query
    const existingEvents = await this.prisma.calendarEvent.findMany({
      where: { providerId, calendarId },
      select: { id: true, externalId: true, syncVersion: true },
    });
    const existingByExternalId = new Map(existingEvents.map((e) => [e.externalId, e]));

    // Prepare bulk operations
    const newEventsToCreate: any[] = [];
    const eventsToUpdate: { externalId: string; id: string; data: any }[] = [];
    const eventsToDelete: string[] = [];
    const allAttachments: { eventExternalId: string; attachments: calendar_v3.Schema$EventAttachment[] }[] = [];
    const processedEventIds = new Set<string>();

    for (const event of events) {
      if (!event.id) continue;

      processedEventIds.add(event.id);
      const existing = existingByExternalId.get(event.id);

      // Handle cancelled/deleted events
      if (event.status === 'cancelled') {
        if (existing) {
          eventsToDelete.push(event.id);
        }
        continue;
      }

      const eventData = this.extractEventData(event, calendarId, providerId, tenantId, calendarName);

      if (existing) {
        eventsToUpdate.push({ externalId: event.id, id: existing.id, data: eventData });
      } else {
        newEventsToCreate.push(eventData);
      }

      // Collect attachments for bulk processing
      if (event.attachments && event.attachments.length > 0) {
        allAttachments.push({ eventExternalId: event.id, attachments: event.attachments });
      }
    }

    // Execute bulk operations in transaction
    let createdCount = 0;
    let updatedCount = 0;

    await this.prisma.$transaction(
      async (tx) => {
        // Create new events
        if (newEventsToCreate.length > 0) {
          await tx.calendarEvent.createMany({
            data: newEventsToCreate,
            skipDuplicates: true,
          });
          createdCount = newEventsToCreate.length;
        }

        // Update existing events
        if (eventsToUpdate.length > 0) {
          const now = new Date();
          const externalIds = eventsToUpdate.map((e) => e.externalId);

          await tx.$executeRaw`
            UPDATE "calendar_events"
            SET "lastSyncedAt" = ${now},
                "syncVersion" = "syncVersion" + 1
            WHERE "providerId" = ${providerId}
              AND "externalId" = ANY(${externalIds}::text[])
          `;
          updatedCount = eventsToUpdate.length;
        }

        // Mark deleted events (only from incremental sync)
        if (eventsToDelete.length > 0) {
          await tx.calendarEvent.updateMany({
            where: {
              providerId,
              calendarId,
              externalId: { in: eventsToDelete },
              isDeleted: false,
            },
            data: { isDeleted: true, isCancelled: true },
          });
        }
      },
      { timeout: 60000 },
    );

    // Handle deleted events for full sync (events not in response)
    let deletedCount = eventsToDelete.length;
    if (isFullSync) {
      const deletedExternalIds = existingEvents
        .filter((e) => !processedEventIds.has(e.externalId))
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
        deletedCount += result.count;
      }
    }

    // Bulk process attachments
    if (allAttachments.length > 0) {
      await this.processBulkAttachments(providerId, allAttachments);
    }

    return {
      eventsProcessed: events.length,
      newEvents: createdCount,
      updatedEvents: updatedCount,
      deletedEvents: deletedCount,
    };
  }

  /**
   * Record sync error for a calendar
   */
  private async recordSyncError(
    providerId: string,
    calendarId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await this.prisma.calendarSyncState.upsert({
      where: {
        providerId_calendarId: { providerId, calendarId },
      },
      create: {
        providerId,
        calendarId,
        fullSyncRequired: true,
        consecutiveErrors: 1,
        lastError: errorMessage,
        lastErrorAt: new Date(),
      },
      update: {
        consecutiveErrors: { increment: 1 },
        lastError: errorMessage,
        lastErrorAt: new Date(),
      },
    });
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

  /**
   * Force a full sync for a provider (clears all sync tokens)
   */
  async forceFullSync(providerId: string): Promise<void> {
    await this.prisma.calendarSyncState.updateMany({
      where: { providerId },
      data: {
        syncToken: null,
        fullSyncRequired: true,
      },
    });
    this.logger.log(`Forced full sync for provider ${providerId}`);
  }

  /**
   * Get sync state for a provider's calendars
   */
  async getSyncStates(providerId: string) {
    return this.prisma.calendarSyncState.findMany({
      where: { providerId },
      orderBy: { calendarName: 'asc' },
    });
  }
}
