import { makeAssistantToolUI } from '@assistant-ui/react';
import { Calendar, MapPin, AlertCircle } from 'lucide-react';
import { Box, Paper, Typography } from '@mui/material';
import type { EventResult, EventItem } from '../types';

function formatTime(item: EventItem): string {
  if (item.isAllDay) return 'All day';
  if (item.startTimeFormatted) {
    return item.endTimeFormatted
      ? `${item.startTimeFormatted} - ${item.endTimeFormatted}`
      : item.startTimeFormatted;
  }
  if (!item.startTime) return '';
  const start = new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!item.endTime) return start;
  const end = new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${start} - ${end}`;
}

function EventRow({ event, isFirst }: { event: EventItem; isFirst: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        py: 1,
        px: 1,
        borderRadius: 1,
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background-color 0.15s ease',
        ...(isFirst ? {} : { borderTop: 1, borderColor: 'divider' }),
      }}
    >
      <Calendar size={14} color="var(--mui-palette-warning-main)" style={{ marginTop: 2, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography
            variant="body2"
            fontWeight={500}
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {event.title}
          </Typography>
          {event.isAllDay && (
            <Box
              component="span"
              sx={{
                px: 0.75,
                py: 0.125,
                fontSize: '0.625rem',
                fontWeight: 600,
                borderRadius: 1,
                bgcolor: 'warning.light',
                color: 'warning.main',
                flexShrink: 0,
              }}
            >
              All day
            </Box>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">{formatTime(event)}</Typography>
        {event.location && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
            <MapPin size={12} />
            <Typography variant="caption" color="text.secondary">{event.location}</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export const EventToolUI = makeAssistantToolUI<
  { startDate?: string; endDate?: string },
  EventResult
>({
  toolName: 'get_events',
  render: ({ result, status }) => {
    if (status.type === 'running') {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            width: 'fit-content',
            borderRadius: '10px',
            border: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
            p: 1.5,
          }}
        >
          <Calendar size={16} color="var(--mui-palette-text-secondary)" />
          <Typography variant="body2" color="text.secondary">Loading events...</Typography>
        </Box>
      );
    }

    if (status.type === 'incomplete') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50' }}>
          <AlertCircle size={16} color="var(--mui-palette-error-main)" />
          <Typography variant="body2" color="error.main">
            Failed to load events: {'reason' in status ? (status as { reason?: string }).reason : 'unknown'}
          </Typography>
        </Box>
      );
    }

    if (!result) return null;

    if (result.error) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50' }}>
          <AlertCircle size={16} color="var(--mui-palette-error-main)" />
          <Typography variant="body2" color="error.main">{result.error}</Typography>
        </Box>
      );
    }

    const events = result.data ?? [];

    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" fontWeight={500} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Events
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </Typography>
        </Box>

        {events.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No events found.</Typography>
        ) : (
          <Box>
            {events.map((e, i) => (
              <EventRow key={e.id} event={e} isFirst={i === 0} />
            ))}
          </Box>
        )}

        {result.summary && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            {result.summary}
          </Typography>
        )}
      </Paper>
    );
  },
});
