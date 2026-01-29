/**
 * RemindersPicker - Component for selecting event reminders
 *
 * Features:
 * - Multiple reminder support
 * - Preset and custom time options
 * - Notification method selection (popup, email)
 * - Matches dashboard UI/UX patterns
 *
 * @see Google Calendar reminder format
 */

import React, { useCallback, useMemo } from 'react';
import {
  Box,
  IconButton,
  FormControl,
  Select,
  MenuItem,
  Typography,
  Button,
  Chip,
  Stack,
} from '@mui/material';
import { Bell, Plus, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

// ============================================================================
// INTERFACES
// ============================================================================

export interface Reminder {
  /** Notification method: 'popup' or 'email' */
  method: 'popup' | 'email';
  /** Minutes before event to send reminder */
  minutes: number;
}

export interface RemindersData {
  /** Whether to use default reminders from calendar settings */
  useDefault?: boolean;
  /** Custom reminder overrides */
  overrides?: Reminder[];
}

export interface RemindersPickerProps {
  /** Current reminders configuration */
  reminders?: RemindersData;
  /** Callback when reminders change */
  onChange: (reminders: RemindersData) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Maximum number of reminders allowed */
  maxReminders?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Preset reminder times in minutes */
const REMINDER_PRESETS = [
  { minutes: 0, labelKey: 'atTime' },
  { minutes: 5, labelKey: 'fiveMinutes' },
  { minutes: 10, labelKey: 'tenMinutes' },
  { minutes: 15, labelKey: 'fifteenMinutes' },
  { minutes: 30, labelKey: 'thirtyMinutes' },
  { minutes: 60, labelKey: 'oneHour' },
  { minutes: 120, labelKey: 'twoHours' },
  { minutes: 1440, labelKey: 'oneDay' },
  { minutes: 2880, labelKey: 'twoDays' },
  { minutes: 10080, labelKey: 'oneWeek' },
] as const;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format minutes to human readable string
 */
function formatMinutes(
  minutes: number,
  labels: Record<string, string>
): string {
  const preset = REMINDER_PRESETS.find((p) => p.minutes === minutes);
  if (preset) {
    return labels[preset.labelKey] || `${minutes} min`;
  }

  if (minutes < 60) {
    return `${minutes} ${labels.minutesUnit || 'min'}`;
  }
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? labels.hourUnit || 'hour' : labels.hoursUnit || 'hours'}`;
  }
  const days = Math.floor(minutes / 1440);
  return `${days} ${days === 1 ? labels.dayUnit || 'day' : labels.daysUnit || 'days'}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function RemindersPicker({
  reminders,
  onChange,
  disabled = false,
  maxReminders = 5,
}: RemindersPickerProps) {
  const t = useTranslations();
  const remindersCopy = t.calendar.reminders;

  // Memoize to avoid dependency changes on every render
  const currentReminders = useMemo(
    () => reminders?.overrides || [],
    [reminders?.overrides]
  );

  const handleAddReminder = useCallback(() => {
    if (currentReminders.length >= maxReminders) return;

    const newReminder: Reminder = { method: 'popup', minutes: 30 };
    onChange({
      useDefault: false,
      overrides: [...currentReminders, newReminder],
    });
  }, [currentReminders, maxReminders, onChange]);

  const handleRemoveReminder = useCallback(
    (index: number) => {
      const newReminders = currentReminders.filter((_, i) => i !== index);
      onChange({
        useDefault: newReminders.length === 0,
        overrides: newReminders,
      });
    },
    [currentReminders, onChange]
  );

  const handleUpdateReminder = useCallback(
    (index: number, field: keyof Reminder, value: Reminder[keyof Reminder]) => {
      const newReminders = currentReminders.map((reminder, i) =>
        i === index ? { ...reminder, [field]: value } : reminder
      );
      onChange({
        useDefault: false,
        overrides: newReminders,
      });
    },
    [currentReminders, onChange]
  );

  return (
    <Box>
      {/* Header with label and add button */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Bell size={16} />
          <Typography variant="body2" fontWeight={500}>
            {remindersCopy.label}
          </Typography>
        </Box>
        {currentReminders.length < maxReminders && (
          <Button
            size="small"
            startIcon={<Plus size={14} />}
            onClick={handleAddReminder}
            disabled={disabled}
            sx={{ textTransform: 'none' }}
          >
            {remindersCopy.addReminder}
          </Button>
        )}
      </Box>

      {/* Reminders list */}
      {currentReminders.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          {remindersCopy.noReminders}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {currentReminders.map((reminder, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                borderRadius: 2,
                bgcolor: 'action.hover',
              }}
            >
              {/* Time selector */}
              <FormControl size="small" sx={{ minWidth: 140, flex: 1 }}>
                <Select
                  value={reminder.minutes}
                  onChange={(e) =>
                    handleUpdateReminder(index, 'minutes', e.target.value as number)
                  }
                  disabled={disabled}
                  sx={{ borderRadius: 2 }}
                >
                  {REMINDER_PRESETS.map((preset) => (
                    <MenuItem key={preset.minutes} value={preset.minutes}>
                      {remindersCopy[preset.labelKey] ||
                        formatMinutes(preset.minutes, remindersCopy)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Method selector */}
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <Select
                  value={reminder.method}
                  onChange={(e) =>
                    handleUpdateReminder(index, 'method', e.target.value as 'popup' | 'email')
                  }
                  disabled={disabled}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="popup">
                    <Chip
                      label={remindersCopy.methodPopup}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20 }}
                    />
                  </MenuItem>
                  <MenuItem value="email">
                    <Chip
                      label={remindersCopy.methodEmail}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20 }}
                    />
                  </MenuItem>
                </Select>
              </FormControl>

              {/* Remove button */}
              <IconButton
                size="small"
                onClick={() => handleRemoveReminder(index)}
                disabled={disabled}
                sx={{ ml: 'auto' }}
              >
                <X size={16} />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default RemindersPicker;
