import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { Calendar, MapPin, User, Users } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { ParsedCalendarInvite } from '@/types/entities';

type CalendarResponse = 'accept' | 'decline' | 'tentative';

export interface CalendarInviteCardProps {
  invite: ParsedCalendarInvite;
  status?: 'pending' | 'accepted' | 'declined' | 'tentative';
  onRespond?: (response: CalendarResponse) => Promise<void>;
}

const defaultLabels = {
  title: 'Meeting Invitation',
  when: 'When',
  where: 'Where',
  organizer: 'Organizer',
  attendees: 'Attendees',
  description: 'Description',
  actions: {
    accept: 'Accept',
    decline: 'Decline',
    tentative: 'Maybe',
  },
  status: {
    pending: 'Pending',
    accepted: 'Accepted',
    declined: 'Declined',
    tentative: 'Tentative',
    cancelled: 'Cancelled',
    updated: 'Updated',
  },
};

function formatDateRange(invite: ParsedCalendarInvite) {
  const start = new Date(invite.startTime);
  const end = new Date(invite.endTime);
  const sameDay = start.toDateString() === end.toDateString();

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(invite.isAllDay ? {} : { hour: '2-digit', minute: '2-digit' }),
    timeZone: invite.timezone || undefined,
  });

  const startLabel = dateFormatter.format(start);

  if (invite.isAllDay || sameDay) {
    return invite.timezone ? `${startLabel} (${invite.timezone})` : startLabel;
  }

  const endLabel = dateFormatter.format(end);
  return invite.timezone
    ? `${startLabel} - ${endLabel} (${invite.timezone})`
    : `${startLabel} - ${endLabel}`;
}

export const CalendarInviteCard: React.FC<CalendarInviteCardProps> = ({
  invite,
  status = 'pending',
  onRespond,
}) => {
  const theme = useTheme();
  const t = useTranslations();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [loading, setLoading] = useState<CalendarResponse | null>(null);

  const labels = useMemo(() => {
    return (
      t.calendar.invitation ||
      defaultLabels
    );
  }, [t]);

  const isCancelled = invite.method === 'CANCEL' || invite.status === 'CANCELLED';
  const isUpdated = !isCancelled && typeof invite.sequence === 'number' && invite.sequence > 0;
  const statusLabel =
    (isCancelled && (labels.status?.cancelled || 'Cancelled')) ||
    (isUpdated && (labels.status?.updated || 'Updated')) ||
    labels.status?.[currentStatus] ||
    currentStatus;

  const attendeeStatusLabel = (status?: string) => {
    if (!status) return undefined;
    const upper = status.toUpperCase();
    if (upper === 'ACCEPTED') return labels.status?.accepted || 'Accepted';
    if (upper === 'DECLINED') return labels.status?.declined || 'Declined';
    if (upper === 'TENTATIVE') return labels.status?.tentative || 'Tentative';
    if (upper === 'NEEDS-ACTION') return labels.status?.needsAction || 'Needs Response';
    return status;
  };

  const handleRespond = async (response: CalendarResponse) => {
    if (!onRespond) return;
    if (isCancelled) return;
    try {
      setLoading(response);
      await onRespond(response);
      setCurrentStatus(
        response === 'accept'
          ? 'accepted'
          : response === 'decline'
            ? 'declined'
            : 'tentative',
      );
    } finally {
      setLoading(null);
    }
  };

  const attendees = invite.attendees ?? [];

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: theme.palette.divider,
        borderRadius: 2,
        p: 2,
        bgcolor: theme.palette.mode === 'dark' ? 'background.paper' : 'grey.50',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Calendar size={18} />
        <Typography variant="subtitle2" fontWeight={700}>
          {labels.title}
        </Typography>
        <Chip
          size="small"
          label={statusLabel}
          color={
            isCancelled
              ? 'default'
              : currentStatus === 'accepted'
                ? 'success'
                : currentStatus === 'declined'
                  ? 'error'
                  : currentStatus === 'tentative'
                    ? 'warning'
                    : 'default'
          }
          sx={{ ml: 1 }}
        />
      </Stack>

      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {invite.summary}
      </Typography>
      {invite.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {invite.description}
        </Typography>
      )}

      <Stack spacing={1.2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Calendar size={14} />
          <Typography variant="body2">
            <strong>{labels.when}:</strong> {formatDateRange(invite)}
          </Typography>
        </Stack>

        {invite.location && (
          <Stack direction="row" spacing={1} alignItems="center">
            <MapPin size={14} />
            <Typography variant="body2">
              <strong>{labels.where}:</strong> {invite.location}
            </Typography>
          </Stack>
        )}

        <Stack direction="row" spacing={1} alignItems="center">
          <User size={14} />
          <Typography variant="body2">
            <strong>{labels.organizer}:</strong>{' '}
            {invite.organizer?.name || invite.organizer?.email}
          </Typography>
        </Stack>

        {attendees.length > 0 && (
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Users size={14} style={{ marginTop: 2 }} />
            <Stack spacing={0.5} flex={1}>
              <Typography variant="body2" fontWeight={600}>
                {labels.attendees}
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                {attendees.slice(0, 6).map((att) => (
                  <Chip
                    key={att.email}
                    label={att.name ? `${att.name} (${att.email})` : att.email}
                    size="small"
                    variant="outlined"
                    color={
                      att.status === 'ACCEPTED'
                        ? 'success'
                        : att.status === 'DECLINED'
                          ? 'error'
                          : att.status === 'TENTATIVE'
                            ? 'warning'
                            : 'default'
                    }
                    title={attendeeStatusLabel(att.status)}
                  />
                ))}
                {attendees.length > 6 && (
                  <Chip
                    size="small"
                    label={`+${attendees.length - 6}`}
                    variant="outlined"
                  />
                )}
              </Stack>
            </Stack>
          </Stack>
        )}
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          size="small"
          onClick={() => handleRespond('accept')}
          disabled={loading !== null || isCancelled}
        >
          {labels.actions?.accept ?? 'Accept'}
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => handleRespond('tentative')}
          disabled={loading !== null || isCancelled}
        >
          {labels.actions?.tentative ?? 'Maybe'}
        </Button>
        <Button
          variant="text"
          size="small"
          color="error"
          onClick={() => handleRespond('decline')}
          disabled={loading !== null || isCancelled}
        >
          {labels.actions?.decline ?? 'Decline'}
        </Button>
      </Stack>

      {isCancelled && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {labels.messages?.inviteCancelled ?? 'This meeting has been cancelled.'}
        </Typography>
      )}
    </Box>
  );
};

export default CalendarInviteCard;
