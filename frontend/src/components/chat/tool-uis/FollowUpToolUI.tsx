/**
 * Tool UI for list_follow_ups.
 * Shows follow-ups with status badge, due date, reason, email subject.
 */
import { makeAssistantToolUI } from '@assistant-ui/react';
import { Clock, AlertCircle } from 'lucide-react';
import type { FollowUpResult, FollowUpItem } from '../types';

function statusColor(s: string): string {
  switch (s) {
    case 'pending':
      return 'bg-[hsl(var(--color-warning)/0.1)] text-[hsl(var(--color-warning))]';
    case 'overdue':
      return 'bg-[hsl(var(--color-error)/0.1)] text-[hsl(var(--color-error))]';
    case 'completed':
      return 'bg-[hsl(var(--color-success)/0.1)] text-[hsl(var(--color-success))]';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function FollowUpRow({ item }: { item: FollowUpItem }) {
  return (
    <div className="flex items-start gap-2 py-2 px-2 rounded hover:bg-muted/30 transition-colors">
      <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${statusColor(item.status)}`}>
            {item.status}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(item.dueDate)}</span>
        </div>
        <p className="text-sm truncate mt-0.5">{item.email.subject ?? '(no subject)'}</p>
        <p className="text-xs text-muted-foreground truncate">From: {item.email.from}</p>
        {item.reason && (
          <p className="text-xs text-muted-foreground mt-0.5 italic">{item.reason}</p>
        )}
      </div>
    </div>
  );
}

export const FollowUpToolUI = makeAssistantToolUI<
  { status?: string; limit?: number },
  FollowUpResult
>({
  toolName: 'list_follow_ups',
  render: ({ result, status }) => {
    if (status.type === 'running') {
      return (
        <div className="chat-tool-running-inline">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading follow-ups...</span>
        </div>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">
            Failed to load follow-ups: {'reason' in status ? status.reason : 'unknown'}
          </span>
        </div>
      );
    }
    if (!result) return null;
    if (result.error) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{result.error}</span>
        </div>
      );
    }
    const items = result.followUps ?? [];
    return (
      <div className="chat-tool-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Follow-ups
          </span>
          <span className="text-xs text-muted-foreground">{result.count} item{result.count !== 1 ? 's' : ''}</span>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            {result.message ?? 'No follow-ups found.'}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <FollowUpRow key={item.followUpId} item={item} />
            ))}
          </div>
        )}
      </div>
    );
  },
});

