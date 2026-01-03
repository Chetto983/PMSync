/**
 * DeadlinesWidget - Upcoming deadlines
 */

'use client';

import { useDeadlines } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import { Typography, List, ListItem, ListItemText, Chip } from '@mui/material';
import { formatDistanceToNow } from 'date-fns';

export function DeadlinesWidget() {
    const t = useTranslations();
    const { data, isLoading, error, refetch } = useDeadlines({ limit: 5 });

    return (
        <BaseWidget
            id="deadlines"
            title={t.dashboard.widgets.deadlines.title}
            loading={isLoading}
            error={error?.message}
            onRefresh={() => refetch()}
            actions={
                data?.todayCount ? (
                    <Chip label={`${data.todayCount} ${t.dashboard.widgets.common.today}`} size="small" color="warning" />
                ) : null
            }
        >
            {data && data.deadlines.length > 0 ? (
                <List dense disablePadding>
                    {data.deadlines.map((deadline) => (
                        <ListItem key={deadline.id} disablePadding sx={{ mb: 1 }}>
                            <ListItemText
                                primary={deadline.title}
                                secondary={formatDistanceToNow(new Date(deadline.dueDate), { addSuffix: true })}
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
                    {t.dashboard.widgets.deadlines.noUpcoming}
                </Typography>
            )}
        </BaseWidget>
    );
}
