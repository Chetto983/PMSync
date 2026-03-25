'use client';

import React, { useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';
import { XCircle, Clock } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useLocale } from '@/lib/hooks/use-locale';
import { formatDateTimeInTz } from '@/lib/utils/format-date-tz';
import {
  useScheduledEmails,
  useCancelScheduledEmail,
  useRescheduleScheduledEmail,
} from '@/hooks/queries/use-scheduled-emails';

export interface ScheduledEmailsListProps {
  copy: {
    title: string;
    noScheduled: string;
    cancel: string;
    cancelConfirm: string;
    reschedule: string;
    scheduledFor: string;
    recipients: string;
    status: { pending: string; processing: string; sent: string; failed: string };
  };
}

type StatusKey = 'pending' | 'processing' | 'sent' | 'failed';

const STATUS_COLOR: Record<StatusKey, 'info' | 'warning' | 'success' | 'error'> = {
  pending: 'info',
  processing: 'warning',
  sent: 'success',
  failed: 'error',
};

export function ScheduledEmailsList({ copy }: ScheduledEmailsListProps) {
  const timezone = useUserTimezone();
  const { locale } = useLocale();
  const { data: emails, isLoading } = useScheduledEmails();
  const cancelMutation = useCancelScheduledEmail();
  const rescheduleMutation = useRescheduleScheduledEmail();

  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<string | null>(null);
  const [newDateTime, setNewDateTime] = useState('');

  const handleCancelConfirm = () => {
    if (!cancelTarget) return;
    cancelMutation.mutate(cancelTarget, { onSettled: () => setCancelTarget(null) });
  };

  const handleRescheduleConfirm = () => {
    if (!rescheduleTarget || !newDateTime) return;
    const iso = new Date(newDateTime).toISOString();
    rescheduleMutation.mutate(
      { id: rescheduleTarget, scheduledAt: iso },
      { onSettled: () => { setRescheduleTarget(null); setNewDateTime(''); } },
    );
  };

  const formatDate = (iso: string) => {
    try { return formatDateTimeInTz(iso, timezone, locale); }
    catch { return iso; }
  };

  const statusLabel = (s: string) => {
    const key = s as StatusKey;
    return copy.status[key] ?? s;
  };

  const statusColor = (s: string) => STATUS_COLOR[s as StatusKey] ?? 'default';

  // Loading skeleton
  if (isLoading) {
    return (
      <SectionCard title={copy.title}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} />
        ))}
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard title={copy.title}>
        {!emails?.length ? (
          <Typography variant="body2" color="text.secondary">
            {copy.noScheduled}
          </Typography>
        ) : (
          <List disablePadding>
            {emails.map((email) => (
              <ListItem
                key={email.id}
                divider
                secondaryAction={
                  email.status === 'pending' ? (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title={copy.reschedule}>
                        <IconButton
                          size="small"
                          onClick={() => { setRescheduleTarget(email.id); setNewDateTime(''); }}
                        >
                          <Clock size={18} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={copy.cancel}>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setCancelTarget(email.id)}
                        >
                          <XCircle size={18} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ) : undefined
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 500, maxWidth: 300 }}>
                        {email.subject}
                      </Typography>
                      <Chip
                        label={statusLabel(email.status)}
                        color={statusColor(email.status) as any}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  }
                  secondary={
                    <>
                      {copy.recipients}: {email.to.join(', ')} &mdash;{' '}
                      {copy.scheduledFor}: {formatDate(email.scheduledAt)}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </SectionCard>

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancelTarget} onClose={() => setCancelTarget(null)}>
        <DialogTitle>{copy.cancel}</DialogTitle>
        <DialogContent>
          <Typography>{copy.cancelConfirm}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelTarget(null)}>{copy.cancel}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleCancelConfirm}
            disabled={cancelMutation.isPending}
          >
            {copy.cancel}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reschedule dialog */}
      <Dialog open={!!rescheduleTarget} onClose={() => setRescheduleTarget(null)}>
        <DialogTitle>{copy.reschedule}</DialogTitle>
        <DialogContent>
          <TextField
            type="datetime-local"
            fullWidth
            value={newDateTime}
            onChange={(e) => setNewDateTime(e.target.value)}
            sx={{ mt: 1 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRescheduleTarget(null)}>{copy.cancel}</Button>
          <Button
            variant="contained"
            onClick={handleRescheduleConfirm}
            disabled={!newDateTime || rescheduleMutation.isPending}
          >
            {copy.reschedule}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ScheduledEmailsList;
