'use client';

import { Box, Typography, Paper, Chip, Tooltip } from '@mui/material';
import { CheckCircle, AlertTriangle, Sparkles, Clock } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface TimeSlotInfo {
  id: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  conflicts?: string[];
  recommendation?: string;
  attendeeAvailability?: {
    email: string;
    available: boolean;
  }[];
}

export interface TimeSlotPickerProps {
  slots: TimeSlotInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TimeSlotPicker({
  slots,
  selectedId,
  onSelect,
}: TimeSlotPickerProps) {
  const t = useTranslations();
  const labels = t.ai.calendarAi.scheduling;

  // Format date/time for display
  const formatSlotTime = (isoString: string) => {
    const date = new Date(isoString);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = dayNames[date.getDay()];
    const month = monthNames[date.getMonth()];
    const dayNum = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;

    return `${day}, ${month} ${dayNum} at ${hour12}:${minutes} ${ampm}`;
  };

  const formatDuration = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationMins = Math.round(durationMs / 60000);

    if (durationMins >= 60) {
      const hours = Math.floor(durationMins / 60);
      const mins = durationMins % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${durationMins}m`;
  };

  if (slots.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
        <Clock size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
        <Typography variant="body2">{labels.noSlots}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {slots.map((slot) => {
        const isSelected = selectedId === slot.id;

        return (
          <Paper
            key={slot.id}
            variant="outlined"
            onClick={() => onSelect(slot.id)}
            sx={{
              p: 2,
              cursor: 'pointer',
              borderWidth: 2,
              borderColor: isSelected ? 'primary.main' : 'divider',
              bgcolor: isSelected ? 'action.selected' : 'background.paper',
              transition: 'all 0.15s ease-in-out',
              '&:hover': {
                borderColor: 'primary.main',
                transform: 'translateY(-1px)',
                boxShadow: 1,
              },
            }}
          >
            {/* Time Display */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {formatSlotTime(slot.startTime)}
              </Typography>
              <Chip
                size="small"
                label={formatDuration(slot.startTime, slot.endTime)}
                variant="outlined"
                sx={{ height: 22 }}
              />
            </Box>

            {/* Status Chips */}
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {slot.isAvailable ? (
                <Chip
                  size="small"
                  icon={<CheckCircle size={12} />}
                  label={labels.youAreFree}
                  color="success"
                  variant="outlined"
                  sx={{ height: 24, '& .MuiChip-icon': { fontSize: 12 } }}
                />
              ) : (
                <Tooltip title={slot.conflicts?.join(', ') || t.ai.calendarAi.availability.busy}>
                  <Chip
                    size="small"
                    icon={<AlertTriangle size={12} />}
                    label={`${labels.conflict} "${slot.conflicts?.[0] || 'event'}"`}
                    color="warning"
                    variant="outlined"
                    sx={{ height: 24, '& .MuiChip-icon': { fontSize: 12 } }}
                  />
                </Tooltip>
              )}

              {slot.recommendation && (
                <Chip
                  size="small"
                  icon={<Sparkles size={12} />}
                  label={slot.recommendation || labels.bestTime}
                  color="primary"
                  variant="outlined"
                  sx={{ height: 24, '& .MuiChip-icon': { fontSize: 12 } }}
                />
              )}
            </Box>

            {/* Attendee Availability (if provided) */}
            {slot.attendeeAvailability && slot.attendeeAvailability.length > 0 && (
              <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {t.ai.calendarAi.availability.attendees}:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {slot.attendeeAvailability.map((attendee, idx) => (
                    <Chip
                      key={idx}
                      size="small"
                      label={attendee.email.split('@')[0]}
                      color={attendee.available ? 'success' : 'error'}
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
}

export default TimeSlotPicker;
