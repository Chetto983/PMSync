'use client';

import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Check, X, Loader2, Shield, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { getAddToolApprovalResponse } from './ChatRuntimeProvider';

// ---------------------------------------------------------------------------
// Tool summary generation for human-readable approval cards
// ---------------------------------------------------------------------------

const HIGH_RISK_TEMPLATES: Record<string, (args: Record<string, unknown>) => string> = {
  send_email: (args) => {
    const to = typeof args.to === 'string' ? args.to : Array.isArray(args.to) ? args.to.join(', ') : 'unknown';
    const subject = typeof args.subject === 'string' ? `'${args.subject}'` : '';
    return `Send email to ${to}${subject ? ` with subject ${subject}` : ''}`;
  },
  delete_email: (args) => {
    const id = typeof args.emailId === 'string' ? args.emailId : 'selected email';
    return `Delete email ${id}`;
  },
  forward_email: (args) => {
    const to = typeof args.to === 'string' ? args.to : Array.isArray(args.to) ? args.to.join(', ') : 'unknown';
    return `Forward email to ${to}`;
  },
  reply_email: (args) => {
    const id = typeof args.emailId === 'string' ? args.emailId : 'selected email';
    return `Reply to email ${id}`;
  },
  delete_event: (args) => {
    const title = typeof args.title === 'string' ? `'${args.title}'` : 'selected event';
    return `Delete event ${title}`;
  },
  delete_contact: (args) => {
    const name = typeof args.name === 'string' ? args.name : typeof args.email === 'string' ? args.email : 'selected contact';
    return `Delete contact ${name}`;
  },
  delete_memory: (args) => {
    const memoryId = typeof args.memoryId === 'string' ? args.memoryId : 'selected memory';
    return `Delete memory ${memoryId}`;
  },
  delete_reminder: (args) => {
    const id = typeof args.reminderId === 'string' ? args.reminderId : 'selected reminder';
    return `Delete reminder ${id}`;
  },
};

export const HIGH_RISK_TOOLS = new Set(Object.keys(HIGH_RISK_TEMPLATES));

function generateToolSummary(toolName: string, args: Record<string, unknown>): string {
  const template = HIGH_RISK_TEMPLATES[toolName];
  if (template) {
    try {
      return template(args);
    } catch {
      // Fall through to default
    }
  }
  return `Execute ${toolName}`;
}

// ---------------------------------------------------------------------------
// Display state logic
// ---------------------------------------------------------------------------

type HitlDisplayState = 'pending' | 'approved' | 'rejected';

type HitlDecision = { approved: boolean; reason?: string };

const hitlDecisionCache = new Map<string, HitlDecision>();

function inferDecisionFromResult(result: unknown): HitlDecision | null {
  const record = result as Record<string, unknown> | undefined;
  if (!record) return null;
  if (record.approved === true) return { approved: true };
  if (record.approved === false) {
    return {
      approved: false,
      reason: typeof record.reason === 'string' ? record.reason : undefined,
    };
  }

  const errorText = typeof record.error === 'string'
    ? record.error
    : typeof record.reason === 'string'
      ? record.reason
      : '';
  if (/(denied|rejected|cancelled|not sent|not deleted|not removed)/i.test(errorText)) {
    return { approved: false, reason: errorText };
  }

  return null;
}

function rememberDecision(toolCallId: string, decision: HitlDecision) {
  if (!toolCallId) return;
  hitlDecisionCache.set(toolCallId, decision);
}

function getDisplayState(
  status: { type: string },
  result: unknown,
  toolCallId: string,
): HitlDisplayState {
  if (status.type === 'requires-action') return 'pending';
  const decisionFromResult = inferDecisionFromResult(result);
  if (decisionFromResult) {
    rememberDecision(toolCallId, decisionFromResult);
    return decisionFromResult.approved ? 'approved' : 'rejected';
  }
  const cached = hitlDecisionCache.get(toolCallId);
  if (cached) return cached.approved ? 'approved' : 'rejected';
  // If complete but no approval data, treat as approved (tool executed normally)
  return 'approved';
}

// ---------------------------------------------------------------------------
// Elapsed time display for pending approvals (FE-H4)
// ---------------------------------------------------------------------------

/** Threshold in ms after which we show an expiry warning (3 minutes). */
const HITL_EXPIRY_WARNING_MS = 3 * 60 * 1000;

function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now();
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  return elapsed;
}

function formatElapsed(totalSeconds: number, t: { minutes: string; seconds: string }): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0) {
    return `${mins} ${t.minutes} ${secs} ${t.seconds}`;
  }
  return `${secs} ${t.seconds}`;
}

// ---------------------------------------------------------------------------
// HitlApprovalWrapper -- SDK-native approval card with terminal states
// ---------------------------------------------------------------------------

interface HitlApprovalWrapperProps {
  status: { type: string; reason?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addResult: (result: any) => void;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  /** Interrupt payload from assistant-ui, contains { type: 'human', payload: { id: approvalId } } */
  interrupt?: { type: string; payload?: { id?: string } };
}

export function HitlApprovalWrapper({
  status,
  addResult,
  toolCallId,
  toolName,
  args,
  result,
  interrupt,
}: HitlApprovalWrapperProps) {
  const t = useTranslations();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  // Track local user action for display when SDK path doesn't update result prop
  const [localAction, setLocalAction] = useState<'approved' | 'rejected' | null>(null);
  const isPending = status.type === 'requires-action' && localAction === null;
  const elapsedSeconds = useElapsedSeconds(isPending);
  const isNearExpiry = elapsedSeconds * 1000 >= HITL_EXPIRY_WARNING_MS;

  useEffect(() => {
    const decision = inferDecisionFromResult(result);
    if (decision) {
      rememberDecision(toolCallId, decision);
    }
  }, [result, toolCallId]);

  const displayState = localAction && status.type !== 'requires-action'
    ? localAction
    : getDisplayState(status, result, toolCallId);

  const handleApprove = () => {
    setBusy('approve');
    setLocalAction('approved');
    rememberDecision(toolCallId, { approved: true });
    const approvalId = (interrupt?.payload as Record<string, unknown>)?.id as string | undefined;
    const approvalFn = getAddToolApprovalResponse();
    if (approvalId && approvalFn) {
      approvalFn({ id: approvalId, approved: true });
    } else {
      addResult({ approved: true });
    }
  };

  const handleReject = () => {
    setBusy('reject');
    setLocalAction('rejected');
    rememberDecision(toolCallId, { approved: false, reason: 'User rejected' });
    const approvalId = interrupt?.payload?.id;
    const approvalFn = getAddToolApprovalResponse();
    if (approvalId && approvalFn) {
      approvalFn({ id: approvalId, approved: false, reason: 'User rejected' });
    } else {
      addResult({ approved: false, reason: 'User rejected' });
    }
  };

  const isBusy = busy !== null;
  const summary = generateToolSummary(toolName, args);

  // --- Approved terminal state ---
  if (displayState === 'approved') {
    return (
      <Box
        data-testid="hitl-approved"
        data-tool-name={toolName}
        sx={{
          border: 1,
          borderColor: 'success.main',
          borderRadius: 2,
          p: 2,
          bgcolor: (theme) => theme.palette.success.main + '0D',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircle
            size={16}
            style={{ flexShrink: 0, color: 'var(--mui-palette-success-main)' }}
          />
          <Typography variant="body2" fontWeight={500}>
            {summary}
          </Typography>
          <Chip
            label={t.chat.hitl.approvedChip}
            size="small"
            sx={{
              ml: 'auto',
              height: 20,
              fontSize: '0.75rem',
              bgcolor: 'success.light',
              color: 'success.main',
              '& .MuiChip-label': { px: 1 },
            }}
          />
        </Box>
        <ToolDetails toolName={toolName} args={args} />
      </Box>
    );
  }

  // --- Rejected terminal state ---
  if (displayState === 'rejected') {
    return (
      <Box
        data-testid="hitl-rejected"
        data-tool-name={toolName}
        sx={{
          border: 1,
          borderColor: 'error.main',
          borderRadius: 2,
          p: 2,
          bgcolor: (theme) => theme.palette.error.main + '0D',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <XCircle
            size={16}
            style={{ flexShrink: 0, color: 'var(--mui-palette-error-main)' }}
          />
          <Typography variant="body2" fontWeight={500}>
            {summary}
          </Typography>
          <Chip
            label={t.chat.hitl.deniedChip}
            size="small"
            sx={{
              ml: 'auto',
              height: 20,
              fontSize: '0.75rem',
              bgcolor: 'error.light',
              color: 'error.main',
              '& .MuiChip-label': { px: 1 },
            }}
          />
        </Box>
        <ToolDetails toolName={toolName} args={args} />
      </Box>
    );
  }

  // --- Pending state (requires-action) ---
  return (
    <Box
      data-testid="hitl-approval"
      data-tool-name={toolName}
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
        <Chip
          label={t.chat.hitl.highChip}
          size="small"
          sx={{
            ml: 'auto',
            height: 20,
            fontSize: '0.75rem',
            bgcolor: 'error.light',
            color: 'error.main',
            '& .MuiChip-label': { px: 1 },
          }}
        />
      </Box>

      {/* Elapsed time (FE-H4) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Clock size={12} style={{ opacity: 0.6 }} />
        <Typography variant="caption" color="text.secondary">
          {t.chat.hitl.waitingFor} {formatElapsed(elapsedSeconds, { minutes: t.chat.hitl.minutes, seconds: t.chat.hitl.seconds })}
        </Typography>
      </Box>

      {/* Expiry warning */}
      {isNearExpiry && (
        <Typography
          variant="caption"
          sx={{ color: 'error.main', fontWeight: 500 }}
        >
          {t.chat.hitl.expiryWarning}
        </Typography>
      )}

      {/* Action summary */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {summary}
        </Typography>
        <ToolDetails toolName={toolName} args={args} />
      </Box>

      {/* Approve / Deny / Dismiss buttons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          data-testid="hitl-approve"
          variant="contained"
          size="small"
          onClick={handleApprove}
          disabled={isBusy}
          startIcon={
            busy === 'approve' ? (
              <Box component="span" sx={{ display: 'inline-flex', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } }, animation: 'spin 1s linear infinite' }}><Loader2 size={14} /></Box>
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
          data-testid="hitl-deny"
          variant="contained"
          size="small"
          onClick={handleReject}
          disabled={isBusy}
          startIcon={
            busy === 'reject' ? (
              <Box component="span" sx={{ display: 'inline-flex', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } }, animation: 'spin 1s linear infinite' }}><Loader2 size={14} /></Box>
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
        <Button
          variant="text"
          size="small"
          onClick={handleReject}
          disabled={isBusy}
          sx={{ ml: 'auto', textTransform: 'none', fontSize: '0.8rem', color: 'text.secondary' }}
        >
          {t.chat.hitl.dismiss}
        </Button>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Shared tool details (read-only collapsible parameters)
// ---------------------------------------------------------------------------

function ToolDetails({ toolName, args }: { toolName: string; args: Record<string, unknown> }) {
  const t = useTranslations();

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
        <Shield size={12} />
        <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
          {toolName}
        </Box>
      </Box>
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
            {t.chat.hitl.viewParameters}
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
    </>
  );
}
