"use client";

import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  BellIcon,
  MailIcon,
} from "lucide-react";
import type { ToolRendererProps, FollowUpResult } from "../types";
import { EmptyState } from "../shared/EmptyState";
import { ResultSummary } from "../shared/ResultSummary";
import { RawJsonToggle } from "../shared/RawJsonToggle";

/**
 * Smart renderer for list_follow_ups tool.
 * Shows follow-up items with status badges, due dates, and linked email info.
 */
export function FollowUpRenderer({ output, errorText }: ToolRendererProps) {
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

  const result = output as FollowUpResult;

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

  // Empty state - show friendly message
  if (!result.followUps?.length) {
    const msg = result.message || "No pending follow-ups";
    return (
      <div className="p-3">
        <EmptyState
          icon={CheckCircle2Icon}
          title={msg}
          description="You're all caught up!"
        />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <ResultSummary
        count={result.count || result.followUps.length}
        noun="follow-up"
        badge={
          result.status ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {result.status}
            </Badge>
          ) : undefined
        }
      />

      <div className="space-y-1">
        {result.followUps.map((fu) => {
          const isOverdue = fu.dueDate && new Date(fu.dueDate) < new Date();
          const statusConfig = getStatusConfig(fu.status, !!isOverdue);

          return (
            <div
              key={fu.followUpId}
              className="flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              {/* Status icon */}
              <statusConfig.icon
                className={`h-4 w-4 mt-0.5 shrink-0 ${statusConfig.iconColor}`}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Line 1: email subject + status badge */}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">
                    {fu.email.subject || "(No subject)"}
                  </span>
                  <Badge
                    variant={statusConfig.variant as "default" | "secondary" | "destructive" | "outline"}
                    className={`text-[10px] px-1.5 py-0 shrink-0 ${statusConfig.badgeClass}`}
                  >
                    {isOverdue ? "Overdue" : fu.status}
                  </Badge>
                  {fu.emailType && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 shrink-0 capitalize"
                    >
                      {fu.emailType}
                    </Badge>
                  )}
                </div>

                {/* Line 2: from + reason */}
                <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <MailIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{fu.email.from}</span>
                  {fu.reason && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="truncate">{fu.reason}</span>
                    </>
                  )}
                </div>

                {/* Line 3: due date */}
                {fu.dueDate && (
                  <div
                    className={`flex items-center gap-1 text-[12px] mt-0.5 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    <ClockIcon className="h-3 w-3" />
                    <span>Due {formatRelativeDate(fu.dueDate)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <RawJsonToggle data={output} />
    </div>
  );
}

function getStatusConfig(status: string, isOverdue: boolean) {
  if (isOverdue) {
    return {
      icon: AlertTriangleIcon,
      iconColor: "text-destructive",
      variant: "destructive",
      badgeClass: "",
    };
  }

  switch (status.toLowerCase()) {
    case "completed":
    case "done":
      return {
        icon: CheckCircle2Icon,
        iconColor: "text-green-600",
        variant: "secondary",
        badgeClass: "text-green-700 bg-green-50",
      };
    case "reminded":
      return {
        icon: BellIcon,
        iconColor: "text-amber-500",
        variant: "secondary",
        badgeClass: "text-amber-700 bg-amber-50",
      };
    default:
      return {
        icon: ClockIcon,
        iconColor: "text-blue-500",
        variant: "secondary",
        badgeClass: "text-blue-700 bg-blue-50",
      };
  }
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < -1) return `${Math.abs(diffDays)} days ago`;
    if (diffDays === -1) return "yesterday";
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "tomorrow";
    if (diffDays < 7) return `in ${diffDays} days`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}
