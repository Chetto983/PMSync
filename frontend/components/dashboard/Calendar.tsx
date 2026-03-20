/**
 * Calendar - Main calendar component with events and sidebar
 *
 * Refactored to use extracted hooks:
 * - useCalendarPreferences - calendar preferences, colors, provider groups
 * - useCalendarData - events, WebSocket, store, locale
 * - useCalendarHandlers - event CRUD, drag-drop, navigation
 *
 * Sub-components:
 * - CalendarSidebar - sidebar with calendar list, quick event, AI insights
 * - CalendarHeader - header with navigation and view toggle
 * - CalendarEventDialog - create event dialog
 * - CalendarEventDetail - event detail/edit dialog
 */

import React, { lazy, Suspense } from 'react';
import {
  Box,
  Paper,
  Drawer,
  alpha,
  useTheme,
  Skeleton,
  CircularProgress,
} from '@mui/material';
const FullCalendar = lazy(() => import('@fullcalendar/react'));
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useSession } from '@/lib/auth-client';
import {
  CalendarSidebar,
  CalendarHeader,
  CalendarEventDialog,
  CalendarEventDetail,
} from '@/components/calendar';
import { useCalendarPreferences } from './calendar/useCalendarPreferences';
import { useCalendarData } from './calendar/useCalendarData';
import { useCalendarHandlers } from './calendar/useCalendarHandlers';
import { useGlobalToast } from '@/lib/context/toast-context';

export function Calendar() {
  const theme = useTheme();
  const translations = useTranslations();
  const calendarCopy = translations.calendar;
  const toast = useGlobalToast();

  const { data: session } = useSession();
  const currentUserEmail = session?.user?.email;

  const prefs = useCalendarPreferences(calendarCopy);
  const data = useCalendarData(prefs.calendarPrefs, prefs.loadCalendars, prefs.setSnackbar, calendarCopy);
  const handlers = useCalendarHandlers(data, prefs.calendarPrefs, calendarCopy, prefs.setSnackbar);

  const {
    calendarPrefs,
    providerGroups,
    colorPickerAnchor,
    colorPickerCalendarId,
    snackbar,
    setSnackbar,
    handleToggleCalendar,
    handleToggleProviderExpanded,
    handleOpenColorPicker,
    handleCloseColorPicker,
    handleColorSelect,
    handleCreateCalendar,
    handleDeleteCalendar,
  } = prefs;

  React.useEffect(() => {
    if (!snackbar.open || !snackbar.message) return;
    toast[snackbar.severity](snackbar.message);
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, [setSnackbar, snackbar, toast]);

  const {
    calendarRef,
    currentMonth,
    currentYear,
    viewType,
    setViewType,
    loading,
    isSyncing,
    storeEvents,
    filteredEvents,
    calendarLocale,
    calendarLocales,
    loadData,
  } = data;

  const {
    quickEventText,
    setQuickEventText,
    eventDialogOpen,
    setEventDialogOpen,
    newEvent,
    setNewEvent,
    formErrors,
    setFormErrors,
    mobileDrawerOpen,
    setMobileDrawerOpen,
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
    handlePrevMonth,
    handleNextMonth,
    handleToday,
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
    handleRSVPRespond,
  } = handlers;

  const sidebarProps = {
    quickEventText,
    onQuickEventTextChange: setQuickEventText,
    onQuickEvent: handleQuickEvent,
    onOpenEventDialog: () => setEventDialogOpen(true),
    onCreateCalendar: handleCreateCalendar,
    onDeleteCalendar: handleDeleteCalendar,
    providerGroups,
    calendarPrefs,
    onToggleCalendar: handleToggleCalendar,
    onToggleProviderExpanded: handleToggleProviderExpanded,
    onColorSelect: handleColorSelect,
    colorPickerAnchor,
    colorPickerCalendarId,
    onOpenColorPicker: handleOpenColorPicker,
    onCloseColorPicker: handleCloseColorPicker,
    eventCount: storeEvents.length,
    isLoading: loading,
  };

  return (
      <Box
      sx={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
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
        <CalendarSidebar {...sidebarProps} />
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
        <CalendarSidebar {...sidebarProps} onCloseMobileDrawer={() => setMobileDrawerOpen(false)} />
      </Drawer>

      {/* Calendar Main */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                top: 0, left: 0, right: 0, bottom: 0,
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
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
              slotLabelFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
              locales={calendarLocales}
              locale={calendarLocale}
              nowIndicator={true}
              navLinks={true}
              weekNumbers={true}
              weekNumberCalculation="ISO"
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              slotDuration="00:30:00"
              businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00' }}
              eventResizableFromStart={true}
              eventDurationEditable={true}
              eventStartEditable={true}
              firstDay={1}
              weekends={true}
              fixedWeekCount={false}
              showNonCurrentDates={true}
              listDayFormat={{ month: 'long', day: 'numeric', year: 'numeric' }}
              listDaySideFormat={{ weekday: 'long' }}
              allDaySlot={true}
              allDayText={calendarCopy.allDay}
              dayMaxEventRows={3}
              moreLinkClick="popover"
            />
          </Suspense>
        </Box>
      </Box>

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
        onRSVPRespond={handleRSVPRespond}
        currentUserEmail={currentUserEmail ?? undefined}
      />
    </Box>
  );
}
