/**
 * RecurrencePicker - Component for selecting event recurrence patterns
 *
 * Features:
 * - Common recurrence presets (daily, weekly, monthly, yearly)
 * - Generates RFC 5545 RRULE strings
 * - Matches dashboard UI/UX patterns
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */

import React, { useMemo } from 'react';
import { FormControl, InputLabel, Select, MenuItem, Box, Typography } from '@mui/material';
import { Repeat } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';

// ============================================================================
// INTERFACES
// ============================================================================

export interface RecurrencePickerProps {
  /** Current recurrence rule strings (RRULE format) */
  recurrence?: string[];
  /** Callback when recurrence changes */
  onChange: (recurrence: string[]) => void;
  /** Reference date for computing "Weekly on Tuesday", etc. */
  startDate?: Date;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

type RecurrencePreset =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'weekdays'
  | 'custom';

// ============================================================================
// HELPERS
// ============================================================================

const DAYS_OF_WEEK = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/**
 * Convert a Date to the day of week abbreviation for RRULE
 */
function getDayOfWeek(date: Date): string {
  return DAYS_OF_WEEK[date.getDay()];
}

/**
 * Get the week number of the month (1-5)
 */
function getWeekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

/**
 * Generate RRULE string from preset
 */
function generateRRule(preset: RecurrencePreset, startDate?: Date): string[] {
  switch (preset) {
    case 'none':
      return [];
    case 'daily':
      return ['RRULE:FREQ=DAILY'];
    case 'weekly': {
      const day = startDate ? getDayOfWeek(startDate) : 'MO';
      return [`RRULE:FREQ=WEEKLY;BYDAY=${day}`];
    }
    case 'monthly': {
      if (startDate) {
        const day = getDayOfWeek(startDate);
        const week = getWeekOfMonth(startDate);
        return [`RRULE:FREQ=MONTHLY;BYDAY=${week}${day}`];
      }
      return ['RRULE:FREQ=MONTHLY;BYMONTHDAY=1'];
    }
    case 'yearly':
      return ['RRULE:FREQ=YEARLY'];
    case 'weekdays':
      return ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'];
    default:
      return [];
  }
}

/**
 * Parse RRULE string to detect preset
 */
function detectPreset(recurrence?: string[]): RecurrencePreset {
  if (!recurrence || recurrence.length === 0) return 'none';

  const rrule = recurrence[0];
  if (!rrule || !rrule.startsWith('RRULE:')) return 'custom';

  const rules = rrule.substring(6); // Remove "RRULE:"

  if (rules.includes('FREQ=DAILY') && !rules.includes('BYDAY')) {
    return 'daily';
  }
  if (rules.includes('FREQ=WEEKLY')) {
    if (rules.includes('BYDAY=MO,TU,WE,TH,FR')) {
      return 'weekdays';
    }
    // Simple weekly on a single day
    const byDayMatch = rules.match(/BYDAY=([A-Z]{2})$/);
    if (byDayMatch) {
      return 'weekly';
    }
  }
  if (rules.includes('FREQ=MONTHLY')) {
    return 'monthly';
  }
  if (rules.includes('FREQ=YEARLY')) {
    return 'yearly';
  }

  return 'custom';
}

// ============================================================================
// COMPONENT
// ============================================================================

export function RecurrencePicker({
  recurrence,
  onChange,
  startDate,
  disabled = false,
}: RecurrencePickerProps) {
  const t = useTranslations();
  const _recurrenceTz = useUserTimezone();
  const recurrenceCopy = t.calendar.recurrence;

  // Detect current preset from recurrence array
  const currentPreset = useMemo(() => detectPreset(recurrence), [recurrence]);

  // Generate label for weekly option based on start date
  const weeklyLabel = useMemo(() => {
    if (startDate) {
      const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: _recurrenceTz }).format(startDate);
      return recurrenceCopy.weeklyOn.replace('{day}', dayName);
    }
    return recurrenceCopy.weekly;
  }, [startDate, recurrenceCopy, _recurrenceTz]);

  // Generate label for monthly option based on start date
  const monthlyLabel = useMemo(() => {
    if (startDate) {
      const week = getWeekOfMonth(startDate);
      const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: _recurrenceTz }).format(startDate);
      const ordinal =
        week === 1
          ? recurrenceCopy.ordinals.first
          : week === 2
            ? recurrenceCopy.ordinals.second
            : week === 3
              ? recurrenceCopy.ordinals.third
              : week === 4
                ? recurrenceCopy.ordinals.fourth
                : recurrenceCopy.ordinals.fifth;
      return recurrenceCopy.monthlyOn.replace('{ordinal}', ordinal).replace('{day}', dayName);
    }
    return recurrenceCopy.monthly;
  }, [startDate, recurrenceCopy, _recurrenceTz]);

  const handleChange = (preset: RecurrencePreset) => {
    if (preset === 'custom') {
      // For custom, keep existing or return empty (to be implemented with advanced picker)
      return;
    }
    onChange(generateRRule(preset, startDate));
  };

  return (
    <FormControl fullWidth disabled={disabled}>
      <InputLabel id="recurrence-label">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Repeat size={16} />
          {recurrenceCopy.label}
        </Box>
      </InputLabel>
      <Select
        labelId="recurrence-label"
        value={currentPreset}
        onChange={(e) => handleChange(e.target.value as RecurrencePreset)}
        label={recurrenceCopy.label}
        sx={{ borderRadius: 2 }}
        renderValue={(value) => {
          switch (value) {
            case 'none':
              return recurrenceCopy.none;
            case 'daily':
              return recurrenceCopy.daily;
            case 'weekly':
              return weeklyLabel;
            case 'monthly':
              return monthlyLabel;
            case 'yearly':
              return recurrenceCopy.yearly;
            case 'weekdays':
              return recurrenceCopy.weekdays;
            case 'custom':
              return recurrenceCopy.custom;
            default:
              return recurrenceCopy.none;
          }
        }}
      >
        <MenuItem value="none">
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2">{recurrenceCopy.none}</Typography>
          </Box>
        </MenuItem>
        <MenuItem value="daily">
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2">{recurrenceCopy.daily}</Typography>
            <Typography variant="caption" color="text.secondary">
              {recurrenceCopy.dailyDescription}
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem value="weekly">
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2">{weeklyLabel}</Typography>
            <Typography variant="caption" color="text.secondary">
              {recurrenceCopy.weeklyDescription}
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem value="monthly">
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2">{monthlyLabel}</Typography>
            <Typography variant="caption" color="text.secondary">
              {recurrenceCopy.monthlyDescription}
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem value="yearly">
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2">{recurrenceCopy.yearly}</Typography>
            <Typography variant="caption" color="text.secondary">
              {recurrenceCopy.yearlyDescription}
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem value="weekdays">
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2">{recurrenceCopy.weekdays}</Typography>
            <Typography variant="caption" color="text.secondary">
              {recurrenceCopy.weekdaysDescription}
            </Typography>
          </Box>
        </MenuItem>
        {currentPreset === 'custom' && (
          <MenuItem value="custom" disabled>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2" color="text.secondary">
                {recurrenceCopy.custom}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {recurrenceCopy.customDescription}
              </Typography>
            </Box>
          </MenuItem>
        )}
      </Select>
    </FormControl>
  );
}

export default RecurrencePicker;
