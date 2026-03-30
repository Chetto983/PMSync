'use client';

import {
  Box,
  Typography,
  Skeleton,
  Paper,
} from '@mui/material';
import { Lightbulb } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useNbaRecommendations, useUpdateNbaStatus } from '@/hooks/queries/use-crm-nba';
import { useGlobalToast } from '@/lib/context/toast-context';
import { SuggestionCard } from './SuggestionCard';

interface NBASectionProps {
  dealId: string;
}

export function NBASection({ dealId }: NBASectionProps) {
  const t = useTranslations();
  const tn = t.nba;
  const toast = useGlobalToast();

  const { data, isLoading, error } = useNbaRecommendations(dealId);
  const updateStatus = useUpdateNbaStatus();

  const handleExecute = (actionId: string) => {
    updateStatus.mutate(
      { actionId, status: 'ACCEPTED' },
      {
        onSuccess: () => toast.success(tn?.status?.ACCEPTED ?? 'Action accepted'),
        onError: () => toast.error(t.common.genericError),
      },
    );
  };

  const handleDismiss = (actionId: string) => {
    updateStatus.mutate(
      { actionId, status: 'DISMISSED' },
      {
        onSuccess: () => toast.success(tn?.status?.DISMISSED ?? 'Action dismissed'),
        onError: () => toast.error(t.common.genericError),
      },
    );
  };

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Skeleton width="50%" height={20} sx={{ mb: 1 }} />
        <Skeleton width="100%" height={60} sx={{ mb: 1 }} />
        <Skeleton width="100%" height={60} />
      </Paper>
    );
  }

  if (error) return null; // Silently fail — NBA is non-critical

  const actions = data?.actions ?? [];
  if (actions.length === 0) return null; // No recommendations = don't show section

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Lightbulb size={16} />
        <Typography variant="subtitle2" fontWeight={600}>
          {tn?.title ?? 'Recommended Actions'}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ ml: 'auto' }}
        >
          {actions.length}
        </Typography>
      </Box>

      {actions.map((action) => (
        <SuggestionCard
          key={action.id}
          action={action}
          onExecute={handleExecute}
          onDismiss={handleDismiss}
          disabled={updateStatus.isPending}
        />
      ))}
    </Paper>
  );
}
