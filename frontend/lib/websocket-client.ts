import { io, Socket } from 'socket.io-client';
import { logger } from '@/lib/logger';

/**
 * WebSocket Client per connessione realtime al backend
 *
 * Caratteristiche:
 * - Autenticazione Better Auth basata su sessione
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
  reason:
    | 'message-processed'
    | 'message-deleted'
    | 'labels-updated'
    | 'message-sent'
    | 'sync-complete'
    | 'read-status-updated'
    | 'starred-updated'
    | 'flagged-updated'
    | 'folder-updated';
  email?: T;
  updates?: Partial<T>;
  unreadCount?: number;
  threadId?: string;
  timestamp?: string;
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
  timestamp?: string;
}

export interface RealtimeCalendarListUpdateEvent {
  calendarId: string;
  calendarName: string;
  providerId: string;
  providerEmail?: string;
  color?: string;
  reason: 'calendar-created' | 'calendar-updated' | 'calendar-deleted';
  timestamp?: string;
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
  timestamp?: string;
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
  timestamp?: string;
}

export interface RealtimeFolderEvent {
  providerId: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  oldName?: string;
  reason: 'folder-created' | 'folder-renamed' | 'folder-deleted';
  timestamp?: string;
}

export interface RealtimeSyncStatus {
  providerId: string;
  status: 'started' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  processed?: number;
  total?: number;
  timestamp?: string;
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
  timestamp?: string;
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

/**
 * AI Agent types available in VoltAgent
 */
export type AiAgentType =
  | 'supervisor'
  | 'intent'
  | 'email'
  | 'calendar'
  | 'contacts'
  | 'knowledge'
  | 'general'
  | 'websearch'
  | 'analytics'
  | 'unified-knowledge'
  | 'response';

/**
 * AI Agent Step Event - Real-time streaming of agent activity
 * Used for 2025 UX pattern: show live agent activity visualization
 */
export interface RealtimeAiAgentStepEvent {
  sessionId: string;
  userId: string;
  /** Unique step ID for tracking */
  stepId: string;
  /** Agent type */
  agentType: AiAgentType;
  /** Step status */
  status: 'started' | 'processing' | 'tool_call' | 'completed' | 'error';
  /** Human-readable action description */
  action: string;
  /** Tool being called (if status is 'tool_call') */
  toolName?: string;
  /** Duration in ms (if completed) */
  duration?: number;
  /** Result summary (if completed) */
  result?: string;
  /** Error message (if error) */
  error?: string;
  timestamp?: string;
}

export type EventHandler<T> = (data: T) => void;

// Auth error detection - these messages indicate session/auth issues
const AUTH_ERROR_PATTERNS = [
  'unauthorized',
  'invalid token',
  'invalid or expired session',
  'session expired',
  'session mismatch',
  'token expired',
  'jwt expired',
  'jwt malformed',
  'user is not assigned to an organization',
  'tenant mismatch',
  'account is disabled',
  'organization is disabled',
  'authentication failed',
  '401',
];

function isAuthError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some(pattern => message.includes(pattern));
}

class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;

  // Track joined rooms for auto-rejoin after reconnect
  private joinedRooms = new Set<string>();

  // Track event handlers so they can be attached after socket creation
  private handlerRegistry = new Map<string, Set<(...args: unknown[]) => void>>();

  // Auth failure callback - called when auth fails after max retries
  private authFailureHandler: (() => void | Promise<void>) | null = null;

  // Reconnect callback - called after successful reconnection
  private reconnectHandler: (() => void) | null = null;

  /**
   * Register handler for auth failures (expired/invalid token)
   * This is called when connection fails due to auth issues
   */
  onAuthFailure(handler: () => void | Promise<void>): () => void {
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
   * Register socket handler with delayed attachment if socket is not ready yet
   */
  private registerHandler(event: string, handler: (...args: unknown[]) => void): () => void {
    const existing = this.handlerRegistry.get(event) ?? new Set();
    existing.add(handler);
    this.handlerRegistry.set(event, existing);

    if (this.socket) {
      this.socket.on(event, handler);
    }

    return () => {
      if (this.socket) {
        this.socket.off(event, handler);
      }
      const handlers = this.handlerRegistry.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlerRegistry.delete(event);
        }
      }
    };
  }

  /**
   * Attach any handlers registered before socket creation
   */
  private attachRegisteredHandlers(): void {
    if (!this.socket) return;
    for (const [event, handlers] of this.handlerRegistry.entries()) {
      for (const handler of handlers) {
        this.socket.on(event, handler);
      }
    }
  }

  /**
   * Inizializza la connessione WebSocket
   */
  /**
   * Connect to the WebSocket server.
   * Auth is handled by httpOnly cookie sent via withCredentials: true.
   */
  connect(): Promise<void> {
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

      // CRITICAL: Only fallback to localhost in development mode
      // In production, NEXT_PUBLIC_API_URL must be set
      const backendUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined);

      if (!backendUrl) {
        logger.error('[WebSocket] NEXT_PUBLIC_API_URL is not configured for production');
        reject(new Error('WebSocket: API URL not configured'));
        return;
      }

      this.socket = io(`${backendUrl}/realtime`, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxReconnectAttempts,
      });

      this.attachRegisteredHandlers();

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
            void this.authFailureHandler();
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
    return this.registerHandler('disconnect', handler);
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
    return this.registerHandler('connect_error', handler as (...args: unknown[]) => void);
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
   * Register handler for successful connection acknowledgement
   */
  onConnected(
    handler: (data: { userId?: string; tenantId?: string; email?: string; timestamp?: string }) => void,
  ): () => void {
    return this.registerHandler('connected', handler as (...args: unknown[]) => void);
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
    return this.registerHandler('email:new', handler as (...args: unknown[]) => void);
  }

  onEmailUpdate(handler: EventHandler<RealtimeEmailEvent>): () => void {
    return this.registerHandler('email:update', handler as (...args: unknown[]) => void);
  }

  onEmailDelete(handler: EventHandler<RealtimeEmailEvent>): () => void {
    return this.registerHandler('email:delete', handler as (...args: unknown[]) => void);
  }

  onUnreadCountUpdate(handler: EventHandler<{ folder: string; count: number; providerId: string; timestamp: string }>): () => void {
    return this.registerHandler('email:unread_count_update', handler as (...args: unknown[]) => void);
  }

  onFolderCountsUpdate(handler: EventHandler<RealtimeFolderCountsEvent>): () => void {
    return this.registerHandler('email:folder_counts_update', handler as (...args: unknown[]) => void);
  }

  onThreadUpdate(handler: EventHandler<{ threadId: string; emailIds: string[]; timestamp: string }>): () => void {
    return this.registerHandler('email:thread_update', handler as (...args: unknown[]) => void);
  }

  onEmailBatchProcessed(handler: EventHandler<{
    providerId: string;
    processed: number;
    created?: number;
    syncType?: 'full' | 'incremental';
    timestamp: string;
  }>): () => void {
    return this.registerHandler('email:batch_processed', handler as (...args: unknown[]) => void);
  }

  /**
   * CALENDAR EVENTS
   */

  onCalendarEventNew(handler: EventHandler<RealtimeCalendarEvent>): () => void {
    return this.registerHandler('calendar:event_new', handler as (...args: unknown[]) => void);
  }

  onCalendarEventUpdate(handler: EventHandler<RealtimeCalendarEvent>): () => void {
    return this.registerHandler('calendar:event_update', handler as (...args: unknown[]) => void);
  }

  onCalendarEventDelete(handler: EventHandler<RealtimeCalendarEvent>): () => void {
    return this.registerHandler('calendar:event_delete', handler as (...args: unknown[]) => void);
  }

  onCalendarListUpdate(handler: EventHandler<RealtimeCalendarListUpdateEvent>): () => void {
    return this.registerHandler('calendar:list_update', handler as (...args: unknown[]) => void);
  }

  /**
   * CONTACT EVENTS
   */

  onContactNew(handler: EventHandler<RealtimeContactEvent>): () => void {
    return this.registerHandler('contact:new', handler as (...args: unknown[]) => void);
  }

  onContactUpdate(handler: EventHandler<RealtimeContactEvent>): () => void {
    return this.registerHandler('contact:update', handler as (...args: unknown[]) => void);
  }

  onContactDelete(handler: EventHandler<RealtimeContactEvent>): () => void {
    return this.registerHandler('contact:delete', handler as (...args: unknown[]) => void);
  }

  onContactCounts(handler: EventHandler<RealtimeContactCountsEvent>): () => void {
    return this.registerHandler('contact:counts', handler as (...args: unknown[]) => void);
  }

  /**
   * LABEL EVENTS
   */

  onLabelNew(handler: EventHandler<RealtimeLabelEvent>): () => void {
    return this.registerHandler('label:new', handler as (...args: unknown[]) => void);
  }

  onLabelUpdate(handler: EventHandler<RealtimeLabelEvent>): () => void {
    return this.registerHandler('label:update', handler as (...args: unknown[]) => void);
  }

  onLabelDelete(handler: EventHandler<RealtimeLabelEvent>): () => void {
    return this.registerHandler('label:delete', handler as (...args: unknown[]) => void);
  }

  /**
   * FOLDER EVENTS
   */

  onFolderCreated(handler: EventHandler<RealtimeFolderEvent>): () => void {
    return this.registerHandler('folder:created', handler as (...args: unknown[]) => void);
  }

  onFolderRenamed(handler: EventHandler<RealtimeFolderEvent>): () => void {
    return this.registerHandler('folder:renamed', handler as (...args: unknown[]) => void);
  }

  onFolderDeleted(handler: EventHandler<RealtimeFolderEvent>): () => void {
    return this.registerHandler('folder:deleted', handler as (...args: unknown[]) => void);
  }

  /**
   * SYNC STATUS EVENTS
   */

  onSyncStatus(handler: EventHandler<RealtimeSyncStatus>): () => void {
    return this.registerHandler('sync:status', handler as (...args: unknown[]) => void);
  }

  /**
   * AI ACTION EVENTS
   */

  onAiActionCreated(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    return this.registerHandler('ai:action:created', handler as (...args: unknown[]) => void);
  }

  onAiActionApproved(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    return this.registerHandler('ai:action:approved', handler as (...args: unknown[]) => void);
  }

  onAiActionRejected(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    return this.registerHandler('ai:action:rejected', handler as (...args: unknown[]) => void);
  }

  onAiActionExecuted(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    return this.registerHandler('ai:action:executed', handler as (...args: unknown[]) => void);
  }

  onAiActionFailed(handler: EventHandler<RealtimeAiActionEvent>): () => void {
    return this.registerHandler('ai:action:failed', handler as (...args: unknown[]) => void);
  }

  onAiSessionUpdate(handler: EventHandler<RealtimeAiSessionEvent>): () => void {
    return this.registerHandler('ai:session:update', handler as (...args: unknown[]) => void);
  }

  /**
   * AI Agent Step Events - Real-time agent activity streaming
   * Used for 2025 UX pattern: live agent progress visualization
   */
  onAiAgentStep(handler: EventHandler<RealtimeAiAgentStepEvent>): () => void {
    return this.registerHandler('ai:agent:step', handler as (...args: unknown[]) => void);
  }

}

// Singleton instance
export const websocketClient = new WebSocketClient();
