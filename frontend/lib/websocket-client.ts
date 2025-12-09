import { io, Socket } from 'socket.io-client';
import { logger } from '@/lib/logger';

/**
 * WebSocket Client per connessione realtime al backend
 *
 * Caratteristiche:
 * - Autenticazione JWT automatica
 * - Reconnection automatica
 * - Isolamento tenant tramite rooms
 * - Type-safe event handlers
 */

/**
 * Email data for realtime events
 * Uses generic types to allow full Email objects from backend
 * Type safety enforced at consumer level with type guards/casts
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RealtimeEmailEvent<T = any> {
  emailId?: string;
  externalId?: string;
  providerId: string;
  folder?: string;
  reason: 'message-processed' | 'message-deleted' | 'labels-updated' | 'message-sent' | 'sync-complete';
  email?: T;
  updates?: Partial<T>;
  unreadCount?: number;
  threadId?: string;
  timestamp: string;
}

export interface RealtimeFolderCountsEvent {
  providerId: string;
  folderId: string;
  folderName: string;
  totalCount: number;
  unreadCount: number;
  timestamp: string;
}

/**
 * Calendar event data for realtime events
 * Uses generic type for flexibility with backend data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RealtimeCalendarEvent<T = any> {
  eventId?: string;
  externalId?: string;
  calendarId: string;
  providerId?: string;
  reason: 'event-created' | 'event-updated' | 'event-deleted';
  event?: T;
  updates?: Partial<T>;
  timestamp: string;
}

/**
 * Contact event data for realtime events
 * Uses generic type for flexibility with backend data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RealtimeContactEvent<T = any> {
  contactId?: string;
  externalId?: string;
  providerId?: string;
  reason: 'contact-created' | 'contact-updated' | 'contact-deleted';
  contact?: T;
  updates?: Partial<T>;
  timestamp: string;
}

export interface RealtimeContactCountsEvent {
  total: number;
  withEmail: number;
  withPhone: number;
  withCompany: number;
  byProvider: Array<{ providerId: string; count: number }>;
  timestamp: string;
}

/**
 * Label event data for realtime events
 * Uses generic type for flexibility with backend data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RealtimeLabelEvent<T = any> {
  labelId: string;
  reason: 'label-created' | 'label-updated' | 'label-deleted';
  label?: T;
  updates?: Partial<T>;
  timestamp: string;
}

export interface RealtimeFolderEvent {
  providerId: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  oldName?: string;
  reason: 'folder-created' | 'folder-renamed' | 'folder-deleted';
  timestamp: string;
}

export interface RealtimeSyncStatus {
  providerId: string;
  status: 'started' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  processed?: number;
  total?: number;
  timestamp: string;
  // Optional fields for sync completion events (aligned with backend RealtimeEventPayloads)
  type?: 'email' | 'calendar' | 'contacts' | 'folders';
  count?: number;
}

export interface RealtimeAiActionEvent {
  actionId: string;
  userId: string;
  agentName: string;
  actionType: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  confidence?: number;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  payload?: Record<string, unknown>;
  reason?: string;
  error?: string;
  timestamp: string;
}

export interface RealtimeAiSessionEvent {
  sessionId: string;
  userId: string;
  status: 'created' | 'message_received' | 'processing' | 'response_ready' | 'ended';
  agentUsed?: string;
  intent?: string;
  pendingActionsCount?: number;
  executedActionsCount?: number;
  timestamp?: string;
}

export type EventHandler<T> = (data: T) => void;

// Auth error detection - these messages indicate token/auth issues
const AUTH_ERROR_PATTERNS = [
  'unauthorized',
  'invalid token',
  'token expired',
  'jwt expired',
  'jwt malformed',
  'authentication failed',
  '401',
];

function isAuthError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some(pattern => message.includes(pattern));
}

class WebSocketClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;

  // Track joined rooms for auto-rejoin after reconnect
  private joinedRooms = new Set<string>();

  // Auth failure callback - called when auth fails after max retries
  private authFailureHandler: (() => void) | null = null;

  // Reconnect callback - called after successful reconnection
  private reconnectHandler: (() => void) | null = null;

  /**
   * Register handler for auth failures (expired/invalid token)
   * This is called when connection fails due to auth issues
   */
  onAuthFailure(handler: () => void): () => void {
    this.authFailureHandler = handler;
    return () => {
      this.authFailureHandler = null;
    };
  }

  /**
   * Register handler for successful reconnection
   * Useful for refreshing data after reconnect
   */
  onReconnect(handler: () => void): () => void {
    this.reconnectHandler = handler;
    return () => {
      this.reconnectHandler = null;
    };
  }

  /**
   * Inizializza la connessione WebSocket
   */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        logger.debug('[WebSocket] Already connected');
        resolve();
        return;
      }

      if (this.isConnecting) {
        logger.debug('[WebSocket] Connection already in progress');
        resolve();
        return;
      }

      this.isConnecting = true;
      this.token = token;

      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

      this.socket = io(`${backendUrl}/realtime`, {
        auth: {
          token: this.token,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxReconnectAttempts,
      });

      let settled = false;
      let isAuthFailure = false;

      // Connection success (initial connect)
      const handleConnected = (data: { socketId?: string }) => {
        if (settled) return;
        settled = true;
        logger.debug('[WebSocket] Connected successfully', { socketId: data?.socketId });
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.socket?.off('connect_error', handleConnectError);
        resolve();
      };

      // Connection error
      const handleConnectError = (error: Error) => {
        logger.error('[WebSocket] Connection error', { message: error.message });
        this.reconnectAttempts++;
        this.isConnecting = false;

        // Check if this is an auth error
        if (isAuthError(error)) {
          isAuthFailure = true;
          logger.error('[WebSocket] Auth failure detected');
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          if (settled) return;
          settled = true;
          this.socket?.off('connected', handleConnected);

          // If auth failure, notify handler
          if (isAuthFailure && this.authFailureHandler) {
            logger.debug('[WebSocket] Triggering auth failure handler');
            this.authFailureHandler();
          }

          reject(new Error(isAuthFailure ? 'Authentication failed' : 'Max reconnection attempts reached'));
        }
      };

      this.socket.once('connected', handleConnected);
      this.socket.on('connect_error', handleConnectError);

      // Disconnection
      this.socket.on('disconnect', (reason: string) => {
        logger.debug('[WebSocket] Disconnected', { reason });
        this.isConnecting = false;
      });

      // Socket.io reconnect event - rejoin rooms after reconnect
      this.socket.io.on('reconnect', () => {
        logger.debug('[WebSocket] Reconnected - rejoining rooms...');
        this.rejoinRooms();

        // Notify reconnect handler
        if (this.reconnectHandler) {
          this.reconnectHandler();
        }
      });

      // Heartbeat
      this.socket.on('heartbeat', (data: { timestamp: string }) => {
        logger.debug('[WebSocket] Heartbeat received', { timestamp: data.timestamp });
      });

      // Pong response
      this.socket.on('pong', (data: { timestamp: string }) => {
        logger.debug('[WebSocket] Pong received', { timestamp: data.timestamp });
      });
    });
  }

  /**
   * Rejoin all tracked rooms after reconnection
   */
  private rejoinRooms(): void {
    if (!this.socket?.connected) return;

    for (const room of this.joinedRooms) {
      logger.debug('[WebSocket] Rejoining room', { room });
      this.socket.emit('join_room', { room });
    }
  }

  /**
   * Disconnetti WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      logger.debug('[WebSocket] Disconnected manually');
    }
    // Clear joined rooms on manual disconnect
    this.joinedRooms.clear();
    this.reconnectAttempts = 0;
  }

  /**
   * Verifica se è connesso
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Registra handler per evento close/disconnect
   */
  onClose(handler: () => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on('disconnect', handler);
    return () => this.socket?.off('disconnect', handler);
  }

  /**
   * Rimuovi handler per evento close/disconnect
   */
  offClose(handler: () => void): void {
    if (this.socket) {
      this.socket.off('disconnect', handler);
    }
  }

  /**
   * Registra handler per evento error
   */
  onError(handler: (error: Error) => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on('connect_error', handler);
    return () => this.socket?.off('connect_error', handler);
  }

  /**
   * Rimuovi handler per evento error
   */
  offError(handler: (error: Error) => void): void {
    if (this.socket) {
      this.socket.off('connect_error', handler);
    }
  }

  /**
   * Invia ping al server
   */
  ping(): void {
    if (this.socket?.connected) {
      this.socket.emit('ping');
    }
  }

  /**
   * Unisciti a una room aggiuntiva
   * Room is tracked for auto-rejoin after reconnect
   */
  joinRoom(room: string): void {
    // Track room for auto-rejoin after reconnect
    this.joinedRooms.add(room);

    if (this.socket?.connected) {
      this.socket.emit('join_room', { room });
    }
  }

  /**
   * Lascia una room
   * Room is removed from tracking
   */
  leaveRoom(room: string): void {
    // Remove from tracking
    this.joinedRooms.delete(room);

    if (this.socket?.connected) {
      this.socket.emit('leave_room', { room });
    }
  }

  /**
   * Get list of currently joined rooms (for debugging)
   */
  getJoinedRooms(): string[] {
    return Array.from(this.joinedRooms);
  }

  /**
   * EMAIL EVENTS
   */

  onEmailNew(handler: EventHandler<RealtimeEmailEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('email:new', handler);
    return () => this.socket?.off('email:new', handler);
  }

  onEmailUpdate(handler: EventHandler<RealtimeEmailEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('email:update', handler);
    return () => this.socket?.off('email:update', handler);
  }

  onEmailDelete(handler: EventHandler<RealtimeEmailEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('email:delete', handler);
    return () => this.socket?.off('email:delete', handler);
  }

  onUnreadCountUpdate(handler: EventHandler<{ folder: string; count: number; providerId: string; timestamp: string }>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('email:unread_count_update', handler);
    return () => this.socket?.off('email:unread_count_update', handler);
  }

  onFolderCountsUpdate(handler: EventHandler<RealtimeFolderCountsEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('email:folder_counts_update', handler);
    return () => this.socket?.off('email:folder_counts_update', handler);
  }

  onThreadUpdate(handler: EventHandler<{ threadId: string; emailIds: string[]; timestamp: string }>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('email:thread_update', handler);
    return () => this.socket?.off('email:thread_update', handler);
  }

  onEmailBatchProcessed(handler: EventHandler<{
    providerId: string;
    processed: number;
    created?: number;
    syncType?: 'full' | 'incremental';
    timestamp: string;
  }>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('email:batch_processed', handler);
    return () => this.socket?.off('email:batch_processed', handler);
  }

  /**
   * CALENDAR EVENTS
   */

  onCalendarEventNew(handler: EventHandler<RealtimeCalendarEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('calendar:event_new', handler);
    return () => this.socket?.off('calendar:event_new', handler);
  }

  onCalendarEventUpdate(handler: EventHandler<RealtimeCalendarEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('calendar:event_update', handler);
    return () => this.socket?.off('calendar:event_update', handler);
  }

  onCalendarEventDelete(handler: EventHandler<RealtimeCalendarEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('calendar:event_delete', handler);
    return () => this.socket?.off('calendar:event_delete', handler);
  }

  /**
   * CONTACT EVENTS
   */

  onContactNew(handler: EventHandler<RealtimeContactEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('contact:new', handler);
    return () => this.socket?.off('contact:new', handler);
  }

  onContactUpdate(handler: EventHandler<RealtimeContactEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('contact:update', handler);
    return () => this.socket?.off('contact:update', handler);
  }

  onContactDelete(handler: EventHandler<RealtimeContactEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('contact:delete', handler);
    return () => this.socket?.off('contact:delete', handler);
  }

  onContactCounts(handler: EventHandler<RealtimeContactCountsEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('contact:counts', handler);
    return () => this.socket?.off('contact:counts', handler);
  }

  /**
   * LABEL EVENTS
   */

  onLabelNew(handler: EventHandler<RealtimeLabelEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('label:new', handler);
    return () => this.socket?.off('label:new', handler);
  }

  onLabelUpdate(handler: EventHandler<RealtimeLabelEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('label:update', handler);
    return () => this.socket?.off('label:update', handler);
  }

  onLabelDelete(handler: EventHandler<RealtimeLabelEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('label:delete', handler);
    return () => this.socket?.off('label:delete', handler);
  }

  /**
   * FOLDER EVENTS
   */

  onFolderCreated(handler: EventHandler<RealtimeFolderEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('folder:created', handler);
    return () => this.socket?.off('folder:created', handler);
  }

  onFolderRenamed(handler: EventHandler<RealtimeFolderEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('folder:renamed', handler);
    return () => this.socket?.off('folder:renamed', handler);
  }

  onFolderDeleted(handler: EventHandler<RealtimeFolderEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('folder:deleted', handler);
    return () => this.socket?.off('folder:deleted', handler);
  }

  /**
   * SYNC STATUS EVENTS
   */

  onSyncStatus(handler: EventHandler<RealtimeSyncStatus>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('sync:status', handler);
    return () => this.socket?.off('sync:status', handler);
  }

  /**
   * AI ACTION EVENTS
   */

  onAiActionCreated(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('ai:action:created', handler);
    return () => this.socket?.off('ai:action:created', handler);
  }

  onAiActionApproved(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('ai:action:approved', handler);
    return () => this.socket?.off('ai:action:approved', handler);
  }

  onAiActionRejected(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('ai:action:rejected', handler);
    return () => this.socket?.off('ai:action:rejected', handler);
  }

  onAiActionExecuted(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('ai:action:executed', handler);
    return () => this.socket?.off('ai:action:executed', handler);
  }

  onAiActionFailed(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('ai:action:failed', handler);
    return () => this.socket?.off('ai:action:failed', handler);
  }

  onAiSessionUpdate(handler: EventHandler<RealtimeAiSessionEvent>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('ai:session:update', handler);
    return () => this.socket?.off('ai:session:update', handler);
  }

}

// Singleton instance
export const websocketClient = new WebSocketClient();
