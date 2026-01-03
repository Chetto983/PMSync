/**
 * TodayEventsWidget - Today's calendar events
 */

'use client';

import { useTodayEvents } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import { Typography, List, ListItem, ListItemText, Chip } from '@mui/material';
import { format } from 'date-fns';

export function TodayEventsWidget() {
    const t = useTranslations();
    const { data, isLoading, error, refetch } = useTodayEvents();

    return (
        <BaseWidget
            id="today-events"
            title={t.dashboard.widgets.todayEvents.title}
            loading={isLoading}
            error={error?.message}
            onRefresh={() => refetch()}
            actions={
                data?.total ? (
                    <Chip label={data.total} size="small" color="info" />
                ) : null
            }
        >
            {data && data.events.length > 0 ? (
                <List dense disablePadding>
                    {data.events.map((event) => (
                        <ListItem key={event.id} disablePadding sx={{ mb: 1 }}>
                            <ListItemText
                                primary={event.title}
                                secondary={`${format(new Date(event.startTime), 'HH:mm')}${event.location ? ` • ${event.location}` : ''}`}
                                slotProps={{
                                    primary: {
                                        variant: 'body2',
                                        noWrap: true,
                                    },
                                    secondary: {
                                        variant: 'caption',
                                        noWrap: true,
                                    },
                                }}
                            />
                        </ListItem>
                    ))}
                </List>
            ) : (
                <Typography variant="body2" color="text.secondary">
                    {t.dashboard.widgets.todayEvents.noEvents}
                </Typography>
            )}
        </BaseWidget>
    );
}
