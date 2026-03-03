'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { Layers, AlertTriangle, ShieldAlert, CheckCircle } from 'lucide-react';
import type { BulkActionResult } from '../types';
import { HitlApprovalCardFromStatus } from '../HitlApprovalCard';

const severityBadge: Record<string, string> = {
  HIGH: 'bg-[hsl(var(--color-error)/0.1)] text-[hsl(var(--color-error))]',
  MEDIUM: 'bg-[hsl(var(--color-warning)/0.1)] text-[hsl(var(--color-warning))]',
  LOW: 'bg-muted text-muted-foreground',
};

export const TriageToolUI = makeAssistantToolUI<
  Record<string, unknown>,
  BulkActionResult
>({
  toolName: 'bulk_email_actions',
  render: ({ status, result, addResult, toolName, args }) => {
    // Native HITL path: requires-action status from backend
    // NOTE: This code path is present but will NOT activate until
    // the backend emits requires_action status instead of data-needs-approval chunks.
    // See Phase 28 or dedicated sub-task for backend update.
    if (status.type === 'requires-action') {
      return (
        <HitlApprovalCardFromStatus
          status={status}
          addResult={addResult}
          toolName={toolName}
          args={args}
        />
      );
    }

    if (status.type === 'running') {
      return (
        <div className="chat-tool-running-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Layers className="h-4 w-4" />
            <span className="text-sm">Processing bulk action...</span>
          </div>
        </div>
      );
    }

    if (status.type === 'incomplete' || !result || result.error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{result?.error ?? 'Bulk action failed'}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="chat-tool-card space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {result.success ? (
              <CheckCircle className="h-4 w-4 text-[hsl(var(--color-success))]" />
            ) : (
              <Layers className="h-4 w-4 text-primary" />
            )}
            <span className="text-sm font-medium">
              {result.actionType ?? 'Bulk Action'}
            </span>
          </div>
          {result.severity && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${severityBadge[result.severity] ?? severityBadge.LOW}`}
            >
              {result.severity}
            </span>
          )}
        </div>

        {result.summary && (
          <p className="text-sm text-muted-foreground">{result.summary}</p>
        )}

        {/* Count info */}
        {result.payload?.count != null && (
          <p className="text-xs text-muted-foreground">
            {result.payload.count} email{result.payload.count !== 1 ? 's' : ''} affected
            {result.payload.skipped ? ` (${result.payload.skipped} skipped)` : ''}
          </p>
        )}

        {/* Approval notice (poll-based HITL handles actual card via AssistantMessage) */}
        {result.requiresApproval && (
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--color-warning))] bg-[hsl(var(--color-warning)/0.05)] rounded-md p-2">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            <span>This action requires your approval before execution</span>
          </div>
        )}
      </div>
    );
  },
});

