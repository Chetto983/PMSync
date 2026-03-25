'use client';

import { useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { Clock, AlertTriangle } from 'lucide-react';
import {
  useFollowUpForEmail,
  useUpdateFollowUpStatus,
  useSnoozeFollowUp,
} from '@/hooks/queries/use-follow-ups';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { formatDateTimeInTz } from '@/lib/utils/format-date-tz';

interface FollowUpIndicatorProps {
  emailId: string;
}

function truncate(text: string, max = 80): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export default function FollowUpIndicator({ emailId }: FollowUpIndicatorProps) {
  const { data: followUp, isLoading } = useFollowUpForEmail(emailId);
  const updateStatus = useUpdateFollowUpStatus();
  const snooze = useSnoozeFollowUp();
  const [snoozed, setSnoozed] = useState(false);
  const tz = useUserTimezone();

  if (isLoading || !followUp || snoozed) return null;

  const isOverdue = followUp.dueDate ? new Date(followUp.dueDate) < new Date() : false;
  const severity = isOverdue ? 'error' : 'warning';
  const IconComponent = isOverdue ? AlertTriangle : Clock;
  const statusLabel = isOverdue ? 'Overdue' : 'Follow-up pending';

  const handleResolve = () => {
    updateStatus.mutate({ id: followUp.id, status: 'RESOLVED' });
  };

  const handleSnooze = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    snooze.mutate({ id: followUp.id, dueDate: tomorrow.toISOString() });
    setSnoozed(true);
  };

  return (
    <Alert
      severity={severity}
      icon={<IconComponent size={18} />}
      sx={{ mb: 1, py: 0.5, alignItems: 'center' }}
      action={
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Button
            size="small"
            color="inherit"
            onClick={handleSnooze}
            disabled={snooze.isPending}
          >
            Snooze
          </Button>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            onClick={handleResolve}
            disabled={updateStatus.isPending}
          >
            Resolve
          </Button>
        </Box>
      }
    >
      <Typography variant="body2" component="span" sx={{ fontWeight: 600, mr: 1 }}>
        {statusLabel}
      </Typography>
      {followUp.dueDate && (
        <Typography variant="caption" component="span" sx={{ mr: 1 }}>
          Due: {formatDateTimeInTz(followUp.dueDate, tz)}
        </Typography>
      )}
      {followUp.reason && (
        <Typography variant="caption" component="span" color="text.secondary">
          {truncate(followUp.reason)}
        </Typography>
      )}
    </Alert>
  );
}
