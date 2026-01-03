/**
 * UnreadEmailsWidget - Unread emails count and list
 */

'use client';

import { useRecentUnreadEmails } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import { Typography, List, ListItem, ListItemText } from '@mui/material';
import { Mail } from 'lucide-react';

export function UnreadEmailsWidget() {
    const t = useTranslations();
    const { data, isLoading, error, refetch } = useRecentUnreadEmails({ limit: 5 });

    return (
        <BaseWidget
            id="unread-emails"
            title={t.dashboard.widgets.unreadEmails.title}
            loading={isLoading}
            error={error?.message}
            onRefresh={() => refetch()}
            icon={<Mail size={18} />}
            badge={data?.total || undefined}
        >
            {data && data.emails.length > 0 ? (
                <List dense disablePadding>
                    {data.emails.map((email) => (
                        <ListItem key={email.id} disablePadding sx={{ mb: 1 }}>
                            <ListItemText
                                primary={email.subject || t.dashboard.widgets.unreadEmails.noSubject}
                                secondary={email.from?.name || email.from?.email}
                                slotProps={{
                                    primary: {
                                        variant: 'body2',
                                        noWrap: true,
                                        fontWeight: email.isRead ? 400 : 600,
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
                    {t.dashboard.widgets.unreadEmails.allCaughtUp}
                </Typography>
            )}
        </BaseWidget>
    );
}
