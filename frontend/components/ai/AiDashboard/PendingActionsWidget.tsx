'use client';

import React, { useEffect } from 'react';
import { Box, Typography, Chip, Button, Skeleton, Tooltip, alpha, useTheme } from '@mui/material';
import { Zap, Check, X, ArrowRight } from 'lucide-react';
import { useQuery, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { multiAgentApi } from '@/lib/api/ai';
import { websocketClient } from '@/lib/websocket-client';
import { CollapsibleWidget } from './CollapsibleWidget';

function pendingActionsOptions() {
  return queryOptions({
    queryKey: ['ai', 'pendingActions'],
    queryFn: async () => {
      const response = await multiAgentApi.getPendingActions({ status: 'PENDING', limit: 5 });
      return response.data?.actions || [];
    },
    staleTime: 10 * 1000, // Reduced for faster updates
    gcTime: 5 * 60 * 1000,
    refetchInterval: 15 * 1000, // Poll every 15s for real-time updates
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

  // WebSocket subscription for real-time updates
  useEffect(() => {
    if (!websocketClient.isConnected()) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
    };

    const unsubCreated = websocketClient.onAiActionCreated(invalidate);
    const unsubApproved = websocketClient.onAiActionApproved(invalidate);
    const unsubRejected = websocketClient.onAiActionRejected(invalidate);
    const unsubExecuted = websocketClient.onAiActionExecuted(invalidate);

    return () => {
      unsubCreated();
      unsubApproved();
      unsubRejected();
      unsubExecuted();
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <Box
        sx={{
          borderRadius: 4,
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          p: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: 2 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={18} />
            <Skeleton width="70%" height={12} sx={{ mt: 0.5 }} />
          </Box>
        </Box>
      </Box>
    );
  }

  // Collapsed summary - show count badge
  const collapsedSummary = actions.length > 0 ? (
    <Chip
      label={actions.length}
      size="small"
      color="warning"
      sx={{ fontWeight: 700, height: 22 }}
    />
  ) : (
    <Typography variant="caption" color="text.secondary">
      {t.ai?.noPendingActions || 'None'}
    </Typography>
  );

  return (
    <CollapsibleWidget
      title={t.ai?.pendingActions || 'Pending Actions'}
      subtitle={t.ai?.pendingActionsHint || 'Requires your approval'}
      icon={<Zap size={18} />}
      iconBgColor={alpha(theme.palette.warning.main, 0.9)}
      defaultExpanded={actions.length > 0}
      collapsedSummary={collapsedSummary}
    >
      <Box sx={{ p: 2 }}>
        {actions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t.ai?.noPendingActions || 'No pending actions'}
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
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                  {action.actionType === 'SEND_EMAIL' && (t.ai?.actions?.sendEmail || 'Send email')}
                  {action.actionType === 'CREATE_EVENT' && (t.ai?.actions?.createEvent || 'Create event')}
                  {action.actionType === 'UPDATE_CONTACT' && (t.ai?.actions?.updateContact || 'Update contact')}
                  {!['SEND_EMAIL', 'CREATE_EVENT', 'UPDATE_CONTACT'].includes(action.actionType) && action.actionType.replace(/_/g, ' ')}
                </Typography>
                <Tooltip title={action.reasoningSteps || action.suspendReason || ''}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, cursor: 'help' }}>
                    {action.summary || ''}
                  </Typography>
                </Tooltip>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<Check size={14} />}
                    onClick={() => approveMutation.mutate(action.id)}
                    disabled={approveMutation.isPending}
                    sx={{ flex: 1, textTransform: 'none', fontSize: '0.75rem', py: 0.5 }}
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
                    sx={{ flex: 1, textTransform: 'none', fontSize: '0.75rem', py: 0.5 }}
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
                {t.common.viewAll || 'View all'} ({actions.length})
              </Button>
            )}
          </Box>
        )}
      </Box>
    </CollapsibleWidget>
  );
}

export default PendingActionsWidget;
