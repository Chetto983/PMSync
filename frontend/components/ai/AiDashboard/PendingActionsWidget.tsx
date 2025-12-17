'use client';

import React from 'react';
import { Box, Typography, Paper, Chip, Button, Skeleton, alpha, useTheme } from '@mui/material';
import { Zap, Check, X, ArrowRight } from 'lucide-react';
import { useQuery, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { multiAgentApi } from '@/lib/api/ai';

function pendingActionsOptions() {
  return queryOptions({
    queryKey: ['ai', 'pendingActions'],
    queryFn: async () => {
      const response = await multiAgentApi.getPendingActions({ status: 'PENDING', limit: 5 });
      return response.data?.actions || [];
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function PendingActionsWidget() {
  const theme = useTheme();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { data: actions = [], isLoading } = useQuery(pendingActionsOptions());

  const approveMutation = useMutation({
    mutationFn: (actionId: string) => multiAgentApi.approveAction(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (actionId: string) => multiAgentApi.rejectAction(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
    },
  });

  if (isLoading) {
    return (
      <Paper
        elevation={0}
        sx={{
          borderRadius: 4,
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          p: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={20} />
            <Skeleton width="70%" height={14} sx={{ mt: 0.5 }} />
          </Box>
        </Box>
        <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.warning.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'warning.main',
          }}
        >
          <Zap size={20} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {t.ai?.pendingActions || 'Azioni in sospeso'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t.ai?.pendingActionsHint || 'Richiede la tua approvazione'}
          </Typography>
        </Box>
        {actions.length > 0 && (
          <Chip
            label={actions.length}
            size="small"
            color="warning"
            sx={{ fontWeight: 700 }}
          />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {actions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {t.ai?.noPendingActions || 'Nessuna azione in sospeso'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {actions.slice(0, 3).map((action) => (
              <Box
                key={action.id}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.background.default, 0.5),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.08),
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  {action.actionType === 'SEND_EMAIL' && (t.ai?.actions?.sendEmail || 'Send email')}
                  {action.actionType === 'CREATE_EVENT' && (t.ai?.actions?.createEvent || 'Create event')}
                  {action.actionType === 'UPDATE_CONTACT' && (t.ai?.actions?.updateContact || 'Update contact')}
                  {!['SEND_EMAIL', 'CREATE_EVENT', 'UPDATE_CONTACT'].includes(action.actionType) && action.actionType.replace(/_/g, ' ')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  {action.summary || ''}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<Check size={14} />}
                    onClick={() => approveMutation.mutate(action.id)}
                    disabled={approveMutation.isPending}
                    sx={{ flex: 1, textTransform: 'none', fontSize: '0.75rem' }}
                  >
                    {t.ai?.approve || 'Approve'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<X size={14} />}
                    onClick={() => rejectMutation.mutate(action.id)}
                    disabled={rejectMutation.isPending}
                    sx={{ flex: 1, textTransform: 'none', fontSize: '0.75rem' }}
                  >
                    {t.ai?.reject || 'Reject'}
                  </Button>
                </Box>
              </Box>
            ))}

            {actions.length > 3 && (
              <Button
                size="small"
                endIcon={<ArrowRight size={14} />}
                sx={{ textTransform: 'none', alignSelf: 'center' }}
              >
                {t.common.viewAll || 'Vedi tutti'} ({actions.length})
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
}

export default PendingActionsWidget;
