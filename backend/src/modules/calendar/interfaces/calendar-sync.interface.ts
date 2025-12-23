/**
 * Shared interfaces for Calendar Sync Services
 * Used by both GoogleCalendarSyncService and MicrosoftCalendarSyncService
 */

import { Prisma } from '@prisma/client';

/**
 * Result of a calendar sync operation
 */
export interface CalendarSyncResult {
  success: boolean;
  providerId: string;
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  deletedEvents: number;
  syncDuration: number;
  syncType: 'full' | 'incremental';
}

/**
 * Result of processing events (used internally)
 */
export interface ProcessEventsResult {
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  deletedEvents: number;
}

/**
 * Sync state for incremental synchronization
 */
export interface CalendarSyncStateData {
  providerId: string;
  calendarId: string;
  calendarName?: string;
  syncToken?: string | null;  // Google
  deltaLink?: string | null;  // Microsoft
  fullSyncRequired: boolean;
  consecutiveErrors: number;
  lastFullSyncAt?: Date | null;
  lastIncrementalAt?: Date | null;
  lastError?: string | null;
  lastErrorAt?: Date | null;
}

/**
 * Calendar list item from provider
 */
export interface ProviderCalendar {
  id: string;
  name: string;
  description?: string;
  accessRole?: string;
  primary?: boolean;
  deleted?: boolean;
}

/**
 * Normalized calendar event data (provider-agnostic)
 */
export interface NormalizedCalendarEvent {
  tenantId: string;
  providerId: string;
  externalId: string;
  calendarId: string;
  calendarName: string;
  iCalUID?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  organizer?: string | null;
  attendees?: Prisma.InputJsonValue;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  timeZone: string;
  recurrence: string[];
  recurringEventId?: string | null;
  status: string;
  visibility: string;
  isCancelled: boolean;
  isDeleted: boolean;
  reminders?: Prisma.InputJsonValue;
  htmlLink?: string | null;
  metadata?: Prisma.InputJsonValue;
  lastSyncedAt: Date;
}

/**
 * Raw event data from provider APIs
 * Used for detecting cancelled/deleted events
 */
export interface RawProviderEvent {
  id: string;
  isCancelled?: boolean;
  isDeleted?: boolean;
}

/**
 * Fetch events result from provider
 */
export interface FetchEventsResult<T> {
  events: T[];
  nextSyncToken?: string;  // Google
  nextDeltaLink?: string;  // Microsoft
}

/**
 * Provider-specific calendar client configuration
 */
export interface CalendarClientConfig {
  accessToken: string;
  maxEventsPerRequest?: number;
}

/**
 * Attachment data for calendar events
 */
export interface CalendarEventAttachmentData {
  eventExternalId: string;
  attachments: Array<{
    title?: string;
    mimeType?: string;
    fileUrl?: string;
    fileId?: string;
    iconLink?: string;
  }>;
}

/**
 * Provider type enum
 */
export type CalendarProviderType = 'google' | 'microsoft';

/**
 * Sync token field mapping
 */
export const SYNC_TOKEN_FIELD: Record<CalendarProviderType, 'syncToken' | 'deltaLink'> = {
  google: 'syncToken',
  microsoft: 'deltaLink',
};
