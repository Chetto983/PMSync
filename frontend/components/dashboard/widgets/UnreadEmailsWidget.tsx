/**
 * UnreadEmailsWidget - Unread emails count and list
 */

'use client';

import { useRecentUnreadEmails } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import { Typography, List, ListItem, ListItemText } from '@mui/material';
import { Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function UnreadEmailsWidget() {
    const t = useTranslations();
    const router = useRouter();
    const { data, isLoading, error, refetch } = useRecentUnreadEmails({ limit: 5 });

    const getSenderName = (from: { name?: string; email?: string } | string) => {
        if (typeof from === 'string') return from.split('<')[0].trim() || from;
        return from?.name || from?.email || '';
    };

    return (
        <BaseWidget
            id="unread-emails"
            title={t.dashboard.widgets.unreadEmails.title}
            loading={isLoading}
            error={error?.message}
            rawError={error}
            onRefresh={() => refetch()}
            icon={<Mail size={18} />}
            badge={data?.total || undefined}
        >
            {data && data.emails.length > 0 ? (
                <List dense disablePadding>
                    {data.emails.map((email) => (
                        <ListItem
                            key={email.id}
                            disablePadding
                            sx={{
                                mb: 1,
                                cursor: 'pointer',
                                borderRadius: 1,
                                '&:hover': { bgcolor: 'action.hover' },
                                px: 1,
                                py: 0.5,
                            }}
                            onClick={() => router.push(`/dashboard/email?id=${email.id}`)}
                        >
                            <ListItemText
                                primary={getSenderName(email.from)}
                                secondary={email.subject || t.dashboard.widgets.unreadEmails.noSubject}
                                slotProps={{
                                    primary: {
                                        variant: 'body2',
                                        noWrap: true,
                                        fontWeight: 600,
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
