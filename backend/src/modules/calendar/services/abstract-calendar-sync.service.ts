/**
 * Abstract Calendar Sync Service
 *
 * Base class that implements shared sync logic for both Google and Microsoft calendars.
 * Uses Template Method pattern - subclasses implement provider-specific API calls.
 *
 * Eliminates ~600 lines of duplicated code between GoogleCalendarSyncService
 * and MicrosoftCalendarSyncService.
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getErrorMessage } from '../../../common/utils';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import {
  CalendarSyncResult,
  ProcessEventsResult,
  ProviderCalendar,
  NormalizedCalendarEvent,
  FetchEventsResult,
  CalendarEventAttachmentData,
  CalendarProviderType,
  SYNC_TOKEN_FIELD,
} from '../interfaces/calendar-sync.interface';

/**
 * Abstract base class for calendar sync services
 */
export abstract class AbstractCalendarSyncService {
  protected abstract readonly logger: Logger;
  protected readonly calendarEnabled: boolean;
  protected readonly maxErrorsBeforeFullSync: number;
  protected readonly fullSyncPastYears: number;
  protected readonly fullSyncFutureYears: number;
  /** Lock TTL for sync operations (5 minutes) */
  protected readonly SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly providerTokenService: ProviderTokenService,
    protected readonly realtimeEvents: RealtimeEventsService,
    protected readonly configService: ConfigService,
    protected readonly redisLock: RedisLockService,
  ) {
    this.calendarEnabled =
      (this.configService.get<string>('CALENDAR_SYNC_ENABLED') || 'true').toLowerCase() !== 'false';
    this.maxErrorsBeforeFullSync = this.configService.get<number>('CALENDAR_SYNC_MAX_ERRORS', 3);
    this.fullSyncPastYears = this.configService.get<number>('CALENDAR_SYNC_PAST_YEARS', 3);
    this.fullSyncFutureYears = this.configService.get<number>('CALENDAR_SYNC_FUTURE_YEARS', 3);
  }

  // ============================================================================
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ============================================================================

  /**
   * Provider type identifier
   */
  protected abstract get providerType(): CalendarProviderType;

  /**
   * Fetch calendar list from provider API
   */
  protected abstract fetchCalendarList(accessToken: string): Promise<ProviderCalendar[]>;

  /**
   * Fetch events from a calendar (full or incremental)
   * @param accessToken Provider access token
   * @param calendarId Calendar ID
   * @param syncToken Sync token for incremental sync (undefined for full sync)
   * @param isFullSync Whether this is a full sync
   */
  protected abstract fetchEvents<T>(
    accessToken: string,
    calendarId: string,
    syncToken: string | undefined,
    isFullSync: boolean,
  ): Promise<FetchEventsResult<T>>;

  /**
   * Extract normalized event data from provider-specific event format
   */
  protected abstract extractEventData(
    event: any,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
  ): NormalizedCalendarEvent;

  /**
   * Check if an event is cancelled/deleted
   */
  protected abstract isEventCancelled(event: any): boolean;

  /**
   * Extract attachments from events (optional, returns empty array by default)
   */
  protected extractAttachments(_events: any[]): CalendarEventAttachmentData[] {
    return [];
  }

  // ============================================================================
  // SHARED IMPLEMENTATION - Common logic for both providers
  // ============================================================================

  /**
   * Get the sync token field name for this provider
   */
  protected get syncTokenField(): 'syncToken' | 'deltaLink' {
    return SYNC_TOKEN_FIELD[this.providerType];
  }

  /**
   * Sync calendar events from provider
   * Uses incremental sync when available, falls back to full sync
   *
   * RACE CONDITION FIX: Uses distributed lock to prevent concurrent syncs
   * for the same provider across multiple workers.
   */
  async syncCalendar(providerId: string, forceFullSync = false): Promise<CalendarSyncResult> {
    if (!this.calendarEnabled) {
      this.logger.warn(
        `Skipping ${this.providerType} calendar sync for ${providerId} (CALENDAR_SYNC_ENABLED=false)`,
      );
      return this.createEmptyResult(providerId);
    }

    // RACE CONDITION FIX: Acquire distributed lock before sync
    const lockKey = `calendar:sync:${providerId}`;

    return this.redisLock.withLock(
      lockKey,
      this.SYNC_LOCK_TTL_MS,
      async () => this.executeSyncWithinLock(providerId, forceFullSync),
      { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 },
    );
  }

  /**
   * Execute the actual sync logic (called within distributed lock)
   */
  private async executeSyncWithinLock(
    providerId: string,
    forceFullSync: boolean,
  ): Promise<CalendarSyncResult> {
    const startTime = Date.now();
    this.logger.log(`Starting ${this.providerType} Calendar sync for provider ${providerId}`);

    try {
      // PHASE 4: Rate limit check before API calls
      const isAllowed = await this.redisLock.checkProviderRateLimit(providerId, this.providerType);
      if (!isAllowed) {
        const status = await this.redisLock.getRateLimitStatus(providerId, this.providerType);
        this.logger.warn(
          `Rate limited for ${this.providerType} provider ${providerId}: ${status.current}/${status.limit}/min, retry in ${status.remainingSeconds}s`,
        );
        throw new Error(`Rate limit exceeded - retry in ${status.remainingSeconds} seconds`);
      }

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

      // Get list of calendars
      const calendars = await this.fetchCalendarList(accessToken);

      this.logger.debug(`Found ${calendars.length} calendars for provider ${providerId}`);

      await this.backfillCalendarNames(providerId, calendars);

      // Sync events from each calendar
      for (const cal of calendars) {
        if (!cal.id) {
          continue;
        }

        try {
          const result = await this.syncCalendarWithState(
            accessToken,
            cal.id,
            providerId,
            provider.tenantId,
            cal.name || cal.description || cal.id,
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
          await this.recordSyncError(provider.tenantId, providerId, cal.id, calError);
        }
      }

      const syncDuration = Date.now() - startTime;

      this.logger.log(
        `${this.providerType} Calendar sync completed for provider ${providerId}: ` +
        `${eventsProcessed} events (${syncType}), ${newEvents} new, ${updatedEvents} updated, ` +
        `${deletedEvents} deleted in ${syncDuration}ms`,
      );

      if (newEvents > 0 || updatedEvents > 0 || deletedEvents > 0) {
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
      this.logger.error(`${this.providerType} Calendar sync failed for provider ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Sync a single calendar using sync state (incremental when possible)
   */
  protected async syncCalendarWithState(
    accessToken: string,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
    forceFullSync: boolean,
  ): Promise<ProcessEventsResult & { syncType: 'full' | 'incremental' }> {
    // Get or create sync state for this calendar
    const syncState = await this.prisma.calendarSyncState.findUnique({
      where: {
        tenantId_providerId_calendarId: { tenantId, providerId, calendarId },
      },
    });

    // Get the sync token (syncToken for Google, deltaLink for Microsoft)
    const currentSyncToken = syncState?.[this.syncTokenField];

    // Determine if we need full sync
    const needsFullSync =
      forceFullSync ||
      !syncState ||
      syncState.fullSyncRequired ||
      !currentSyncToken ||
      syncState.consecutiveErrors >= this.maxErrorsBeforeFullSync;

    if (needsFullSync) {
      this.logger.debug(`Running FULL sync for calendar ${calendarId}`);
      return this.runFullSync(accessToken, calendarId, providerId, tenantId, calendarName);
    }

    // Try incremental sync
    this.logger.debug(`Running INCREMENTAL sync for calendar ${calendarId} with ${this.syncTokenField}`);
    try {
      return await this.runIncrementalSync(
        accessToken,
        calendarId,
        providerId,
        tenantId,
        calendarName,
        currentSyncToken,
      );
    } catch (error: any) {
      // Handle sync token invalidation (410 Gone for Google, 404 for Microsoft)
      const status = error?.code || error?.response?.status;
      if (status === 410 || status === 404) {
        this.logger.warn(`Sync token expired for calendar ${calendarId}, falling back to full sync`);
        // Invalidate the sync token
        await this.prisma.calendarSyncState.update({
          where: { tenantId_providerId_calendarId: { tenantId, providerId, calendarId } },
          data: {
            [this.syncTokenField]: null,
            fullSyncRequired: true,
            lastError: `Sync token expired (${status})`,
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
   * Run full calendar sync
   */
  protected async runFullSync(
    accessToken: string,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
  ): Promise<ProcessEventsResult & { syncType: 'full' | 'incremental' }> {
    // Fetch all events (provider-specific implementation)
    const fetchResult = await this.fetchEvents(accessToken, calendarId, undefined, true);

    // Get the next sync token
    const nextSyncToken = fetchResult.nextSyncToken || fetchResult.nextDeltaLink;

    // Process events in bulk
    const result = await this.processEvents(
      fetchResult.events,
      calendarId,
      providerId,
      tenantId,
      calendarName,
      true, // isFullSync - mark deleted events
    );

    // Save sync state with new sync token
    await this.prisma.calendarSyncState.upsert({
      where: {
        tenantId_providerId_calendarId: { tenantId, providerId, calendarId },
      },
      create: {
        tenantId,
        providerId,
        calendarId,
        calendarName,
        [this.syncTokenField]: nextSyncToken,
        fullSyncRequired: false,
        lastFullSyncAt: new Date(),
        consecutiveErrors: 0,
      },
      update: {
        calendarName,
        [this.syncTokenField]: nextSyncToken,
        fullSyncRequired: false,
        lastFullSyncAt: new Date(),
        consecutiveErrors: 0,
        lastError: null,
        lastErrorAt: null,
      },
    });

    this.logger.debug(
      `Full sync saved ${this.syncTokenField} for calendar ${calendarId}: ${nextSyncToken ? 'yes' : 'no'}`,
    );

    return {
      ...result,
      syncType: 'full',
    };
  }

  /**
   * Run incremental calendar sync using sync token
   */
  protected async runIncrementalSync(
    accessToken: string,
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
    syncToken: string,
  ): Promise<ProcessEventsResult & { syncType: 'full' | 'incremental' }> {
    // Fetch changed events using sync token
    const fetchResult = await this.fetchEvents(accessToken, calendarId, syncToken, false);

    this.logger.debug(
      `Incremental sync found ${fetchResult.events.length} changed events for calendar ${calendarId}`,
    );

    // Process only changed events
    const result = await this.processEvents(
      fetchResult.events,
      calendarId,
      providerId,
      tenantId,
      calendarName,
      false, // isFullSync - don't mark other events as deleted
    );

    // Get the next sync token
    const nextSyncToken = fetchResult.nextSyncToken || fetchResult.nextDeltaLink;

    // Update sync state with new sync token
    await this.prisma.calendarSyncState.update({
      where: {
        tenantId_providerId_calendarId: { tenantId, providerId, calendarId },
      },
      data: {
        [this.syncTokenField]: nextSyncToken,
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
  protected async processEvents(
    events: any[],
    calendarId: string,
    providerId: string,
    tenantId: string,
    calendarName: string,
    isFullSync: boolean,
  ): Promise<ProcessEventsResult> {
    const syncWindow = this.getSyncWindow();

    // Fetch ALL existing events for this calendar in ONE query, including archived rows.
    const existingEvents = await this.prisma.calendarEvent.findMany({
      where: { providerId, calendarId },
      select: { id: true, externalId: true, syncVersion: true, isDeleted: true },
    });
    const existingByExternalId = new Map(existingEvents.map((e) => [e.externalId, e]));

    // Handle full sync with zero events - delete all existing events
    if (events.length === 0) {
      if (isFullSync && existingEvents.length > 0) {
        this.logger.debug(
          `Full sync returned 0 events for calendar ${calendarId}, marking ${existingEvents.length} existing events as deleted`,
        );
        const result = await this.prisma.calendarEvent.updateMany({
          where: {
            providerId,
            calendarId,
            isDeleted: false,
          },
          data: { isDeleted: true },
        });
        return { eventsProcessed: 0, newEvents: 0, updatedEvents: 0, deletedEvents: result.count };
      }
      return { eventsProcessed: 0, newEvents: 0, updatedEvents: 0, deletedEvents: 0 };
    }

    // Prepare bulk operations
    const newEventsToCreate: NormalizedCalendarEvent[] = [];
    const eventsToUpdate: { externalId: string; id: string; data: NormalizedCalendarEvent }[] = [];
    const cancelledEventIds: string[] = [];
    const outOfWindowEventIds: string[] = [];
    const processedEventIds = new Set<string>();

    for (const event of events) {
      if (!event.id) continue;

      processedEventIds.add(event.id);
      const existing = existingByExternalId.get(event.id);

      // Handle cancelled/deleted events
      if (this.isEventCancelled(event)) {
        if (existing) {
          cancelledEventIds.push(event.id);
        }
        continue;
      }

      const eventData = this.extractEventData(event, calendarId, providerId, tenantId, calendarName);

      if (!this.eventOverlapsSyncWindow(eventData.startTime, eventData.endTime, syncWindow)) {
        if (existing) {
          outOfWindowEventIds.push(event.id);
        }
        continue;
      }

      if (existing) {
        eventsToUpdate.push({ externalId: event.id, id: existing.id, data: eventData });
      } else {
        newEventsToCreate.push(eventData);
      }
    }

    // Execute bulk operations in transaction
    let createdCount = 0;
    let updatedCount = 0;

    // PERFORMANCE FIX: Reduced timeout from 60s to 30s to prevent connection pool exhaustion
    // Large batches are split to reduce transaction scope
    await this.prisma.$transaction(
      async (tx) => {
        // Create new events
        if (newEventsToCreate.length > 0) {
          await tx.calendarEvent.createMany({
            data: newEventsToCreate as Prisma.CalendarEventCreateManyInput[],
            skipDuplicates: true,
          });
          createdCount = newEventsToCreate.length;
        }

        // Update existing events
        if (eventsToUpdate.length > 0) {
          for (const update of eventsToUpdate) {
            await tx.calendarEvent.update({
              where: { id_tenantId: { id: update.id, tenantId } },
              data: {
                ...(update.data as Prisma.CalendarEventUpdateInput),
                syncVersion: { increment: 1 },
                lastSyncedAt: new Date(),
              },
            });
          }
          updatedCount = eventsToUpdate.length;
        }

        // Mark deleted events (from incremental sync)
        if (cancelledEventIds.length > 0) {
          await tx.calendarEvent.updateMany({
            where: {
              providerId,
              calendarId,
              externalId: { in: cancelledEventIds },
              isDeleted: false,
            },
            data: { isDeleted: true, isCancelled: true },
          });
        }

        // Archive events that moved outside the retained sync window.
        if (outOfWindowEventIds.length > 0) {
          await tx.calendarEvent.updateMany({
            where: {
              providerId,
              calendarId,
              externalId: { in: outOfWindowEventIds },
              isDeleted: false,
            },
            data: { isDeleted: true },
          });
        }
      },
      { timeout: 30000 },
    );

    // Handle deleted events for full sync (events not in response)
    let deletedCount = cancelledEventIds.length + outOfWindowEventIds.length;
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

    // Bulk process attachments (provider-specific, optional)
    const attachments = this.extractAttachments(events);
    if (attachments.length > 0) {
      await this.processBulkAttachments(providerId, attachments);
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
  protected async recordSyncError(
    tenantId: string,
    providerId: string,
    calendarId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage = getErrorMessage(error);

    await this.prisma.calendarSyncState.upsert({
      where: {
        tenantId_providerId_calendarId: { tenantId, providerId, calendarId },
      },
      create: {
        tenantId,
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
   * Force a full sync for a provider (clears all sync tokens)
   */
  async forceFullSync(providerId: string): Promise<void> {
    await this.prisma.calendarSyncState.updateMany({
      where: { providerId },
      data: {
        [this.syncTokenField]: null,
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

  /**
   * Process attachments for multiple events in bulk
   */
  protected async processBulkAttachments(
    providerId: string,
    allAttachments: CalendarEventAttachmentData[],
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
            isGoogleDrive: this.providerType === 'google',
            isOneDrive: this.providerType === 'microsoft',
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
        `Failed to process bulk attachments: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Populate calendar names for historical events
   */
  protected async backfillCalendarNames(
    providerId: string,
    calendars: ProviderCalendar[],
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
            calendarName: cal.name || cal.description || cal.id,
          },
        }),
      );

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }
  }

  /**
   * Create an empty sync result (used when sync is disabled)
   */
  protected createEmptyResult(providerId: string): CalendarSyncResult {
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

  protected getSyncWindow(referenceDate = new Date()): { start: Date; end: Date } {
    const start = new Date(referenceDate);
    start.setUTCFullYear(start.getUTCFullYear() - this.fullSyncPastYears);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(referenceDate);
    end.setUTCFullYear(end.getUTCFullYear() + this.fullSyncFutureYears);
    end.setUTCHours(23, 59, 59, 999);

    return { start, end };
  }

  protected eventOverlapsSyncWindow(
    startTime: Date,
    endTime: Date,
    syncWindow = this.getSyncWindow(),
  ): boolean {
    return endTime >= syncWindow.start && startTime <= syncWindow.end;
  }
}
