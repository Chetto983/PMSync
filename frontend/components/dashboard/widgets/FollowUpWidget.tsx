/**
 * FollowUpWidget - Pending follow-ups
 */

'use client';

import { useFollowUps } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import { Typography, List, ListItem, ListItemText, Chip } from '@mui/material';
import { formatDistanceToNow } from 'date-fns';

export function FollowUpWidget() {
    const t = useTranslations();
    const { data, isLoading, error, refetch } = useFollowUps({ limit: 5 });

    return (
        <BaseWidget
            id="follow-ups"
            title={t.dashboard.widgets.followUps.title}
            loading={isLoading}
            error={error?.message}
            onRefresh={() => refetch()}
            actions={
                data?.overdueCount ? (
                    <Chip label={`${data.overdueCount} ${t.dashboard.widgets.common.overdue}`} size="small" color="error" />
                ) : null
            }
        >
            {data && data.followUps.length > 0 ? (
                <List dense disablePadding>
                    {data.followUps.map((followUp) => (
                        <ListItem key={followUp.id} disablePadding sx={{ mb: 1 }}>
                            <ListItemText
                                primary={followUp.subject}
                                secondary={`${followUp.contactName} • ${formatDistanceToNow(new Date(followUp.dueDate), { addSuffix: true })}`}
                                slotProps={{
                                    primary: {
                                        variant: 'body2',
                                        noWrap: true,
                                    },
                                    secondary: {
                                        variant: 'caption',
                                        noWrap: true,
                                        color: followUp.status === 'overdue' ? 'error' : 'text.secondary',
                                    },
                                }}
                            />
                        </ListItem>
                    ))}
                </List>
            ) : (
                <Typography variant="body2" color="text.secondary">
                    {t.dashboard.widgets.followUps.noPending}
                </Typography>
            )}
        </BaseWidget>
    );
}
