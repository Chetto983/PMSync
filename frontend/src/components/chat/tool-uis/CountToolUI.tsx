/**
 * Tool UI for count_emails.
 * Stats grid with total, unread, read numbers.
 */
import { makeAssistantToolUI } from '@assistant-ui/react';
import { Mail, AlertCircle } from 'lucide-react';
import type { CountResult } from '../types';

export const CountToolUI = makeAssistantToolUI<
  { folder?: string; unreadOnly?: boolean },
  CountResult
>({
  toolName: 'count_emails',
  render: ({ args, result, status }) => {
    if (status.type === 'running') {
      return (
        <div className="chat-tool-running-inline">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Counting emails{args.folder ? ` in ${args.folder}` : ''}...
          </span>
        </div>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">
            Failed to count emails: {'reason' in status ? status.reason : 'unknown'}
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
    const data = result.data;
    if (!data) return null;
    return (
      <div className="chat-tool-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Email Count{data.folder ? ` - ${data.folder}` : ''}
          </span>
          {data.period && (
            <span className="text-xs text-muted-foreground">{data.period}</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-2xl font-bold">{data.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.unread}</div>
            <div className="text-xs text-muted-foreground">Unread</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{data.read}</div>
            <div className="text-xs text-muted-foreground">Read</div>
          </div>
        </div>
        {result.summary && (
          <p className="text-xs text-muted-foreground mt-3 pt-2 border-t text-center">{result.summary}</p>
        )}
      </div>
    );
  },
});

