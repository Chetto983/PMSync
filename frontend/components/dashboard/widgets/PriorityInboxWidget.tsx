/**
 * PriorityInboxWidget - Shows starred/flagged important emails
 *
 * Uses the existing importantEmails query hook which fetches
 * emails marked as starred OR flagged (provider-agnostic "important")
 */

'use client';

import { useImportantEmails } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import {
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Box,
  Chip,
  Button,
} from '@mui/material';
import { Star, AlertCircle, Inbox } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function PriorityInboxWidget() {
  const t = useTranslations();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useImportantEmails({ limit: 5 });

  const handleViewAll = () => {
    router.push('/dashboard/email?filter=important');
  };

  const handleEmailClick = (emailId: string) => {
    router.push(`/dashboard/email?id=${emailId}`);
  };

  return (
    <BaseWidget
      id="priority-inbox"
      title={t.dashboard.widgets.priorityInbox.title}
      loading={isLoading}
      error={error?.message}
      rawError={error}
      onRefresh={() => refetch()}
      icon={<Star size={18} />}
      badge={data?.total || undefined}
      actions={
        data && data.emails.length > 0 ? (
          <Button size="small" onClick={handleViewAll}>
            {t.dashboard.widgets.priorityInbox.viewAll}
          </Button>
        ) : undefined
      }
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
                '&:hover': {
                  bgcolor: 'action.hover',
                },
                px: 1,
                py: 0.5,
              }}
              onClick={() => handleEmailClick(email.id)}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                {email.isStarred ? (
                  <Star size={16} fill="#FFB300" color="#FFB300" />
                ) : (
                  <AlertCircle size={16} color="error" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        fontWeight: email.isRead ? 400 : 600,
                        flex: 1,
                      }}
                    >
                      {email.subject || t.dashboard.widgets.priorityInbox.noSubject}
                    </Typography>
                    {!email.isRead && (
                      <Chip
                        label={t.dashboard.widgets.priorityInbox.urgent}
                        size="small"
                        color="error"
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    )}
                  </Box>
                }
                secondary={
                  <Typography variant="caption" noWrap color="text.secondary">
                    {typeof email.from === 'object'
                      ? email.from?.name || email.from?.email
                      : email.from}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 3,
            color: 'text.secondary',
          }}
        >
          <Inbox size={32} strokeWidth={1.5} />
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
            {t.dashboard.widgets.priorityInbox.empty}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center' }}>
            {t.dashboard.widgets.priorityInbox.emptyDescription}
          </Typography>
        </Box>
      )}
    </BaseWidget>
  );
}
