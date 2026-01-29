/**
 * RSVPButtons - Component for responding to calendar event invitations
 *
 * Features:
 * - Accept / Decline / Maybe buttons
 * - Shows current response status
 * - Loading state during API call
 * - Matches dashboard UI/UX patterns
 */

import React, { useState, useCallback } from 'react';
import { Box, Button, ButtonGroup, Typography, CircularProgress, Chip } from '@mui/material';
import { Check, X, HelpCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

// ============================================================================
// INTERFACES
// ============================================================================

export type RSVPResponse = 'accepted' | 'declined' | 'tentative';

export interface RSVPButtonsProps {
  /** Event ID for the RSVP */
  eventId: string;
  /** Current RSVP status */
  currentStatus?: RSVPResponse | 'needsAction';
  /** Callback when user responds */
  onRespond: (eventId: string, response: RSVPResponse) => Promise<void>;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Compact mode (smaller buttons) */
  compact?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function RSVPButtons({
  eventId,
  currentStatus,
  onRespond,
  disabled = false,
  compact = false,
}: RSVPButtonsProps) {
  const t = useTranslations();
  const rsvpCopy = t.calendar.rsvp;

  const [isLoading, setIsLoading] = useState<RSVPResponse | null>(null);

  const handleRespond = useCallback(
    async (response: RSVPResponse) => {
      if (disabled || isLoading) return;

      setIsLoading(response);
      try {
        await onRespond(eventId, response);
      } finally {
        setIsLoading(null);
      }
    },
    [eventId, onRespond, disabled, isLoading]
  );

  // Show current status badge if already responded
  const StatusBadge = () => {
    if (!currentStatus || currentStatus === 'needsAction') return null;

    const statusConfig = {
      accepted: { label: rsvpCopy.accepted, color: 'success' as const, icon: <Check size={14} /> },
      declined: { label: rsvpCopy.declined, color: 'error' as const, icon: <X size={14} /> },
      tentative: { label: rsvpCopy.tentative, color: 'warning' as const, icon: <HelpCircle size={14} /> },
    };

    const config = statusConfig[currentStatus];
    if (!config) return null;

    return (
      <Chip
        icon={config.icon}
        label={config.label}
        color={config.color}
        size="small"
        variant="outlined"
        sx={{ mb: 1 }}
      />
    );
  };

  return (
    <Box>
      <StatusBadge />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {currentStatus && currentStatus !== 'needsAction'
            ? rsvpCopy.changeResponse
            : rsvpCopy.respondToInvite}
        </Typography>

        <ButtonGroup
          size={compact ? 'small' : 'medium'}
          variant="outlined"
          disabled={disabled}
          sx={{
            '& .MuiButton-root': {
              borderRadius: 2,
              textTransform: 'none',
            },
          }}
        >
          {/* Accept Button */}
          <Button
            onClick={() => handleRespond('accepted')}
            disabled={isLoading !== null}
            color={currentStatus === 'accepted' ? 'success' : 'inherit'}
            variant={currentStatus === 'accepted' ? 'contained' : 'outlined'}
            startIcon={
              isLoading === 'accepted' ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <Check size={16} />
              )
            }
            sx={{ minWidth: compact ? 80 : 100 }}
          >
            {rsvpCopy.accept}
          </Button>

          {/* Maybe Button */}
          <Button
            onClick={() => handleRespond('tentative')}
            disabled={isLoading !== null}
            color={currentStatus === 'tentative' ? 'warning' : 'inherit'}
            variant={currentStatus === 'tentative' ? 'contained' : 'outlined'}
            startIcon={
              isLoading === 'tentative' ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <HelpCircle size={16} />
              )
            }
            sx={{ minWidth: compact ? 80 : 100 }}
          >
            {rsvpCopy.maybe}
          </Button>

          {/* Decline Button */}
          <Button
            onClick={() => handleRespond('declined')}
            disabled={isLoading !== null}
            color={currentStatus === 'declined' ? 'error' : 'inherit'}
            variant={currentStatus === 'declined' ? 'contained' : 'outlined'}
            startIcon={
              isLoading === 'declined' ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <X size={16} />
              )
            }
            sx={{ minWidth: compact ? 80 : 100 }}
          >
            {rsvpCopy.decline}
          </Button>
        </ButtonGroup>
      </Box>
    </Box>
  );
}

export default RSVPButtons;
