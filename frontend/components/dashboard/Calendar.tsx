import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Snackbar,
  Alert as MuiAlert,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Popover,
  Drawer,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  RefreshCw,
  ChevronDown,
  Palette,
  Menu,
  Edit2,
  Trash2,
  MapPin,
  Clock,
  X,
  Paperclip,
  Download,
  FileText,
  Image as ImageIcon,
  File,
} from 'lucide-react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventInput, DateSelectArg, EventClickArg } from '@fullcalendar/core';
import { useRouter } from 'next/router';
import { logger } from '@/lib/logger';
import { calendarApi, type CreateEventDto, type CalendarInfo, type CalendarEvent as ApiCalendarEvent, type UpdateEventDto, type CalendarEventAttachment } from '@/lib/api/calendar';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { allFullCalendarLocales, getFullCalendarLocale } from '@/locales';
import { useTranslations } from '@/lib/hooks/use-translations';
import { getStoredUserSettings } from '@/lib/utils/user-settings';
import { useCalendarStore, type CalendarEvent } from '@/stores/calendar-store';
import { websocketClient, type RealtimeCalendarEvent, type RealtimeSyncStatus } from '@/lib/websocket-client';

interface CalendarPreference {
  id: string; // providerId:calendarId
  calendarId: string;
  calendarName: string;
  providerId: string;
  providerEmail: string;
  providerType: string;
  color: string;
  enabled: boolean;
}

interface ProviderGroup {
  providerId: string;
  providerEmail: string;
  providerType: string;
  calendars: CalendarPreference[];
  expanded: boolean;
}

// Color palette for calendars - defined outside component to avoid re-creation
const CALENDAR_COLORS = [
  '#0B7EFF', '#9C27B0', '#00C853', '#FF9800', '#E91E63',
  '#3F51B5', '#009688', '#795548', '#607D8B', '#FF5722',
];

// Local storage key for calendar preferences
const CALENDAR_PREFS_KEY = 'calendar-preferences';

export function Calendar() {
  const router = useRouter();
  const translations = useTranslations();
  const calendarCopy = translations.calendar;
  const calendarRef = useRef<FullCalendar>(null);
  const [currentMonth, setCurrentMonth] = useState('');
  const [currentYear, setCurrentYear] = useState('');
  const [viewType, setViewType] = useState<'day' | 'week' | 'month' | 'list'>('month');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProvider, _setSelectedProvider] = useState<string | undefined>();

  // Use calendar store for events and real-time updates
  // WebSocket events (calendar:event_new, calendar:event_update, calendar:event_delete)
  // automatically update the store via useWebSocket hook
  const {
    events: storeEvents,
    setEvents: setStoreEvents,
    isLoading: loading,
    setLoading,
    isSyncing,
    setLastSyncAt,
  } = useCalendarStore();

  // Calendar preferences and provider groups
  const [calendarPrefs, setCalendarPrefs] = useState<Map<string, CalendarPreference>>(new Map());
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<HTMLElement | null>(null);
  const [colorPickerCalendarId, setColorPickerCalendarId] = useState<string | null>(null);

  // Get the FullCalendar locale based on user settings, router locale, or browser locale
  // Supports English and Italian locales
  const calendarLocale = useMemo(() => {
    // Priority: 1. User settings, 2. Router locale, 3. Browser locale
    const userSettings = getStoredUserSettings();
    const userLanguage = userSettings.language; // e.g., 'en-US', 'it-IT'
    const browserLocale = typeof navigator !== 'undefined' ? navigator.language : 'en';
    const appLocale = userLanguage || router.locale || browserLocale;
    return getFullCalendarLocale(appLocale);
  }, [router.locale]);

  // All FullCalendar locales are available for the calendar
  const calendarLocales = useMemo(() => allFullCalendarLocales, []);

  const [quickEventText, setQuickEventText] = useState('');
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    start: '',
    end: '',
    calendar: 'work',
    description: '',
  });
  const [formErrors, setFormErrors] = useState<{
    title?: string;
    start?: string;
    end?: string;
    calendar?: string;
  }>({});
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
  const [editedEvent, setEditedEvent] = useState({
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
  const [editFormErrors, setEditFormErrors] = useState<{
    title?: string;
    start?: string;
    end?: string;
  }>({});

  const updateCalendarHeader = useCallback(() => {
    if (calendarRef.current) {
      const calApi = calendarRef.current.getApi();
      const date = calApi.getDate();
      // Use the proper locale for date formatting
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
  // Colors are stored in the database via the API
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

  // Update calendar color via API
  const updateCalendarColor = useCallback(async (calendarId: string, providerId: string, color: string) => {
    try {
      await calendarApi.updateCalendarPreferences(providerId, calendarId, { color });
      // Update local state
      setCalendarPrefs((prev) => {
        const newPrefs = new Map(prev);
        const key = `${providerId}:${calendarId}`;
        const existing = newPrefs.get(key);
        if (existing) {
          newPrefs.set(key, { ...existing, color });
        }
        return newPrefs;
      });
      // Update provider groups
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
        message: calendarCopy.colorUpdated || 'Color updated',
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to update calendar color', { error });
      setSnackbar({
        open: true,
        message: calendarCopy.failedToUpdateColor || 'Failed to update color',
        severity: 'error',
      });
    }
  }, [calendarCopy]);

  // Load calendars from API and merge with saved enabled state
  const loadCalendars = useCallback(async () => {
    try {
      const calendarsRes = await calendarApi.listCalendars();
      const calendars = calendarsRes.data.calendars || [];
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
    } catch (error) {
      logger.warn('Failed to load calendars', { error });
    }
  }, [loadEnabledState]);

  // Refresh calendars list when backend emits realtime calendar list updates
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCalendarsRefresh = () => {
      void loadCalendars();
    };

    window.addEventListener('calendars:refresh', handleCalendarsRefresh as EventListener);
    return () => {
      window.removeEventListener('calendars:refresh', handleCalendarsRefresh as EventListener);
    };
  }, [loadCalendars]);

  // Load providers and events
  // triggerSync: if true, sync from Google/Microsoft before loading from database
  const loadData = useCallback(async (triggerSync = false) => {
    try {
      setLoading(true);

      // Load providers (non-blocking - continue even if fails)
      let loadedProviders: ProviderConfig[] = [];
      try {
        const providersRes = await providersApi.getProviders();
        loadedProviders = providersRes || [];
        setProviders(loadedProviders);
      } catch (providerError) {
        logger.warn('Failed to load providers for calendar', { error: providerError });
        setProviders([]);
      }

      // Trigger sync for all calendar providers if requested
      // This syncs events from Google/Microsoft to our database
      if (triggerSync && loadedProviders.length > 0) {
        const calendarProviders = loadedProviders.filter(p => p.supportsCalendar);
        logger.debug('[Calendar] Syncing providers', { count: calendarProviders.length });

        // Sync all providers in parallel (non-blocking)
        const syncPromises = calendarProviders.map(async (provider) => {
          try {
            const result = await calendarApi.syncProvider(provider.id);
            logger.info(`[Calendar] Synced ${provider.email}`, { newEvents: result.data?.newEvents || 0, updatedEvents: result.data?.updatedEvents || 0 });
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
        const fcApi = calendarRef.current.getApi();
        const view = fcApi.view;
        startTime = view.activeStart;
        endTime = view.activeEnd;
      } else {
        // Default to current month
        const now = new Date();
        startTime = new Date(now.getFullYear(), now.getMonth(), 1);
        endTime = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }

      // Load events - if no provider selected, load from all providers
      const eventsRes = await calendarApi.listEvents({
        ...(selectedProvider && { providerId: selectedProvider }),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });

      // Update the store with events (real-time updates will also update the store)
      setStoreEvents(eventsRes.data.events || []);
      setLastSyncAt(new Date());
    } catch (error) {
      logger.error('Failed to load calendar data', { error });
      setStoreEvents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProvider, setStoreEvents, setLoading, setLastSyncAt, loadCalendars]);

  useEffect(() => {
    updateCalendarHeader();
  }, [updateCalendarHeader, calendarLocale]);

  useEffect(() => {
    if (!calendarRef.current) return;
    const calendarApi = calendarRef.current.getApi();
    const viewName =
      viewType === 'day'
        ? 'timeGridDay'
        : viewType === 'week'
          ? 'timeGridWeek'
          : viewType === 'list'
            ? 'listWeek'
            : 'dayGridMonth';
    calendarApi.changeView(viewName);
  }, [viewType]);

  // Keep selected event in sync with realtime updates/removals
  useEffect(() => {
    if (selectedEvent) {
      const updated = storeEvents.find((e) => e.id === selectedEvent.id);
      if (!updated) {
        setSelectedEvent(null);
      } else if (updated !== selectedEvent) {
        setSelectedEvent(updated);
      }
    }
  }, [storeEvents, selectedEvent]);

  // Load data when provider changes or on mount (do not auto-sync to avoid delay)
  useEffect(() => {
    loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  // WebSocket event handling for real-time calendar updates
  useEffect(() => {
    // Helper for retrying failed fetches
    const fetchWithRetry = async <T,>(
      fn: () => Promise<T>,
      retries = 2,
      delay = 1000
    ): Promise<T | null> => {
      for (let i = 0; i <= retries; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i === retries) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      return null;
    };

    const handleCalendarEventNew = async (event: RealtimeCalendarEvent) => {
      logger.debug('[Calendar] WebSocket: calendar:event_new', { event });
      if (event.eventId) {
        try {
          const calEvent = await fetchWithRetry(() => calendarApi.getEvent(event.eventId!));
          if (calEvent?.data) {
            useCalendarStore.getState().addEvent(calEvent.data);
          }
        } catch (error) {
          logger.error('Failed to fetch new calendar event after retries', { error });
          setSnackbar({
            open: true,
            message: 'Failed to load new calendar event. Try refreshing.',
            severity: 'warning',
          });
        }
      }
    };

    const handleCalendarEventUpdate = async (event: RealtimeCalendarEvent) => {
      logger.debug('[Calendar] WebSocket: calendar:event_update', { event });
      if (event.eventId) {
        try {
          const calEvent = await fetchWithRetry(() => calendarApi.getEvent(event.eventId!));
          if (calEvent?.data) {
            useCalendarStore.getState().updateEvent(event.eventId, calEvent.data);
          }
        } catch (error) {
          logger.error('Failed to fetch updated calendar event after retries', { error });
          setSnackbar({
            open: true,
            message: 'Failed to sync calendar update. Try refreshing.',
            severity: 'warning',
          });
        }
      }
    };

    const handleCalendarEventDelete = (event: RealtimeCalendarEvent) => {
      logger.debug('[Calendar] WebSocket: calendar:event_delete', { event });
      if (event.eventId) {
        useCalendarStore.getState().deleteEvent(event.eventId);
      }
    };

    const handleSyncStatus = (event: RealtimeSyncStatus) => {
      // Handle sync completion
      if (event.status === 'completed') {
        logger.info('[Calendar] WebSocket: sync completed', { providerId: event.providerId });
        useCalendarStore.getState().setSyncing(false);
        useCalendarStore.getState().setLastSyncAt(new Date());
      } else if (event.status === 'failed') {
        logger.error('[Calendar] WebSocket: sync failed', { providerId: event.providerId });
        useCalendarStore.getState().setSyncing(false);
        setSnackbar({
          open: true,
          message: event.error || 'Calendar sync failed',
          severity: 'error',
        });
      }
    };

    // Subscribe to events
    const unsubNew = websocketClient.onCalendarEventNew(handleCalendarEventNew);
    const unsubUpdate = websocketClient.onCalendarEventUpdate(handleCalendarEventUpdate);
    const unsubDelete = websocketClient.onCalendarEventDelete(handleCalendarEventDelete);
    const unsubSync = websocketClient.onSyncStatus(handleSyncStatus);

    return () => {
      unsubNew();
      unsubUpdate();
      unsubDelete();
      unsubSync();
    };
  }, []);

  const handlePrevMonth = () => {
    if (calendarRef.current) {
      calendarRef.current.getApi().prev();
      updateCalendarHeader();
      loadData(); // Reload events for new date range
    }
  };

  const handleNextMonth = () => {
    if (calendarRef.current) {
      calendarRef.current.getApi().next();
      updateCalendarHeader();
      loadData(); // Reload events for new date range
    }
  };

  const handleToday = () => {
    if (calendarRef.current) {
      calendarRef.current.getApi().today();
      updateCalendarHeader();
      loadData(); // Reload events for new date range
    }
  };

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    setNewEvent({
      title: '',
      start: selectInfo.startStr,
      end: selectInfo.endStr,
      calendar: 'work',
      description: '',
    });
    setEventDialogOpen(true);
  };

  const handleEventClick = async (clickInfo: EventClickArg) => {
    // Find the full event from store
    const eventId = clickInfo.event.id;
    const fullEvent = storeEvents.find(e => e.id === eventId);

    if (fullEvent) {
      setSelectedEvent(fullEvent);
      setEditedEvent({
        title: fullEvent.title,
        description: fullEvent.description || '',
        location: fullEvent.location || '',
        start: fullEvent.startTime.slice(0, 16), // Format for datetime-local input
        end: fullEvent.endTime.slice(0, 16),
      });
      setIsEditMode(false);
      setAttachments([]);
      setEventDetailsOpen(true);

      // Fetch attachments for this event
      setLoadingAttachments(true);
      try {
        const response = await calendarApi.listAttachments(fullEvent.id);
        setAttachments(response.data?.attachments || []);
      } catch (error) {
        logger.error('Failed to fetch attachments', { error });
        setAttachments([]);
      } finally {
        setLoadingAttachments(false);
      }
    }
  };

  const handleUpdateEvent = async () => {
    if (!selectedEvent) return;

    // Validate edit form
    const errors: typeof editFormErrors = {};

    if (!editedEvent.title.trim()) {
      errors.title = calendarCopy.validation?.titleRequired || 'Title is required';
    }
    if (!editedEvent.start) {
      errors.start = calendarCopy.validation?.startRequired || 'Start date/time is required';
    }
    if (!editedEvent.end) {
      errors.end = calendarCopy.validation?.endRequired || 'End date/time is required';
    }
    if (editedEvent.start && editedEvent.end && new Date(editedEvent.end) <= new Date(editedEvent.start)) {
      errors.end = calendarCopy.validation?.endAfterStart || 'End time must be after start time';
    }

    // Check for duplicate events (excluding current event)
    if (editedEvent.title.trim() && editedEvent.start && editedEvent.end) {
      const eventStart = new Date(editedEvent.start).getTime();
      const eventEnd = new Date(editedEvent.end).getTime();
      const titleLower = editedEvent.title.trim().toLowerCase();

      const duplicate = storeEvents.find(existingEvent => {
        // Skip the current event being edited
        if (existingEvent.id === selectedEvent.id) return false;

        const existingStart = new Date(existingEvent.startTime).getTime();
        const existingEnd = new Date(existingEvent.endTime).getTime();
        const existingTitle = existingEvent.title.toLowerCase();

        // Check if title matches and times overlap
        return existingTitle === titleLower &&
          eventStart < existingEnd &&
          eventEnd > existingStart;
      });

      if (duplicate) {
        errors.title = calendarCopy.validation?.duplicateEvent || 'An event with this title already exists at the same time';
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      const updateData: UpdateEventDto = {
        title: editedEvent.title,
        description: editedEvent.description,
        location: editedEvent.location,
        startTime: new Date(editedEvent.start).toISOString(),
        endTime: new Date(editedEvent.end).toISOString(),
      };

      // Optimistic update - update store immediately
      useCalendarStore.getState().updateEvent(selectedEvent.id, {
        ...selectedEvent,
        title: editedEvent.title,
        description: editedEvent.description,
        location: editedEvent.location,
        startTime: new Date(editedEvent.start).toISOString(),
        endTime: new Date(editedEvent.end).toISOString(),
      });

      // Then sync with server
      await calendarApi.updateEvent(selectedEvent.id, updateData);

      setEventDetailsOpen(false);
      setSelectedEvent(null);
      setIsEditMode(false);
      setEditFormErrors({});
      setSnackbar({
        open: true,
        message: calendarCopy.eventUpdated || 'Event updated successfully',
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to update event', { error });
      // Rollback on error - reload from server
      await loadData();
      setSnackbar({
        open: true,
        message: calendarCopy.failedToUpdateEvent || 'Failed to update event',
        severity: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;

    const eventToDelete = selectedEvent;
    setIsDeleting(true);
    try {
      // Optimistic delete - remove from store immediately
      useCalendarStore.getState().deleteEvent(eventToDelete.id);

      setEventDetailsOpen(false);
      setSelectedEvent(null);

      // Then sync with server
      await calendarApi.deleteEvent(eventToDelete.id);

      setSnackbar({
        open: true,
        message: calendarCopy.eventDeleted || 'Event deleted successfully',
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to delete event', { error });
      // Rollback on error - reload from server
      await loadData();
      setSnackbar({
        open: true,
        message: calendarCopy.failedToDeleteEvent || 'Failed to delete event',
        severity: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownloadAttachment = async (attachment: CalendarEventAttachment) => {
    if (!selectedEvent) return;

    try {
      // If there's a direct file URL (Google Drive, OneDrive), open it
      if (attachment.fileUrl) {
        window.open(attachment.fileUrl, '_blank');
        return;
      }

      // Otherwise, get the download URL from the API
      const response = await calendarApi.getAttachmentUrl(selectedEvent.id, attachment.id);
      if (response.data?.url) {
        window.open(response.data.url, '_blank');
      }
    } catch (error) {
      logger.error('Failed to download attachment', { error });
      setSnackbar({
        open: true,
        message: calendarCopy.failedToDownloadAttachment || 'Failed to download attachment',
        severity: 'error',
      });
    }
  };

  const getAttachmentIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon size={16} aria-hidden="true" focusable="false" />;
    } else if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) {
      return <FileText size={16} />;
    }
    return <File size={16} />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCloseEventDetails = () => {
    setEventDetailsOpen(false);
    setSelectedEvent(null);
    setIsEditMode(false);
    setEditFormErrors({});
  };

  const validateEventForm = (event: typeof newEvent, checkDuplicate = true): { isValid: boolean; errors: typeof formErrors } => {
    const errors: typeof formErrors = {};

    // Title is required
    if (!event.title.trim()) {
      errors.title = calendarCopy.validation?.titleRequired || 'Title is required';
    }

    // Start date/time is required
    if (!event.start) {
      errors.start = calendarCopy.validation?.startRequired || 'Start date/time is required';
    }

    // End date/time is required
    if (!event.end) {
      errors.end = calendarCopy.validation?.endRequired || 'End date/time is required';
    }

    // End time must be after start time
    if (event.start && event.end && new Date(event.end) <= new Date(event.start)) {
      errors.end = calendarCopy.validation?.endAfterStart || 'End time must be after start time';
    }

    // Check for duplicate events (same title and overlapping time)
    if (checkDuplicate && event.title.trim() && event.start && event.end) {
      const eventStart = new Date(event.start).getTime();
      const eventEnd = new Date(event.end).getTime();
      const titleLower = event.title.trim().toLowerCase();

      const duplicate = storeEvents.find(existingEvent => {
        const existingStart = new Date(existingEvent.startTime).getTime();
        const existingEnd = new Date(existingEvent.endTime).getTime();
        const existingTitle = existingEvent.title.toLowerCase();

        // Check if title matches and times overlap
        return existingTitle === titleLower &&
          eventStart < existingEnd &&
          eventEnd > existingStart;
      });

      if (duplicate) {
        errors.title = calendarCopy.validation?.duplicateEvent || 'An event with this title already exists at the same time';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  };

  const handleCreateEvent = async () => {
    // Validate form
    const validation = validateEventForm(newEvent);
    setFormErrors(validation.errors);

    if (!validation.isValid) {
      return;
    }

    // Get first calendar provider (or use selected provider)
    const provider = selectedProvider
      ? providers.find(p => p.id === selectedProvider)
      : providers.find(p => p.supportsCalendar);

    if (!provider) {
      setSnackbar({
        open: true,
        message: calendarCopy.noProviderAlert,
        severity: 'warning',
      });
      return;
    }

    try {
      const eventData: CreateEventDto = {
        providerId: provider.id,
        title: newEvent.title,
        description: newEvent.description,
        startTime: newEvent.start,
        endTime: newEvent.end || newEvent.start,
        isAllDay: false,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        calendarName: newEvent.calendar,
      };

      await calendarApi.createEvent(eventData);

      // Reload events from backend
      await loadData();

      setEventDialogOpen(false);
      setFormErrors({});
      setNewEvent({
        title: '',
        start: '',
        end: '',
        calendar: 'work',
        description: '',
      });
      setSnackbar({
        open: true,
        message: `${calendarCopy.saveEvent} ✓`,
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to create event', { error });
      setSnackbar({
        open: true,
        message: calendarCopy.failedToCreateEvent,
        severity: 'error',
      });
    }
  };

  const handleQuickEvent = async () => {
    if (!quickEventText.trim()) return;

    const provider = selectedProvider
      ? providers.find((p) => p.id === selectedProvider)
      : providers.find((p) => p.supportsCalendar);

    if (!provider) {
      setSnackbar({
        open: true,
        message: calendarCopy.noProviderAlert,
        severity: 'warning',
      });
      return;
    }

    try {
      const start = new Date();
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      await calendarApi.createEvent({
        providerId: provider.id,
        title: quickEventText.trim(),
        description: '',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        isAllDay: false,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setQuickEventText('');
      await loadData();
      setSnackbar({
        open: true,
        message: `${calendarCopy.saveEvent} ✓`,
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to create quick event', { error });
      setSnackbar({
        open: true,
        message: calendarCopy.failedToCreateQuickEvent,
        severity: 'error',
      });
    }
  };

  // Toggle calendar visibility
  const handleToggleCalendar = useCallback((calendarKey: string) => {
    setCalendarPrefs((prev) => {
      const newPrefs = new Map(prev);
      const existing = newPrefs.get(calendarKey);
      if (existing) {
        newPrefs.set(calendarKey, { ...existing, enabled: !existing.enabled });
      }
      // Save enabled state to localStorage
      saveEnabledState(newPrefs);
      return newPrefs;
    });
    // Update provider groups
    setProviderGroups((prev) =>
      prev.map((group) => ({
        ...group,
        calendars: group.calendars.map((cal) =>
          cal.id === calendarKey ? { ...cal, enabled: !cal.enabled } : cal
        ),
      }))
    );
  }, [saveEnabledState]);

  // Toggle provider group expansion
  const handleToggleProviderExpanded = useCallback((providerId: string) => {
    setProviderGroups((prev) =>
      prev.map((group) =>
        group.providerId === providerId
          ? { ...group, expanded: !group.expanded }
          : group
      )
    );
  }, []);

  // Open color picker
  const handleOpenColorPicker = useCallback((event: React.MouseEvent<HTMLElement>, calendarId: string) => {
    event.stopPropagation();
    setColorPickerAnchor(event.currentTarget);
    setColorPickerCalendarId(calendarId);
  }, []);

  // Close color picker
  const handleCloseColorPicker = useCallback(() => {
    setColorPickerAnchor(null);
    setColorPickerCalendarId(null);
  }, []);

  // Handle color selection
  const handleColorSelect = useCallback((color: string) => {
    if (colorPickerCalendarId) {
      const pref = calendarPrefs.get(colorPickerCalendarId);
      if (pref) {
        updateCalendarColor(pref.calendarId, pref.providerId, color);
      }
    }
    handleCloseColorPicker();
  }, [colorPickerCalendarId, calendarPrefs, updateCalendarColor, handleCloseColorPicker]);

  // Convert store events to FullCalendar format and filter by enabled calendars
  const filteredEvents = useMemo(() => {
    return storeEvents
      .filter((event) => {
        // Filter out deleted/cancelled events
        if (event.isDeleted || event.isCancelled) return false;
        // Filter by enabled calendars
        const calendarKey = `${event.providerId}:${event.calendarId || 'primary'}`;
        const pref = calendarPrefs.get(calendarKey);
        return pref?.enabled !== false;
      })
      .map(convertToFullCalendarEvent);
  }, [storeEvents, calendarPrefs, convertToFullCalendarEvent]);

  // Sidebar content - reused for desktop and mobile drawer
  const renderSidebarContent = () => (
    <>
      {/* Quick Event Input */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={calendarCopy.quickEventPlaceholder}
          value={quickEventText}
          onChange={(e) => setQuickEventText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleQuickEvent()}
          sx={{ mb: 1 }}
        />
        <Button
          fullWidth
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => {
            setEventDialogOpen(true);
            setMobileDrawerOpen(false);
          }}
        >
          {calendarCopy.createEvent}
        </Button>
      </Box>

      {/* Calendars - Grouped by Provider */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {calendarCopy.filterTitle || 'My Calendars'}
      </Typography>
      <Box sx={{ mb: 2, overflow: 'auto', flex: 1 }}>
        {providerGroups.map((group) => (
          <Accordion
            key={group.providerId}
            expanded={group.expanded}
            onChange={() => handleToggleProviderExpanded(group.providerId)}
            disableGutters
            elevation={0}
            sx={{
              '&:before': { display: 'none' },
              bgcolor: 'transparent',
            }}
          >
            <AccordionSummary
              expandIcon={<ChevronDown size={16} />}
              sx={{
                minHeight: 36,
                px: 0,
                '& .MuiAccordionSummary-content': { my: 0.5 },
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {group.providerEmail}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <List disablePadding>
                {group.calendars.map((cal) => (
                  <ListItem
                    key={cal.id}
                    disablePadding
                    sx={{ mb: 0.25 }}
                    secondaryAction={
                      <Tooltip title="Change color">
                        <IconButton
                          size="small"
                          onClick={(e) => handleOpenColorPicker(e, cal.id)}
                          sx={{ p: 0.5 }}
                        >
                          <Palette size={14} />
                        </IconButton>
                      </Tooltip>
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Checkbox
                        size="small"
                        checked={cal.enabled}
                        onChange={() => handleToggleCalendar(cal.id)}
                        sx={{
                          color: cal.color,
                          '&.Mui-checked': { color: cal.color },
                          p: 0.5,
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={cal.calendarName}
                      primaryTypographyProps={{ fontSize: '0.8125rem', noWrap: true }}
                    />
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        ))}
        {providerGroups.length === 0 && !loading && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', p: 1 }}>
            {calendarCopy.noProviders || 'No calendars found. Add a provider in Settings.'}
          </Typography>
        )}
      </Box>

      {/* AI Assistant - Only show if there are events */}
      {storeEvents.length > 5 && (
        <Box
          sx={{
            mt: 'auto',
            p: 2,
            borderRadius: 2,
            bgcolor: 'primary.main',
            color: 'white',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Sparkles size={20} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {calendarCopy.aiInsightsTitle}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ fontSize: '0.75rem', mb: 1.5, opacity: 0.9 }}>
            {calendarCopy.aiOptimizeMessage.replace('{count}', storeEvents.length.toString())}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              sx={{
                bgcolor: 'white',
                color: 'primary.main',
                '&:hover': { bgcolor: 'grey.100' },
              }}
              onClick={() => router.push('/dashboard/ai')}
            >
              {calendarCopy.openAiAssistant}
            </Button>
          </Box>
        </Box>
      )}
      {storeEvents.length === 0 && !loading && (
        <Box
          sx={{
            mt: 'auto',
            p: 2,
            borderRadius: 2,
            bgcolor: 'action.hover',
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {calendarCopy.noEventsMessage}
          </Typography>
        </Box>
      )}
    </>
  );

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', overflow: 'hidden' }}>
      {/* Desktop Sidebar */}
      <Paper
        sx={{
          width: 280,
          borderRadius: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          p: 2,
        }}
      >
        {renderSidebarContent()}
      </Paper>

      {/* Mobile Drawer */}
      <Drawer
        anchor="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        sx={{ display: { xs: 'block', md: 'none' } }}
        slotProps={{
          paper: { sx: { width: 280, p: 2 } },
        }}
      >
        {renderSidebarContent()}
      </Drawer>

      {/* Color Picker Popover - must be outside sidebar to work with both desktop and mobile */}
      <Popover
        open={Boolean(colorPickerAnchor)}
        anchorEl={colorPickerAnchor}
        onClose={handleCloseColorPicker}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 160 }}>
          {CALENDAR_COLORS.map((color) => (
            <Box
              key={color}
              onClick={() => handleColorSelect(color)}
              sx={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                bgcolor: color,
                cursor: 'pointer',
                border: '2px solid transparent',
                '&:hover': { border: '2px solid', borderColor: 'primary.main' },
              }}
            />
          ))}
        </Box>
      </Popover>

      {/* Calendar Main */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {/* Hamburger menu for mobile */}
          <IconButton
            size="small"
            onClick={() => setMobileDrawerOpen(true)}
            sx={{ display: { xs: 'flex', md: 'none' } }}
          >
            <Menu size={20} />
          </IconButton>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {currentMonth} {currentYear}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton size="small" onClick={handlePrevMonth}>
              <ChevronLeft size={20} />
            </IconButton>
            <IconButton size="small" onClick={handleNextMonth}>
              <ChevronRight size={20} />
            </IconButton>
          </Box>
          <Button variant="outlined" size="small" onClick={handleToday}>
            {calendarCopy.today}
          </Button>

          <Tooltip title={calendarCopy.refreshTooltip}>
            <IconButton
              size="small"
              onClick={() => loadData(true)}
              disabled={loading || isSyncing}
              sx={{ ml: 1 }}
            >
              <RefreshCw
                size={18}
                className={loading || isSyncing ? 'animate-spin' : ''}
              />
            </IconButton>
          </Tooltip>

          <Box sx={{ flex: 1 }} />

          <ToggleButtonGroup
            value={viewType}
            exclusive
            onChange={(_, newView) => newView && setViewType(newView)}
            size="small"
          >
            <ToggleButton value="day">{calendarCopy.day}</ToggleButton>
            <ToggleButton value="week">{calendarCopy.week}</ToggleButton>
            <ToggleButton value="month">{calendarCopy.month}</ToggleButton>
            <ToggleButton value="list">{calendarCopy.list}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Calendar Grid */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3, position: 'relative' }}>
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
                bgcolor: 'rgba(0, 0, 0, 0.05)',
                zIndex: 10,
              }}
            >
              <CircularProgress />
            </Box>
          )}
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
            height="100%"
            eventDisplay="block"
            // Time formatting
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
            // Locales - all 70+ FullCalendar locales available
            locales={calendarLocales}
            locale={calendarLocale}
            // Navigation and display
            nowIndicator={true}
            navLinks={true}
            weekNumbers={true}
            weekNumberCalculation="ISO"
            // Time grid settings
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            // Business hours (can be customized)
            businessHours={{
              daysOfWeek: [1, 2, 3, 4, 5], // Monday - Friday
              startTime: '09:00',
              endTime: '18:00',
            }}
            // Drag and drop / resize
            eventResizableFromStart={true}
            eventDurationEditable={true}
            eventStartEditable={true}
            // Date/time settings
            firstDay={1} // Monday as first day of week
            weekends={true}
            fixedWeekCount={false}
            showNonCurrentDates={true}
            // List view settings
            listDayFormat={{
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            }}
            listDaySideFormat={{
              weekday: 'long',
            }}
            // All-day settings
            allDaySlot={true}
            allDayText={calendarLocale === 'it' ? 'Tutto il giorno' : 'All day'}
            // Multi-month/day settings
            dayMaxEventRows={3}
            moreLinkClick="popover"
          />
        </Box>
      </Box>

      {/* Create Event Dialog */}
      <Dialog open={eventDialogOpen} onClose={() => { setEventDialogOpen(false); setFormErrors({}); }} maxWidth="sm" fullWidth>
        <DialogTitle>{calendarCopy.createEventDialogTitle}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              fullWidth
              label={calendarCopy.eventTitleLabel}
              value={newEvent.title}
              onChange={(e) => {
                setNewEvent({ ...newEvent, title: e.target.value });
                if (formErrors.title) setFormErrors({ ...formErrors, title: undefined });
              }}
              error={!!formErrors.title}
              helperText={formErrors.title}
              required
            />
            <TextField
              fullWidth
              label={calendarCopy.startDateTime}
              type="datetime-local"
              value={newEvent.start}
              onChange={(e) => {
                setNewEvent({ ...newEvent, start: e.target.value });
                if (formErrors.start) setFormErrors({ ...formErrors, start: undefined });
              }}
              InputLabelProps={{ shrink: true }}
              error={!!formErrors.start}
              helperText={formErrors.start}
              required
            />
            <TextField
              fullWidth
              label={calendarCopy.endDateTime}
              type="datetime-local"
              value={newEvent.end}
              onChange={(e) => {
                setNewEvent({ ...newEvent, end: e.target.value });
                if (formErrors.end) setFormErrors({ ...formErrors, end: undefined });
              }}
              InputLabelProps={{ shrink: true }}
              error={!!formErrors.end}
              helperText={formErrors.end}
              required
            />
            <FormControl fullWidth>
              <InputLabel>{calendarCopy.calendarLabel}</InputLabel>
              <Select
                value={newEvent.calendar}
                onChange={(e) => setNewEvent({ ...newEvent, calendar: e.target.value })}
                label={calendarCopy.calendarLabel}
              >
                {Array.from(calendarPrefs.values()).map((cal) => (
                  <MenuItem key={cal.id} value={cal.calendarId}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: cal.color,
                        }}
                      />
                      {cal.calendarName}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label={calendarCopy.eventDescription}
              multiline
              rows={3}
              value={newEvent.description}
              onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEventDialogOpen(false); setFormErrors({}); }}>{calendarCopy.cancelEvent}</Button>
          <Button variant="contained" onClick={handleCreateEvent}>
            {calendarCopy.saveEvent}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Event Details/Edit Dialog */}
      <Dialog
        open={eventDetailsOpen}
        onClose={handleCloseEventDetails}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {isEditMode ? (calendarCopy.editEvent || 'Edit Event') : (calendarCopy.eventDetails || 'Event Details')}
          <Box>
            {!isEditMode && (
              <>
                <IconButton size="small" onClick={() => setIsEditMode(true)} sx={{ mr: 0.5 }}>
                  <Edit2 size={18} />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={handleDeleteEvent}
                  disabled={isDeleting}
                >
                  <Trash2 size={18} />
                </IconButton>
              </>
            )}
            <IconButton size="small" onClick={handleCloseEventDetails} sx={{ ml: 1 }}>
              <X size={18} />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedEvent && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              {isEditMode ? (
                <>
                  <TextField
                    fullWidth
                    label={calendarCopy.eventTitleLabel}
                    value={editedEvent.title}
                    onChange={(e) => {
                      setEditedEvent({ ...editedEvent, title: e.target.value });
                      if (editFormErrors.title) setEditFormErrors({ ...editFormErrors, title: undefined });
                    }}
                    required
                    error={!!editFormErrors.title}
                    helperText={editFormErrors.title}
                  />
                  <TextField
                    fullWidth
                    label={calendarCopy.startDateTime}
                    type="datetime-local"
                    value={editedEvent.start}
                    onChange={(e) => {
                      setEditedEvent({ ...editedEvent, start: e.target.value });
                      if (editFormErrors.start) setEditFormErrors({ ...editFormErrors, start: undefined });
                    }}
                    slotProps={{ inputLabel: { shrink: true } }}
                    required
                    error={!!editFormErrors.start}
                    helperText={editFormErrors.start}
                  />
                  <TextField
                    fullWidth
                    label={calendarCopy.endDateTime}
                    type="datetime-local"
                    value={editedEvent.end}
                    onChange={(e) => {
                      setEditedEvent({ ...editedEvent, end: e.target.value });
                      if (editFormErrors.end) setEditFormErrors({ ...editFormErrors, end: undefined });
                    }}
                    slotProps={{ inputLabel: { shrink: true } }}
                    required
                    error={!!editFormErrors.end}
                    helperText={editFormErrors.end}
                  />
                  <TextField
                    fullWidth
                    label={calendarCopy.location}
                    value={editedEvent.location}
                    onChange={(e) => setEditedEvent({ ...editedEvent, location: e.target.value })}
                  />
                  <TextField
                    fullWidth
                    label={calendarCopy.eventDescription}
                    multiline
                    rows={3}
                    value={editedEvent.description}
                    onChange={(e) => setEditedEvent({ ...editedEvent, description: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <Typography variant="h6">{selectedEvent.title}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                    <Clock size={16} />
                    <Typography variant="body2">
                      {new Date(selectedEvent.startTime).toLocaleString()} - {new Date(selectedEvent.endTime).toLocaleString()}
                    </Typography>
                  </Box>
                  {selectedEvent.location && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                      <MapPin size={16} />
                      <Typography variant="body2">{selectedEvent.location}</Typography>
                    </Box>
                  )}
                  {selectedEvent.description && (
                    <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                      {selectedEvent.description}
                    </Typography>
                  )}
                  {selectedEvent.calendarName && (
                    <Typography variant="caption" color="text.secondary">
                      {calendarCopy.calendarLabel}: {selectedEvent.calendarName}
                    </Typography>
                  )}

                  {/* Attachments section */}
                  {(attachments.length > 0 || loadingAttachments) && (
                    <Box sx={{ mt: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Paperclip size={16} />
                        <Typography variant="subtitle2">
                          {calendarCopy.attachments} ({attachments.length})
                        </Typography>
                      </Box>
                      {loadingAttachments ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                          <CircularProgress size={20} />
                        </Box>
                      ) : (
                        <List dense sx={{ py: 0 }}>
                          {attachments.map((attachment) => (
                            <ListItem
                              key={attachment.id}
                              sx={{
                                px: 1,
                                borderRadius: 1,
                                '&:hover': { bgcolor: 'action.hover' },
                              }}
                              secondaryAction={
                                <IconButton
                                  edge="end"
                                  size="small"
                                  onClick={() => handleDownloadAttachment(attachment)}
                                  title={calendarCopy.download}
                                >
                                  <Download size={16} />
                                </IconButton>
                              }
                            >
                              <ListItemIcon sx={{ minWidth: 32 }}>
                                {getAttachmentIcon(attachment.mimeType)}
                              </ListItemIcon>
                              <ListItemText
                                primary={attachment.filename}
                                secondary={formatFileSize(attachment.size)}
                                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                                secondaryTypographyProps={{ variant: 'caption' }}
                              />
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </Box>
                  )}
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {isEditMode ? (
            <>
              <Button onClick={() => { setIsEditMode(false); setEditFormErrors({}); }}>{calendarCopy.cancelEvent}</Button>
              <Button
                variant="contained"
                onClick={handleUpdateEvent}
                disabled={isSaving}
              >
                {isSaving ? <CircularProgress size={20} /> : (calendarCopy.saveEvent)}
              </Button>
            </>
          ) : (
            <Button onClick={handleCloseEventDetails}>{calendarCopy.close}</Button>
          )}
        </DialogActions>
      </Dialog>

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
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </MuiAlert>
      </Snackbar>
    </Box>
  );
}
