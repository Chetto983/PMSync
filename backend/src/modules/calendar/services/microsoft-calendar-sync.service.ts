import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
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
  '@removed'?: { reason: string }; // Delta sync: event was deleted
}

interface MicrosoftEventsResponse {
  value?: MicrosoftEvent[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

export interface MicrosoftCalendarSyncResult {
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
export class MicrosoftCalendarSyncService {
  private readonly logger = new Logger(MicrosoftCalendarSyncService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private readonly calendarEnabled: boolean;
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
    this.maxErrorsBeforeFullSync = this.configService.get<number>('CALENDAR_SYNC_MAX_ERRORS', 3);
    if (!this.calendarEnabled) {
      this.logger.warn('MicrosoftCalendarSyncService disabled via CALENDAR_SYNC_ENABLED=false');
    }
  }

  /**
   * Sync calendar events from Microsoft Calendar
   * Uses incremental sync (deltaLink) when available, falls back to full sync
   */
  async syncCalendar(providerId: string, forceFullSync = false): Promise<MicrosoftCalendarSyncResult> {
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
        syncType: 'full',
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

      let eventsProcessed = 0;
      let newEvents = 0;
      let updatedEvents = 0;
      let deletedEvents = 0;
      let syncType: 'full' | 'incremental' = 'incremental';

      // Get list of calendars with $select to fetch only required fields
      const calendarsUrl = `${this.GRAPH_API_BASE}/me/calendars?$select=id,name`;
      const calendarsResponse = await axios.get<{ value: Array<{ id: string; name: string }> }>(
        calendarsUrl,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'client-request-id': crypto.randomUUID(), // 2025 best practice: track requests
          },
        },
      );

      const calendars = calendarsResponse.data.value || [];
      this.logger.debug(`Found ${calendars.length} calendars for provider ${providerId}`);

      await this.backfillCalendarNames(providerId, calendars);

      // Sync events from each calendar
      for (const cal of calendars) {
        try {
          const result = await this.syncCalendarWithState(
            accessToken,
            cal.id,
            providerId,
            provider.tenantId,
            cal.name,
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
        `Microsoft Calendar sync completed for provider ${providerId}: ${eventsProcessed} events (${syncType}), ${newEvents} new, ${updatedEvents} updated, ${deletedEvents} deleted in ${syncDuration}ms`,
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
      this.logger.error(`Microsoft Calendar sync failed for provider ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Sync a single calendar using sync state (incremental when possible)
   */
  private async syncCalendarWithState(
    accessToken: string,
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
      !syncState.deltaLink ||
      syncState.consecutiveErrors >= this.maxErrorsBeforeFullSync;

    if (needsFullSync) {
      this.logger.debug(`Running FULL sync for calendar ${calendarId}`);
      return this.runFullSync(accessToken, calendarId, providerId, tenantId, calendarName);
    }

    // Try incremental sync
    this.logger.debug(`Running INCREMENTAL sync for calendar ${calendarId} with deltaLink`);
    try {
      return await this.runIncrementalSync(
        accessToken,
        calendarId,
        providerId,
        tenantId,
        calendarName,
        syncState.deltaLink!,
      );
    } catch (error: any) {
      // Handle delta token invalidation (410 Gone or token expired)
      const status = error?.response?.status || error?.code;
      if (status === 410 || status === 404) {
        this.logger.warn(`Delta token expired for calendar ${calendarId}, falling back to full sync`);
        // Invalidate the delta link
        await this.prisma.calendarSyncState.update({
          where: { providerId_calendarId: { providerId, calendarId } },
          data: {
            deltaLink: null,
            fullSyncRequired: true,
            lastError: `Delta token expired (${status})`,
            lastErrorAt: new Date(),
          },
        });
        // Run full sync
        return this.runFullSync(accessToken, calendarId, providerId, tenantId, calendarName);
      }
      throw error;
    }
  }

  /**
   * Run full calendar sync using delta query (fetches all events, gets deltaLink)
   * Uses calendarView/delta endpoint for initial sync
   */
  private async runFullSync(
    accessToken: string,
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

    // Use delta query for initial full sync (gets all events + deltaLink for future)
    // Note: calendarView/delta requires startDateTime and endDateTime
    const startDateTimeParam = encodeURIComponent(sixtyDaysAgo.toISOString());
    const endDateTimeParam = encodeURIComponent(sixtyDaysAhead.toISOString());

    // $select: Fetch only required fields to reduce bandwidth (2025 best practice)
    const selectFields = 'id,subject,start,end,location,organizer,attendees,isAllDay,isCancelled,recurrence,seriesMasterId,iCalUId,showAs,sensitivity,webLink,lastModifiedDateTime,body,bodyPreview';
    let deltaUrl: string | undefined =
      `${this.GRAPH_API_BASE}/me/calendars/${calendarId}/calendarView/delta?startDateTime=${startDateTimeParam}&endDateTime=${endDateTimeParam}&$select=${selectFields}`;

    // Fetch ALL events using delta pagination
    const allEvents: MicrosoftEvent[] = [];
    let nextDeltaLink: string | undefined;

    this.logger.debug(`Fetching initial sync from: ${deltaUrl}`);

    while (deltaUrl) {
      const response: AxiosResponse<MicrosoftEventsResponse> = await axios.get(deltaUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'client-request-id': crypto.randomUUID(),
        },
      });

      const events = response.data.value || [];

      // DEBUG: Log the first few events to inspect raw API response
      if (allEvents.length === 0 && events.length > 0) {
        this.logger.warn(`[MICROSOFT API DEBUG] First event raw data: ${JSON.stringify(events[0], null, 2)}`);
        this.logger.warn(`[MICROSOFT API DEBUG] Found ${events.length} events in first page.`);
      }

      allEvents.push(...events);

      // Check for more pages or final deltaLink
      if (response.data['@odata.nextLink']) {
        deltaUrl = response.data['@odata.nextLink'];
      } else {
        deltaUrl = undefined;
        nextDeltaLink = response.data['@odata.deltaLink'];
      }
    }

    // Process events in bulk (full sync mode)
    const result = await this.processEvents(
      allEvents,
      calendarId,
      providerId,
      tenantId,
      calendarName,
      true, // isFullSync - mark deleted events
    );

    // Save sync state with new deltaLink
    await this.prisma.calendarSyncState.upsert({
      where: {
        providerId_calendarId: { providerId, calendarId },
      },
      create: {
        providerId,
        calendarId,
        calendarName,
        deltaLink: nextDeltaLink,
        fullSyncRequired: false,
        lastFullSyncAt: new Date(),
        consecutiveErrors: 0,
      },
      update: {
        calendarName,
        deltaLink: nextDeltaLink,
        fullSyncRequired: false,
        lastFullSyncAt: new Date(),
        consecutiveErrors: 0,
        lastError: null,
        lastErrorAt: null,
      },
    });

    this.logger.debug(
      `Full sync saved deltaLink for calendar ${calendarId}: ${nextDeltaLink ? 'yes' : 'no'}`,
    );

    return {
      ...result,
      syncType: 'full',
    };
  }

  /**
   * Run incremental calendar sync using deltaLink
   * Only fetches changes since last sync
   */
  private async runIncrementalSync(
    accessToken: string,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
    deltaLink: string,
  ): Promise<{
    eventsProcessed: number;
    newEvents: number;
    updatedEvents: number;
    deletedEvents: number;
    syncType: 'full' | 'incremental';
  }> {
    // Fetch only changed events using deltaLink
    const changedEvents: MicrosoftEvent[] = [];
    let deltaUrl: string | undefined = deltaLink;
    let nextDeltaLink: string | undefined;

    while (deltaUrl) {
      const response: AxiosResponse<MicrosoftEventsResponse> = await axios.get(deltaUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'client-request-id': crypto.randomUUID(),
        },
      });

      const events = response.data.value || [];
      changedEvents.push(...events);

      if (response.data['@odata.nextLink']) {
        deltaUrl = response.data['@odata.nextLink'];
      } else {
        deltaUrl = undefined;
        nextDeltaLink = response.data['@odata.deltaLink'];
      }
    }

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

    // Update sync state with new deltaLink
    await this.prisma.calendarSyncState.update({
      where: {
        providerId_calendarId: { providerId, calendarId },
      },
      data: {
        deltaLink: nextDeltaLink,
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
    events: MicrosoftEvent[],
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
    const processedEventIds = new Set<string>();

    for (const event of events) {
      if (!event.id) continue;

      processedEventIds.add(event.id);
      const existing = existingByExternalId.get(event.id);

      // Handle deleted events from delta sync (@removed property)
      if (event['@removed']) {
        if (existing) {
          eventsToDelete.push(event.id);
        }
        continue;
      }

      // Handle cancelled events
      if (event.isCancelled) {
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
          // We can't use updateMany for different data, so we need to loop
          // But we should do it inside the transaction
          for (const update of eventsToUpdate) {
            await tx.calendarEvent.update({
              where: { id: update.id },
              data: {
                ...update.data,
                syncVersion: { increment: 1 },
                lastSyncedAt: new Date(),
              },
            });
            updatedCount++;
          }
        }

        // Mark deleted events (from incremental sync)
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
   * Extract event data from Microsoft event
   */
  private extractEventData(
    event: MicrosoftEvent,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
  ): any {
    let title = event.subject;

    // If no subject OR empty subject, try to extract from body or attendees (common for birthday events)
    if ((!title || title.trim() === '') && !event.isCancelled && !event['@removed']) {
      // DEBUG: Log birthday events to see what data is available
      if (calendarName?.toLowerCase().includes('compleanno') || calendarName?.toLowerCase().includes('birthday')) {
        this.logger.debug(
          `Birthday event without subject - Calendar: ${calendarName}, ` +
          `Body preview: "${event.bodyPreview?.substring(0, 100)}", ` +
          `Attendees: ${event.attendees?.length || 0}`,
        );
      }

      // Try to extract from body content (birthday events often have name in body)
      const bodyContent = event.body?.content || event.bodyPreview || '';
      if (bodyContent) {
        // Look for patterns like "Birthday: Name" or just extract first line
        const birthdayMatch = bodyContent.match(/(?:Birthday|Compleanno|Anniversaire):\s*(.+?)(?:\n|<|$)/i);
        if (birthdayMatch && birthdayMatch[1]) {
          title = birthdayMatch[1].trim();
          this.logger.debug(`Extracted title from body pattern: "${title}"`);
        } else {
          // Extract first non-empty line from body
          const firstLine = bodyContent
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .split('\n')
            .map(l => l.trim())
            .find(l => l.length > 0 && l.length < 100); // Reasonable title length
          if (firstLine) {
            title = firstLine;
            this.logger.debug(`Extracted title from first line: "${title}"`);
          }
        }
      }

      // If still no title, try attendees (birthday events may have person as attendee)
      if (!title && event.attendees && event.attendees.length > 0) {
        const firstAttendee = event.attendees[0];
        if (firstAttendee?.emailAddress?.name) {
          title = `${firstAttendee.emailAddress.name}'s Birthday`;
          this.logger.debug(`Extracted title from attendee: "${title}"`);
        }
      }

      // If still no title, check calendar name for context
      if (!title && calendarName) {
        if (calendarName.toLowerCase().includes('birthday') ||
          calendarName.toLowerCase().includes('compleanno')) {
          title = 'Birthday Event';
          this.logger.debug(`Using calendar context title: "${title}"`);
        }
      }

      // Final fallback
      if (!title) {
        this.logger.warn(
          `Event ${event.id} in calendar ${calendarId} (${calendarName}) is missing subject. ` +
          `Body preview: ${event.bodyPreview?.substring(0, 100) || 'none'}`,
        );
        title = '(No Title)';
      }
    }
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

  /**
   * Force a full sync for a provider (clears all delta links)
   */
  async forceFullSync(providerId: string): Promise<void> {
    await this.prisma.calendarSyncState.updateMany({
      where: { providerId },
      data: {
        deltaLink: null,
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
