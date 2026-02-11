"use client";

import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  BellPlusIcon,
  CalendarIcon,
  ClockIcon,
  ExternalLinkIcon,
  MapPinIcon,
} from "lucide-react";
import type { ToolRendererProps, EventResult } from "../types";
import { ActionBar } from "../shared/ActionBar";
import { EmptyState } from "../shared/EmptyState";
import { ResultSummary } from "../shared/ResultSummary";
import { RawJsonToggle } from "../shared/RawJsonToggle";

/**
 * Smart renderer for get_events tool.
 * Shows event items with time range, title, location, all-day badge.
 */
export function EventRenderer({ output, errorText, onAction }: ToolRendererProps) {
  if (errorText) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{errorText}</p>
        </div>
      </div>
    );
  }

  if (!output) return null;

  const result = output as EventResult;

  if (result.error) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{result.error}</p>
        </div>
      </div>
    );
  }

  if (!result.data?.length) {
    return (
      <div className="p-3">
        <EmptyState
          icon={CalendarIcon}
          title="No events found"
          description={result.summary || "No events in this time period"}
        />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <ResultSummary count={result.data.length} noun="event" />

      <div className="space-y-1">
        {result.data.map((event) => (
          <div
            key={event.id}
            className="relative group flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            {/* Time indicator */}
            <div className="w-12 shrink-0 text-center mt-0.5">
              {event.isAllDay ? (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  All day
                </Badge>
              ) : event.startTime ? (
                <span className="text-xs font-medium text-foreground">
                  {formatTime(event.startTime)}
                </span>
              ) : null}
            </div>

            {/* Color bar */}
            <div className="w-0.5 self-stretch rounded-full bg-primary/60 shrink-0" />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium block truncate">
                {event.title}
              </span>

              <div className="flex items-center gap-2 text-[12px] text-muted-foreground mt-0.5">
                {/* Duration */}
                {event.startTime && event.endTime && !event.isAllDay && (
                  <span className="flex items-center gap-1">
                    <ClockIcon className="h-3 w-3" />
                    {formatTime(event.startTime)} – {formatTime(event.endTime)}
                  </span>
                )}

                {/* Location */}
                {event.location && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPinIcon className="h-3 w-3 shrink-0" />
                    {event.location}
                  </span>
                )}
              </div>
            </div>

            {/* Action bar - shows on hover */}
            <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ActionBar actions={[
                { icon: ExternalLinkIcon, label: 'View calendar', onClick: () => onAction?.({ type: 'navigate', route: '/dashboard/calendar' }) },
                { icon: BellPlusIcon, label: 'Create follow-up', onClick: () => onAction?.({ type: 'send-message', message: `Create a follow-up for the event "${event.title}"` }) },
              ]} />
            </div>
          </div>
        ))}
      </div>

      <RawJsonToggle data={output} />
    </div>
  );
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
