import { create } from 'zustand';
import type { CalendarEvent as ApiCalendarEvent } from '@/lib/api/calendar';
import { logger } from '@/lib/logger';

// Re-export the API type for convenience
export type CalendarEvent = ApiCalendarEvent;

interface CalendarState {
  // Event data
  events: CalendarEvent[];
  selectedEvent: CalendarEvent | null;
  isLoading: boolean;

  // View state
  currentView: 'month' | 'week' | 'day' | 'list';
  selectedDate: Date;

  // Provider filtering
  selectedProviderId: string | null;
  enabledCalendarIds: Set<string>;

  // Sync state
  lastSyncAt: Date | null;
  isSyncing: boolean;
  syncError: string | null;

  // Actions - Event management
  setEvents: (events: CalendarEvent[]) => void;
  appendEvents: (events: CalendarEvent[]) => void;
  addEvent: (event: CalendarEvent) => void;
  updateEvent: (id: string, updates: Partial<CalendarEvent> | CalendarEvent) => void;
  deleteEvent: (id: string) => void;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  setLoading: (loading: boolean) => void;

  // Actions - View management
  setCurrentView: (view: 'month' | 'week' | 'day' | 'list') => void;
  setSelectedDate: (date: Date) => void;

  // Actions - Provider/Calendar filtering
  setSelectedProviderId: (providerId: string | null) => void;
  toggleCalendarEnabled: (calendarId: string) => void;
  setEnabledCalendarIds: (calendarIds: Set<string>) => void;

  // Actions - Sync state
  setSyncing: (syncing: boolean) => void;
  setSyncError: (error: string | null) => void;
  setLastSyncAt: (date: Date | null) => void;

  // Queries
  getEventsByDate: (date: Date) => CalendarEvent[];
  getEventsByDateRange: (startDate: Date, endDate: Date) => CalendarEvent[];
  getEventsByProvider: (providerId: string) => CalendarEvent[];
  getEventsByCalendar: (calendarId: string) => CalendarEvent[];
  getFilteredEvents: () => CalendarEvent[];
  getUniqueCalendars: () => Array<{ calendarId: string; calendarName: string; providerId: string }>;

  // Reset
  reset: () => void;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  selectedEvent: null,
  isLoading: false,
  currentView: 'month',
  selectedDate: new Date(),
  selectedProviderId: null,
  enabledCalendarIds: new Set<string>(),
  lastSyncAt: null,
  isSyncing: false,
  syncError: null,

  setEvents: (events) => {
    logger.debug('[Calendar Store] setEvents called', { count: events.length });
    // Auto-enable all calendars when events are loaded
    const calendarIds = new Set(events.map((e) => e.calendarId).filter(Boolean) as string[]);
    set({ events, enabledCalendarIds: calendarIds });
  },

  appendEvents: (newEvents) =>
    set((state) => {
      // Filter out duplicates
      const existingIds = new Set(state.events.map((e) => e.id));
      const uniqueNewEvents = newEvents.filter((e) => !existingIds.has(e.id));
      logger.debug('[Calendar Store] appendEvents', { newCount: uniqueNewEvents.length });
      return {
        events: [...state.events, ...uniqueNewEvents],
      };
    }),

  addEvent: (event) =>
    set((state) => {
      logger.debug('[Calendar Store] addEvent called', { id: event.id, title: event.title?.substring(0, 30) });

      // Prevent duplicates
      if (state.events.some((e) => e.id === event.id)) {
        logger.warn('[Calendar Store] Event already exists, skipping');
        return state;
      }

      // Auto-enable calendar if new
      const newEnabledCalendars = new Set(state.enabledCalendarIds);
      if (event.calendarId) {
        newEnabledCalendars.add(event.calendarId);
      }

      logger.debug('[Calendar Store] Event added successfully');
      return {
        events: [...state.events, event],
        enabledCalendarIds: newEnabledCalendars,
      };
    }),

  updateEvent: (id, updates) =>
    set((state) => {
      logger.debug('[Calendar Store] updateEvent called', { id, hasUpdates: !!updates });
      const eventIndex = state.events.findIndex((e) => e.id === id);

      if (eventIndex === -1) {
        // Event doesn't exist - try to add if updates is a full event
        if (typeof updates === 'object' && updates !== null && 'id' in updates && 'title' in updates) {
          logger.debug('[Calendar Store] Event not found, adding as new');
          const newEvent = updates as CalendarEvent;
          return {
            events: [...state.events, newEvent],
          };
        }
        logger.warn('[Calendar Store] Event not found, cannot update with partial data');
        return state;
      }

      const newEvents = [...state.events];
      // Check if updates is a full event object
      const isFullEvent = typeof updates === 'object' && updates !== null &&
                         'id' in updates && 'title' in updates && 'startTime' in updates;
      newEvents[eventIndex] = isFullEvent
        ? (updates as CalendarEvent)
        : { ...newEvents[eventIndex], ...updates };

      logger.debug('[Calendar Store] Event updated successfully');
      return {
        events: newEvents,
        selectedEvent: state.selectedEvent?.id === id
          ? newEvents[eventIndex]
          : state.selectedEvent,
      };
    }),

  deleteEvent: (id) =>
    set((state) => {
      logger.debug('[Calendar Store] deleteEvent called', { id });
      const eventExists = state.events.some((e) => e.id === id);

      if (!eventExists) {
        logger.warn('[Calendar Store] Event not found, cannot delete');
        return state;
      }

      logger.debug('[Calendar Store] Event deleted successfully');
      return {
        events: state.events.filter((e) => e.id !== id),
        selectedEvent: state.selectedEvent?.id === id ? null : state.selectedEvent,
      };
    }),

  setSelectedEvent: (event) => set({ selectedEvent: event }),

  setLoading: (loading) => set({ isLoading: loading }),

  setCurrentView: (view) => set({ currentView: view }),

  setSelectedDate: (date) => set({ selectedDate: date }),

  setSelectedProviderId: (providerId) => set({ selectedProviderId: providerId }),

  toggleCalendarEnabled: (calendarId) =>
    set((state) => {
      const newSet = new Set(state.enabledCalendarIds);
      if (newSet.has(calendarId)) {
        newSet.delete(calendarId);
      } else {
        newSet.add(calendarId);
      }
      return { enabledCalendarIds: newSet };
    }),

  setEnabledCalendarIds: (calendarIds) => set({ enabledCalendarIds: calendarIds }),

  setSyncing: (syncing) => set({ isSyncing: syncing }),

  setSyncError: (error) => set({ syncError: error }),

  setLastSyncAt: (date) => set({ lastSyncAt: date }),

  getEventsByDate: (date) => {
    const events = get().events;
    const targetDate = new Date(date).toISOString().split('T')[0];
    return events.filter((event) => {
      const eventDate = new Date(event.startTime).toISOString().split('T')[0];
      return eventDate === targetDate && !event.isDeleted && !event.isCancelled;
    });
  },

  getEventsByDateRange: (startDate, endDate) => {
    const events = get().events;
    return events.filter((event) => {
      if (event.isDeleted || event.isCancelled) return false;
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventStart <= endDate && eventEnd >= startDate;
    });
  },

  getEventsByProvider: (providerId) => {
    const events = get().events;
    return events.filter((event) =>
      event.providerId === providerId && !event.isDeleted && !event.isCancelled
    );
  },

  getEventsByCalendar: (calendarId) => {
    const events = get().events;
    return events.filter((event) =>
      event.calendarId === calendarId && !event.isDeleted && !event.isCancelled
    );
  },

  getFilteredEvents: () => {
    const state = get();
    return state.events.filter((event) => {
      if (event.isDeleted || event.isCancelled) return false;

      // Filter by provider if selected
      if (state.selectedProviderId && event.providerId !== state.selectedProviderId) {
        return false;
      }

      // Filter by enabled calendars
      if (event.calendarId && !state.enabledCalendarIds.has(event.calendarId)) {
        return false;
      }

      return true;
    });
  },

  getUniqueCalendars: () => {
    const events = get().events;
    const calendarMap = new Map<string, { calendarId: string; calendarName: string; providerId: string }>();

    events.forEach((event) => {
      if (event.calendarId && !calendarMap.has(event.calendarId)) {
        calendarMap.set(event.calendarId, {
          calendarId: event.calendarId,
          calendarName: event.calendarName || event.calendarId,
          providerId: event.providerId,
        });
      }
    });

    return Array.from(calendarMap.values());
  },

  reset: () =>
    set({
      events: [],
      selectedEvent: null,
      isLoading: false,
      currentView: 'month',
      selectedDate: new Date(),
      selectedProviderId: null,
      enabledCalendarIds: new Set<string>(),
      lastSyncAt: null,
      isSyncing: false,
      syncError: null,
    }),
}));
