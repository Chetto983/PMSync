/**
 * UnreadEmailsWidget - Unread emails count and list
 */

'use client';

import { useImportantEmails } from '@/hooks/queries/use-dashboard';
import { BaseWidget } from './BaseWidget';
import { Typography, List, ListItem, ListItemText, Chip } from '@mui/material';

export function UnreadEmailsWidget() {
    const { data, isLoading, error, refetch } = useImportantEmails({ limit: 5 });

    return (
        <BaseWidget
            id="unread-emails"
            title="Unread Emails"
            loading={isLoading}
            error={error?.message}
            onRefresh={() => refetch()}
            actions={
                data?.total ? (
                    <Chip label={data.total} size="small" color="primary" />
                ) : null
            }
        >
            {data && data.emails.length > 0 ? (
                <List dense disablePadding>
                    {data.emails.map((email) => (
                        <ListItem key={email.id} disablePadding sx={{ mb: 1 }}>
                            <ListItemText
                                primary={email.subject || '(No subject)'}
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
                    All caught up!
                </Typography>
            )}
        </BaseWidget>
    );
}
