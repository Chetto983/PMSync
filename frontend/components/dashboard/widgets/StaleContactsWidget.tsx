/**
 * StaleContactsWidget - Contacts needing reconnection
 */

'use client';

import { useStaleContacts } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import {
    Typography,
    List,
    ListItem,
    ListItemText,
    Chip,
    Button,
    Box,
} from '@mui/material';
import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function StaleContactsWidget() {
    const t = useTranslations();
    const router = useRouter();
    const { data, isLoading, error, refetch } = useStaleContacts({ limit: 5 });

    const crm = t.dashboard.widgets.crm;

    return (
        <BaseWidget
            id="contacts"
            title={crm.title}
            loading={isLoading}
            error={error?.message}
            rawError={error}
            onRefresh={() => refetch()}
            icon={<Users size={20} />}
            actions={
                data?.total ? (
                    <Chip
                        label={data.total === 1 ? crm.subtitle.replace('{count}', '1') : crm.subtitlePlural.replace('{count}', String(data.total))}
                        size="small"
                        color="warning"
                    />
                ) : null
            }
        >
            {data && data.contacts.length > 0 ? (
                <>
                    <List dense disablePadding>
                        {data.contacts.map((contact) => (
                            <ListItem
                                key={contact.id}
                                disablePadding
                                sx={{ mb: 1 }}
                                secondaryAction={
                                    <Button
                                        size="small"
                                        variant="text"
                                        onClick={() => router.push(`/dashboard/contacts?id=${contact.id}`)}
                                        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                                    >
                                        {crm.reconnect}
                                    </Button>
                                }
                            >
                                <ListItemText
                                    primary={contact.name}
                                    secondary={crm.daysAgo.replace('{days}', String(contact.daysSinceContact))}
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
                    {data.averageScore > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            {crm.avgScore.replace('{score}', String(data.averageScore))}
                        </Typography>
                    )}
                </>
            ) : (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        {crm.allActive}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                        {crm.greatJob}
                    </Typography>
                </Box>
            )}
        </BaseWidget>
    );
}
