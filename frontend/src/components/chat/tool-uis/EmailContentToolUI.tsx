/**
 * Tool UI for get_email_content.
 * Renders email card(s) with from, to, subject, date, content preview, attachment badges.
 */
import { makeAssistantToolUI } from '@assistant-ui/react';
import { Mail, Paperclip, AlertCircle } from 'lucide-react';
import type { EmailContentResult, EmailContentItem } from '../types';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function EmailCard({ email }: { email: EmailContentItem }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{email.from}</span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {formatDate(email.date)}
        </span>
      </div>
      <h4 className="text-sm font-semibold mb-1 truncate">{email.subject ?? '(no subject)'}</h4>
      <div className="text-xs text-muted-foreground mb-2">
        <span>To: {email.to.join(', ')}</span>
        {email.cc.length > 0 && <span className="ml-2">Cc: {email.cc.join(', ')}</span>}
      </div>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
        {truncate(email.content, 500)}
      </p>
      {email.hasAttachments && email.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t">
          {email.attachments.map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
            >
              <Paperclip className="h-3 w-3" />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const EmailContentToolUI = makeAssistantToolUI<
  { emailId?: string; emailIds?: string[] },
  EmailContentResult
>({
  toolName: 'get_email_content',
  render: ({ result, status }) => {
    if (status.type === 'running') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 animate-pulse">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading email content...</span>
        </div>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">
            Failed to load email: {'reason' in status ? status.reason : 'unknown'}
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
    const emails = result.emails ?? [];
    if (emails.length === 0) {
      return <p className="text-sm text-muted-foreground p-3">No email content found.</p>;
    }
    return (
      <div className="space-y-2">
        {emails.map((email) => (
          <EmailCard key={email.id} email={email} />
        ))}
      </div>
    );
  },
});
