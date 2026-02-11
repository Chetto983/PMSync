"use client";

import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckSquareIcon,
  ClockIcon,
  MailIcon,
  ZapIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ToolRendererProps, BriefingResult } from "../types";
import { RawJsonToggle } from "../shared/RawJsonToggle";

// --- Local sub-components ---

function BriefingSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="pl-5">{children}</div>
    </div>
  );
}

/**
 * Smart renderer for get_daily_briefing tool.
 * Shows structured daily briefing: stats, summary, follow-ups, deadlines, action items, calendar.
 */
export function BriefingRenderer({ output, errorText }: ToolRendererProps) {
  if (errorText) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{errorText}</p>
        </div>
        <RawJsonToggle data={output} />
      </div>
    );
  }

  if (!output) return null;

  const result = output as BriefingResult;

  if (result.error) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{result.error}</p>
        </div>
        <RawJsonToggle data={output} />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Stats bar */}
      {result.stats && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">
            <MailIcon className="h-3 w-3 mr-1" />
            {result.stats.totalUnread} unread
          </Badge>
          <Badge variant="secondary">{result.stats.newToday} new today</Badge>
          {result.stats.highPriority > 0 && (
            <Badge variant="destructive">
              {result.stats.highPriority} high priority
            </Badge>
          )}
        </div>
      )}

      {/* Summary section */}
      {result.summary && (
        <BriefingSection icon={ZapIcon} title="Summary">
          <p className="text-sm text-foreground leading-relaxed">
            {result.summary.summary}
          </p>
          {result.summary.highlights?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {result.summary.highlights.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </BriefingSection>
      )}

      {/* Follow-ups section */}
      {result.followUps && (
        <BriefingSection icon={ClockIcon} title="Follow-ups">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-foreground">{result.followUps.message}</span>
            {result.followUps.overdue > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {result.followUps.overdue} overdue
              </Badge>
            )}
            {result.followUps.dueToday > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {result.followUps.dueToday} due today
              </Badge>
            )}
          </div>
        </BriefingSection>
      )}

      {/* Deadlines section */}
      {result.deadlines && result.deadlines.count > 0 && (
        <BriefingSection icon={AlertTriangleIcon} title="Deadlines">
          <p className="text-xs text-foreground">{result.deadlines.message}</p>
          {result.deadlines.items?.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.deadlines.items.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.detail && <span className="ml-1">— {item.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </BriefingSection>
      )}

      {/* Action items section */}
      {result.actionItems && result.actionItems.count > 0 && (
        <BriefingSection icon={CheckSquareIcon} title="Action items">
          <p className="text-xs text-foreground">{result.actionItems.message}</p>
          {result.actionItems.items?.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.actionItems.items.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.detail && <span className="ml-1">— {item.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </BriefingSection>
      )}

      {/* Calendar section */}
      {result.calendar && (
        <BriefingSection icon={CalendarIcon} title="Calendar">
          <p className="text-xs text-foreground">{result.calendar.message}</p>
        </BriefingSection>
      )}

      <RawJsonToggle data={output} />
    </div>
  );
}
