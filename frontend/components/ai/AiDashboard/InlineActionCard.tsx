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
 * Refactored 2026-01-31: Extracted hooks and sub-components.
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
  IconButton,
  Chip,
  CircularProgress,
  Alert,
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
import { useTranslations } from '@/lib/hooks/use-translations';
import { type PendingAction, type ApprovalResponse } from '@/lib/api/ai';
import { useHitlMutations } from './useHitlMutations';
import { HitlPayloadEditor } from './HitlPayloadEditor';
import { HitlStatusBadge } from './HitlStatusBadge';

// Re-export for ChatMessages
export type { PendingAction };

interface InlineActionCardProps {
  action: PendingAction;
  onStatusChange?: (newStatus: string, executionResult?: ApprovalResponse['executionResult']) => void;
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

  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedPayload, setEditedPayload] = useState(action.payload);
  const [executionFeedback, setExecutionFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

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
  const isPending = !action.status || action.status === 'PENDING';

  // Use extracted mutations hook
  const { approveMutation, rejectMutation, isLoading } = useHitlMutations({
    actionId: action.id,
    editedPayload,
    onApproveSuccess: (result) => {
      if (result.executionResult) {
        const execResult = result.executionResult;
        if (execResult.success) {
          const summary = Array.isArray(execResult.summary)
            ? execResult.summary.join(', ')
            : execResult.summary || ((inlineT?.executionSuccess as string) || 'Action completed successfully');
          setExecutionFeedback({ success: true, message: summary });
        } else {
          setExecutionFeedback({
            success: false,
            message: execResult.error || ((inlineT?.executionFailed as string) || 'Action failed'),
          });
        }
      }
      onStatusChange?.('APPROVED', result.executionResult);
    },
    onRejectSuccess: () => {
      onStatusChange?.('REJECTED');
    },
  });

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
            <HitlStatusBadge
              status={action.status}
              translations={{
                approved: inlineT?.approved as string,
                rejected: inlineT?.rejected as string,
                executed: inlineT?.executed as string,
                failed: inlineT?.failed as string,
                expired: inlineT?.expired as string,
              }}
            />
          </Box>
          {action.summary && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {action.summary}
            </Typography>
          )}
        </Box>

        {/* Expand/Collapse */}
        <IconButton size="small" sx={{ color: 'text.secondary' }}>
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

          {/* Payload Fields - Using extracted component */}
          <Typography
            variant="caption"
            sx={{ mb: 1.5, display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}
          >
            {(inlineT?.actionDetails as string) || 'Action Details'}
          </Typography>
          <HitlPayloadEditor
            payload={editedPayload}
            editMode={editMode}
            onChange={setEditedPayload}
            getFieldLabel={getFieldLabel}
          />

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

      {/* Execution Feedback */}
      {executionFeedback && (
        <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: alpha(theme.palette.divider, 0.1) }}>
          <Alert
            severity={executionFeedback.success ? 'success' : 'error'}
            sx={{
              py: 0.5,
              '& .MuiAlert-message': { fontSize: '0.85rem' },
            }}
          >
            {executionFeedback.message}
          </Alert>
        </Box>
      )}

      {/* Action Buttons */}
      {isPending && !executionFeedback && (
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
