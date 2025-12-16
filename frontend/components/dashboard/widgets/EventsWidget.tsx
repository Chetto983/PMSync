'use client';

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Divider,
  Button,
  Skeleton,
} from '@mui/material';
import { Calendar, Video, Clock, MapPin, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/router';
import { DashboardCard } from '../DashboardCard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useTodayEvents, type CalendarEvent } from '@/hooks/queries';

export function EventsWidget() {
  const router = useRouter();
  const t = useTranslations();
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

  return (
    <DashboardCard
      title={t.dashboard.home.sections.upcomingEvents}
      subtitle={t.dashboard.home.sections.upcomingEventsSubtitle}
    >
      {isLoading ? (
        <Box sx={{ py: 2 }}>
          {[1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="70%" height={20} />
                <Skeleton width="50%" height={16} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : events.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Calendar size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <Typography variant="body2" color="text.secondary">
            {t.dashboard.home.sections.noEvents}
          </Typography>
          <Button
            variant="contained"
            startIcon={<Calendar size={18} />}
            sx={{ mt: 2 }}
            onClick={() => router.push('/dashboard/calendar')}
          >
            {t.dashboard.home.sections.viewCalendar}
          </Button>
        </Box>
      ) : (
        <>
          <List sx={{ p: 0 }}>
            {events.slice(0, 5).map((event, index) => (
              <React.Fragment key={event.id}>
                {index > 0 && <Divider />}
                <ListItemButton onClick={() => handleEventClick(event)}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                      {event.type === 'meeting' ? <Video size={20} /> : <Calendar size={20} />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={event.title}
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Clock size={14} />
                        <span>{formatTime(event.startTime)}</span>
                        {event.location && (
                          <>
                            <MapPin size={14} style={{ marginLeft: 8 }} />
                            <span>{event.location}</span>
                          </>
                        )}
                      </Box>
                    }
                  />
                  <Button size="small" variant="outlined">
                    {t.common.join}
                  </Button>
                </ListItemButton>
              </React.Fragment>
            ))}
          </List>
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button
              endIcon={<ArrowRight size={18} />}
              onClick={() => router.push('/dashboard/calendar')}
            >
              {t.dashboard.home.sections.viewCalendar}
            </Button>
          </Box>
        </>
      )}
    </DashboardCard>
  );
}

export default EventsWidget;
