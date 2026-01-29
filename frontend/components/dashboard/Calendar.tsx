/**
 * Calendar - Main calendar component with events and sidebar
 *
 * Refactored to use extracted components:
 * - CalendarSidebar - sidebar with calendar list, quick event, AI insights
 * - CalendarHeader - header with navigation and view toggle
 * - CalendarEventDialog - create event dialog
 * - CalendarEventDetail - event detail/edit dialog
 *
 * Features:
 * - Full FullCalendar integration with multiple views
 * - Real-time WebSocket updates
 * - Calendar color preferences stored in database
 * - Glassmorphism styling matching dashboard/email
 * - Mobile-responsive with drawer
 *
 * @see https://fullcalendar.io/docs
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  Box,
  Paper,
  Snackbar,
  Alert as MuiAlert,
  Drawer,
  alpha,
  useTheme,
  Skeleton,
  CircularProgress,
} from '@mui/material';
// Lazy load FullCalendar for faster initial page load (~100KB bundle reduction)
const FullCalendar = lazy(() => import('@fullcalendar/react'));
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventInput, DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { useRouter } from 'next/router';
import { logger } from '@/lib/logger';
import {
  type CreateEventDto,
  type UpdateEventDto,
  type CalendarInfo,
  type CalendarEvent as ApiCalendarEvent,
  type CalendarEventAttachment,
} from '@/lib/api/calendar';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCalendars,
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
  useSyncCalendarProvider,
  useUpdateCalendarPreferences,
  calendarEventsOptions,
  calendarEventDetailOptions,
  calendarEventAttachmentsOptions,
} from '@/hooks/queries/use-calendar';
import { calendarKeys } from '@/hooks/queries/calendar-keys';
import type { ProviderConfig } from '@/lib/api/providers';
import { useProviders } from '@/hooks/queries/use-providers';
import { allFullCalendarLocales, getFullCalendarLocale } from '@/locales';
import { useTranslations } from '@/lib/hooks/use-translations';
import { getStoredUserSettings } from '@/lib/utils/user-settings';
import { useCalendarStore, type CalendarEvent } from '@/stores/calendar-store';
import { websocketClient, type RealtimeCalendarEvent, type RealtimeSyncStatus } from '@/lib/websocket-client';
import {
  CalendarSidebar,
  CalendarHeader,
  CalendarEventDialog,
  CalendarEventDetail,
  type CalendarPreference,
  type ProviderGroup,
  type CalendarViewType,
  type NewEventData,
  type EventFormErrors,
  type EditedEventData,
  type EditFormErrors,
} from '@/components/calendar';

// Color palette for calendars - defined outside component to avoid re-creation
const CALENDAR_COLORS = [
  '#0B7EFF', '#9C27B0', '#00C853', '#FF9800', '#E91E63',
  '#3F51B5', '#009688', '#795548', '#607D8B', '#FF5722',
];

// Local storage key for calendar preferences
const CALENDAR_PREFS_KEY = 'calendar-preferences';

export function Calendar() {
  const router = useRouter();
  const theme = useTheme();
  const translations = useTranslations();
  const calendarCopy = translations.calendar;
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

  // TanStack Query client for imperative fetching
  const queryClient = useQueryClient();

  // TanStack Query hooks for data fetching and mutations
  const { data: calendarsData, refetch: refetchCalendars } = useCalendars();
  const createEventMutation = useCreateCalendarEvent();
  const updateEventMutation = useUpdateCalendarEvent();
  const deleteEventMutation = useDeleteCalendarEvent();
  const syncProviderMutation = useSyncCalendarProvider();
  const updatePreferencesMutation = useUpdateCalendarPreferences();

  // Calendar preferences and provider groups
  const [calendarPrefs, setCalendarPrefs] = useState<Map<string, CalendarPreference>>(new Map());
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<HTMLElement | null>(null);
  const [colorPickerCalendarId, setColorPickerCalendarId] = useState<string | null>(null);

  // Get the FullCalendar locale based on user settings
  const calendarLocale = useMemo(() => {
    const userSettings = getStoredUserSettings();
    const userLanguage = userSettings.language;
    const browserLocale = typeof navigator !== 'undefined' ? navigator.language : 'en';
    const appLocale = userLanguage || router.locale || browserLocale;
    return getFullCalendarLocale(appLocale);
  }, [router.locale]);

  const calendarLocales = useMemo(() => allFullCalendarLocales, []);

  const [quickEventText, setQuickEventText] = useState('');
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<NewEventData>({
    title: '',
    start: '',
    end: '',
    calendar: 'work',
    description: '',
  });
  const [formErrors, setFormErrors] = useState<EventFormErrors>({});
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Event details dialog state
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ApiCalendarEvent | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedEvent, setEditedEvent] = useState<EditedEventData>({
    title: '',
    description: '',
    location: '',
    start: '',
    end: '',
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [attachments, setAttachments] = useState<CalendarEventAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [editFormErrors, setEditFormErrors] = useState<EditFormErrors>({});

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

  // Load UI-only preferences from localStorage (enabled state)
  const loadEnabledState = useCallback((): Record<string, boolean> => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(CALENDAR_PREFS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, []);

  // Save enabled state to localStorage (UI preference)
  const saveEnabledState = useCallback((prefs: Map<string, CalendarPreference>) => {
    if (typeof window === 'undefined') return;
    try {
      const toSave: Record<string, boolean> = {};
      prefs.forEach((pref, key) => {
        toSave[key] = pref.enabled;
      });
      localStorage.setItem(CALENDAR_PREFS_KEY, JSON.stringify(toSave));
    } catch (e) {
      logger.warn('Failed to save calendar enabled state', { error: e });
    }
  }, []);

  // Update calendar color via API using TanStack Query mutation
  const updateCalendarColor = useCallback(
    async (calendarId: string, providerId: string, color: string) => {
      try {
        await updatePreferencesMutation.mutateAsync({ providerId, calendarId, data: { color } });
        setCalendarPrefs((prev) => {
          const newPrefs = new Map(prev);
          const key = `${providerId}:${calendarId}`;
          const existing = newPrefs.get(key);
          if (existing) {
            newPrefs.set(key, { ...existing, color });
          }
          return newPrefs;
        });
        setProviderGroups((prev) =>
          prev.map((group) => ({
            ...group,
            calendars: group.calendars.map((cal) =>
              cal.calendarId === calendarId && cal.providerId === providerId
                ? { ...cal, color }
                : cal
            ),
          }))
        );
        setSnackbar({
          open: true,
          message: calendarCopy.colorUpdated,
          severity: 'success',
        });
      } catch (error) {
        logger.error('Failed to update calendar color', { error });
        setSnackbar({
          open: true,
          message: calendarCopy.failedToUpdateColor,
          severity: 'error',
        });
      }
    },
    [calendarCopy, updatePreferencesMutation]
  );

  // Process calendars data from TanStack Query
  useEffect(() => {
    if (!calendarsData?.calendars) return;

    const calendars = calendarsData.calendars;
    const savedEnabled = loadEnabledState();

    // Filter out deprecated "Primary Calendar" entries
    const filteredCalendars = calendars.filter((cal: CalendarInfo) => {
      const isPrimaryCalendar = cal.calendarName === 'Primary Calendar' || cal.calendarId === 'primary';
      return !isPrimaryCalendar;
    });

    // Create calendar preferences map
    const newPrefs = new Map<string, CalendarPreference>();
    filteredCalendars.forEach((cal: CalendarInfo, index: number) => {
      const key = cal.id;
      newPrefs.set(key, {
        id: key,
        calendarId: cal.calendarId,
        calendarName: cal.calendarName,
        providerId: cal.providerId,
        providerEmail: cal.providerEmail,
        providerType: cal.providerType,
        color: cal.backgroundColor || CALENDAR_COLORS[index % CALENDAR_COLORS.length],
        enabled: savedEnabled[key] ?? true,
      });
    });
    setCalendarPrefs(newPrefs);

    // Group calendars by provider
    const groupsMap = new Map<string, ProviderGroup>();
    newPrefs.forEach((pref) => {
      if (!groupsMap.has(pref.providerId)) {
        groupsMap.set(pref.providerId, {
          providerId: pref.providerId,
          providerEmail: pref.providerEmail,
          providerType: pref.providerType,
          calendars: [],
          expanded: true,
        });
      }
      groupsMap.get(pref.providerId)!.calendars.push(pref);
    });
    setProviderGroups(Array.from(groupsMap.values()));
  }, [calendarsData, loadEnabledState]);

  // Refresh calendars list using TanStack Query refetch
  const loadCalendars = useCallback(async () => {
    await refetchCalendars();
  }, [refetchCalendars]);

  // Refresh calendars list when backend emits realtime calendar list updates
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCalendarsRefresh = () => {
      void refetchCalendars();
    };

    window.addEventListener('calendars:refresh', handleCalendarsRefresh as EventListener);
    return () => {
      window.removeEventListener('calendars:refresh', handleCalendarsRefresh as EventListener);
    };
  }, [refetchCalendars]);

  // Use TanStack Query for providers (follows frontend rules)
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

  // Load events (providers come from useProviders hook)
  const loadData = useCallback(
    async (triggerSync = false) => {
      try {
        setLoading(true);

        // Get providers from ref to avoid stale closure
        const loadedProviders = providersRef.current;

        // Trigger sync for all calendar providers if requested using TanStack Query mutation
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

        // Load calendars from API
        await loadCalendars();

        // Get date range from calendar (current view)
        let startTime: Date;
        let endTime: Date;

        if (calendarRef.current) {
          const calApi = calendarRef.current.getApi();
          const view = calApi.view;
          startTime = view.activeStart;
          endTime = view.activeEnd;
        } else {
          // Default to current month
          const now = new Date();
          startTime = new Date(now.getFullYear(), now.getMonth(), 1);
          endTime = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }

        // Load events from API using TanStack Query
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
    [loadCalendars, selectedProvider, setLoading, setStoreEvents, setLastSyncAt, syncProviderMutation, queryClient, calendarCopy.failedToLoadEvents]
  );

  // Initial data load - load events without triggering sync (faster UX)
  // Sync is triggered manually via refresh button
  useEffect(() => {
    void loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update calendar header on mount and view change
  useEffect(() => {
    updateCalendarHeader();
  }, [updateCalendarHeader]);

  // WebSocket event handlers - now also invalidates TanStack Query cache
  useEffect(() => {
    if (!websocketClient) return;

    // Handler for new calendar events
    const unsubscribeNew = websocketClient.onCalendarEventNew((event: RealtimeCalendarEvent) => {
      logger.debug('[Calendar] WebSocket new event received', { reason: event.reason });
      if (event.event) {
        addStoreEvent(event.event as CalendarEvent);
        // Also invalidate TanStack Query cache to keep it in sync
        void queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
      }
    });

    // Handler for updated calendar events
    const unsubscribeUpdate = websocketClient.onCalendarEventUpdate((event: RealtimeCalendarEvent) => {
      logger.debug('[Calendar] WebSocket update event received', { reason: event.reason });
      if (event.event && event.eventId) {
        updateStoreEvent(event.eventId, event.event as CalendarEvent);
        // Invalidate both event detail and events list
        void queryClient.invalidateQueries({ queryKey: calendarKeys.eventDetail(event.eventId) });
        void queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
      }
    });

    // Handler for deleted calendar events
    const unsubscribeDelete = websocketClient.onCalendarEventDelete((event: RealtimeCalendarEvent) => {
      logger.debug('[Calendar] WebSocket delete event received', { reason: event.reason });
      if (event.eventId) {
        deleteStoreEvent(event.eventId);
        // Remove from cache and invalidate lists
        queryClient.removeQueries({ queryKey: calendarKeys.eventDetail(event.eventId) });
        void queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
      }
    });

    // Handler for sync status updates
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

  // Navigation handlers
  const handlePrevMonth = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().prev();
      updateCalendarHeader();
    }
  }, [updateCalendarHeader]);

  const handleNextMonth = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().next();
      updateCalendarHeader();
    }
  }, [updateCalendarHeader]);

  const handleToday = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().today();
      updateCalendarHeader();
    }
  }, [updateCalendarHeader]);

  // Toggle calendar enabled/disabled
  const handleToggleCalendar = useCallback(
    (calendarId: string) => {
      setCalendarPrefs((prev) => {
        const newPrefs = new Map(prev);
        const existing = newPrefs.get(calendarId);
        if (existing) {
          newPrefs.set(calendarId, { ...existing, enabled: !existing.enabled });
        }
        saveEnabledState(newPrefs);
        return newPrefs;
      });
      setProviderGroups((prev) =>
        prev.map((group) => ({
          ...group,
          calendars: group.calendars.map((cal) =>
            cal.id === calendarId ? { ...cal, enabled: !cal.enabled } : cal
          ),
        }))
      );
    },
    [saveEnabledState]
  );

  // Toggle provider group expanded/collapsed
  const handleToggleProviderExpanded = useCallback((providerId: string) => {
    setProviderGroups((prev) =>
      prev.map((group) =>
        group.providerId === providerId ? { ...group, expanded: !group.expanded } : group
      )
    );
  }, []);

  // Color picker handlers
  const handleOpenColorPicker = useCallback((event: React.MouseEvent<HTMLElement>, calendarId: string) => {
    event.stopPropagation();
    setColorPickerAnchor(event.currentTarget);
    setColorPickerCalendarId(calendarId);
  }, []);

  const handleCloseColorPicker = useCallback(() => {
    setColorPickerAnchor(null);
    setColorPickerCalendarId(null);
  }, []);

  const handleColorSelect = useCallback(
    (calendarId: string, providerId: string, color: string) => {
      updateCalendarColor(calendarId, providerId, color);
    },
    [updateCalendarColor]
  );

  // Quick event creation
  const handleQuickEvent = useCallback(() => {
    if (!quickEventText.trim()) return;

    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
    const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour

    setNewEvent({
      title: quickEventText,
      start: start.toISOString().slice(0, 16),
      end: end.toISOString().slice(0, 16),
      calendar: 'primary',
      description: '',
    });
    setQuickEventText('');
    setEventDialogOpen(true);
  }, [quickEventText]);

  // Date selection handler
  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    const start = selectInfo.start;
    const end = selectInfo.end || new Date(start.getTime() + 60 * 60 * 1000);

    setNewEvent({
      title: '',
      start: start.toISOString().slice(0, 16),
      end: end.toISOString().slice(0, 16),
      calendar: 'primary',
      description: '',
    });
    setEventDialogOpen(true);
  }, []);

  // Event click handler using TanStack Query for data fetching
  const handleEventClick = useCallback(
    async (clickInfo: EventClickArg) => {
      const eventId = clickInfo.event.id;

      try {
        const event = await queryClient.fetchQuery(calendarEventDetailOptions(eventId));
        setSelectedEvent(event);
        setEditedEvent({
          title: event.title,
          description: event.description || '',
          location: event.location || '',
          start: new Date(event.startTime).toISOString().slice(0, 16),
          end: new Date(event.endTime).toISOString().slice(0, 16),
        });
        setEventDetailsOpen(true);

        // Load attachments using TanStack Query
        setLoadingAttachments(true);
        try {
          const attachmentsRes = await queryClient.fetchQuery(calendarEventAttachmentsOptions(eventId));
          setAttachments(attachmentsRes.attachments || []);
        } catch {
          setAttachments([]);
        } finally {
          setLoadingAttachments(false);
        }
      } catch (error) {
        logger.error('Failed to load event details', { error });
        setSnackbar({
          open: true,
          message: calendarCopy.failedToLoadEventDetails,
          severity: 'error',
        });
      }
    },
    [queryClient, calendarCopy.failedToLoadEventDetails]
  );

  // Handle event drag and drop
  const handleEventDrop = useCallback(
    async (info: EventDropArg) => {
      const { event, revert } = info;
      try {
        await updateEventMutation.mutateAsync({
          id: event.id,
          data: {
            startTime: event.start?.toISOString(),
            endTime: event.end?.toISOString(),
          },
        });
        setSnackbar({
          open: true,
          message: calendarCopy.eventMoved || 'Event moved',
          severity: 'success',
        });
        void loadData(false);
      } catch (error) {
        logger.error('Failed to move event', { error });
        revert();
        setSnackbar({
          open: true,
          message: calendarCopy.failedToMoveEvent || 'Failed to move event',
          severity: 'error',
        });
      }
    },
    [updateEventMutation, calendarCopy, loadData]
  );

  // Handle event resize
  const handleEventResize = useCallback(
    async (info: EventResizeDoneArg) => {
      const { event, revert } = info;
      try {
        await updateEventMutation.mutateAsync({
          id: event.id,
          data: {
            startTime: event.start?.toISOString(),
            endTime: event.end?.toISOString(),
          },
        });
        setSnackbar({
          open: true,
          message: calendarCopy.eventResized || 'Event resized',
          severity: 'success',
        });
        void loadData(false);
      } catch (error) {
        logger.error('Failed to resize event', { error });
        revert();
        setSnackbar({
          open: true,
          message: calendarCopy.failedToResizeEvent || 'Failed to resize event',
          severity: 'error',
        });
      }
    },
    [updateEventMutation, calendarCopy, loadData]
  );

  // Create event handler
  const handleCreateEvent = useCallback(async () => {
    // Validation
    const errors: EventFormErrors = {};
    if (!newEvent.title.trim()) {
      errors.title = calendarCopy.validation.titleRequired;
    }
    if (!newEvent.start) {
      errors.start = calendarCopy.validation.startRequired;
    }
    if (!newEvent.end) {
      errors.end = calendarCopy.validation.endRequired;
    }
    if (newEvent.start && newEvent.end && new Date(newEvent.start) >= new Date(newEvent.end)) {
      errors.end = calendarCopy.validation.endAfterStart;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      const firstProvider = providers.find((p) => p.supportsCalendar);
      if (!firstProvider) {
        setSnackbar({
          open: true,
          message: calendarCopy.noProviderAlert,
          severity: 'error',
        });
        return;
      }

      const createDto: CreateEventDto = {
        providerId: firstProvider.id,
        title: newEvent.title,
        startTime: new Date(newEvent.start).toISOString(),
        endTime: new Date(newEvent.end).toISOString(),
        description: newEvent.description,
        calendarId: newEvent.calendar,
        // Include recurrence if set
        ...(newEvent.recurrence &&
          newEvent.recurrence.length > 0 && { recurrence: newEvent.recurrence }),
        // Include reminders if set
        ...(newEvent.reminders && { reminders: newEvent.reminders }),
        // Include attendees if set
        ...(newEvent.attendees &&
          newEvent.attendees.length > 0 && {
            attendees: newEvent.attendees.map((a) => ({ email: a.email, name: a.name })),
          }),
      };

      await createEventMutation.mutateAsync(createDto);
      setSnackbar({
        open: true,
        message: calendarCopy.eventCreated,
        severity: 'success',
      });
      setEventDialogOpen(false);
      setFormErrors({});
      setNewEvent({
        title: '',
        start: '',
        end: '',
        calendar: 'primary',
        description: '',
        recurrence: undefined,
        reminders: undefined,
        attendees: undefined,
      });

      // Reload events
      void loadData(false);
    } catch (error) {
      logger.error('Failed to create event', { error });
      setSnackbar({
        open: true,
        message: calendarCopy.failedToCreateEvent,
        severity: 'error',
      });
    }
  }, [newEvent, providers, calendarCopy, loadData, createEventMutation]);

  // Update event handler
  const handleUpdateEvent = useCallback(async () => {
    if (!selectedEvent) return;

    // Validation
    const errors: EditFormErrors = {};
    if (!editedEvent.title.trim()) {
      errors.title = calendarCopy.validation.titleRequired;
    }
    if (!editedEvent.start) {
      errors.start = calendarCopy.validation.startRequired;
    }
    if (!editedEvent.end) {
      errors.end = calendarCopy.validation.endRequired;
    }

    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      const updateDto: UpdateEventDto = {
        title: editedEvent.title,
        description: editedEvent.description,
        location: editedEvent.location,
        startTime: new Date(editedEvent.start).toISOString(),
        endTime: new Date(editedEvent.end).toISOString(),
      };

      await updateEventMutation.mutateAsync({ id: selectedEvent.id, data: updateDto });
      setSnackbar({
        open: true,
        message: calendarCopy.eventUpdated,
        severity: 'success',
      });
      setEventDetailsOpen(false);
      setIsEditMode(false);
      setEditFormErrors({});

      // Reload events
      void loadData(false);
    } catch (error) {
      logger.error('Failed to update event', { error });
      setSnackbar({
        open: true,
        message: calendarCopy.failedToUpdateEvent,
        severity: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }, [selectedEvent, editedEvent, calendarCopy, loadData, updateEventMutation]);

  // Delete event handler
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return;

    setIsDeleting(true);
    try {
      await deleteEventMutation.mutateAsync(selectedEvent.id);
      setSnackbar({
        open: true,
        message: calendarCopy.eventDeleted,
        severity: 'success',
      });
      setEventDetailsOpen(false);
      setSelectedEvent(null);

      // Reload events
      void loadData(false);
    } catch (error) {
      logger.error('Failed to delete event', { error });
      setSnackbar({
        open: true,
        message: calendarCopy.failedToDeleteEvent,
        severity: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [selectedEvent, calendarCopy, loadData, deleteEventMutation]);

  // Close event details dialog
  const handleCloseEventDetails = useCallback(() => {
    setEventDetailsOpen(false);
    setIsEditMode(false);
    setSelectedEvent(null);
    setAttachments([]);
    setEditFormErrors({});
  }, []);

  // Download attachment handler
  const handleDownloadAttachment = useCallback((attachment: CalendarEventAttachment) => {
    if (attachment.fileUrl) {
      window.open(attachment.fileUrl, '_blank');
    }
  }, []);

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

  return (
    <Box
      sx={{
        height: 'calc(100vh - 64px)',
        display: 'flex',
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.background.default, 0.5),
      }}
    >
      {/* Desktop Sidebar */}
      <Paper
        sx={{
          width: 280,
          borderRadius: 0,
          borderRight: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          p: 2,
          bgcolor: alpha(theme.palette.background.paper, 0.7),
          backdropFilter: 'blur(20px)',
        }}
      >
        <CalendarSidebar
          quickEventText={quickEventText}
          onQuickEventTextChange={setQuickEventText}
          onQuickEvent={handleQuickEvent}
          onOpenEventDialog={() => setEventDialogOpen(true)}
          providerGroups={providerGroups}
          calendarPrefs={calendarPrefs}
          onToggleCalendar={handleToggleCalendar}
          onToggleProviderExpanded={handleToggleProviderExpanded}
          onColorSelect={handleColorSelect}
          colorPickerAnchor={colorPickerAnchor}
          colorPickerCalendarId={colorPickerCalendarId}
          onOpenColorPicker={handleOpenColorPicker}
          onCloseColorPicker={handleCloseColorPicker}
          eventCount={storeEvents.length}
          isLoading={loading}
        />
      </Paper>

      {/* Mobile Drawer */}
      <Drawer
        anchor="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        sx={{ display: { xs: 'block', md: 'none' } }}
        PaperProps={{
          sx: {
            width: 280,
            p: 2,
            bgcolor: alpha(theme.palette.background.paper, 0.95),
            backdropFilter: 'blur(20px)',
          },
        }}
      >
        <CalendarSidebar
          quickEventText={quickEventText}
          onQuickEventTextChange={setQuickEventText}
          onQuickEvent={handleQuickEvent}
          onOpenEventDialog={() => setEventDialogOpen(true)}
          providerGroups={providerGroups}
          calendarPrefs={calendarPrefs}
          onToggleCalendar={handleToggleCalendar}
          onToggleProviderExpanded={handleToggleProviderExpanded}
          onColorSelect={handleColorSelect}
          colorPickerAnchor={colorPickerAnchor}
          colorPickerCalendarId={colorPickerCalendarId}
          onOpenColorPicker={handleOpenColorPicker}
          onCloseColorPicker={handleCloseColorPicker}
          eventCount={storeEvents.length}
          isLoading={loading}
          onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
        />
      </Drawer>

      {/* Calendar Main */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <CalendarHeader
          currentMonth={currentMonth}
          currentYear={currentYear}
          viewType={viewType}
          onViewTypeChange={setViewType}
          onPrev={handlePrevMonth}
          onNext={handleNextMonth}
          onToday={handleToday}
          onRefresh={() => loadData(true)}
          isLoading={loading}
          isSyncing={isSyncing}
          onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
        />

        {/* Calendar Grid */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 3,
            position: 'relative',
            bgcolor: alpha(theme.palette.background.paper, 0.5),
            backdropFilter: 'blur(10px)',
          }}
        >
          {loading && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(theme.palette.background.paper, 0.5),
                backdropFilter: 'blur(4px)',
                zIndex: 10,
              }}
            >
              <CircularProgress />
            </Box>
          )}
          <Suspense
            fallback={
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* Calendar grid skeleton */}
                <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, flex: 1 }}>
                  {Array.from({ length: 35 }).map((_, i) => (
                    <Skeleton key={i} variant="rectangular" sx={{ borderRadius: 0.5, minHeight: 80 }} />
                  ))}
                </Box>
              </Box>
            }
          >
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={false}
              editable={true}
              selectable={true}
              selectMirror={true}
              dayMaxEvents={true}
              events={filteredEvents}
              select={handleDateSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              height="100%"
              eventDisplay="block"
              eventTimeFormat={{
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
              }}
              slotLabelFormat={{
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
              }}
              locales={calendarLocales}
              locale={calendarLocale}
              nowIndicator={true}
              navLinks={true}
              weekNumbers={true}
              weekNumberCalculation="ISO"
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              slotDuration="00:30:00"
              businessHours={{
                daysOfWeek: [1, 2, 3, 4, 5],
                startTime: '09:00',
                endTime: '18:00',
              }}
              eventResizableFromStart={true}
              eventDurationEditable={true}
              eventStartEditable={true}
              firstDay={1}
              weekends={true}
              fixedWeekCount={false}
              showNonCurrentDates={true}
              listDayFormat={{
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              }}
              listDaySideFormat={{
                weekday: 'long',
              }}
              allDaySlot={true}
              allDayText={calendarCopy.allDay}
              dayMaxEventRows={3}
              moreLinkClick="popover"
            />
          </Suspense>
        </Box>
      </Box>

      {/* Create Event Dialog */}
      <CalendarEventDialog
        open={eventDialogOpen}
        onClose={() => setEventDialogOpen(false)}
        newEvent={newEvent}
        onEventChange={setNewEvent}
        formErrors={formErrors}
        onFormErrorChange={setFormErrors}
        onCreate={handleCreateEvent}
        calendarPrefs={calendarPrefs}
      />

      {/* Event Details/Edit Dialog */}
      <CalendarEventDetail
        open={eventDetailsOpen}
        onClose={handleCloseEventDetails}
        selectedEvent={selectedEvent}
        isEditMode={isEditMode}
        onEditModeChange={setIsEditMode}
        editedEvent={editedEvent}
        onEditedEventChange={setEditedEvent}
        editFormErrors={editFormErrors}
        onFormErrorChange={setEditFormErrors}
        onUpdate={handleUpdateEvent}
        onDelete={handleDeleteEvent}
        isSaving={isSaving}
        isDeleting={isDeleting}
        attachments={attachments}
        loadingAttachments={loadingAttachments}
        onDownloadAttachment={handleDownloadAttachment}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MuiAlert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {snackbar.message}
        </MuiAlert>
      </Snackbar>
    </Box>
  );
}
