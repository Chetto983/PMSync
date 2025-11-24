import { io, Socket } from 'socket.io-client';

/**
 * WebSocket Client per connessione realtime al backend
 *
 * Caratteristiche:
 * - Autenticazione JWT automatica
 * - Reconnection automatica
 * - Isolamento tenant tramite rooms
 * - Type-safe event handlers
 */

export interface RealtimeEmailEvent {
  emailId?: string;
  externalId?: string;
  providerId: string;
  folder?: string;
  reason: 'message-processed' | 'message-deleted' | 'labels-updated' | 'message-sent' | 'sync-complete';
  email?: any;
  updates?: any;
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

export interface RealtimeCalendarEvent {
  eventId?: string;
  externalId?: string;
  calendarId: string;
  providerId?: string;
  reason: 'event-created' | 'event-updated' | 'event-deleted';
  event?: any;
  updates?: any;
  timestamp: string;
}

export interface RealtimeContactEvent {
  contactId?: string;
  externalId?: string;
  providerId?: string;
  reason: 'contact-created' | 'contact-updated' | 'contact-deleted';
  contact?: any;
  updates?: any;
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
}

export type EventHandler<T> = (data: T) => void;

class WebSocketClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;

  /**
   * Inizializza la connessione WebSocket
   */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        console.log('[WebSocket] Already connected');
        resolve();
        return;
      }

      if (this.isConnecting) {
        console.log('[WebSocket] Connection already in progress');
        resolve();
        return;
      }

      this.isConnecting = true;
      this.token = token;

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

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

      // Connection success
      this.socket.on('connected', (data: any) => {
        console.log('[WebSocket] Connected successfully:', data);
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        resolve();
      });

      // Connection error
      this.socket.on('connect_error', (error: Error) => {
        console.error('[WebSocket] Connection error:', error.message);
        this.reconnectAttempts++;
        this.isConnecting = false;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Max reconnection attempts reached'));
        }
      });

      // Disconnection
      this.socket.on('disconnect', (reason: string) => {
        console.log('[WebSocket] Disconnected:', reason);
        this.isConnecting = false;
      });

      // Heartbeat
      this.socket.on('heartbeat', (data: any) => {
        console.log('[WebSocket] Heartbeat received:', data.timestamp);
      });

      // Pong response
      this.socket.on('pong', (data: any) => {
        console.log('[WebSocket] Pong received:', data.timestamp);
      });
    });
  }

  /**
   * Disconnetti WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('[WebSocket] Disconnected manually');
    }
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
   */
  joinRoom(room: string): void {
    if (this.socket?.connected) {
      this.socket.emit('join_room', { room });
    }
  }

  /**
   * Lascia una room
   */
  leaveRoom(room: string): void {
    if (this.socket?.connected) {
      this.socket.emit('leave_room', { room });
    }
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

  /**
   * SYNC STATUS EVENTS
   */

  onSyncStatus(handler: EventHandler<RealtimeSyncStatus>): () => void {
    if (!this.socket) return () => {};
    this.socket.on('sync:status', handler);
    return () => this.socket?.off('sync:status', handler);
  }

}

// Singleton instance
export const websocketClient = new WebSocketClient();
