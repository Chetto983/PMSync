/**
 * Tool UI for search_contacts.
 * Contact cards with name, company, job title, email.
 */
import { makeAssistantToolUI } from '@assistant-ui/react';
import { User, AlertCircle } from 'lucide-react';
import type { ContactSearchResult, ContactItem } from '../types';

function ContactCard({ contact }: { contact: ContactItem }) {
  const name = contact.displayName ?? ([contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown');
  const primaryEmail = contact.emails?.[0]?.value ?? null;

  return (
    <div className="flex items-start gap-2.5 py-2 px-2 rounded hover:bg-muted/30 transition-colors">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <User className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        {(contact.jobTitle || contact.company) && (
          <p className="text-xs text-muted-foreground truncate">
            {[contact.jobTitle, contact.company].filter(Boolean).join(' at ')}
          </p>
        )}
        {primaryEmail && (
          <p className="text-xs text-muted-foreground truncate">{primaryEmail}</p>
        )}
      </div>
    </div>
  );
}

export const ContactToolUI = makeAssistantToolUI<
  { query: string },
  ContactSearchResult
>({
  toolName: 'search_contacts',
  render: ({ args, result, status }) => {
    if (status.type === 'running') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 animate-pulse">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Searching contacts for "{args.query}"...</span>
        </div>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">
            Contact search failed: {'reason' in status ? status.reason : 'unknown'}
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
    const contacts = result.data ?? [];
    return (
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Contacts
          </span>
          <span className="text-xs text-muted-foreground">{contacts.length} found</span>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No contacts found.</p>
        ) : (
          <div className="divide-y divide-border">
            {contacts.map((c) => (
              <ContactCard key={c.id} contact={c} />
            ))}
          </div>
        )}
        {result.summary && (
          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{result.summary}</p>
        )}
      </div>
    );
  },
});
