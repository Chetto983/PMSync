import { useState, useCallback, useEffect, useMemo } from 'react';
import type { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { logger } from '@/lib/logger';
import {
  type CreateEventDto,
  type UpdateEventDto,
  type CalendarEvent as ApiCalendarEvent,
  type CalendarEventAttachment,
} from '@/lib/api/calendar';
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
  calendarEventDetailOptions,
  calendarEventAttachmentsOptions,
} from '@/hooks/queries/use-calendar';
import type {
  NewEventData,
  EventFormErrors,
  EditedEventData,
  EditFormErrors,
  CalendarPreference,
} from '@/components/calendar';
import type { useCalendarData } from './useCalendarData';
import {
  getDefaultCalendarSelection,
  resolveSelectedCalendarPreference,
} from './calendar-event-form';
import { formatDateTimeLocalInput } from './calendar-date-time';

type CalendarData = ReturnType<typeof useCalendarData>;
interface CalendarCopy {
  failedToLoadEventDetails?: string;
  eventMoved?: string;
  failedToMoveEvent?: string;
  eventResized?: string;
  failedToResizeEvent?: string;
  noProviderAlert?: string;
  eventCreated?: string;
  failedToCreateEvent?: string;
  eventUpdated?: string;
  failedToUpdateEvent?: string;
  eventDeleted?: string;
  failedToDeleteEvent?: string;
  validation: {
    titleRequired: string;
    startRequired: string;
    endRequired: string;
    calendarRequired?: string;
    endAfterStart: string;
  };
}

export function useCalendarHandlers(
  data: CalendarData,
  calendarPrefs: Map<string, CalendarPreference>,
  calendarCopy: CalendarCopy,
  setSnackbar: (s: { open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }) => void,
) {
  const {
    calendarRef,
    updateCalendarHeader,
    loadData,
    queryClient,
  } = data;

  const createEventMutation = useCreateCalendarEvent();
  const updateEventMutation = useUpdateCalendarEvent();
  const deleteEventMutation = useDeleteCalendarEvent();
  const failedToLoadEventDetailsMessage =
    calendarCopy.failedToLoadEventDetails || 'Failed to load event details';
  const eventCreatedMessage = calendarCopy.eventCreated || 'Event created';
  const failedToCreateEventMessage =
    calendarCopy.failedToCreateEvent || 'Failed to create event';
  const eventUpdatedMessage = calendarCopy.eventUpdated || 'Event updated';
  const failedToUpdateEventMessage =
    calendarCopy.failedToUpdateEvent || 'Failed to update event';
  const eventDeletedMessage = calendarCopy.eventDeleted || 'Event deleted';
  const failedToDeleteEventMessage =
    calendarCopy.failedToDeleteEvent || 'Failed to delete event';
  const noProviderAlertMessage =
    calendarCopy.noProviderAlert || 'Please select a provider';
  const defaultCalendarSelection = useMemo(
    () => getDefaultCalendarSelection(calendarPrefs),
    [calendarPrefs],
  );

  // Quick event state
  const [quickEventText, setQuickEventText] = useState('');
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<NewEventData>({
    title: '',
    start: '',
    end: '',
    calendar: '',
    description: '',
  });
  const [formErrors, setFormErrors] = useState<EventFormErrors>({});

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

  useEffect(() => {
    if (!defaultCalendarSelection) return;

    setNewEvent((prev) => {
      const selectedCalendar = resolveSelectedCalendarPreference(calendarPrefs, prev.calendar);
      if (selectedCalendar?.id === prev.calendar) {
        return prev;
      }

      return {
        ...prev,
        calendar: selectedCalendar?.id ?? defaultCalendarSelection,
      };
    });
  }, [calendarPrefs, defaultCalendarSelection]);

  // Navigation handlers
  const handlePrevMonth = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().prev();
      updateCalendarHeader();
    }
  }, [calendarRef, updateCalendarHeader]);

  const handleNextMonth = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().next();
      updateCalendarHeader();
    }
  }, [calendarRef, updateCalendarHeader]);

  const handleToday = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().today();
      updateCalendarHeader();
    }
  }, [calendarRef, updateCalendarHeader]);

  // Quick event creation
  const handleQuickEvent = useCallback(() => {
    if (!quickEventText.trim()) return;

    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    setNewEvent({
      title: quickEventText,
      start: formatDateTimeLocalInput(start),
      end: formatDateTimeLocalInput(end),
      calendar: defaultCalendarSelection,
      description: '',
    });
    setQuickEventText('');
    setEventDialogOpen(true);
  }, [defaultCalendarSelection, quickEventText]);

  // Date selection handler
  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    const start = selectInfo.start;
    const end = selectInfo.end || new Date(start.getTime() + 60 * 60 * 1000);

    setNewEvent({
      title: '',
      start: formatDateTimeLocalInput(start),
      end: formatDateTimeLocalInput(end),
      calendar: defaultCalendarSelection,
      description: '',
    });
    setEventDialogOpen(true);
  }, [defaultCalendarSelection]);

  // Event click handler
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
          start: formatDateTimeLocalInput(event.startTime),
          end: formatDateTimeLocalInput(event.endTime),
        });
        setEventDetailsOpen(true);

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
          message: failedToLoadEventDetailsMessage,
          severity: 'error',
        });
      }
    },
    [failedToLoadEventDetailsMessage, queryClient, setSnackbar]
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
    [updateEventMutation, calendarCopy, loadData, setSnackbar]
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
    [updateEventMutation, calendarCopy, loadData, setSnackbar]
  );

  // Create event handler
  const handleCreateEvent = useCallback(async () => {
    const errors: EventFormErrors = {};
    if (!newEvent.title.trim()) errors.title = calendarCopy.validation.titleRequired;
    if (!newEvent.start) errors.start = calendarCopy.validation.startRequired;
    if (!newEvent.end) errors.end = calendarCopy.validation.endRequired;
    const selectedCalendar = resolveSelectedCalendarPreference(calendarPrefs, newEvent.calendar);
    if (!selectedCalendar) {
      errors.calendar =
        calendarCopy.validation.calendarRequired ?? noProviderAlertMessage;
    }
    if (newEvent.start && newEvent.end && new Date(newEvent.start) >= new Date(newEvent.end)) {
      errors.end = calendarCopy.validation.endAfterStart;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      if (!selectedCalendar) {
        setSnackbar({ open: true, message: noProviderAlertMessage, severity: 'error' });
        return;
      }

      const createDto: CreateEventDto = {
        providerId: selectedCalendar.providerId,
        title: newEvent.title,
        startTime: new Date(newEvent.start).toISOString(),
        endTime: new Date(newEvent.end).toISOString(),
        description: newEvent.description,
        calendarId: selectedCalendar.calendarId,
        calendarName: selectedCalendar.calendarName,
        ...(newEvent.recurrence && newEvent.recurrence.length > 0 && { recurrence: newEvent.recurrence }),
        ...(newEvent.reminders && { reminders: newEvent.reminders }),
        ...(newEvent.attendees && newEvent.attendees.length > 0 && {
          attendees: newEvent.attendees.map((a) => ({ email: a.email, name: a.name })),
        }),
      };

      await createEventMutation.mutateAsync(createDto);
      setSnackbar({ open: true, message: eventCreatedMessage, severity: 'success' });
      setEventDialogOpen(false);
      setFormErrors({});
      setNewEvent({
        title: '', start: '', end: '', calendar: defaultCalendarSelection, description: '',
        recurrence: undefined, reminders: undefined, attendees: undefined,
      });
      void loadData(false);
    } catch (error) {
      logger.error('Failed to create event', { error });
      setSnackbar({ open: true, message: failedToCreateEventMessage, severity: 'error' });
    }
  }, [
    calendarPrefs,
    calendarCopy,
    createEventMutation,
    defaultCalendarSelection,
    eventCreatedMessage,
    failedToCreateEventMessage,
    loadData,
    newEvent,
    noProviderAlertMessage,
    setSnackbar,
  ]);

  // Update event handler
  const handleUpdateEvent = useCallback(async () => {
    if (!selectedEvent) return;

    const errors: EditFormErrors = {};
    if (!editedEvent.title.trim()) errors.title = calendarCopy.validation.titleRequired;
    if (!editedEvent.start) errors.start = calendarCopy.validation.startRequired;
    if (!editedEvent.end) errors.end = calendarCopy.validation.endRequired;

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
      setSnackbar({ open: true, message: eventUpdatedMessage, severity: 'success' });
      setEventDetailsOpen(false);
      setIsEditMode(false);
      setEditFormErrors({});
      void loadData(false);
    } catch (error) {
      logger.error('Failed to update event', { error });
      setSnackbar({ open: true, message: failedToUpdateEventMessage, severity: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [
    calendarCopy,
    editedEvent,
    eventUpdatedMessage,
    failedToUpdateEventMessage,
    loadData,
    selectedEvent,
    setSnackbar,
    updateEventMutation,
  ]);

  // Delete event handler
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return;

    setIsDeleting(true);
    try {
      await deleteEventMutation.mutateAsync(selectedEvent.id);
      setSnackbar({ open: true, message: eventDeletedMessage, severity: 'success' });
      setEventDetailsOpen(false);
      setSelectedEvent(null);
      void loadData(false);
    } catch (error) {
      logger.error('Failed to delete event', { error });
      setSnackbar({ open: true, message: failedToDeleteEventMessage, severity: 'error' });
    } finally {
      setIsDeleting(false);
    }
  }, [
    deleteEventMutation,
    eventDeletedMessage,
    failedToDeleteEventMessage,
    loadData,
    selectedEvent,
    setSnackbar,
  ]);

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

  return {
    // Quick event
    quickEventText,
    setQuickEventText,
    eventDialogOpen,
    setEventDialogOpen,
    newEvent,
    setNewEvent,
    formErrors,
    setFormErrors,
    // Mobile drawer
    mobileDrawerOpen,
    setMobileDrawerOpen,
    // Event details
    eventDetailsOpen,
    selectedEvent,
    isEditMode,
    setIsEditMode,
    editedEvent,
    setEditedEvent,
    editFormErrors,
    setEditFormErrors,
    isSaving,
    isDeleting,
    attachments,
    loadingAttachments,
    // Navigation
    handlePrevMonth,
    handleNextMonth,
    handleToday,
    // Event actions
    handleQuickEvent,
    handleDateSelect,
    handleEventClick,
    handleEventDrop,
    handleEventResize,
    handleCreateEvent,
    handleUpdateEvent,
    handleDeleteEvent,
    handleCloseEventDetails,
    handleDownloadAttachment,
  };
}
