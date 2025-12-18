'use client';

/**
 * InlineActionCard - Inline HITL Approval Component
 *
 * Shows pending action directly in chat for approve/reject/modify.
 * Follows 2025 HITL best practices from research:
 * - Inline display mode for quick confirmations
 * - Max 2 primary actions (Approve/Reject)
 * - Expandable details to view/edit payload
 * - Independent confirmation (user must explicitly approve)
 *
 * @see https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices
 * @see https://developers.openai.com/apps-sdk/concepts/ui-guidelines/
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Collapse,
  TextField,
  IconButton,
  Chip,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  Calendar,
  User,
  Trash2,
  FolderInput,
  AlertTriangle,
  Edit3,
  Bot,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { multiAgentApi, type PendingAction } from '@/lib/api/ai';

// Re-export for ChatMessages
export type { PendingAction };

interface InlineActionCardProps {
  action: PendingAction;
  onStatusChange?: (newStatus: string) => void;
}

// Action type icons
const ACTION_ICONS: Record<string, typeof Mail> = {
  SEND_EMAIL: Mail,
  CREATE_EVENT: Calendar,
  UPDATE_CONTACT: User,
  DELETE_EMAIL: Trash2,
  MOVE_EMAIL: FolderInput,
};

// Severity colors
const SEVERITY_COLORS = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'error',
} as const;

export function InlineActionCard({ action, onStatusChange }: InlineActionCardProps) {
  const theme = useTheme();
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedPayload, setEditedPayload] = useState(action.payload);

  // Get translated labels with fallbacks
  const inlineT = (t.ai as Record<string, unknown>)?.inlineAction as Record<string, unknown> | undefined;
  const getActionTypeLabel = (type: string) => {
    const types = inlineT?.actionTypes as Record<string, string> | undefined;
    return types?.[type] || type.replace(/_/g, ' ');
  };
  const getSeverityLabel = (sev: string) => {
    const sevLabels = inlineT?.severity as Record<string, string> | undefined;
    return sevLabels?.[sev] || sev;
  };
  const getFieldLabel = (field: string) => {
    const fields = inlineT?.fields as Record<string, string> | undefined;
    return fields?.[field] || field;
  };

  const Icon = ACTION_ICONS[action.actionType] || Mail;
  const severityColor = SEVERITY_COLORS[action.severity];
  // Default to PENDING if status is undefined
  const isPending = !action.status || action.status === 'PENDING';

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      // Send the edited payload instead of the original one
      await multiAgentApi.approveAction(action.id, editedPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
      onStatusChange?.('APPROVED');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async () => {
      await multiAgentApi.rejectAction(action.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
      onStatusChange?.('REJECTED');
    },
  });

  const isLoading = approveMutation.isPending || rejectMutation.isPending;

  // Render payload fields
  const renderPayloadFields = () => {
    const editableFields = ['to', 'cc', 'bcc', 'subject', 'body', 'title', 'location'];

    return Object.entries(editedPayload)
      .filter(([key]) => editableFields.includes(key) || key === 'attendees')
      .map(([key, value]) => {
        if (value === undefined || value === null) return null;

        const displayValue = Array.isArray(value)
          ? value.join(', ')
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);

        const isMultiline = key === 'body';

        return (
          <Box key={key} sx={{ mb: 1.5 }}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 500, textTransform: 'uppercase', fontSize: '0.65rem' }}
            >
              {getFieldLabel(key)}
            </Typography>
            {editMode ? (
              <TextField
                fullWidth
                size="small"
                multiline={isMultiline}
                rows={isMultiline ? 3 : 1}
                value={displayValue}
                onChange={(e) => {
                  setEditedPayload(prev => ({
                    ...prev,
                    [key]: key === 'to' || key === 'cc' || key === 'bcc' || key === 'attendees'
                      ? e.target.value.split(',').map(s => s.trim())
                      : e.target.value,
                  }));
                }}
                sx={{
                  mt: 0.5,
                  '& .MuiOutlinedInput-root': {
                    fontSize: '0.85rem',
                    bgcolor: alpha(theme.palette.background.paper, 0.5),
                  },
                }}
              />
            ) : (
              <Typography
                variant="body2"
                sx={{
                  mt: 0.25,
                  color: 'text.primary',
                  wordBreak: 'break-word',
                  whiteSpace: isMultiline ? 'pre-wrap' : 'normal',
                }}
              >
                {displayValue || '-'}
              </Typography>
            )}
          </Box>
        );
      });
  };

  // Status indicator for non-pending states
  const renderStatusBadge = () => {
    if (isPending) return null;

    const statusConfig = {
      APPROVED: { color: 'success', label: (inlineT?.approved as string) || 'Approved' },
      REJECTED: { color: 'error', label: (inlineT?.rejected as string) || 'Rejected' },
      EXECUTED: { color: 'success', label: (inlineT?.executed as string) || 'Executed' },
      FAILED: { color: 'error', label: (inlineT?.failed as string) || 'Failed' },
      EXPIRED: { color: 'warning', label: (inlineT?.expired as string) || 'Expired' },
    };

    const config = statusConfig[action.status as keyof typeof statusConfig];
    if (!config) return null;

    return (
      <Chip
        size="small"
        label={config.label}
        color={config.color as 'success' | 'error' | 'warning'}
        sx={{ fontWeight: 600, fontSize: '0.7rem' }}
      />
    );
  };

  return (
    <Box
      sx={{
        mt: 2,
        borderRadius: 3,
        border: '2px solid',
        borderColor: isPending
          ? alpha(theme.palette.warning.main, 0.5)
          : alpha(theme.palette.divider, 0.2),
        bgcolor: isPending
          ? alpha(theme.palette.warning.main, 0.04)
          : alpha(theme.palette.background.paper, 0.5),
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        ...(isPending && {
          boxShadow: `0 0 0 1px ${alpha(theme.palette.warning.main, 0.1)}`,
        }),
      }}
    >
      {/* Header */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          cursor: 'pointer',
          bgcolor: isPending
            ? alpha(theme.palette.warning.main, 0.06)
            : 'transparent',
          borderBottom: expanded ? '1px solid' : 'none',
          borderColor: alpha(theme.palette.divider, 0.1),
          '&:hover': {
            bgcolor: isPending
              ? alpha(theme.palette.warning.main, 0.08)
              : alpha(theme.palette.action.hover, 0.04),
          },
        }}
      >
        {/* Icon */}
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette[severityColor].main, 0.1),
            color: `${severityColor}.main`,
          }}
        >
          <Icon size={18} />
        </Box>

        {/* Title & Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {getActionTypeLabel(action.actionType)}
            </Typography>
            <Chip
              size="small"
              icon={<AlertTriangle size={10} />}
              label={getSeverityLabel(action.severity)}
              color={severityColor}
              variant="outlined"
              sx={{ height: 20, fontSize: '0.65rem', '& .MuiChip-icon': { fontSize: 10 } }}
            />
            {renderStatusBadge()}
          </Box>
          {action.summary && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {action.summary}
            </Typography>
          )}
        </Box>

        {/* Expand/Collapse */}
        <IconButton
          size="small"
          sx={{ color: 'text.secondary' }}
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </IconButton>
      </Box>

      {/* Expandable Details */}
      <Collapse in={expanded}>
        <Box sx={{ px: 2, py: 2 }}>
          {/* AI Reasoning Section */}
          {(action.reasoningSteps || action.suspendReason) && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: alpha(theme.palette.info.main, 0.04), borderRadius: 2, border: '1px solid', borderColor: alpha(theme.palette.info.main, 0.1) }}>
              <Typography
                variant="caption"
                sx={{ color: 'info.main', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
              >
                <Bot size={12} /> {(inlineT?.reasoning as string) || 'AI Reasoning'}
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'text.secondary' }}>
                {action.reasoningSteps || action.suspendReason}
              </Typography>
            </Box>
          )}

          {/* Payload Fields */}
          <Typography
            variant="caption"
            sx={{ mb: 1.5, display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}
          >
            {(inlineT?.actionDetails as string) || 'Action Details'}
          </Typography>
          {renderPayloadFields()}

          {/* Edit toggle */}
          {isPending && (
            <Button
              size="small"
              startIcon={<Edit3 size={14} />}
              onClick={() => setEditMode(!editMode)}
              sx={{ mt: 1, textTransform: 'none', fontSize: '0.75rem' }}
            >
              {editMode
                ? ((inlineT?.hideDetails as string) || 'Done editing')
                : ((inlineT?.editPayload as string) || 'Edit')}
            </Button>
          )}
        </Box>
      </Collapse>

      {/* Action Buttons - Only show for PENDING */}
      {isPending && (
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: 'flex',
            gap: 1,
            borderTop: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.1),
            bgcolor: alpha(theme.palette.background.paper, 0.5),
          }}
        >
          <Button
            fullWidth
            variant="contained"
            color="success"
            size="small"
            startIcon={isLoading && approveMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <Check size={16} />}
            onClick={() => approveMutation.mutate()}
            disabled={isLoading}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              py: 1,
              boxShadow: 'none',
              '&:hover': { boxShadow: 'none' },
            }}
          >
            {approveMutation.isPending
              ? ((inlineT?.approving as string) || 'Approving...')
              : (t.ai?.approve || 'Approve')}
          </Button>
          <Button
            fullWidth
            variant="outlined"
            color="error"
            size="small"
            startIcon={isLoading && rejectMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <X size={16} />}
            onClick={() => rejectMutation.mutate()}
            disabled={isLoading}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              py: 1,
            }}
          >
            {rejectMutation.isPending
              ? ((inlineT?.rejecting as string) || 'Rejecting...')
              : (t.ai?.reject || 'Reject')}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default InlineActionCard;
