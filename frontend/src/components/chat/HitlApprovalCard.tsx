'use client';

import { useState } from 'react';
import { AlertTriangle, Check, X, Loader2, Shield } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
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

const severityBadge: Record<string, string> = {
  HIGH: 'bg-[hsl(var(--color-error)/0.1)] text-[hsl(var(--color-error))]',
  MEDIUM: 'bg-[hsl(var(--color-warning)/0.1)] text-[hsl(var(--color-warning))]',
  LOW: 'bg-muted text-muted-foreground',
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
    <div className="border-2 border-[hsl(var(--color-warning)/0.4)] rounded-lg p-4 bg-[hsl(var(--color-warning)/0.05)] space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-[hsl(var(--color-warning))] shrink-0" />
        <span className="text-sm font-medium">{t.chat.hitl.pendingTitle}</span>
      </div>

      {/* Action info */}
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{action.summary}</p>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Shield className="h-3 w-3" />
            {action.actionType}
          </span>
          {action.severity && (
            <span
              className={`px-1.5 py-0.5 rounded-full ${severityBadge[action.severity] ?? severityBadge.LOW}`}
            >
              {action.severity}
            </span>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="bg-[hsl(var(--color-success))] hover:opacity-90 disabled:opacity-50 text-white rounded-md px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors"
        >
          {isApproving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {t.chat.hitl.approveLabel}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="bg-[hsl(var(--color-error))] hover:opacity-90 disabled:opacity-50 text-white rounded-md px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors"
        >
          {isRejecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          {t.chat.hitl.rejectLabel}
        </button>
      </div>
    </div>
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
    <div className="border-2 border-[hsl(var(--color-warning)/0.4)] rounded-lg p-4 bg-[hsl(var(--color-warning)/0.05)] space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-[hsl(var(--color-warning))] shrink-0" />
        <span className="text-sm font-medium">{t.chat.hitl.pendingTitle}</span>
      </div>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Tool <span className="font-mono text-xs">{toolName}</span> requires your approval
        </p>
        {args && Object.keys(args).length > 0 && (
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground select-none">
              View parameters
            </summary>
            <pre className="mt-1 bg-muted/50 rounded p-2 overflow-x-auto max-h-32">
              {JSON.stringify(args, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={isBusy}
          className="bg-[hsl(var(--color-success))] hover:opacity-90 disabled:opacity-50 text-white rounded-md px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors"
        >
          {busy === 'approve' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {t.chat.hitl.approveLabel}
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={isBusy}
          className="bg-[hsl(var(--color-error))] hover:opacity-90 disabled:opacity-50 text-white rounded-md px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors"
        >
          {busy === 'reject' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          {t.chat.hitl.rejectLabel}
        </button>
      </div>
    </div>
  );
}
