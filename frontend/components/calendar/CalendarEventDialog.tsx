/**
 * CalendarEventDialog - Dialog for creating calendar events
 *
 * Features:
 * - Form validation with error display
 * - Calendar selector with color indicators
 * - Date/time pickers with proper formatting
 * - Matches dashboard UI/UX patterns
 *
 * @see https://fullcalendar.io/docs
 */

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  alpha,
  useTheme,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { CalendarPreference } from './CalendarSidebar';

// ============================================================================
// INTERFACES
// ============================================================================

export interface NewEventData {
  title: string;
  start: string;
  end: string;
  calendar: string;
  description: string;
}

export interface EventFormErrors {
  title?: string;
  start?: string;
  end?: string;
  calendar?: string;
}

interface CalendarEventDialogProps {
  /** Whether dialog is open */
  open: boolean;
  /** Handler for closing dialog */
  onClose: () => void;
  /** New event data */
  newEvent: NewEventData;
  /** Handler for event data change */
  onEventChange: (event: NewEventData) => void;
  /** Form errors */
  formErrors: EventFormErrors;
  /** Handler for form error change */
  onFormErrorChange: (errors: EventFormErrors) => void;
  /** Handler for creating event */
  onCreate: () => void;
  /** Calendar preferences map */
  calendarPrefs: Map<string, CalendarPreference>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CalendarEventDialog({
  open,
  onClose,
  newEvent,
  onEventChange,
  formErrors,
  onFormErrorChange,
  onCreate,
  calendarPrefs,
}: CalendarEventDialogProps) {
  const theme = useTheme();
  const t = useTranslations();
  const calendarCopy = t.calendar;

  // Handle close with error cleanup
  const handleClose = () => {
    onClose();
    onFormErrorChange({});
  };

  // Handle field change with error clearing
  const handleFieldChange = (field: keyof NewEventData, value: string) => {
    onEventChange({ ...newEvent, [field]: value });
    if (formErrors[field as keyof EventFormErrors]) {
      onFormErrorChange({ ...formErrors, [field]: undefined });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: alpha(theme.palette.background.paper, 0.98),
          backdropFilter: 'blur(20px)',
        },
      }}
    >
      <DialogTitle
        sx={{
          pb: 1,
          fontWeight: 600,
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
        }}
      >
        {calendarCopy.createEventDialogTitle}
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Event Title */}
          <TextField
            fullWidth
            label={calendarCopy.eventTitleLabel}
            value={newEvent.title}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            error={!!formErrors.title}
            helperText={formErrors.title}
            required
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />

          {/* Start Date/Time */}
          <TextField
            fullWidth
            label={calendarCopy.startDateTime}
            type="datetime-local"
            value={newEvent.start}
            onChange={(e) => handleFieldChange('start', e.target.value)}
            InputLabelProps={{ shrink: true }}
            error={!!formErrors.start}
            helperText={formErrors.start}
            required
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />

          {/* End Date/Time */}
          <TextField
            fullWidth
            label={calendarCopy.endDateTime}
            type="datetime-local"
            value={newEvent.end}
            onChange={(e) => handleFieldChange('end', e.target.value)}
            InputLabelProps={{ shrink: true }}
            error={!!formErrors.end}
            helperText={formErrors.end}
            required
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />

          {/* Calendar Selector */}
          <FormControl fullWidth>
            <InputLabel>{calendarCopy.calendarLabel}</InputLabel>
            <Select
              value={newEvent.calendar}
              onChange={(e) => handleFieldChange('calendar', e.target.value)}
              label={calendarCopy.calendarLabel}
              sx={{
                borderRadius: 2,
              }}
            >
              {Array.from(calendarPrefs.values()).map((cal) => (
                <MenuItem key={cal.id} value={cal.calendarId}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        bgcolor: cal.color,
                        flexShrink: 0,
                      }}
                    />
                    {cal.calendarName}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Description */}
          <TextField
            fullWidth
            label={calendarCopy.eventDescription}
            multiline
            rows={3}
            value={newEvent.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
        }}
      >
        <Button
          onClick={handleClose}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 500,
          }}
        >
          {calendarCopy.cancelEvent}
        </Button>
        <Button
          variant="contained"
          onClick={onCreate}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            px: 3,
            boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.3)}`,
          }}
        >
          {calendarCopy.saveEvent}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CalendarEventDialog;
