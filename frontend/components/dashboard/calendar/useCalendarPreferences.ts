import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import {
  useCalendars,
  useCreateCalendar,
  useDeleteCalendar,
  useUpdateCalendarPreferences,
} from '@/hooks/queries/use-calendar';
import {
  type CalendarPreference,
  type ProviderGroup,
} from '@/components/calendar';
import type { CalendarInfo } from '@/lib/api/calendar';
import { CALENDAR_COLORS, CALENDAR_PREFS_KEY } from './calendar-constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCalendarPreferences(calendarCopy: any) {
  const { data: calendarsData, refetch: refetchCalendars } = useCalendars();
  const createCalendarMutation = useCreateCalendar();
  const deleteCalendarMutation = useDeleteCalendar();
  const updatePreferencesMutation = useUpdateCalendarPreferences();

  const [calendarPrefs, setCalendarPrefs] = useState<Map<string, CalendarPreference>>(new Map());
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<HTMLElement | null>(null);
  const [colorPickerCalendarId, setColorPickerCalendarId] = useState<string | null>(null);

  const dispatchCalendarRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('calendars:refresh'));
  }, []);

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

  // Update calendar color via API
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

    const filteredCalendars = calendars.filter((cal: CalendarInfo) => {
      const isPrimaryCalendar = cal.calendarName === 'Primary Calendar' || cal.calendarId === 'primary';
      return !isPrimaryCalendar;
    });

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
        primary: cal.primary ?? false,
        removable: cal.removable ?? !(cal.primary ?? false),
      });
    });
    setCalendarPrefs(newPrefs);

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

  // Refresh calendars list
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

  const handleCreateCalendar = useCallback(
    async ({
      providerId,
      name,
      description,
      color,
    }: {
      providerId: string;
      name: string;
      description?: string;
      color?: string;
    }) => {
      try {
        await createCalendarMutation.mutateAsync({
          providerId,
          name,
          description,
          color,
        });
        setSnackbar({
          open: true,
          message: calendarCopy.calendarCreated,
          severity: 'success',
        });
        dispatchCalendarRefresh();
      } catch (error) {
        logger.error('Failed to create calendar', { error });
        setSnackbar({
          open: true,
          message: calendarCopy.failedToCreateCalendar,
          severity: 'error',
        });
        throw error;
      }
    },
    [calendarCopy, createCalendarMutation, dispatchCalendarRefresh]
  );

  const handleDeleteCalendar = useCallback(
    async (providerId: string, calendarId: string) => {
      try {
        await deleteCalendarMutation.mutateAsync({ providerId, calendarId });
        setSnackbar({
          open: true,
          message: calendarCopy.calendarDeleted,
          severity: 'success',
        });
        dispatchCalendarRefresh();
      } catch (error) {
        logger.error('Failed to delete calendar', { error });
        setSnackbar({
          open: true,
          message: calendarCopy.failedToDeleteCalendar,
          severity: 'error',
        });
        throw error;
      }
    },
    [calendarCopy, deleteCalendarMutation, dispatchCalendarRefresh]
  );

  // Snackbar state (shared with parent via return)
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  return {
    calendarPrefs,
    providerGroups,
    colorPickerAnchor,
    colorPickerCalendarId,
    snackbar,
    setSnackbar,
    loadCalendars,
    handleToggleCalendar,
    handleToggleProviderExpanded,
    handleOpenColorPicker,
    handleCloseColorPicker,
    handleColorSelect,
    handleCreateCalendar,
    handleDeleteCalendar,
  };
}
