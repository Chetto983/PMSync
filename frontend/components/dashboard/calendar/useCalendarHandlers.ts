import { useState, useCallback } from 'react';
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
} from '@/components/calendar';
import type { useCalendarData } from './useCalendarData';

type CalendarData = ReturnType<typeof useCalendarData>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCalendarHandlers(data: CalendarData, calendarCopy: any, setSnackbar: (s: { open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }) => void) {
  const {
    calendarRef,
    providers,
    updateCalendarHeader,
    loadData,
    queryClient,
  } = data;

  const createEventMutation = useCreateCalendarEvent();
  const updateEventMutation = useUpdateCalendarEvent();
  const deleteEventMutation = useDeleteCalendarEvent();

  // Quick event state
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
          start: new Date(event.startTime).toISOString().slice(0, 16),
          end: new Date(event.endTime).toISOString().slice(0, 16),
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
          message: calendarCopy.failedToLoadEventDetails,
          severity: 'error',
        });
      }
    },
    [queryClient, calendarCopy.failedToLoadEventDetails, setSnackbar]
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
        setSnackbar({ open: true, message: calendarCopy.noProviderAlert, severity: 'error' });
        return;
      }

      const createDto: CreateEventDto = {
        providerId: firstProvider.id,
        title: newEvent.title,
        startTime: new Date(newEvent.start).toISOString(),
        endTime: new Date(newEvent.end).toISOString(),
        description: newEvent.description,
        calendarId: newEvent.calendar,
        ...(newEvent.recurrence && newEvent.recurrence.length > 0 && { recurrence: newEvent.recurrence }),
        ...(newEvent.reminders && { reminders: newEvent.reminders }),
        ...(newEvent.attendees && newEvent.attendees.length > 0 && {
          attendees: newEvent.attendees.map((a) => ({ email: a.email, name: a.name })),
        }),
      };

      await createEventMutation.mutateAsync(createDto);
      setSnackbar({ open: true, message: calendarCopy.eventCreated, severity: 'success' });
      setEventDialogOpen(false);
      setFormErrors({});
      setNewEvent({
        title: '', start: '', end: '', calendar: 'primary', description: '',
        recurrence: undefined, reminders: undefined, attendees: undefined,
      });
      void loadData(false);
    } catch (error) {
      logger.error('Failed to create event', { error });
      setSnackbar({ open: true, message: calendarCopy.failedToCreateEvent, severity: 'error' });
    }
  }, [newEvent, providers, calendarCopy, loadData, createEventMutation, setSnackbar]);

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
      setSnackbar({ open: true, message: calendarCopy.eventUpdated, severity: 'success' });
      setEventDetailsOpen(false);
      setIsEditMode(false);
      setEditFormErrors({});
      void loadData(false);
    } catch (error) {
      logger.error('Failed to update event', { error });
      setSnackbar({ open: true, message: calendarCopy.failedToUpdateEvent, severity: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [selectedEvent, editedEvent, calendarCopy, loadData, updateEventMutation, setSnackbar]);

  // Delete event handler
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return;

    setIsDeleting(true);
    try {
      await deleteEventMutation.mutateAsync(selectedEvent.id);
      setSnackbar({ open: true, message: calendarCopy.eventDeleted, severity: 'success' });
      setEventDetailsOpen(false);
      setSelectedEvent(null);
      void loadData(false);
    } catch (error) {
      logger.error('Failed to delete event', { error });
      setSnackbar({ open: true, message: calendarCopy.failedToDeleteEvent, severity: 'error' });
    } finally {
      setIsDeleting(false);
    }
  }, [selectedEvent, calendarCopy, loadData, deleteEventMutation, setSnackbar]);

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
