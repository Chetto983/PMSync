/**
 * TanStack Query keys for calendar operations
 *
 * Following 2025 best practices:
 * - Hierarchical key structure for granular invalidation
 * - Factory pattern for consistent key generation
 * - Type-safe with const assertions
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
 */

import type { CalendarEventListParams } from '@/lib/api/calendar';

export const calendarKeys = {
  // Root key for all calendar queries
  all: ['calendar'] as const,

  // Calendar list
  calendars: () => [...calendarKeys.all, 'calendars'] as const,

  // Events with filters
  events: () => [...calendarKeys.all, 'events'] as const,
  eventList: (params?: CalendarEventListParams) => [...calendarKeys.events(), params ?? {}] as const,
  eventsByRange: (startTime: string, endTime: string, providerId?: string, calendarId?: string) =>
    [...calendarKeys.events(), { startTime, endTime, providerId, calendarId }] as const,

  // Single event details
  eventDetails: () => [...calendarKeys.all, 'event-detail'] as const,
  eventDetail: (id: string) => [...calendarKeys.eventDetails(), id] as const,

  // Event attachments
  attachments: () => [...calendarKeys.all, 'attachments'] as const,
  eventAttachments: (eventId: string) => [...calendarKeys.attachments(), eventId] as const,
  attachment: (eventId: string, attachmentId: string) =>
    [...calendarKeys.attachments(), eventId, attachmentId] as const,

  // Conflicts
  conflicts: () => [...calendarKeys.all, 'conflicts'] as const,
  conflictsByRange: (startDate: string, endDate: string) =>
    [...calendarKeys.conflicts(), { startDate, endDate }] as const,

  // Sync status
  syncStatus: () => [...calendarKeys.all, 'sync-status'] as const,
  providerSync: (providerId: string) => [...calendarKeys.syncStatus(), providerId] as const,
} as const;
