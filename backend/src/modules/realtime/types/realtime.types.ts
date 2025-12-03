import { Socket } from 'socket.io';

export type EmailEventReason =
  | 'message-processed'
  | 'message-deleted'
  | 'labels-updated'
  | 'message-sent'
  | 'sync-complete'
  | 'read-status-updated'
  | 'starred-updated'
  | 'flagged-updated'
  | 'folder-updated';

export interface EmailEventPayload {
  emailId?: string;
  externalId?: string;
  providerId: string;
  folder?: string;
  reason: EmailEventReason;
  email?: Record<string, unknown>;
  updates?: Record<string, unknown>;
  unreadCount?: number;
  threadId?: string;
  timestamp?: string;
}

export interface CalendarEventPayload {
  eventId?: string;
  externalId?: string;
  calendarId: string;
  providerId?: string;
  reason: 'event-created' | 'event-updated' | 'event-deleted';
  event?: Record<string, unknown>;
  updates?: Record<string, unknown>;
  timestamp?: string;
}

export interface CalendarListPayload {
  calendarId: string;
  calendarName: string;
  providerId: string;
  providerEmail?: string;
  color?: string;
  reason: 'calendar-created' | 'calendar-updated' | 'calendar-deleted';
  timestamp?: string;
}

export interface ContactEventPayload {
  contactId?: string;
  externalId?: string;
  providerId?: string;
  reason: 'contact-created' | 'contact-updated' | 'contact-deleted';
  contact?: Record<string, unknown>;
  updates?: Record<string, unknown>;
  timestamp?: string;
}

export interface LabelEventPayload {
  labelId: string;
  reason: 'label-created' | 'label-updated' | 'label-deleted';
  label?: Record<string, unknown>;
  updates?: Record<string, unknown>;
  timestamp?: string;
}

export interface FolderEventPayload {
  providerId: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  oldName?: string;
  reason: 'folder-created' | 'folder-renamed' | 'folder-deleted';
  timestamp?: string;
}

/**
 * AI Multi-Agent Event Payloads
 */
export interface AiActionEventPayload {
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

export interface AiSessionEventPayload {
  sessionId: string;
  userId: string;
  status: 'created' | 'message_received' | 'processing' | 'response_ready' | 'ended';
  agentUsed?: string;
  intent?: string;
  pendingActionsCount?: number;
  executedActionsCount?: number;
  timestamp?: string;
}


export interface RealtimeEventPayloads {
  'email:new': EmailEventPayload;
  'email:update': EmailEventPayload;
  'email:delete': EmailEventPayload;
  'email:batch_processed': {
    providerId: string;
    processed: number;
    created?: number;
    syncType?: 'full' | 'incremental' | (string & {});
    timestamp?: string;
  };
  'email:unread_count_update': {
    folder: string;
    count: number;
    providerId: string;
    timestamp?: string;
  };
  'email:folder_counts_update': {
    providerId: string;
    folderId: string;
    folderName: string;
    totalCount: number;
    unreadCount: number;
    timestamp: string;
  };
  'email:thread_update': {
    threadId: string;
    emailIds: string[];
    timestamp?: string;
  };
  'calendar:event_new': CalendarEventPayload;
  'calendar:event_update': CalendarEventPayload;
  'calendar:event_delete': CalendarEventPayload;
  'calendar:list_update': CalendarListPayload;
  'contact:new': ContactEventPayload;
  'contact:update': ContactEventPayload;
  'contact:delete': ContactEventPayload;
  'contact:counts': {
    total: number;
    withEmail: number;
    withPhone: number;
    withCompany: number;
    byProvider: Array<{ providerId: string; count: number }>;
    timestamp: string;
  };
  'label:new': LabelEventPayload;
  'label:update': LabelEventPayload;
  'label:delete': LabelEventPayload;
  // Folder events
  'folder:created': FolderEventPayload;
  'folder:renamed': FolderEventPayload;
  'folder:deleted': FolderEventPayload;
  'sync:status': {
    providerId: string;
    status: 'started' | 'in_progress' | 'completed' | 'failed';
    progress?: number;
    error?: string;
    processed?: number;
    total?: number;
    timestamp?: string;
    // Optional fields for sync completion events (used by calendar/contact sync)
    type?: 'email' | 'calendar' | 'contacts' | 'folders';
    count?: number;
  };
  // AI Multi-Agent Events
  'ai:action:created': AiActionEventPayload;
  'ai:action:approved': AiActionEventPayload;
  'ai:action:rejected': AiActionEventPayload;
  'ai:action:executed': AiActionEventPayload;
  'ai:action:failed': AiActionEventPayload;
  'ai:session:update': AiSessionEventPayload;
}

export type KnownRealtimeEvent = keyof RealtimeEventPayloads;
export type GenericRealtimePayload = Record<string, unknown>;

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  tenantId?: string;
  email?: string;
}

export const buildTenantRoom = (tenantId: string) => `tenant:${tenantId}`;
export const buildTenantScopedRoom = (tenantId: string, room: string) =>
  `${buildTenantRoom(tenantId)}:${room}`;
