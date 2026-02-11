"use client";

import { AlertTriangleIcon, CircleIcon, ExternalLinkIcon, MailIcon, StarIcon } from "lucide-react";
import type { ToolRendererProps, EmailIndexResult } from "../types";
import { EmptyState } from "../shared/EmptyState";
import { SearchTypeBadge } from "../shared/ResultSummary";
import { RawJsonToggle } from "../shared/RawJsonToggle";

/**
 * Color palette for avatar backgrounds based on sender hash.
 * Uses the app's brand palette (teal, purple, pink, blue, orange).
 */
const AVATAR_COLORS = [
  "bg-[hsl(189,70%,92%)] text-[hsl(189,70%,35%)]",       // teal
  "bg-[hsl(258,55%,92%)] text-[hsl(258,55%,40%)]",       // purple
  "bg-[hsl(320,70%,92%)] text-[hsl(320,70%,40%)]",       // pink
  "bg-[hsl(210,100%,92%)] text-[hsl(210,100%,40%)]",     // blue
  "bg-[hsl(28,100%,92%)] text-[hsl(28,100%,40%)]",       // orange
  "bg-[hsl(142,71%,90%)] text-[hsl(142,71%,30%)]",       // green
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Smart renderer for list_email_index tool.
 * Modern design with colored avatars, clean typography, Superhuman-inspired layout.
 */
export function EmailListRenderer({ output, errorText, onAction }: ToolRendererProps) {
  if (errorText) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/10 p-3">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{errorText}</p>
        </div>
      </div>
    );
  }

  if (!output) return null;

  const result = output as EmailIndexResult;

  if (result.error) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/10 p-3">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{result.error}</p>
        </div>
      </div>
    );
  }

  if (!result.index?.length) {
    return (
      <div className="p-3">
        <EmptyState
          icon={MailIcon}
          title="No emails found"
          description="Try a different search or check another folder"
        />
      </div>
    );
  }

  return (
    <div className="py-2">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="text-xs font-medium text-muted-foreground/80">
          {result.count} {result.count === 1 ? "email" : "emails"}
        </span>
        {result.searchType && <SearchTypeBadge type={result.searchType} />}
      </div>

      {/* Email list */}
      <div className="divide-y divide-border/40">
        {result.index.map((email) => {
          const name = extractName(email.from);
          const avatarColor = getAvatarColor(name);
          return (
            <div
              key={email.id}
              className={`group flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 cursor-pointer ${
                email.unread ? "bg-primary/[0.02]" : ""
              }`}
              onClick={() => onAction?.({ type: "navigate", route: `/dashboard/email?threadId=${email.id}` })}
            >
              {/* Avatar with sender color */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${avatarColor}`}
              >
                <span className="text-[11px] font-semibold leading-none">
                  {getInitials(email.from)}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Line 1: sender + indicators + date */}
                <div className="flex items-center gap-1.5">
                  {email.unread && (
                    <CircleIcon className="h-[6px] w-[6px] fill-primary text-primary shrink-0" />
                  )}
                  <span
                    className={`text-[13px] truncate ${
                      email.unread
                        ? "font-semibold text-foreground"
                        : "font-normal text-foreground/80"
                    }`}
                  >
                    {name}
                  </span>
                  {email.starred && (
                    <StarIcon className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                  )}
                  <span className="text-[11px] text-muted-foreground/60 ml-auto shrink-0 tabular-nums">
                    {formatDate(email.date)}
                  </span>
                  <ExternalLinkIcon className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>

                {/* Line 2: subject */}
                <p
                  className={`text-[13px] truncate leading-snug mt-0.5 ${
                    email.unread
                      ? "text-foreground/90 font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {email.subject || "(No subject)"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 pt-2 space-y-1.5">
        {result.hint && (
          <p className="text-[11px] text-muted-foreground/50 italic">
            {result.hint}
          </p>
        )}
        <RawJsonToggle data={output} />
      </div>
    </div>
  );
}

function getInitials(from: string): string {
  const name = extractName(from);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function extractName(from: string): string {
  // "John Doe <john@example.com>" -> "John Doe"
  // Also strip escaped quotes from names like \"Immobiliare.it\"
  const match = from.match(/^([^<]+)/);
  const raw = match ? match[1].trim() : from;
  return raw.replace(/\\?"/g, "").trim();
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}
