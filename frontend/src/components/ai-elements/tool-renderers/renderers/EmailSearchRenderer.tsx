"use client";

import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  CircleIcon,
  StarIcon,
  SearchIcon,
} from "lucide-react";
import type { ToolRendererProps, EmailSearchResult } from "../types";
import { EmptyState } from "../shared/EmptyState";
import { ResultSummary, SearchTypeBadge } from "../shared/ResultSummary";
import { RawJsonToggle } from "../shared/RawJsonToggle";

const SENTIMENT_CONFIG: Record<string, { emoji: string; color: string }> = {
  positive: { emoji: "😊", color: "text-green-600" },
  negative: { emoji: "😟", color: "text-red-600" },
  neutral: { emoji: "😐", color: "text-muted-foreground" },
  mixed: { emoji: "😕", color: "text-amber-600" },
};

const PRIORITY_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: "Urgent", color: "bg-red-100 text-red-700 border-red-200" },
  2: { label: "High", color: "bg-orange-100 text-orange-700 border-orange-200" },
  3: { label: "Medium", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  4: { label: "Low", color: "bg-green-100 text-green-700 border-green-200" },
  5: { label: "Lowest", color: "bg-slate-100 text-slate-600 border-slate-200" },
};

/**
 * Smart renderer for search_emails, list_emails, semantic_search_emails.
 * Shows email items with priority badges, sentiment, and AI labels.
 */
export function EmailSearchRenderer({ output, errorText }: ToolRendererProps) {
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

  const result = output as EmailSearchResult;

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
          icon={SearchIcon}
          title="No emails found"
          description={result.summary || "Try adjusting your search criteria"}
        />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <ResultSummary
        count={result.data.length}
        noun="email"
        badge={result.searchType ? <SearchTypeBadge type={result.searchType} /> : undefined}
      />

      <div className="space-y-0.5">
        {result.data.map((email) => {
          const priorityCfg = email.aiPriority
            ? PRIORITY_CONFIG[email.aiPriority]
            : null;
          const sentimentCfg = email.aiSentiment
            ? SENTIMENT_CONFIG[email.aiSentiment]
            : null;

          return (
            <div
              key={email.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              {/* Avatar initials */}
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-medium text-muted-foreground">
                  {getInitials(email.from)}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Line 1: sender + indicators */}
                <div className="flex items-center gap-1 flex-wrap">
                  {!email.isRead && (
                    <CircleIcon className="h-2 w-2 fill-blue-500 text-blue-500 shrink-0" />
                  )}
                  <span
                    className={`text-sm truncate ${!email.isRead ? "font-semibold" : ""}`}
                  >
                    {extractName(email.from)}
                  </span>
                  {email.isStarred && (
                    <StarIcon className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                  )}
                  {priorityCfg && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 leading-tight ${priorityCfg.color}`}
                    >
                      {priorityCfg.label}
                    </Badge>
                  )}
                  {sentimentCfg && (
                    <span className={`text-xs ${sentimentCfg.color}`}>
                      {sentimentCfg.emoji}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                    {email.receivedAt ? formatDate(email.receivedAt) : ""}
                  </span>
                </div>

                {/* Line 2: subject */}
                <p className="text-[13px] truncate text-muted-foreground">
                  {email.subject || "(No subject)"}
                </p>

                {/* AI labels */}
                {email.aiLabels && email.aiLabels.length > 0 && (
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {email.aiLabels.slice(0, 3).map((label) => (
                      <Badge
                        key={label}
                        variant="secondary"
                        className="text-[9px] px-1 py-0"
                      >
                        {label}
                      </Badge>
                    ))}
                    {email.aiLabels.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{email.aiLabels.length - 3}
                      </span>
                    )}
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

function getInitials(from: string): string {
  const name = extractName(from);
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function extractName(from: string): string {
  const match = from.match(/^([^<]+)/);
  return match ? match[1].trim() : from;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0)
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}
