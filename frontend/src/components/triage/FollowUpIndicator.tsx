import React from 'react';
import { Box, Chip, Typography, IconButton, Tooltip, Skeleton } from '@mui/material';
import { CheckSquare, Clock, X, Check } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useFollowUpForEmail,
  useUpdateFollowUpStatus,
  useDeleteFollowUp,
} from '@/hooks/queries/use-follow-ups';

interface FollowUpIndicatorProps {
  emailId: string;
}

export function FollowUpIndicator({ emailId }: FollowUpIndicatorProps) {
  const t = useTranslations();
  const tr = t.ai.triage.followUp;
  const { data: followUp, isLoading } = useFollowUpForEmail(emailId);
  const updateStatus = useUpdateFollowUpStatus();
  const deleteFollowUp = useDeleteFollowUp();

  if (isLoading) {
    return <Skeleton width={120} height={24} />;
  }

  if (!followUp || followUp.status === 'RESOLVED' || followUp.status === 'EXPIRED') {
    return null;
  }

  const isTodo = followUp.followUpType === 'TODO';
  const isWaiting = followUp.followUpType === 'WAITING_FOR';

  const handleResolve = () => {
    updateStatus.mutate({ id: followUp.id, status: 'RESOLVED' });
  };

  const handleDismiss = () => {
    deleteFollowUp.mutate(followUp.id);
  };

  const dueDate = followUp.dueDate
    ? new Date(followUp.dueDate).toLocaleDateString()
    : null;

  const waitingSince = followUp.createdAt
    ? new Date(followUp.createdAt).toLocaleDateString()
    : null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.5,
        px: 1,
        borderRadius: 1,
        bgcolor: isTodo ? 'success.main' : 'warning.main',
        color: 'common.white',
        fontSize: '0.75rem',
      }}
    >
      {isTodo && <CheckSquare size={14} />}
      {isWaiting && <Clock size={14} />}

      <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 600 }}>
        {isTodo ? tr.todo : tr.waiting}
      </Typography>

      {isTodo && dueDate && (
        <Chip
          size="small"
          label={`${tr.dueDate}: ${dueDate}`}
          sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.2)', color: 'inherit' }}
        />
      )}

      {isWaiting && waitingSince && (
        <Chip
          size="small"
          label={`${tr.waitingSince} ${waitingSince}`}
          sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.2)', color: 'inherit' }}
        />
      )}

      {followUp.reason && (
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', ml: 0.5 }}>
          {followUp.reason}
        </Typography>
      )}

      <Box sx={{ ml: 'auto', display: 'flex', gap: 0.25 }}>
        <Tooltip title={tr.resolve}>
          <IconButton
            size="small"
            onClick={handleResolve}
            disabled={updateStatus.isPending}
            sx={{ color: 'inherit', p: 0.25 }}
          >
            <Check size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip title={tr.dismiss}>
          <IconButton
            size="small"
            onClick={handleDismiss}
            disabled={deleteFollowUp.isPending}
            sx={{ color: 'inherit', p: 0.25 }}
          >
            <X size={14} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
