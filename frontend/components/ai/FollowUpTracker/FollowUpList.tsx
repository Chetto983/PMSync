'use client';

import React from 'react';
import {
  Box,
  Typography,
  Skeleton,
  Button,
  alpha,
  useTheme,
} from '@mui/material';
import { Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { EmailFollowUp } from '@/hooks/queries';
import { FollowUpCard } from './FollowUpCard';

interface FollowUpListProps {
  followUps: EmailFollowUp[];
  isLoading?: boolean;
  error?: Error | null;
  onResolve?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
  resolvingId?: string | null;
  onRetry?: () => void;
}

export function FollowUpList({
  followUps,
  isLoading,
  error,
  onResolve,
  onSnooze,
  onViewEmail,
  resolvingId,
  onRetry,
}: FollowUpListProps) {
  const theme = useTheme();
  const t = useTranslations();

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={140}
            sx={{ borderRadius: 3 }}
          />
        ))}
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 6,
          gap: 2,
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: alpha(theme.palette.error.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'error.main',
          }}
        >
          <AlertCircle size={28} />
        </Box>
        <Typography color="error">{t.ai.followUpTracker.error}</Typography>
        {onRetry && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshCw size={16} />}
            onClick={onRetry}
          >
            {t.ai.followUpTracker.retry}
          </Button>
        )}
      </Box>
    );
  }

  // Empty state
  if (!followUps || followUps.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 6,
          gap: 2,
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: alpha(theme.palette.success.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'success.main',
          }}
        >
          <Clock size={28} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {t.ai.followUpTracker.noFollowUps}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {t.ai.followUpTracker.noFollowUpsDescription}
        </Typography>
      </Box>
    );
  }

  // List of follow-ups
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {followUps.map((followUp) => (
        <FollowUpCard
          key={followUp.id}
          followUp={followUp}
          onResolve={onResolve}
          onSnooze={onSnooze}
          onViewEmail={onViewEmail}
          isResolving={resolvingId === followUp.id}
        />
      ))}
    </Box>
  );
}

export default FollowUpList;
