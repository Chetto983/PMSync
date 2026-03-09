'use client';

import { useState } from 'react';
import { AlertTriangle, Check, X, Loader2, Shield } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import type { PendingAction } from '@/lib/api/ai';

// ---------------------------------------------------------------------------
// HitlApprovalCard -- poll-based HITL (FUNCTIONAL mechanism)
// ---------------------------------------------------------------------------

interface HitlApprovalCardProps {
  action: PendingAction;
  onApprove: () => void;
  onReject: () => void;
  isApproving?: boolean;
  isRejecting?: boolean;
}

const severityColor: Record<string, { bg: string; color: string }> = {
  HIGH: { bg: 'error.light', color: 'error.main' },
  MEDIUM: { bg: 'warning.light', color: 'warning.main' },
  LOW: { bg: 'action.hover', color: 'text.secondary' },
};

export function HitlApprovalCard({
  action,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
}: HitlApprovalCardProps) {
  const t = useTranslations();
  const busy = isApproving || isRejecting;

  return (
    <Box
      sx={{
        border: 2,
        borderColor: 'warning.main',
        borderRadius: 2,
        p: 2,
        bgcolor: (theme) => theme.palette.warning.main + '0D',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AlertTriangle
          size={16}
          style={{ flexShrink: 0, color: 'var(--mui-palette-warning-main)' }}
        />
        <Typography variant="body2" fontWeight={500}>
          {t.chat.hitl.pendingTitle}
        </Typography>
      </Box>

      {/* Action info */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {action.summary}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.75rem' }}>
          <Box
            component="span"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}
          >
            <Shield size={12} />
            {action.actionType}
          </Box>
          {action.severity && (() => {
            const sev = severityColor[action.severity] ?? severityColor.LOW;
            return (
              <Chip
                label={action.severity}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.75rem',
                  bgcolor: sev.bg,
                  color: sev.color,
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            );
          })()}
        </Box>
      </Box>

      {/* Buttons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          onClick={onApprove}
          disabled={busy}
          startIcon={
            isApproving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />
          }
          sx={{
            bgcolor: 'success.main',
            '&:hover': { bgcolor: 'success.dark' },
            textTransform: 'none',
            fontSize: '0.875rem',
          }}
        >
          {t.chat.hitl.approveLabel}
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={onReject}
          disabled={busy}
          startIcon={
            isRejecting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />
          }
          sx={{
            bgcolor: 'error.main',
            '&:hover': { bgcolor: 'error.dark' },
            textTransform: 'none',
            fontSize: '0.875rem',
          }}
        >
          {t.chat.hitl.rejectLabel}
        </Button>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// HitlApprovalCardFromStatus -- native requires_action path (CODE PRESENT, NOT ACTIVE)
// This will activate when the backend emits requires_action status instead of
// the current data-needs-approval chunk approach. See Phase 28 or dedicated sub-task.
// ---------------------------------------------------------------------------

interface HitlApprovalCardFromStatusProps {
  status: { type: string; reason?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addResult: (result: any) => void;
  toolName: string;
  args: Record<string, unknown>;
}

export function HitlApprovalCardFromStatus({
  addResult,
  toolName,
  args,
}: HitlApprovalCardFromStatusProps) {
  const t = useTranslations();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const handleApprove = () => {
    setBusy('approve');
    addResult({ approved: true });
  };

  const handleReject = () => {
    setBusy('reject');
    addResult({ approved: false, reason: 'User rejected' });
  };

  const isBusy = busy !== null;

  return (
    <Box
      sx={{
        border: 2,
        borderColor: 'warning.main',
        borderRadius: 2,
        p: 2,
        bgcolor: (theme) => theme.palette.warning.main + '0D',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AlertTriangle
          size={16}
          style={{ flexShrink: 0, color: 'var(--mui-palette-warning-main)' }}
        />
        <Typography variant="body2" fontWeight={500}>
          {t.chat.hitl.pendingTitle}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          Tool{' '}
          <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
            {toolName}
          </Box>{' '}
          requires your approval
        </Typography>
        {args && Object.keys(args).length > 0 && (
          <Box component="details" sx={{ fontSize: '0.75rem' }}>
            <Box
              component="summary"
              sx={{
                color: 'text.secondary',
                cursor: 'pointer',
                userSelect: 'none',
                '&:hover': { color: 'text.primary' },
              }}
            >
              View parameters
            </Box>
            <Box
              component="pre"
              sx={{
                mt: 0.5,
                bgcolor: 'action.hover',
                borderRadius: 1,
                p: 1,
                overflowX: 'auto',
                maxHeight: 128,
                fontSize: '0.75rem',
              }}
            >
              {JSON.stringify(args, null, 2)}
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          onClick={handleApprove}
          disabled={isBusy}
          startIcon={
            busy === 'approve' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )
          }
          sx={{
            bgcolor: 'success.main',
            '&:hover': { bgcolor: 'success.dark' },
            textTransform: 'none',
            fontSize: '0.875rem',
          }}
        >
          {t.chat.hitl.approveLabel}
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={handleReject}
          disabled={isBusy}
          startIcon={
            busy === 'reject' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <X size={14} />
            )
          }
          sx={{
            bgcolor: 'error.main',
            '&:hover': { bgcolor: 'error.dark' },
            textTransform: 'none',
            fontSize: '0.875rem',
          }}
        >
          {t.chat.hitl.rejectLabel}
        </Button>
      </Box>
    </Box>
  );
}
