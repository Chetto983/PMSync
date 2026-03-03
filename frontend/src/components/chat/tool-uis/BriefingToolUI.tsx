'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import {
  Sun,
  AlertTriangle,
  Mail,
  Star,
  Clock,
  CheckSquare,
  Calendar,
  MessageCircle,
} from 'lucide-react';
import type { BriefingResult } from '../types';

export const BriefingToolUI = makeAssistantToolUI<
  Record<string, never>,
  BriefingResult
>({
  toolName: 'get_daily_briefing',
  render: ({ status, result }) => {
    if (status.type === 'running') {
      return (
        <div className="chat-tool-running-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sun className="h-4 w-4" />
            <span className="text-sm">Generating daily briefing...</span>
          </div>
        </div>
      );
    }

    if (status.type === 'incomplete' || !result || result.error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{result?.error ?? 'Briefing failed'}</span>
          </div>
        </div>
      );
    }

    const { stats, summary, followUps, deadlines, actionItems, calendar } = result;

    return (
      <div className="chat-tool-card space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-[hsl(var(--color-warning))]" />
          <span className="text-sm font-medium">Daily Briefing</span>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 bg-[hsl(var(--color-info)/0.1)] text-[hsl(var(--color-info))] px-2 py-1 rounded-md">
            <Mail className="h-3 w-3" />
            {stats.totalUnread} unread
          </span>
          <span className="flex items-center gap-1 bg-[hsl(var(--color-error)/0.1)] text-[hsl(var(--color-error))] px-2 py-1 rounded-md">
            <Star className="h-3 w-3" />
            {stats.highPriority} high priority
          </span>
          <span className="flex items-center gap-1 bg-[hsl(var(--color-success)/0.1)] text-[hsl(var(--color-success))] px-2 py-1 rounded-md">
            <Mail className="h-3 w-3" />
            {stats.newToday} new
          </span>
        </div>

        {/* Summary */}
        <div>
          <p className="text-sm text-muted-foreground">{summary.summary}</p>
          {summary.highlights.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {summary.highlights.map((h, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">&#8226;</span>
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Follow-ups */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {followUps.message}
            {followUps.overdue > 0 && (
              <span className="text-[hsl(var(--color-error))] font-medium ml-1">
                ({followUps.overdue} overdue)
              </span>
            )}
          </span>
        </div>

        {/* Deadlines */}
        {deadlines.count > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Clock className="h-3 w-3 text-[hsl(var(--color-warning))]" />
              Deadlines ({deadlines.count})
            </div>
            {deadlines.items.map((d, i) => (
              <p key={i} className="text-xs text-muted-foreground pl-4.5">
                <span className="font-medium">{d.title}</span>
                {d.detail && <span className="ml-1">- {d.detail}</span>}
              </p>
            ))}
          </div>
        )}

        {/* Action items */}
        {actionItems.count > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <CheckSquare className="h-3 w-3 text-[hsl(var(--color-success))]" />
              Action Items ({actionItems.count})
            </div>
            {actionItems.items.map((a, i) => (
              <p key={i} className="text-xs text-muted-foreground pl-4.5">
                <span className="font-medium">{a.title}</span>
                {a.detail && <span className="ml-1">- {a.detail}</span>}
              </p>
            ))}
          </div>
        )}

        {/* Calendar */}
        {calendar.hasEvents && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3 text-[hsl(var(--color-info))]" />
            {calendar.message}
          </div>
        )}
      </div>
    );
  },
});

