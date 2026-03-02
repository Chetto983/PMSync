'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { Users, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import type { CrmResult, CrmContactStat } from '../types';

function ContactStatCard({ contact }: { contact: CrmContactStat }) {
  const scorePercent = Math.min(Math.round(contact.relationshipScore), 100);
  const scoreColor =
    scorePercent >= 70 ? 'bg-green-500' : scorePercent >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{contact.displayName}</p>
        <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* Score bar */}
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${scoreColor}`}
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <span className="text-xs font-medium w-7 text-right">{scorePercent}%</span>
        </div>
        {/* Interaction count */}
        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
          <TrendingUp className="h-2.5 w-2.5" />
          {contact.interactionCount}
        </span>
      </div>
    </div>
  );
}

export const CrmToolUI = makeAssistantToolUI<
  { contactId?: string },
  CrmResult
>({
  toolName: 'get_relationship_stats',
  render: ({ status, result }) => {
    if (status.type === 'running') {
      return (
        <div className="rounded-lg border bg-card p-3 animate-pulse">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-sm">Loading relationship data...</span>
          </div>
        </div>
      );
    }

    if (status.type === 'incomplete' || !result || result.error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{result?.error ?? 'Failed to load CRM data'}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Relationship Stats</span>
          </div>
          {result.averageScore != null && (
            <span className="text-xs text-muted-foreground">
              Avg: {Math.round(result.averageScore)}%
            </span>
          )}
        </div>
        {result.summary && (
          <p className="text-xs text-muted-foreground mb-2">{result.summary}</p>
        )}
        <div className="divide-y divide-border">
          {result.contacts.map((c) => (
            <ContactStatCard key={c.contactId} contact={c} />
          ))}
        </div>
        {result.contacts.some((c) => c.staleDays != null && c.staleDays > 30) && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
            <Clock className="h-3 w-3" />
            Some contacts may need re-engagement
          </div>
        )}
      </div>
    );
  },
});
