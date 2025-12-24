/**
 * Calendar Provider Interface
 *
 * Common interface for all calendar providers (Google, Microsoft)
 * Inspired by Zero's unified provider pattern
 */

export interface CalendarProviderConfig {
  userId: string;
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft';
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: Date;
}

export interface CalendarEvent {
  id: string;
  externalId: string;
  title: string;
  description?: string;
  location?: string;
  organizer?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    status: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  }>;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  timeZone: string;
  recurrence?: string[];
  recurringEventId?: string;
  status: string;
  visibility: string;
  reminders?: any;
  htmlLink?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CalendarList {
  id: string;
  name: string;
  description?: string;
  primary?: boolean;
  accessRole: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

export interface CreateCalendarEventData {
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean;
  timeZone?: string;
  attendees?: Array<{
    email: string;
    name?: string;
  }>;
  recurrence?: string[];
  reminders?: any;
}

export interface UpdateCalendarEventData extends Partial<CreateCalendarEventData> {
  id: string;
}

export interface CalendarSyncOptions {
  calendarId?: string;
  timeMin?: Date;
  timeMax?: Date;
  maxResults?: number;
  syncToken?: string;
}

export interface CalendarSyncResult {
  success: boolean;
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  deletedEvents: number;
  nextSyncToken?: string;
}

/**
 * ICalendarProvider - Common interface for all calendar providers
 *
 * This interface defines the contract that all calendar providers must implement.
 * It provides a unified API for calendar operations.
 */
export interface ICalendarProvider {
  readonly config: CalendarProviderConfig;

  // ==================== Authentication ====================

  /**
   * Refresh the access token
   */
  refreshToken(): Promise<{ accessToken: string; expiresAt: Date }>;

  // ==================== Calendar Management ====================

  /**
   * List all calendars
   */
  listCalendars(): Promise<CalendarList[]>;

  /**
   * Get a specific calendar by ID
   */
  getCalendar(calendarId: string): Promise<CalendarList>;

  /**
   * Create a new calendar
   */
  createCalendar(name: string, description?: string): Promise<{ id: string }>;

  /**
   * Update a calendar
   */
  updateCalendar(calendarId: string, name: string, description?: string): Promise<void>;

  /**
   * Delete a calendar
   */
  deleteCalendar(calendarId: string): Promise<void>;

  // ==================== Event Operations ====================

  /**
   * List events from a calendar
   */
  listEvents(calendarId: string, options?: CalendarSyncOptions): Promise<CalendarEvent[]>;

  /**
   * Get a single event
   */
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent>;

  /**
   * Create a new event
   */
  createEvent(calendarId: string, eventData: CreateCalendarEventData): Promise<{ id: string }>;

  /**
   * Update an existing event
   */
  updateEvent(calendarId: string, eventData: UpdateCalendarEventData): Promise<void>;

  /**
   * Delete an event
   */
  deleteEvent(calendarId: string, eventId: string): Promise<void>;

  // ==================== Sync Operations ====================

  /**
   * Sync calendar events
   */
  syncCalendars(options?: CalendarSyncOptions): Promise<CalendarSyncResult>;

  /**
   * Get sync token for incremental sync
   */
  getSyncToken?(): Promise<string>;

  // ==================== Utility Methods ====================

  /**
   * Test connection to calendar provider
   */
  testConnection(): Promise<boolean>;
}

/**
 * Base error class for calendar provider errors
 */
export class CalendarProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public originalError?: any,
  ) {
    super(message);
    this.name = 'CalendarProviderError';
  }
}

/**
 * Calendar sync error
 */
export class CalendarSyncError extends CalendarProviderError {
  constructor(provider: string, originalError?: any) {
    super('Calendar synchronization failed', 'SYNC_FAILED', provider, originalError);
    this.name = 'CalendarSyncError';
  }
}
