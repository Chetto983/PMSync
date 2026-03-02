/**
 * Tool UI for list_email_index.
 * Compact table with idx, from, subject, date, unread indicator.
 */
import { makeAssistantToolUI } from '@assistant-ui/react';
import { List, AlertCircle } from 'lucide-react';
import type { EmailIndexResult } from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const EmailListToolUI = makeAssistantToolUI<
  { folder?: string; limit?: number },
  EmailIndexResult
>({
  toolName: 'list_email_index',
  render: ({ args, result, status }) => {
    if (status.type === 'running') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 animate-pulse">
          <List className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading email index...</span>
        </div>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">
            Failed to load index: {'reason' in status ? status.reason : 'unknown'}
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
    const items = result.index ?? [];
    return (
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Email Index{args.folder ? ` - ${args.folder}` : ''}
          </span>
          <span className="text-xs text-muted-foreground">{result.count} email{result.count !== 1 ? 's' : ''}</span>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No emails in index.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1 pr-2 text-left w-8">#</th>
                  <th className="py-1 pr-2 text-left">From</th>
                  <th className="py-1 pr-2 text-left">Subject</th>
                  <th className="py-1 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-border/50 hover:bg-muted/30 ${item.unread ? 'font-semibold' : ''}`}
                  >
                    <td className="py-1 pr-2 text-muted-foreground">{item.idx}</td>
                    <td className="py-1 pr-2 truncate max-w-[120px]">{item.from}</td>
                    <td className="py-1 pr-2 truncate max-w-[200px]">{item.subject}</td>
                    <td className="py-1 text-right text-muted-foreground whitespace-nowrap">
                      {formatDate(item.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.hint && (
          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t italic">{result.hint}</p>
        )}
      </div>
    );
  },
});
