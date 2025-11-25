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
} from 'lucide-react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventInput, DateSelectArg, EventClickArg } from '@fullcalendar/core';
import { useRouter } from 'next/router';
import { calendarApi, type CreateEventDto, type CalendarInfo } from '@/lib/api/calendar';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { allFullCalendarLocales, getFullCalendarLocale } from '@/locales';
import { useTranslations } from '@/lib/hooks/use-translations';
import { getStoredUserSettings } from '@/lib/utils/user-settings';
import { useCalendarStore, type CalendarEvent } from '@/stores/calendar-store';

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
  const calendarCopy = translations.dashboard.calendar;
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

  const updateCalendarHeader = useCallback(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      const date = calendarApi.getDate();
      setCurrentMonth(date.toLocaleDateString('en-US', { month: 'long' }));
      setCurrentYear(date.getFullYear().toString());
    }
  }, []);

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
    try {
      const saved = localStorage.getItem(CALENDAR_PREFS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, []);

  // Save enabled state to localStorage (UI preference)
  const saveEnabledState = useCallback((prefs: Map<string, CalendarPreference>) => {
    try {
      const toSave: Record<string, boolean> = {};
      prefs.forEach((pref, key) => {
        toSave[key] = pref.enabled;
      });
      localStorage.setItem(CALENDAR_PREFS_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('Failed to save calendar enabled state:', e);
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
      console.error('Failed to update calendar color:', error);
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
      console.warn('Failed to load calendars:', error);
    }
  }, [loadEnabledState]);

  // Load providers and events
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load providers (non-blocking - continue even if fails)
      try {
        const providersRes = await providersApi.getProviders();
        setProviders(providersRes || []);
      } catch (providerError) {
        console.warn('Failed to load providers for calendar:', providerError);
        setProviders([]);
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
      console.error('Failed to load calendar data:', error);
      setStoreEvents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProvider, setStoreEvents, setLoading, setLastSyncAt, loadCalendars]);

  useEffect(() => {
    updateCalendarHeader();
  }, [updateCalendarHeader]);

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

  // Load data only when selectedProvider changes or on mount
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

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

  const handleEventClick = (_clickInfo: EventClickArg) => {
    // Open event details dialog (planned)
  };

  const handleCreateEvent = async () => {
    if (!newEvent.title) return;

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
      console.error('Failed to create event:', error);
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
      console.error('Failed to create quick event:', error);
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
              onClick={loadData}
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
      <Dialog open={eventDialogOpen} onClose={() => setEventDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{calendarCopy.createEventDialogTitle}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              fullWidth
              label={calendarCopy.eventTitleLabel}
              value={newEvent.title}
              onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
            />
            <TextField
              fullWidth
              label={calendarCopy.startDateTime}
              type="datetime-local"
              value={newEvent.start}
              onChange={(e) => setNewEvent({ ...newEvent, start: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              label={calendarCopy.endDateTime}
              type="datetime-local"
              value={newEvent.end}
              onChange={(e) => setNewEvent({ ...newEvent, end: e.target.value })}
              InputLabelProps={{ shrink: true }}
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
          <Button onClick={() => setEventDialogOpen(false)}>{calendarCopy.cancelEvent}</Button>
          <Button variant="contained" onClick={handleCreateEvent}>
            {calendarCopy.saveEvent}
          </Button>
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
