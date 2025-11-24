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
  'contact:new': ContactEventPayload;
  'contact:update': ContactEventPayload;
  'contact:delete': ContactEventPayload;
  'label:new': LabelEventPayload;
  'label:update': LabelEventPayload;
  'label:delete': LabelEventPayload;
  'sync:status': {
    providerId: string;
    status: 'started' | 'in_progress' | 'completed' | 'failed';
    progress?: number;
    error?: string;
    processed?: number;
    total?: number;
    timestamp?: string;
  };
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
