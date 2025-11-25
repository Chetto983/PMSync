import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RealtimeGateway } from '../gateways/realtime.gateway';
import {
  CalendarEventPayload,
  CalendarListPayload,
  ContactEventPayload,
  EmailEventPayload,
  LabelEventPayload,
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
} from '../types/realtime.types';

/**
 * Servizio per emettere eventi realtime ai client WebSocket
 *
 * Questo servizio è chiamato dai worker di sincronizzazione, dai controller
 * e dai servizi AI per notificare i client di modifiche in realtime.
 *
 * Tutti gli eventi sono isolati per tenant tramite rooms.
 */
@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private gateway: RealtimeGateway;
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
  private readonly EMAIL_BUFFER_MS: number;
  private readonly EMAIL_BUFFER_MAX: number;
  private readonly FOLDER_BUFFER_MS: number;
  private readonly FOLDER_BUFFER_MAX: number;

  constructor(private readonly config: ConfigService) {
    this.EMAIL_BUFFER_MS = this.config.get<number>('REALTIME_EMAIL_BUFFER_MS', 200);
    this.EMAIL_BUFFER_MAX = this.config.get<number>('REALTIME_EMAIL_BUFFER_MAX', 500);
    this.FOLDER_BUFFER_MS = this.config.get<number>('REALTIME_FOLDER_BUFFER_MS', 250);
    this.FOLDER_BUFFER_MAX = this.config.get<number>('REALTIME_FOLDER_BUFFER_MAX', 200);
  }

  /**
   * Setter per iniettare il gateway (per evitare circular dependency)
   */
  setGateway(gateway: RealtimeGateway) {
    this.gateway = gateway;
  }

  /**
   * Verifica se un tenant ha connessioni WebSocket attive
   * @param tenantId ID del tenant
   * @returns true se ci sono client connessi per questo tenant
   */
  hasTenantConnections(tenantId: string): boolean {
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
    this.emitToTenant(tenantId, 'email:unread_count_update', payload);
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
      this.flushFolderCountsBuffer();
    }
  }

  /**
   * Emette evento per aggiornamento thread
   */
  emitThreadUpdate(
    tenantId: string,
    payload: RealtimeEventPayloads['email:thread_update'],
  ) {
    this.emitToTenant(tenantId, 'email:thread_update', payload);
  }

  /**
   * Emette evento di batch processing (es. full import senza eventi granulari)
   */
  emitEmailBatchProcessed(tenantId: string, payload: RealtimeEventPayloads['email:batch_processed']) {
    this.emitToTenant(tenantId, 'email:batch_processed', payload);
  }

  /**
   * CALENDAR EVENTS
   */

  /**
   * Emette evento per nuovo evento calendario
   */
  emitCalendarEventNew(tenantId: string, payload: CalendarEventPayload) {
    this.emitToTenant(tenantId, 'calendar:event_new', payload);
  }

  /**
   * Emette evento per evento calendario aggiornato
   */
  emitCalendarEventUpdate(tenantId: string, payload: CalendarEventPayload) {
    this.emitToTenant(tenantId, 'calendar:event_update', payload);
  }

  /**
   * Emette evento per evento calendario eliminato
   */
  emitCalendarEventDelete(tenantId: string, payload: CalendarEventPayload) {
    this.emitToTenant(tenantId, 'calendar:event_delete', payload);
  }

  /**
   * Emette evento per aggiornamento lista calendari (creazione, modifica, eliminazione calendario)
   */
  emitCalendarListUpdate(tenantId: string, payload: CalendarListPayload) {
    this.emitToTenant(tenantId, 'calendar:list_update', payload);
  }

  /**
   * CONTACT EVENTS
   */

  /**
   * Emette evento per nuovo contatto
   */
  emitContactNew(tenantId: string, payload: ContactEventPayload) {
    this.emitToTenant(tenantId, 'contact:new', payload);
  }

  /**
   * Emette evento per contatto aggiornato
   */
  emitContactUpdate(tenantId: string, payload: ContactEventPayload) {
    this.emitToTenant(tenantId, 'contact:update', payload);
  }

  /**
   * Emette evento per contatto eliminato
   */
  emitContactDelete(tenantId: string, payload: ContactEventPayload) {
    this.emitToTenant(tenantId, 'contact:delete', payload);
  }

  /**
   * LABEL EVENTS
   */

  /**
   * Emette evento per nuova label creata
   */
  emitLabelNew(tenantId: string, payload: LabelEventPayload) {
    this.emitToTenant(tenantId, 'label:new', payload);
  }

  /**
   * Emette evento per label aggiornata
   */
  emitLabelUpdate(tenantId: string, payload: LabelEventPayload) {
    this.emitToTenant(tenantId, 'label:update', payload);
  }

  /**
   * Emette evento per label eliminata
   */
  emitLabelDelete(tenantId: string, payload: LabelEventPayload) {
    this.emitToTenant(tenantId, 'label:delete', payload);
  }

  /**
   * SYNC STATUS EVENTS
   */

  /**
   * Emette evento per stato sincronizzazione provider
   */
  emitSyncStatus(tenantId: string, payload: RealtimeEventPayloads['sync:status']) {
    this.emitToTenant(tenantId, 'sync:status', payload);
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
        default:
          // Fallback for any unknown reasons
          this.emitEmailUpdate(tenantId, eventPayload);
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
  private emitToTenant<E extends KnownRealtimeEvent>(
    tenantId: string,
    event: E,
    payload: RealtimeEventPayloads[E],
  ) {
    if (!this.gateway || !this.gateway.server) {
      this.logger.warn(`Gateway not initialized, cannot emit event: ${event}`);
      return;
    }

    // Skip if tenant has no active connections
    if (!this.hasTenantConnections(tenantId)) {
      this.logger.debug(`Skipping event ${event} for inactive tenant: ${tenantId}`);
      return;
    }

    const room = buildTenantRoom(tenantId);
    this.emitToRoom(room, event, payload);
  }

  private emitToTenantImmediate<E extends KnownRealtimeEvent>(
    tenantId: string,
    event: E,
    payload: RealtimeEventPayloads[E],
  ) {
    // Skip if tenant has no active connections
    if (!this.hasTenantConnections(tenantId)) {
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
      this.emitToTenantImmediate(item.tenantId, item.event, item.payload as any);
    }

    this.logger.debug(`Flushed ${events.length} buffered email event(s)`);
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
        this.emitToTenant(entry.tenantId, 'email:folder_counts_update', entry.payload);
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
