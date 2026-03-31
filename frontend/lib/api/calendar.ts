import { apiClient } from '../api-client';

// ===== TYPES =====

export type CalendarEventAttachment = {
  id: string;
  eventId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageType: string;
  storagePath?: string;
  fileUrl?: string;
  fileId?: string;
  iconLink?: string;
  isGoogleDrive: boolean;
  isOneDrive: boolean;
  createdAt: string;
};

export type CalendarEvent = {
  id: string;
  tenantId: string;
  providerId: string;
  externalId: string;
  calendarId?: string;
  calendarName?: string;
  iCalUID?: string;
  title: string;
  description?: string;
  location?: string;
  organizer?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    responseStatus?: string;
  }>;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  timeZone: string;
  recurrence: string[];
  recurringEventId?: string;
  status: string;
  visibility: string;
  isDeleted: boolean;
  isCancelled: boolean;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method: string;
      minutes: number;
    }>;
  };
  metadata?: Record<string, unknown>;
  htmlLink?: string;
  lastSyncedAt: string;
  syncVersion: number;
  createdAt?: string;
  updatedAt?: string;
  provider?: {
    id: string;
    email?: string;
    providerType?: string;
    displayName?: string | null;
  };
  attachments?: CalendarEventAttachment[];
};

export type CreateEventDto = {
  providerId: string;
  calendarId?: string;
  calendarName?: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date | string;
  endTime: Date | string;
  isAllDay?: boolean;
  timeZone?: string;
  attendees?: Array<{ email: string; name?: string }>;
  recurrence?: string[]; // RRULE strings for recurring events
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method: string;
      minutes: number;
    }>;
  };
};

export type UpdateEventDto = {
  title?: string;
  description?: string;
  location?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  isAllDay?: boolean;
  timeZone?: string;
  attendees?: Array<{ email: string; name?: string }>;
  recurrence?: string[]; // RRULE strings for recurring events
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method: string;
      minutes: number;
    }>;
  };
  calendarName?: string;
};

export type CalendarEventListParams = {
  providerId?: string;
  calendarId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
};

export type CalendarEventListResponse = {
  events: CalendarEvent[];
  total: number;
};

export type CalendarSyncResult = {
  success: boolean;
  providerId: string;
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  deletedEvents: number;
  syncDuration: number;
};

// Calendar list types
export type CalendarInfo = {
  id: string;
  calendarId: string;
  calendarName: string;
  providerId: string;
  providerEmail: string;
  providerType: string;
  eventCount: number;
  backgroundColor?: string;
  primary?: boolean;
  removable?: boolean;
};

export type CalendarListResponse = {
  calendars: CalendarInfo[];
  total: number;
};

export type CreateCalendarDto = {
  providerId: string;
  name: string;
  description?: string;
  color?: string;
};

export type UpdateCalendarPreferencesDto = {
  name?: string;
  color?: string;
};

// ===== API CLIENT =====

export const calendarApi = {
  /**
   * List calendar events with filters
   * GET /calendar/events
   */
  listEvents(params?: CalendarEventListParams) {
    const queryParams = new URLSearchParams();

    if (params?.providerId) queryParams.append('providerId', params.providerId);
    if (params?.calendarId) queryParams.append('calendarId', params.calendarId);
    if (params?.startTime) queryParams.append('startTime', params.startTime);
    if (params?.endTime) queryParams.append('endTime', params.endTime);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const query = queryParams.toString();
    return apiClient.get<CalendarEventListResponse>(`/calendar/events${query ? `?${query}` : ''}`);
  },

  /**
   * Get calendar event by ID
   * GET /calendar/events/:id
   */
  getEvent(id: string) {
    return apiClient.get<CalendarEvent>(`/calendar/events/${id}`);
  },

  /**
   * Create a new calendar event
   * POST /calendar/events
   */
  createEvent(data: CreateEventDto) {
    return apiClient.post<CalendarEvent>('/calendar/events', data);
  },

  /**
   * Update a calendar event
   * PATCH /calendar/events/:id
   */
  updateEvent(id: string, data: UpdateEventDto) {
    return apiClient.patch<CalendarEvent>(`/calendar/events/${id}`, data);
  },

  /**
   * Delete a calendar event
   * DELETE /calendar/events/:id
   */
  deleteEvent(id: string) {
    return apiClient.delete<void>(`/calendar/events/${id}`);
  },

  /**
   * Trigger manual sync for a provider
   * POST /calendar/sync/:providerId
   */
  syncProvider(providerId: string) {
    return apiClient.post<CalendarSyncResult>(`/calendar/sync/${providerId}`);
  },

  // ===== CALENDAR LIST MANAGEMENT =====

  /**
   * List all calendars from all providers
   * GET /calendar/calendars
   */
  listCalendars() {
    return apiClient.get<CalendarListResponse>('/calendar/calendars');
  },

  /**
   * Create a new calendar
   * POST /calendar/calendars
   */
  createCalendar(data: CreateCalendarDto) {
    return apiClient.post<CalendarInfo>('/calendar/calendars', data);
  },

  /**
   * Update calendar preferences (name, color)
   * PATCH /calendar/calendars/:providerId/:calendarId
   */
  updateCalendarPreferences(
    providerId: string,
    calendarId: string,
    data: UpdateCalendarPreferencesDto
  ) {
    return apiClient.patch<{ success: boolean; calendarId: string; providerId: string; color?: string }>(
      `/calendar/calendars/${providerId}/${encodeURIComponent(calendarId)}`,
      data
    );
  },

  /**
   * Delete a calendar
   * DELETE /calendar/calendars/:providerId/:calendarId
   */
  deleteCalendar(providerId: string, calendarId: string) {
    return apiClient.delete<{ success: boolean; calendarId: string; providerId: string }>(
      `/calendar/calendars/${providerId}/${encodeURIComponent(calendarId)}`
    );
  },

  // ===== ATTACHMENTS =====

  /**
   * List attachments for a calendar event
   * GET /calendar/events/:eventId/attachments
   */
  listAttachments(eventId: string) {
    return apiClient.get<{ total: number; attachments: CalendarEventAttachment[] }>(
      `/calendar/events/${eventId}/attachments`
    );
  },

  /**
   * Get attachment download URL
   * GET /calendar/events/:eventId/attachments/:attachmentId
   */
  getAttachmentUrl(eventId: string, attachmentId: string) {
    return apiClient.get<{ url: string; filename: string; mimeType: string }>(
      `/calendar/events/${eventId}/attachments/${attachmentId}`
    );
  },

  // ===== RSVP =====

  /**
   * Get the source email ID for a calendar event (for RSVP)
   * GET /calendar/events/:id/source-email
   */
  getEventSourceEmail(eventId: string) {
    return apiClient.get<{ emailId: string | null }>(`/calendar/events/${eventId}/source-email`);
  },

  // ===== Conflicts =====

  /**
   * Detect scheduling conflicts in a date range
   * GET /calendar/conflicts
   */
  getConflicts(startDate: string, endDate: string) {
    return apiClient.get<{
      success: boolean;
      conflicts: Array<{
        eventA: { id: string; title: string; startTime: string; endTime: string };
        eventB: { id: string; title: string; startTime: string; endTime: string };
        overlapMinutes: number;
        severity: 'hard' | 'soft';
      }>;
      total: number;
    }>('/calendar/conflicts', { params: { startDate, endDate } });
  },
};
