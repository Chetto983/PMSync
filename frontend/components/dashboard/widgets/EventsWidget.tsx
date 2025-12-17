'use client';

import React from 'react';
import {
  Box,
  Typography,
  Button,
  Skeleton,
  alpha,
  useTheme,
  Chip,
} from '@mui/material';
import { Calendar, Video, Clock, MapPin, ArrowRight, CalendarDays } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useTodayEvents, type CalendarEvent } from '@/hooks/queries';

export function EventsWidget() {
  const router = useRouter();
  const t = useTranslations();
  const theme = useTheme();
  const { data, isLoading } = useTodayEvents();

  const events = data?.events || [];

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString(t.locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleEventClick = (event: CalendarEvent) => {
    router.push(`/dashboard/calendar?eventId=${event.id}`);
  };

  const isNow = (event: CalendarEvent) => {
    const now = new Date();
    const start = new Date(event.startTime);
    const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
    return now >= start && now <= end;
  };

  return (
    <Box
      sx={{
        height: '100%',
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          borderColor: alpha(theme.palette.success.main, 0.2),
          boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.06)}`,
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2.5,
          py: 2,
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.06),
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2.5,
            bgcolor: alpha(theme.palette.success.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'success.main',
          }}
        >
          <CalendarDays size={20} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
            {t.dashboard.home.sections.upcomingEvents}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t.dashboard.home.sections.upcomingEventsSubtitle}
          </Typography>
        </Box>
        {events.length > 0 && (
          <Chip
            label={events.length}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.success.main, 0.1),
              color: 'success.main',
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3].map((i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
                <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="70%" height={18} />
                  <Skeleton width="50%" height={14} sx={{ mt: 0.5 }} />
                </Box>
              </Box>
            ))}
          </Box>
        ) : events.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.success.main, 0.08),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <Calendar size={28} style={{ opacity: 0.5 }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t.dashboard.home.sections.noEvents}
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<Calendar size={16} />}
              onClick={() => router.push('/dashboard/calendar')}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                bgcolor: 'success.main',
                '&:hover': { bgcolor: 'success.dark' },
              }}
            >
              {t.dashboard.home.sections.viewCalendar}
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {events.slice(0, 4).map((event) => {
              const nowActive = isNow(event);
              return (
                <Box
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2.5,
                    cursor: 'pointer',
                    bgcolor: nowActive ? alpha(theme.palette.success.main, 0.08) : 'transparent',
                    border: '1px solid',
                    borderColor: nowActive ? alpha(theme.palette.success.main, 0.2) : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.success.main, 0.06),
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      bgcolor: nowActive
                        ? 'success.main'
                        : alpha(theme.palette.success.main, 0.1),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: nowActive ? 'white' : 'success.main',
                      flexShrink: 0,
                    }}
                  >
                    {event.type === 'meeting' ? <Video size={18} /> : <Calendar size={18} />}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: nowActive ? 600 : 500,
                        fontSize: '0.875rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {event.title}
                    </Typography>
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        mt: 0.25,
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                      }}
                    >
                      <Clock size={12} />
                      <span>{formatTime(event.startTime)}</span>
                      {event.location && (
                        <>
                          <MapPin size={12} style={{ marginLeft: 4 }} />
                          <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {event.location}
                          </span>
                        </>
                      )}
                    </Box>
                  </Box>
                  {nowActive && (
                    <Chip
                      label="NOW"
                      size="small"
                      sx={{
                        bgcolor: 'success.main',
                        color: 'white',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        height: 20,
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Footer */}
      {events.length > 0 && (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Button
            fullWidth
            size="small"
            endIcon={<ArrowRight size={16} />}
            onClick={() => router.push('/dashboard/calendar')}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 500,
              color: 'success.main',
              bgcolor: alpha(theme.palette.success.main, 0.06),
              '&:hover': {
                bgcolor: alpha(theme.palette.success.main, 0.12),
              },
            }}
          >
            {t.dashboard.home.sections.viewCalendar}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default EventsWidget;
