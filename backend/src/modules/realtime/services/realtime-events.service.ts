import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IRealtimeGateway } from '../types/realtime-gateway.interface';
import {
  CalendarEventPayload,
  CalendarListPayload,
  ContactEventPayload,
  EmailEventPayload,
  LabelEventPayload,
  FolderEventPayload,
  AiActionEventPayload,
  AiSessionEventPayload,
  AiAgentStepEventPayload,
  FollowUpReminderPayload,
  CrmDealStageChangedPayload,
  KnownRealtimeEvent,
  RealtimeEventPayloads,
  buildTenantRoom,
} from '../types/realtime.types';

export type {
  CalendarEventPayload,
  CalendarListPayload,
  ContactEventPayload,
  EmailEventPayload,
  LabelEventPayload,
  FolderEventPayload,
  AiActionEventPayload,
  AiSessionEventPayload,
  AiAgentStepEventPayload,
  FollowUpReminderPayload,
  CrmDealStageChangedPayload,
} from '../types/realtime.types';

/**
 * RealtimeEventsService - Event emission with buffering and deduplication
 *
 * Features:
 * - Tenant-isolated event delivery via WebSocket rooms
 * - Event buffering to prevent storms during bulk operations
 * - Deduplication for email, contact, and calendar events
 * - Folder count caching with TTL and size bounds
 * - Lifecycle cleanup on module destroy (no dangling timers)
 *
 * @see REALTIME_MODULE_ROADMAP.md for implementation details
 */
@Injectable()
export class RealtimeEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private gateway: IRealtimeGateway;
  private emailEventBuffer = new Map<
    string,
    { event: KnownRealtimeEvent; tenantId: string; payload: EmailEventPayload }
  >();
  private emailBufferTimer?: NodeJS.Timeout;
  private folderCountsBuffer = new Map<
    string,
    Map<
      string,
      { tenantId: string; payload: RealtimeEventPayloads['email:folder_counts_update'] }
    >
  >(); // providerId -> folderId -> { tenantId, payload }
  private folderBufferTimer?: NodeJS.Timeout;
  private lastFolderCounts = new Map<
    string,
    Map<string, { totalCount: number; unreadCount: number }>
  >(); // providerId -> folderId -> counts snapshot
  // Contact event buffering (similar to email events)
  private contactEventBuffer = new Map<
    string,
    { event: KnownRealtimeEvent; tenantId: string; payload: ContactEventPayload }
  >();
  private contactBufferTimer?: NodeJS.Timeout;
  // Calendar event buffering
  private calendarEventBuffer = new Map<
    string,
    { event: KnownRealtimeEvent; tenantId: string; payload: CalendarEventPayload }
  >();
  private calendarBufferTimer?: NodeJS.Timeout;
  private readonly EMAIL_BUFFER_MS: number;
  private readonly EMAIL_BUFFER_MAX: number;
  private readonly FOLDER_BUFFER_MS: number;
  private readonly FOLDER_BUFFER_MAX: number;
  private readonly CONTACT_BUFFER_MS: number;
  private readonly CONTACT_BUFFER_MAX: number;
  private readonly CALENDAR_BUFFER_MS: number;
  private readonly CALENDAR_BUFFER_MAX: number;

  // Cache bounds configuration
  private readonly FOLDER_CACHE_MAX_PROVIDERS: number;
  private readonly FOLDER_CACHE_MAX_FOLDERS_PER_PROVIDER: number;
  private readonly FOLDER_CACHE_TTL_MS: number;
  private folderCacheCleanupTimer?: NodeJS.Timeout;

  // Shutdown configuration
  private readonly FLUSH_ON_SHUTDOWN: boolean;

  constructor(private readonly config: ConfigService) {
    this.EMAIL_BUFFER_MS = this.config.get<number>('REALTIME_EMAIL_BUFFER_MS', 200);
    this.EMAIL_BUFFER_MAX = this.config.get<number>('REALTIME_EMAIL_BUFFER_MAX', 500);
    this.FOLDER_BUFFER_MS = this.config.get<number>('REALTIME_FOLDER_BUFFER_MS', 250);
    this.FOLDER_BUFFER_MAX = this.config.get<number>('REALTIME_FOLDER_BUFFER_MAX', 200);
    this.CONTACT_BUFFER_MS = this.config.get<number>('REALTIME_CONTACT_BUFFER_MS', 300);
    this.CONTACT_BUFFER_MAX = this.config.get<number>('REALTIME_CONTACT_BUFFER_MAX', 200);
    this.CALENDAR_BUFFER_MS = this.config.get<number>('REALTIME_CALENDAR_BUFFER_MS', 300);
    this.CALENDAR_BUFFER_MAX = this.config.get<number>('REALTIME_CALENDAR_BUFFER_MAX', 100);

    // Cache bounds: limit memory usage for folder count deduplication
    this.FOLDER_CACHE_MAX_PROVIDERS = this.config.get<number>('REALTIME_FOLDER_CACHE_MAX_PROVIDERS', 100);
    this.FOLDER_CACHE_MAX_FOLDERS_PER_PROVIDER = this.config.get<number>('REALTIME_FOLDER_CACHE_MAX_FOLDERS', 50);
    this.FOLDER_CACHE_TTL_MS = this.config.get<number>('REALTIME_FOLDER_CACHE_TTL_MS', 5 * 60 * 1000); // 5 min

    // Periodic cache cleanup every TTL interval
    this.folderCacheCleanupTimer = setInterval(() => this.cleanupFolderCache(), this.FOLDER_CACHE_TTL_MS);

    // Shutdown behavior: flush buffered events before clearing (default: true for production safety)
    this.FLUSH_ON_SHUTDOWN = this.config.get<boolean>('REALTIME_FLUSH_ON_SHUTDOWN', true);
  }

  /**
   * Lifecycle cleanup - flush buffered events and clear all timers
   *
   * When REALTIME_FLUSH_ON_SHUTDOWN=true (default), all buffered events are
   * delivered before shutdown to avoid dropping events during deploys.
   */
  onModuleDestroy() {
    this.logger.log('Cleaning up realtime events service...');

    // Flush buffered events before clearing (avoids dropping events during deploys)
    if (this.FLUSH_ON_SHUTDOWN && this.gateway?.server) {
      const emailCount = this.emailEventBuffer.size;
      const contactCount = this.contactEventBuffer.size;
      const calendarCount = this.calendarEventBuffer.size;
      const folderCount = this.folderCountsBuffer.size;

      if (emailCount || contactCount || calendarCount || folderCount) {
        this.logger.log(
          `Flushing buffered events on shutdown: ${emailCount} email, ${contactCount} contact, ${calendarCount} calendar, ${folderCount} folder providers`,
        );

        // Flush all buffers synchronously (these are all sync operations internally)
        this.flushEmailEventsSync();
        this.flushContactEvents();
        this.flushCalendarEvents();
        this.flushFolderCountsBuffer();
      }
    }

    // Clear all buffer timers
    if (this.emailBufferTimer) {
      clearTimeout(this.emailBufferTimer);
      this.emailBufferTimer = undefined;
    }
    if (this.folderBufferTimer) {
      clearTimeout(this.folderBufferTimer);
      this.folderBufferTimer = undefined;
    }
    if (this.contactBufferTimer) {
      clearTimeout(this.contactBufferTimer);
      this.contactBufferTimer = undefined;
    }
    if (this.calendarBufferTimer) {
      clearTimeout(this.calendarBufferTimer);
      this.calendarBufferTimer = undefined;
    }
    if (this.folderCacheCleanupTimer) {
      clearInterval(this.folderCacheCleanupTimer);
      this.folderCacheCleanupTimer = undefined;
    }

    // Clear all buffers and caches
    this.emailEventBuffer.clear();
    this.folderCountsBuffer.clear();
    this.contactEventBuffer.clear();
    this.calendarEventBuffer.clear();
    this.lastFolderCounts.clear();

    this.logger.log('Realtime events service cleanup complete');
  }

  /**
   * Synchronous version of flushEmailEvents for shutdown (no async/await)
   */
  private flushEmailEventsSync() {
    if (this.emailBufferTimer) {
      clearTimeout(this.emailBufferTimer);
      this.emailBufferTimer = undefined;
    }

    if (!this.emailEventBuffer.size) {
      return;
    }

    const events = Array.from(this.emailEventBuffer.values());
    this.emailEventBuffer.clear();

    for (const item of events) {
      void this.emitToTenantImmediate(item.tenantId, item.event, item.payload as any);
    }

    this.logger.debug(`Flushed ${events.length} buffered email event(s) on shutdown`);
  }

  /**
   * Clean up stale folder count cache entries to prevent unbounded growth
   * Also enforces per-provider folder limit
   */
  private cleanupFolderCache() {
    // If cache is within bounds, skip provider eviction
    if (this.lastFolderCounts.size <= this.FOLDER_CACHE_MAX_PROVIDERS) {
      // Still check per-provider limits
      for (const [providerId, folderMap] of this.lastFolderCounts) {
        if (folderMap.size > this.FOLDER_CACHE_MAX_FOLDERS_PER_PROVIDER) {
          const excess = folderMap.size - this.FOLDER_CACHE_MAX_FOLDERS_PER_PROVIDER;
          const keysToDelete = Array.from(folderMap.keys()).slice(0, excess);
          for (const key of keysToDelete) {
            folderMap.delete(key);
          }
          this.logger.debug(`Evicted ${keysToDelete.length} folder(s) from provider ${providerId} cache`);
        }
      }
      return;
    }

    // Evict oldest providers (FIFO-style, clear all if over limit)
    const excess = this.lastFolderCounts.size - this.FOLDER_CACHE_MAX_PROVIDERS;
    if (excess > 0) {
      const keysToDelete = Array.from(this.lastFolderCounts.keys()).slice(0, excess);
      for (const key of keysToDelete) {
        this.lastFolderCounts.delete(key);
      }
      this.logger.debug(`Evicted ${keysToDelete.length} stale provider(s) from folder count cache`);
    }
  }

  /**
   * Setter per iniettare il gateway (per evitare circular dependency)
   */
  setGateway(gateway: IRealtimeGateway) {
    this.gateway = gateway;
  }

  /**
   * Verifica se un tenant ha connessioni WebSocket attive
   * @param tenantId ID del tenant
   * @returns true se ci sono client connessi per questo tenant
   */
  async hasTenantConnections(tenantId: string): Promise<boolean> {
    if (!this.gateway) {
      return false;
    }
    return this.gateway.hasTenantConnections(tenantId);
  }

  /**
   * EMAIL EVENTS
   */

  /**
   * Emette evento per nuova email ricevuta
   */
  emitEmailNew(tenantId: string, payload: EmailEventPayload) {
    this.bufferEmailEvent(tenantId, 'email:new', payload);
  }

  /**
   * Emette evento per email aggiornata (es. letta, starred, labels)
   */
  emitEmailUpdate(tenantId: string, payload: EmailEventPayload) {
    this.bufferEmailEvent(tenantId, 'email:update', payload);
  }

  /**
   * Emette evento per email eliminata
   */
  emitEmailDelete(tenantId: string, payload: EmailEventPayload) {
    this.bufferEmailEvent(tenantId, 'email:delete', payload);
  }

  /**
   * Emette evento per aggiornamento contatore non lette
   */
  emitUnreadCountUpdate(
    tenantId: string,
    payload: RealtimeEventPayloads['email:unread_count_update'],
  ) {
    void this.emitToTenant(tenantId, 'email:unread_count_update', payload);
  }

  /**
   * Emette evento per aggiornamento conteggio cartelle (totale + non lette)
   */
  emitFolderCountsUpdate(
    tenantId: string,
    payload: RealtimeEventPayloads['email:folder_counts_update'],
  ) {
    // Skip unchanged counts to avoid spamming the frontend
    const providerCache =
      this.lastFolderCounts.get(payload.providerId) ??
      new Map<string, { totalCount: number; unreadCount: number }>();
    const prev = providerCache.get(payload.folderId);
    if (prev && prev.totalCount === payload.totalCount && prev.unreadCount === payload.unreadCount) {
      return;
    }
    providerCache.set(payload.folderId, {
      totalCount: payload.totalCount,
      unreadCount: payload.unreadCount,
    });
    this.lastFolderCounts.set(payload.providerId, providerCache);

    const providerBuffer =
      this.folderCountsBuffer.get(payload.providerId) ??
      new Map<string, { tenantId: string; payload: RealtimeEventPayloads['email:folder_counts_update'] }>();
    providerBuffer.set(payload.folderId, { tenantId, payload });
    this.folderCountsBuffer.set(payload.providerId, providerBuffer);

    if (!this.folderBufferTimer) {
      this.folderBufferTimer = setTimeout(() => this.flushFolderCountsBuffer(), this.FOLDER_BUFFER_MS);
    }

    if (providerBuffer.size >= this.FOLDER_BUFFER_MAX) {
      void this.flushFolderCountsBuffer();
    }
  }

  /**
   * Emette evento per aggiornamento thread
   */
  emitThreadUpdate(
    tenantId: string,
    payload: RealtimeEventPayloads['email:thread_update'],
  ) {
    void this.emitToTenant(tenantId, 'email:thread_update', payload);
  }

  /**
   * Emette evento di batch processing (es. full import senza eventi granulari)
   */
  emitEmailBatchProcessed(tenantId: string, payload: RealtimeEventPayloads['email:batch_processed']) {
    void this.emitToTenant(tenantId, 'email:batch_processed', payload);
  }

  /**
   * CALENDAR EVENTS
   * Note: Calendar events are buffered to prevent event storms during bulk sync operations
   */

  /**
   * Emette evento per nuovo evento calendario (buffered)
   */
  emitCalendarEventNew(tenantId: string, payload: CalendarEventPayload) {
    this.bufferCalendarEvent(tenantId, 'calendar:event_new', payload);
  }

  /**
   * Emette evento per evento calendario aggiornato (buffered)
   */
  emitCalendarEventUpdate(tenantId: string, payload: CalendarEventPayload) {
    this.bufferCalendarEvent(tenantId, 'calendar:event_update', payload);
  }

  /**
   * Emette evento per evento calendario eliminato (buffered)
   */
  emitCalendarEventDelete(tenantId: string, payload: CalendarEventPayload) {
    this.bufferCalendarEvent(tenantId, 'calendar:event_delete', payload);
  }

  /**
   * Emette evento per aggiornamento lista calendari (creazione, modifica, eliminazione calendario)
   */
  emitCalendarListUpdate(tenantId: string, payload: CalendarListPayload) {
    void this.emitToTenant(tenantId, 'calendar:list_update', payload);
  }

  /**
   * Emette evento di sync calendario completato (emesso dopo il flush del buffer)
   */
  emitCalendarSyncComplete(tenantId: string, payload: { providerId: string; count: number }) {
    // Flush any pending calendar events first
    this.flushCalendarEvents();
    // Then emit sync complete (type and count are now typed in sync:status)
    void this.emitToTenant(tenantId, 'sync:status', {
      providerId: payload.providerId,
      status: 'completed',
      type: 'calendar',
      count: payload.count,
    });
  }

  /**
   * CONTACT EVENTS
   * Note: Contact events are buffered to prevent event storms during bulk sync operations
   */

  /**
   * Emette evento per nuovo contatto (buffered)
   */
  emitContactNew(tenantId: string, payload: ContactEventPayload) {
    this.bufferContactEvent(tenantId, 'contact:new', payload);
  }

  /**
   * Emette evento per contatto aggiornato (buffered)
   */
  emitContactUpdate(tenantId: string, payload: ContactEventPayload) {
    this.bufferContactEvent(tenantId, 'contact:update', payload);
  }

  /**
   * Emette evento per contatto eliminato (buffered)
   */
  emitContactDelete(tenantId: string, payload: ContactEventPayload) {
    this.bufferContactEvent(tenantId, 'contact:delete', payload);
  }

  /**
   * Emette evento di sync contatti completato (emesso dopo il flush del buffer)
   */
  emitContactSyncComplete(tenantId: string, payload: { providerId: string; count: number }) {
    // Flush any pending contact events first
    this.flushContactEvents();
    // Then emit sync complete (type and count are now typed in sync:status)
    void this.emitToTenant(tenantId, 'sync:status', {
      providerId: payload.providerId,
      status: 'completed',
      type: 'contacts',
      count: payload.count,
    });
  }

  /**
   * Emit contact counts update
   */
  emitContactCounts(
    tenantId: string,
    payload: {
      total: number;
      withEmail: number;
      withPhone: number;
      withCompany: number;
      byProvider: Array<{ providerId: string; count: number }>;
    },
  ) {
    void this.emitToTenant(tenantId, 'contact:counts', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * LABEL EVENTS
   */

  /**
   * Emette evento per nuova label creata
   */
  emitLabelNew(tenantId: string, payload: LabelEventPayload) {
    void this.emitToTenant(tenantId, 'label:new', payload);
  }

  /**
   * Emette evento per label aggiornata
   */
  emitLabelUpdate(tenantId: string, payload: LabelEventPayload) {
    void this.emitToTenant(tenantId, 'label:update', payload);
  }

  /**
   * Emette evento per label eliminata
   */
  emitLabelDelete(tenantId: string, payload: LabelEventPayload) {
    void this.emitToTenant(tenantId, 'label:delete', payload);
  }

  /**
   * FOLDER EVENTS
   */

  /**
   * Emette evento per nuova cartella creata
   */
  emitFolderCreated(tenantId: string, payload: Omit<FolderEventPayload, 'reason'>) {
    void this.emitToTenant(tenantId, 'folder:created', {
      ...payload,
      reason: 'folder-created',
    });
  }

  /**
   * Emette evento per cartella rinominata
   */
  emitFolderRenamed(tenantId: string, payload: Omit<FolderEventPayload, 'reason'>) {
    void this.emitToTenant(tenantId, 'folder:renamed', {
      ...payload,
      reason: 'folder-renamed',
    });
  }

  /**
   * Emette evento per cartella eliminata
   */
  emitFolderDeleted(tenantId: string, payload: Omit<FolderEventPayload, 'reason'>) {
    void this.emitToTenant(tenantId, 'folder:deleted', {
      ...payload,
      reason: 'folder-deleted',
    });
  }

  /**
   * SYNC STATUS EVENTS
   */

  /**
   * Emette evento per stato sincronizzazione provider
   */
  emitSyncStatus(tenantId: string, payload: RealtimeEventPayloads['sync:status']) {
    void this.emitToTenant(tenantId, 'sync:status', payload);
  }

  /**
   * AI MULTI-AGENT EVENTS
   */

  /**
   * Emette evento per nuova azione AI pending
   */
  emitAiActionCreated(tenantId: string, payload: AiActionEventPayload) {
    void this.emitToTenant(tenantId, 'ai:action:created', payload);
  }

  /**
   * Emette evento per azione AI approvata
   */
  emitAiActionApproved(tenantId: string, payload: AiActionEventPayload) {
    void this.emitToTenant(tenantId, 'ai:action:approved', payload);
  }

  /**
   * Emette evento per azione AI rifiutata
   */
  emitAiActionRejected(tenantId: string, payload: AiActionEventPayload) {
    void this.emitToTenant(tenantId, 'ai:action:rejected', payload);
  }

  /**
   * Emette evento per azione AI eseguita con successo
   */
  emitAiActionExecuted(tenantId: string, payload: AiActionEventPayload) {
    void this.emitToTenant(tenantId, 'ai:action:executed', payload);
  }

  /**
   * Emette evento per azione AI fallita
   */
  emitAiActionFailed(tenantId: string, payload: AiActionEventPayload) {
    void this.emitToTenant(tenantId, 'ai:action:failed', payload);
  }

  /**
   * Emette evento per aggiornamento sessione AI
   */
  emitAiSessionUpdate(tenantId: string, payload: AiSessionEventPayload) {
    void this.emitToTenant(tenantId, 'ai:session:update', payload);
  }

  /**
   * Emette evento per step agente AI (real-time activity streaming)
   * Used for 2025 UX pattern: show live agent activity visualization
   */
  emitAiAgentStep(tenantId: string, payload: AiAgentStepEventPayload) {
    void this.emitToTenant(tenantId, 'ai:agent:step', payload);
  }

  /**
   * FOLLOW-UP REMINDER EVENTS
   */

  emitFollowUpReminderUpcoming(tenantId: string, payload: FollowUpReminderPayload): void {
    void this.emitToTenant(tenantId, 'followup:reminder:upcoming', payload);
  }

  emitFollowUpReminderImminent(tenantId: string, payload: FollowUpReminderPayload): void {
    void this.emitToTenant(tenantId, 'followup:reminder:imminent', payload);
  }

  emitFollowUpReminderOverdue(tenantId: string, payload: FollowUpReminderPayload): void {
    void this.emitToTenant(tenantId, 'followup:reminder:overdue', payload);
  }

  /**
   * CRM DEAL EVENTS
   */

  emitCrmDealStageChanged(tenantId: string, payload: CrmDealStageChangedPayload): void {
    void this.emitToTenant(tenantId, 'crm:deal:stage-changed', payload);
  }

  /**
   * MAILBOX CHANGE NOTIFICATIONS
   */

  /**
   * Centralized method for notifying mailbox changes from sync services
   * Replaces duplicate notifyMailboxChange methods in google-sync, microsoft-sync, and imap-sync services
   *
   * @param tenantId - The tenant ID
   * @param providerId - The provider ID
   * @param reason - The event reason (message-processed, labels-updated, message-deleted, sync-complete)
   * @param payload - Optional payload with emailId, externalId, folder
   * @param options - Optional configuration (suppressMessageEvents flag)
   */
  notifyMailboxChange(
    tenantId: string,
    providerId: string,
    reason: EmailEventPayload['reason'],
    payload?: { emailId?: string; externalId?: string; folder?: string },
    options?: { suppressMessageEvents?: boolean },
  ): void {
    try {
      const eventPayload: EmailEventPayload = {
        providerId,
        reason,
        ...payload,
      };

      // Skip message events if suppression is enabled
      if (
        options?.suppressMessageEvents &&
        (reason === 'message-processed' || reason === 'labels-updated' || reason === 'message-deleted')
      ) {
        return;
      }

      // Route to appropriate emit method based on reason
      switch (reason) {
        case 'message-processed':
          this.emitEmailNew(tenantId, eventPayload);
          break;
        case 'labels-updated':
        case 'read-status-updated':
        case 'starred-updated':
        case 'flagged-updated':
        case 'folder-updated':
          this.emitEmailUpdate(tenantId, eventPayload);
          break;
        case 'message-deleted':
          this.emitEmailDelete(tenantId, eventPayload);
          break;
        case 'sync-complete':
          this.emitSyncStatus(tenantId, {
            providerId,
            status: 'completed',
          });
          break;
        case 'message-sent':
          // Message sent events are also updates
          this.emitEmailUpdate(tenantId, eventPayload);
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to emit mailbox change event for ${tenantId}: ${message}`);
    }
  }

  /**
   * GENERIC EMIT
   */

  /**
   * Emette un evento generico alla room del tenant
   * Skip if no active connections to avoid wasting resources
   */
  private async emitToTenant<E extends KnownRealtimeEvent>(
    tenantId: string,
    event: E,
    payload: RealtimeEventPayloads[E],
  ) {
    if (!this.gateway || !this.gateway.server) {
      this.logger.warn(`Gateway not initialized, cannot emit event: ${event}`);
      return;
    }

    // Skip if tenant has no active connections
    if (!(await this.hasTenantConnections(tenantId))) {
      this.logger.debug(`Skipping event ${event} for inactive tenant: ${tenantId}`);
      return;
    }

    const room = buildTenantRoom(tenantId);
    this.emitToRoom(room, event, payload);
  }

  private async emitToTenantImmediate<E extends KnownRealtimeEvent>(
    tenantId: string,
    event: E,
    payload: RealtimeEventPayloads[E],
  ) {
    // Skip if tenant has no active connections
    if (!(await this.hasTenantConnections(tenantId))) {
      this.logger.debug(`Skipping immediate event ${event} for inactive tenant: ${tenantId}`);
      return;
    }

    this.emitInternal(buildTenantRoom(tenantId), event, payload);
  }

  /**
   * Emette evento a una room specifica (es. thread-based)
   */
  emitToRoom<E extends KnownRealtimeEvent>(room: string, event: E, payload: RealtimeEventPayloads[E]) {
    this.emitInternal(room, event, payload);
  }

  /**
   * Emette evento a tutti i client connessi (usare con cautela)
   */
  emitToAll<E extends KnownRealtimeEvent>(event: E, payload: RealtimeEventPayloads[E]) {
    this.emitInternal('all', event, payload, true);
  }

  /**
   * Bufferizza eventi email per ridurre spam su bulk (sync/import/move).
   */
  private bufferEmailEvent(tenantId: string, event: KnownRealtimeEvent, payload: EmailEventPayload) {
    const dedupeKey = `${tenantId}:${event}:${payload.externalId ?? payload.emailId ?? ''}`;
    this.emailEventBuffer.set(dedupeKey, { event, tenantId, payload });

    if (this.emailEventBuffer.size >= this.EMAIL_BUFFER_MAX) {
      void this.flushEmailEvents();
      return;
    }

    if (!this.emailBufferTimer) {
      this.emailBufferTimer = setTimeout(() => {
        this.flushEmailEvents().catch((err) =>
          this.logger.warn(
            `Failed flushing email events buffer: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }, this.EMAIL_BUFFER_MS);
    }
  }

  private async flushEmailEvents() {
    if (this.emailBufferTimer) {
      clearTimeout(this.emailBufferTimer);
      this.emailBufferTimer = undefined;
    }

    if (!this.emailEventBuffer.size) {
      return;
    }

    const events = Array.from(this.emailEventBuffer.values());
    this.emailEventBuffer.clear();

    for (const item of events) {
      void this.emitToTenantImmediate(item.tenantId, item.event, item.payload as any);
    }

    this.logger.debug(`Flushed ${events.length} buffered email event(s)`);
  }

  /**
   * Bufferizza eventi contact per ridurre spam su bulk sync.
   */
  private bufferContactEvent(tenantId: string, event: KnownRealtimeEvent, payload: ContactEventPayload) {
    const dedupeKey = `${tenantId}:${event}:${payload.contactId ?? ''}`;
    this.contactEventBuffer.set(dedupeKey, { event, tenantId, payload });

    if (this.contactEventBuffer.size >= this.CONTACT_BUFFER_MAX) {
      void this.flushContactEvents();
      return;
    }

    if (!this.contactBufferTimer) {
      this.contactBufferTimer = setTimeout(() => {
        void this.flushContactEvents();
      }, this.CONTACT_BUFFER_MS);
    }
  }

  private flushContactEvents() {
    if (this.contactBufferTimer) {
      clearTimeout(this.contactBufferTimer);
      this.contactBufferTimer = undefined;
    }

    if (!this.contactEventBuffer.size) {
      return;
    }

    const events = Array.from(this.contactEventBuffer.values());
    this.contactEventBuffer.clear();

    for (const item of events) {
      void this.emitToTenantImmediate(item.tenantId, item.event, item.payload as any);
    }

    this.logger.debug(`Flushed ${events.length} buffered contact event(s)`);
  }

  /**
   * Bufferizza eventi calendar per ridurre spam su bulk sync.
   */
  private bufferCalendarEvent(tenantId: string, event: KnownRealtimeEvent, payload: CalendarEventPayload) {
    const dedupeKey = `${tenantId}:${event}:${payload.eventId ?? payload.externalId ?? ''}`;
    this.calendarEventBuffer.set(dedupeKey, { event, tenantId, payload });

    if (this.calendarEventBuffer.size >= this.CALENDAR_BUFFER_MAX) {
      void this.flushCalendarEvents();
      return;
    }

    if (!this.calendarBufferTimer) {
      this.calendarBufferTimer = setTimeout(() => {
        void this.flushCalendarEvents();
      }, this.CALENDAR_BUFFER_MS);
    }
  }

  private flushCalendarEvents() {
    if (this.calendarBufferTimer) {
      clearTimeout(this.calendarBufferTimer);
      this.calendarBufferTimer = undefined;
    }

    if (!this.calendarEventBuffer.size) {
      return;
    }

    const events = Array.from(this.calendarEventBuffer.values());
    this.calendarEventBuffer.clear();

    for (const item of events) {
      void this.emitToTenantImmediate(item.tenantId, item.event, item.payload as any);
    }

    this.logger.debug(`Flushed ${events.length} buffered calendar event(s)`);
  }

  /**
   * Flush buffered folder count updates, emitting only the latest per folder.
   */
  private flushFolderCountsBuffer() {
    if (this.folderBufferTimer) {
      clearTimeout(this.folderBufferTimer);
      this.folderBufferTimer = undefined;
    }

    for (const [, folderMap] of this.folderCountsBuffer) {
      for (const entry of folderMap.values()) {
        void this.emitToTenant(entry.tenantId, 'email:folder_counts_update', entry.payload);
      }
    }

    if (this.folderCountsBuffer.size) {
      this.logger.debug(`Flushed folder count buffer with ${this.folderCountsBuffer.size} provider(s)`);
    }

    this.folderCountsBuffer.clear();
  }

  private emitInternal<E extends KnownRealtimeEvent>(
    room: string,
    event: E,
    payload: RealtimeEventPayloads[E],
    toAll = false,
  ) {
    if (!this.gateway || !this.gateway.server) {
      this.logger.warn(`Gateway not initialized, cannot emit event: ${event}`);
      return;
    }

    const enriched = {
      ...payload,
      timestamp: new Date().toISOString(),
    };

    if (toAll) {
      this.gateway.server.emit(event, enriched);
      this.logger.debug(`Emitted ${event} to all clients`, payload);
    } else {
      this.gateway.server.to(room).emit(event, enriched);
      this.logger.debug(`Emitted ${event} to room ${room}`, payload);
    }
  }
}
