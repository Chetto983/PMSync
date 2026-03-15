import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import type { EventInput } from '@fullcalendar/core';
import { logger } from '@/lib/logger';
import {
  calendarEventsOptions,
} from '@/hooks/queries/use-calendar';
import { calendarKeys } from '@/hooks/queries/calendar-keys';
import { useProviders } from '@/hooks/queries/use-providers';
import { allFullCalendarLocales, getFullCalendarLocale } from '@/locales';
import { getStoredUserSettings } from '@/lib/utils/user-settings';
import { useCalendarStore, type CalendarEvent } from '@/stores/calendar-store';
import { websocketClient, type RealtimeCalendarEvent, type RealtimeSyncStatus } from '@/lib/websocket-client';
import {
  useSyncCalendarProvider,
} from '@/hooks/queries/use-calendar';
import type { ProviderConfig } from '@/lib/api/providers';
import type { CalendarPreference, CalendarViewType } from '@/components/calendar';

export function useCalendarData(
  calendarPrefs: Map<string, CalendarPreference>,
  loadCalendars: () => Promise<void>,
  setSnackbar: (s: { open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendarCopy: any,
) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calendarRef = useRef<any>(null);

  const [currentMonth, setCurrentMonth] = useState('');
  const [currentYear, setCurrentYear] = useState('');
  const [viewType, setViewType] = useState<CalendarViewType>('month');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProvider, _setSelectedProvider] = useState<string | undefined>();

  // Use calendar store for events and real-time updates
  const {
    events: storeEvents,
    setEvents: setStoreEvents,
    addEvent: addStoreEvent,
    updateEvent: updateStoreEvent,
    deleteEvent: deleteStoreEvent,
    isLoading: loading,
    setLoading,
    isSyncing,
    setLastSyncAt,
  } = useCalendarStore();

  const syncProviderMutation = useSyncCalendarProvider();

  // Get the FullCalendar locale based on user settings
  const calendarLocale = useMemo(() => {
    const userSettings = getStoredUserSettings();
    const userLanguage = userSettings.language;
    const browserLocale = typeof navigator !== 'undefined' ? navigator.language : 'en';
    const appLocale = userLanguage || router.locale || browserLocale;
    return getFullCalendarLocale(appLocale);
  }, [router.locale]);

  const calendarLocales = useMemo(() => allFullCalendarLocales, []);

  const updateCalendarHeader = useCallback(() => {
    if (calendarRef.current) {
      const calApi = calendarRef.current.getApi();
      const date = calApi.getDate();
      const locale = calendarLocale === 'it' ? 'it-IT' : 'en-US';
      setCurrentMonth(date.toLocaleDateString(locale, { month: 'long' }));
      setCurrentYear(date.getFullYear().toString());
    }
  }, [calendarLocale]);

  // Convert backend CalendarEvent to FullCalendar EventInput
  const convertToFullCalendarEvent = useCallback(
    (event: CalendarEvent): EventInput => {
      const calendarKey = `${event.providerId}:${event.calendarId || 'primary'}`;
      const pref = calendarPrefs.get(calendarKey);
      return {
        id: event.id,
        title: event.title,
        start: event.startTime,
        end: event.endTime,
        allDay: event.isAllDay,
        backgroundColor: pref?.color || '#0B7EFF',
        extendedProps: {
          description: event.description,
          location: event.location,
          calendar: pref?.calendarName || event.calendarName || 'calendar',
          providerId: event.providerId,
          calendarId: event.calendarId,
          calendarName: event.calendarName,
        },
      };
    },
    [calendarPrefs]
  );

  // Use TanStack Query for providers
  const { data: providersData } = useProviders();

  // Sync providers state from TanStack Query
  useEffect(() => {
    if (providersData) {
      setProviders(providersData);
    }
  }, [providersData]);

  // Ref to avoid stale closure in loadData callback
  const providersRef = useRef(providers);
  useEffect(() => {
    providersRef.current = providers;
  }, [providers]);

  // Load events
  const loadData = useCallback(
    async (triggerSync = false) => {
      try {
        setLoading(true);

        const loadedProviders = providersRef.current;

        if (triggerSync && loadedProviders.length > 0) {
          const calendarProviders = loadedProviders.filter((p) => p.supportsCalendar);
          logger.debug('[Calendar] Syncing providers', { count: calendarProviders.length });

          const syncPromises = calendarProviders.map(async (provider) => {
            try {
              const result = await syncProviderMutation.mutateAsync(provider.id);
              logger.info(`[Calendar] Synced ${provider.email}`, {
                newEvents: result?.newEvents || 0,
                updatedEvents: result?.updatedEvents || 0,
              });
              return result;
            } catch (syncError) {
              logger.warn(`[Calendar] Failed to sync ${provider.email}`, { error: syncError });
              return null;
            }
          });

          await Promise.all(syncPromises);
        }

        await loadCalendars();

        let startTime: Date;
        let endTime: Date;

        if (calendarRef.current) {
          const calApi = calendarRef.current.getApi();
          const view = calApi.view;
          startTime = view.activeStart;
          endTime = view.activeEnd;
        } else {
          const now = new Date();
          startTime = new Date(now.getFullYear(), now.getMonth(), 1);
          endTime = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }

        try {
          const eventsRes = await queryClient.fetchQuery(
            calendarEventsOptions({
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              providerId: selectedProvider,
            })
          );
          const events = eventsRes.events || [];
          setStoreEvents(events);
          setLastSyncAt(new Date());
        } catch (eventsError) {
          logger.error('Failed to load calendar events', { error: eventsError });
          setSnackbar({
            open: true,
            message: calendarCopy.failedToLoadEvents,
            severity: 'error',
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [loadCalendars, selectedProvider, setLoading, setStoreEvents, setLastSyncAt, syncProviderMutation, queryClient, calendarCopy.failedToLoadEvents, setSnackbar]
  );

  // Initial data load
  useEffect(() => {
    void loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCalendarsRefresh = () => {
      void loadData(false);
    };

    window.addEventListener('calendars:refresh', handleCalendarsRefresh as EventListener);
    return () => {
      window.removeEventListener('calendars:refresh', handleCalendarsRefresh as EventListener);
    };
  }, [loadData]);

  // Update calendar header on mount and view change
  useEffect(() => {
    updateCalendarHeader();
  }, [updateCalendarHeader]);

  // WebSocket event handlers
  useEffect(() => {
    if (!websocketClient) return;

    const unsubscribeNew = websocketClient.onCalendarEventNew((event: RealtimeCalendarEvent) => {
      logger.debug('[Calendar] WebSocket new event received', { reason: event.reason });
      if (event.event) {
        addStoreEvent(event.event as CalendarEvent);
        void queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
      }
    });

    const unsubscribeUpdate = websocketClient.onCalendarEventUpdate((event: RealtimeCalendarEvent) => {
      logger.debug('[Calendar] WebSocket update event received', { reason: event.reason });
      if (event.event && event.eventId) {
        updateStoreEvent(event.eventId, event.event as CalendarEvent);
        void queryClient.invalidateQueries({ queryKey: calendarKeys.eventDetail(event.eventId) });
        void queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
      }
    });

    const unsubscribeDelete = websocketClient.onCalendarEventDelete((event: RealtimeCalendarEvent) => {
      logger.debug('[Calendar] WebSocket delete event received', { reason: event.reason });
      if (event.eventId) {
        deleteStoreEvent(event.eventId);
        queryClient.removeQueries({ queryKey: calendarKeys.eventDetail(event.eventId) });
        void queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
      }
    });

    const unsubscribeSyncStatus = websocketClient.onSyncStatus((status: RealtimeSyncStatus) => {
      logger.debug('[Calendar] Sync status', { status: status.status, type: status.type });
      if (status.status === 'completed' && status.type === 'calendar') {
        void loadData(false);
      }
    });

    return () => {
      unsubscribeNew();
      unsubscribeUpdate();
      unsubscribeDelete();
      unsubscribeSyncStatus();
    };
  }, [addStoreEvent, updateStoreEvent, deleteStoreEvent, loadData, queryClient]);

  // Handle view change
  useEffect(() => {
    if (calendarRef.current) {
      const calApi = calendarRef.current.getApi();
      const viewMap = {
        day: 'timeGridDay',
        week: 'timeGridWeek',
        month: 'dayGridMonth',
        list: 'listMonth',
      };
      calApi.changeView(viewMap[viewType]);
      updateCalendarHeader();
    }
  }, [viewType, updateCalendarHeader]);

  // Filter events by enabled calendars
  const filteredEvents = useMemo(() => {
    return storeEvents
      .filter((event) => {
        if (event.isDeleted || event.isCancelled) return false;
        const calendarKey = `${event.providerId}:${event.calendarId || 'primary'}`;
        const pref = calendarPrefs.get(calendarKey);
        return pref?.enabled !== false;
      })
      .map(convertToFullCalendarEvent);
  }, [storeEvents, calendarPrefs, convertToFullCalendarEvent]);

  return {
    calendarRef,
    currentMonth,
    currentYear,
    viewType,
    setViewType,
    providers,
    loading,
    isSyncing,
    storeEvents,
    filteredEvents,
    calendarLocale,
    calendarLocales,
    updateCalendarHeader,
    loadData,
    queryClient,
  };
}
