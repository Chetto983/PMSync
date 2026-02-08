/**
 * AttendeesPicker - Component for selecting event attendees
 *
 * Features:
 * - Autocomplete from contacts
 * - Manual email entry with validation
 * - Chip display for selected attendees
 * - RSVP status display (for view mode)
 * - Matches dashboard UI/UX patterns
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  TextField,
  Chip,
  Avatar,
  Autocomplete,
  Typography,
  Stack,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { Users, X, Check, HelpCircle, Clock } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useContacts } from '@/hooks/queries/use-contacts';
import { useDebounce } from 'use-debounce';

// ============================================================================
// INTERFACES
// ============================================================================

export interface Attendee {
  /** Attendee email address */
  email: string;
  /** Optional display name */
  name?: string;
  /** RSVP response status (for received invites) */
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  /** Whether this is the organizer */
  organizer?: boolean;
}

export interface AttendeesPickerProps {
  /** Current attendees list */
  attendees: Attendee[];
  /** Callback when attendees change */
  onChange: (attendees: Attendee[]) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Maximum number of attendees allowed */
  maxAttendees?: number;
  /** Current user email (to mark as organizer) */
  organizerEmail?: string;
  /** Read-only mode (just display, no editing) */
  readOnly?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Get initials from name or email
 */
function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.split(' ');
    return parts
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
  }
  if (email) {
    return email[0].toUpperCase();
  }
  return '?';
}

/**
 * Get RSVP status icon
 */
function RSVPIcon({ status }: { status?: string }) {
  const theme = useTheme();
  switch (status) {
    case 'accepted':
      return <Check size={12} color={theme.palette.success.main} />;
    case 'declined':
      return <X size={12} color={theme.palette.error.main} />;
    case 'tentative':
      return <HelpCircle size={12} color={theme.palette.warning.main} />;
    case 'needsAction':
      return <Clock size={12} color={theme.palette.text.disabled} />;
    default:
      return null;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AttendeesPicker({
  attendees,
  onChange,
  disabled = false,
  maxAttendees = 50,
  // organizerEmail reserved for future use (marking current user as organizer)
  readOnly = false,
}: AttendeesPickerProps) {
  const t = useTranslations();
  const attendeesCopy = t.calendar.attendeesPicker;

  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Debounce search input for contact autocomplete
  const [debouncedSearch] = useDebounce(inputValue, 300);

  // Fetch contacts for autocomplete
  const { data: contactsData, isLoading: isLoadingContacts } = useContacts(
    debouncedSearch.length >= 2 ? { search: debouncedSearch, limit: 10 } : undefined
  );

  // Transform contacts to autocomplete options
  const contactOptions = useMemo(() => {
    if (!contactsData?.contacts) return [];
    return contactsData.contacts
      .filter((contact) => {
        // Filter out contacts already added
        const primaryEmail = contact.emails?.[0]?.value;
        if (!primaryEmail) return false;
        return !attendees.some((a) => a.email.toLowerCase() === primaryEmail.toLowerCase());
      })
      .map((contact) => ({
        email: contact.emails?.[0]?.value || '',
        name: contact.displayName || undefined,
      }));
  }, [contactsData, attendees]);

  const handleAddAttendee = useCallback(
    (attendee: Attendee | string) => {
      if (attendees.length >= maxAttendees) {
        setError(attendeesCopy.maxAttendeesReached);
        return;
      }

      let newAttendee: Attendee;

      if (typeof attendee === 'string') {
        // Manual email entry
        const email = attendee.trim();
        if (!isValidEmail(email)) {
          setError(attendeesCopy.invalidEmail);
          return;
        }
        // Check for duplicates
        if (attendees.some((a) => a.email.toLowerCase() === email.toLowerCase())) {
          setError(attendeesCopy.duplicateAttendee);
          return;
        }
        newAttendee = { email };
      } else {
        // Selected from autocomplete
        if (attendees.some((a) => a.email.toLowerCase() === attendee.email.toLowerCase())) {
          setError(attendeesCopy.duplicateAttendee);
          return;
        }
        newAttendee = attendee;
      }

      setError(null);
      setInputValue('');
      onChange([...attendees, newAttendee]);
    },
    [attendees, maxAttendees, onChange, attendeesCopy]
  );

  const handleRemoveAttendee = useCallback(
    (email: string) => {
      onChange(attendees.filter((a) => a.email !== email));
    },
    [attendees, onChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && inputValue.trim()) {
        event.preventDefault();
        handleAddAttendee(inputValue);
      }
    },
    [inputValue, handleAddAttendee]
  );

  // Read-only mode - just display attendees
  if (readOnly) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Users size={16} />
          <Typography variant="body2" fontWeight={500}>
            {attendeesCopy.label} ({attendees.length})
          </Typography>
        </Box>
        <Stack spacing={0.5}>
          {attendees.map((attendee) => (
            <Box
              key={attendee.email}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.5,
              }}
            >
              <Avatar sx={{ width: 24, height: 24, fontSize: 12 }}>
                {getInitials(attendee.name, attendee.email)}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2">
                  {attendee.name || attendee.email}
                  {attendee.organizer && (
                    <Chip
                      label={attendeesCopy.organizer}
                      size="small"
                      sx={{ ml: 1, height: 18, fontSize: 10 }}
                    />
                  )}
                </Typography>
                {attendee.name && (
                  <Typography variant="caption" color="text.secondary">
                    {attendee.email}
                  </Typography>
                )}
              </Box>
              <RSVPIcon status={attendee.responseStatus} />
            </Box>
          ))}
        </Stack>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Users size={16} />
        <Typography variant="body2" fontWeight={500}>
          {attendeesCopy.label}
        </Typography>
      </Box>

      {/* Autocomplete input */}
      <Autocomplete
        freeSolo
        options={contactOptions}
        getOptionLabel={(option) =>
          typeof option === 'string' ? option : option.name || option.email
        }
        inputValue={inputValue}
        onInputChange={(_, value) => {
          setInputValue(value);
          setError(null);
        }}
        onChange={(_, value) => {
          if (value && typeof value !== 'string') {
            handleAddAttendee(value);
          }
        }}
        disabled={disabled}
        loading={isLoadingContacts}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={attendeesCopy.placeholder}
            size="small"
            error={!!error}
            helperText={error}
            onKeyDown={handleKeyDown}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {isLoadingContacts && <CircularProgress color="inherit" size={16} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
        )}
        renderOption={(props, option) => {
          const { key, ...otherProps } = props;
          return (
            <li key={key} {...otherProps}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Avatar sx={{ width: 28, height: 28, fontSize: 12 }}>
                  {getInitials(option.name, option.email)}
                </Avatar>
                <Box>
                  <Typography variant="body2">{option.name || option.email}</Typography>
                  {option.name && (
                    <Typography variant="caption" color="text.secondary">
                      {option.email}
                    </Typography>
                  )}
                </Box>
              </Box>
            </li>
          );
        }}
      />

      {/* Selected attendees chips */}
      {attendees.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {attendees.map((attendee) => (
            <Chip
              key={attendee.email}
              avatar={
                <Avatar sx={{ width: 24, height: 24, fontSize: 10 }}>
                  {getInitials(attendee.name, attendee.email)}
                </Avatar>
              }
              label={attendee.name || attendee.email}
              onDelete={disabled ? undefined : () => handleRemoveAttendee(attendee.email)}
              deleteIcon={<X size={14} />}
              size="small"
              sx={{ borderRadius: 2 }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default AttendeesPicker;
