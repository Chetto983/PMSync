// ============================================
// WebSocket Event Types
// Based on backend RealtimeEventsService
// ============================================

import type {
  Email,
  CalendarEvent,
  Contact,
  Folder,
  AgentPendingAction,
} from './entities';

// ============================================
// WebSocket Connection
// ============================================

export interface WebSocketConnectionOptions {
  url: string;
  token: string;
  tenantId: string;
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export type WebSocketConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// ============================================
// Event Types
// ============================================

// Email Events
export interface EmailNewEvent {
  type: 'email:new';
  payload: {
    email: Email;
    providerId: string;
    folder: string;
  };
}

export interface EmailUpdateEvent {
  type: 'email:update';
  payload: {
    emailId: string;
    updates: Partial<Email>;
    providerId: string;
  };
}

export interface EmailDeleteEvent {
  type: 'email:delete';
  payload: {
    emailId: string;
    providerId: string;
  };
}

export interface EmailBatchUpdateEvent {
  type: 'email:batch_update';
  payload: {
    emailIds: string[];
    updates: Partial<Email>;
    providerId: string;
  };
}

// Folder Events
export interface FolderCountUpdateEvent {
  type: 'folder:count_update';
  payload: {
    folderId: string;
    providerId: string;
    totalCount: number;
    unreadCount: number;
  };
}

export interface FolderSyncEvent {
  type: 'folder:sync';
  payload: {
    folders: Folder[];
    providerId: string;
  };
}

// Calendar Events
export interface CalendarEventNewEvent {
  type: 'calendar:event_new';
  payload: {
    event: CalendarEvent;
    providerId: string;
  };
}

export interface CalendarEventUpdateEvent {
  type: 'calendar:event_update';
  payload: {
    eventId: string;
    updates: Partial<CalendarEvent>;
    providerId: string;
  };
}

export interface CalendarEventDeleteEvent {
  type: 'calendar:event_delete';
  payload: {
    eventId: string;
    providerId: string;
  };
}

export interface CalendarReminderEvent {
  type: 'calendar:reminder';
  payload: {
    event: CalendarEvent;
    minutesUntilStart: number;
  };
}

// Contact Events
export interface ContactNewEvent {
  type: 'contact:new';
  payload: {
    contact: Contact;
  };
}

export interface ContactUpdateEvent {
  type: 'contact:update';
  payload: {
    contactId: string;
    updates: Partial<Contact>;
  };
}

export interface ContactDeleteEvent {
  type: 'contact:delete';
  payload: {
    contactId: string;
  };
}

export interface ContactMergeEvent {
  type: 'contact:merge';
  payload: {
    sourceContactIds: string[];
    mergedContact: Contact;
  };
}

// Sync Events
export interface SyncStartEvent {
  type: 'sync:start';
  payload: {
    providerId: string;
    syncType: 'full' | 'delta';
  };
}

export interface SyncProgressEvent {
  type: 'sync:progress';
  payload: {
    providerId: string;
    stage: string;
    progress: number; // 0-100
    message?: string;
  };
}

export interface SyncCompleteEvent {
  type: 'sync:complete';
  payload: {
    providerId: string;
    syncType: 'full' | 'delta';
    stats: {
      newEmails: number;
      updatedEmails: number;
      deletedEmails: number;
      newEvents?: number;
      newContacts?: number;
    };
  };
}

export interface SyncErrorEvent {
  type: 'sync:error';
  payload: {
    providerId: string;
    error: string;
    retryable: boolean;
  };
}

// AI Events
export interface AiActionCreatedEvent {
  type: 'ai:action:created';
  payload: {
    action: AgentPendingAction;
  };
}

export interface AiActionUpdatedEvent {
  type: 'ai:action:updated';
  payload: {
    actionId: string;
    status: string;
    updates: Partial<AgentPendingAction>;
  };
}

export interface AiActionExecutedEvent {
  type: 'ai:action:executed';
  payload: {
    actionId: string;
    result: unknown;
    success: boolean;
    error?: string;
  };
}

export interface AiChatStreamEvent {
  type: 'ai:chat:stream';
  payload: {
    sessionId: string;
    chunk: string;
    isComplete: boolean;
  };
}

export interface AiToolCallEvent {
  type: 'ai:tool:call';
  payload: {
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
  };
}

export interface AiToolResultEvent {
  type: 'ai:tool:result';
  payload: {
    sessionId: string;
    toolName: string;
    result: unknown;
  };
}

// Provider Events
export interface ProviderStatusEvent {
  type: 'provider:status';
  payload: {
    providerId: string;
    status: 'active' | 'error' | 'disconnected' | 'reauthorization_required';
    error?: string;
  };
}

export interface ProviderTokenRefreshEvent {
  type: 'provider:token_refresh';
  payload: {
    providerId: string;
    success: boolean;
    error?: string;
  };
}

// System Events
export interface SystemNotificationEvent {
  type: 'system:notification';
  payload: {
    id: string;
    level: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    dismissible: boolean;
    duration?: number; // Auto-dismiss after ms
  };
}

export interface SystemMaintenanceEvent {
  type: 'system:maintenance';
  payload: {
    scheduledAt: Date;
    estimatedDuration: number; // minutes
    message: string;
  };
}

// ============================================
// Union Type of All Events
// ============================================

export type WebSocketEvent =
  // Email
  | EmailNewEvent
  | EmailUpdateEvent
  | EmailDeleteEvent
  | EmailBatchUpdateEvent
  // Folder
  | FolderCountUpdateEvent
  | FolderSyncEvent
  // Calendar
  | CalendarEventNewEvent
  | CalendarEventUpdateEvent
  | CalendarEventDeleteEvent
  | CalendarReminderEvent
  // Contact
  | ContactNewEvent
  | ContactUpdateEvent
  | ContactDeleteEvent
  | ContactMergeEvent
  // Sync
  | SyncStartEvent
  | SyncProgressEvent
  | SyncCompleteEvent
  | SyncErrorEvent
  // AI
  | AiActionCreatedEvent
  | AiActionUpdatedEvent
  | AiActionExecutedEvent
  | AiChatStreamEvent
  | AiToolCallEvent
  | AiToolResultEvent
  // Provider
  | ProviderStatusEvent
  | ProviderTokenRefreshEvent
  // System
  | SystemNotificationEvent
  | SystemMaintenanceEvent;

// ============================================
// Event Handler Types
// ============================================

export type WebSocketEventType = WebSocketEvent['type'];

export type WebSocketEventPayload<T extends WebSocketEventType> = Extract<
  WebSocketEvent,
  { type: T }
>['payload'];

export type WebSocketEventHandler<T extends WebSocketEventType = WebSocketEventType> = (
  payload: WebSocketEventPayload<T>
) => void;

// Event subscription map
export type WebSocketEventHandlers = {
  [K in WebSocketEventType]?: WebSocketEventHandler<K>;
};
