/**
 * TanStack Query hooks for calendar operations
 *
 * Best practices implemented:
 * - queryOptions for type-safe, reusable query configurations
 * - Proper staleTime and gcTime for optimal caching
 * - Automatic background refetching
 * - Error handling with retry configuration
 * - Integration with WebSocket for real-time invalidation
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/queries
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  calendarApi,
  type CalendarEventListParams,
  type CreateEventDto,
  type UpdateEventDto,
  type CreateCalendarDto,
  type UpdateCalendarPreferencesDto,
} from '@/lib/api/calendar';
import { calendarKeys } from './calendar-keys';

// ============================================================================
// Query Options (for sharing between hooks and prefetching)
// ============================================================================

/**
 * Query options for fetching calendar list
 */
export function calendarListOptions() {
  return queryOptions({
    queryKey: calendarKeys.calendars(),
    queryFn: async () => {
      const response = await calendarApi.listCalendars();
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - calendars rarely change
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Query options for fetching calendar events
 */
export function calendarEventsOptions(params?: CalendarEventListParams) {
  return queryOptions({
    queryKey: calendarKeys.eventList(params),
    queryFn: async () => {
      const response = await calendarApi.listEvents(params);
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - events can change
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Query options for fetching events by date range
 */
export function calendarEventsByRangeOptions(
  startTime: string,
  endTime: string,
  providerId?: string,
  calendarId?: string,
) {
  return queryOptions({
    queryKey: calendarKeys.eventsByRange(startTime, endTime, providerId, calendarId),
    queryFn: async () => {
      const response = await calendarApi.listEvents({
        startTime,
        endTime,
        providerId,
        calendarId,
      });
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
    enabled: !!startTime && !!endTime,
  });
}

/**
 * Query options for fetching single event
 */
export function calendarEventDetailOptions(id: string) {
  return queryOptions({
    queryKey: calendarKeys.eventDetail(id),
    queryFn: async () => {
      const response = await calendarApi.getEvent(id);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - single events rarely change
    gcTime: 15 * 60 * 1000, // 15 minutes
    enabled: !!id,
  });
}

/**
 * Query options for fetching event attachments
 */
export function calendarEventAttachmentsOptions(eventId: string) {
  return queryOptions({
    queryKey: calendarKeys.eventAttachments(eventId),
    queryFn: async () => {
      const response = await calendarApi.listAttachments(eventId);
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - attachments don't change
    gcTime: 30 * 60 * 1000,
    enabled: !!eventId,
  });
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook for fetching calendar list
 *
 * @example
 * ```tsx
 * const { data, isPending, error } = useCalendars();
 * const calendars = data?.calendars ?? [];
 * ```
 */
export function useCalendars() {
  return useQuery(calendarListOptions());
}

/**
 * Hook for fetching calendar events
 *
 * @example
 * ```tsx
 * const { data, isPending } = useCalendarEvents({
 *   providerId: 'provider-id',
 *   startTime: '2025-01-01T00:00:00Z',
 *   endTime: '2025-01-31T23:59:59Z',
 * });
 * ```
 */
export function useCalendarEvents(params?: CalendarEventListParams) {
  return useQuery(calendarEventsOptions(params));
}

/**
 * Hook for fetching events by date range
 *
 * @example
 * ```tsx
 * const { data } = useCalendarEventsByRange(
 *   '2025-01-01T00:00:00Z',
 *   '2025-01-31T23:59:59Z',
 *   'provider-id'
 * );
 * ```
 */
export function useCalendarEventsByRange(
  startTime: string,
  endTime: string,
  providerId?: string,
  calendarId?: string,
) {
  return useQuery(calendarEventsByRangeOptions(startTime, endTime, providerId, calendarId));
}

/**
 * Hook for fetching single calendar event
 *
 * @example
 * ```tsx
 * const { data: event, isPending } = useCalendarEvent('event-id');
 * ```
 */
export function useCalendarEvent(id: string) {
  return useQuery(calendarEventDetailOptions(id));
}

/**
 * Hook for fetching event attachments
 *
 * @example
 * ```tsx
 * const { data } = useCalendarEventAttachments('event-id');
 * const attachments = data?.attachments ?? [];
 * ```
 */
export function useCalendarEventAttachments(eventId: string) {
  return useQuery(calendarEventAttachmentsOptions(eventId));
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook for creating calendar events
 *
 * @example
 * ```tsx
 * const createEvent = useCreateCalendarEvent();
 * await createEvent.mutateAsync({
 *   providerId: 'provider-id',
 *   title: 'Meeting',
 *   startTime: new Date(),
 *   endTime: new Date(Date.now() + 3600000),
 * });
 * ```
 */
export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateEventDto) => {
      const response = await calendarApi.createEvent(data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all event queries to refresh lists
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

/**
 * Hook for updating calendar events
 *
 * @example
 * ```tsx
 * const updateEvent = useUpdateCalendarEvent();
 * await updateEvent.mutateAsync({
 *   id: 'event-id',
 *   data: { title: 'Updated Meeting' },
 * });
 * ```
 */
export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateEventDto }) => {
      const response = await calendarApi.updateEvent(id, data);
      return response.data;
    },
    onSuccess: (_, { id }) => {
      // Invalidate specific event and all event lists
      queryClient.invalidateQueries({ queryKey: calendarKeys.eventDetail(id) });
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

/**
 * Hook for deleting calendar events
 *
 * @example
 * ```tsx
 * const deleteEvent = useDeleteCalendarEvent();
 * await deleteEvent.mutateAsync('event-id');
 * ```
 */
export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await calendarApi.deleteEvent(id);
      return id;
    },
    onSuccess: (id) => {
      // Remove from cache and invalidate lists
      queryClient.removeQueries({ queryKey: calendarKeys.eventDetail(id) });
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

/**
 * Hook for syncing a provider's calendar
 *
 * @example
 * ```tsx
 * const syncProvider = useSyncCalendarProvider();
 * await syncProvider.mutateAsync('provider-id');
 * ```
 */
export function useSyncCalendarProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerId: string) => {
      const response = await calendarApi.syncProvider(providerId);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all calendar data after sync
      queryClient.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}

/**
 * Hook for creating a new calendar
 *
 * @example
 * ```tsx
 * const createCalendar = useCreateCalendar();
 * await createCalendar.mutateAsync({
 *   providerId: 'provider-id',
 *   name: 'Work Calendar',
 *   color: '#4285f4',
 * });
 * ```
 */
export function useCreateCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCalendarDto) => {
      const response = await calendarApi.createCalendar(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.calendars() });
    },
  });
}

/**
 * Hook for updating calendar preferences
 *
 * @example
 * ```tsx
 * const updatePreferences = useUpdateCalendarPreferences();
 * await updatePreferences.mutateAsync({
 *   providerId: 'provider-id',
 *   calendarId: 'calendar-id',
 *   data: { color: '#ff0000' },
 * });
 * ```
 */
export function useUpdateCalendarPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      providerId,
      calendarId,
      data,
    }: {
      providerId: string;
      calendarId: string;
      data: UpdateCalendarPreferencesDto;
    }) => {
      const response = await calendarApi.updateCalendarPreferences(providerId, calendarId, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.calendars() });
    },
  });
}
