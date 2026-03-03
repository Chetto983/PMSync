/**
 * Tool UIs for search_emails, list_emails, and semantic_search_emails.
 * All three share the same result shape (EmailSearchResult) and visual layout.
 */
import { makeAssistantToolUI } from '@assistant-ui/react';
import { Search, Mail, Star, AlertCircle } from 'lucide-react';
import type { EmailSearchResult, EmailSearchItem } from '../types';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sentimentDot(sentiment: string | null) {
  if (!sentiment) return null;
  const color =
    sentiment === 'positive'
      ? 'bg-[hsl(var(--color-success))]'
      : sentiment === 'negative'
        ? 'bg-[hsl(var(--color-error))]'
        : 'bg-[hsl(var(--color-warning))]';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={sentiment} />;
}

function priorityBadge(priority: number | null) {
  if (priority == null || priority < 7) return null;
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[hsl(var(--color-error)/0.1)] text-[hsl(var(--color-error))]">
      P{priority}
    </span>
  );
}

function EmailRow({ item }: { item: EmailSearchItem }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors">
      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm truncate ${item.isRead === false ? 'font-semibold' : ''}`}>
            {item.from}
          </span>
          {item.isStarred && <Star className="h-3 w-3 text-[hsl(var(--color-warning))] fill-[hsl(var(--color-warning))] shrink-0" />}
          {priorityBadge(item.aiPriority)}
          {sentimentDot(item.aiSentiment)}
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatDate(item.receivedAt)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{item.subject ?? '(no subject)'}</p>
      </div>
    </div>
  );
}

function RunningState({ label }: { label: string }) {
  return (
    <div className="chat-tool-running-inline">
      <Search className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function ErrorState({ reason }: { reason: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
      <AlertCircle className="h-4 w-4 text-destructive" />
      <span className="text-sm text-destructive">Search failed: {reason}</span>
    </div>
  );
}

function ResultCard({ result, label }: { result: EmailSearchResult; label: string }) {
  if (result.error) {
    return <ErrorState reason={result.error} />;
  }
  const items = result.data ?? [];
  return (
    <div className="chat-tool-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{items.length} result{items.length !== 1 ? 's' : ''}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No emails found.</p>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <EmailRow key={item.id} item={item} />
          ))}
        </div>
      )}
      {result.summary && (
        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{result.summary}</p>
      )}
    </div>
  );
}

export const EmailSearchToolUI = makeAssistantToolUI<
  { query: string; folder?: string; maxResults?: number },
  EmailSearchResult
>({
  toolName: 'search_emails',
  render: ({ args, result, status }) => {
    if (status.type === 'running') return <RunningState label={`Searching "${args.query}"...`} />;
    if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} />;
    if (!result) return null;
    return <ResultCard result={result} label="Email Search" />;
  },
});

export const ListEmailsToolUI = makeAssistantToolUI<
  { folder?: string; limit?: number; unreadOnly?: boolean },
  EmailSearchResult
>({
  toolName: 'list_emails',
  render: ({ args, result, status }) => {
    if (status.type === 'running') return <RunningState label={`Loading emails${args.folder ? ` from ${args.folder}` : ''}...`} />;
    if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} />;
    if (!result) return null;
    return <ResultCard result={result} label={args.folder ?? 'Inbox'} />;
  },
});

export const SemanticSearchToolUI = makeAssistantToolUI<
  { query: string },
  EmailSearchResult
>({
  toolName: 'semantic_search_emails',
  render: ({ args, result, status }) => {
    if (status.type === 'running') return <RunningState label={`Semantic search "${args.query}"...`} />;
    if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} />;
    if (!result) return null;
    return <ResultCard result={result} label="Semantic Search" />;
  },
});

