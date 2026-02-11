"use client";

import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  SendIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import type { ToolRendererProps, CrmResult, CrmContactStat } from "../types";
import { ActionBar } from "../shared/ActionBar";
import { EmptyState } from "../shared/EmptyState";
import { ResultSummary } from "../shared/ResultSummary";
import { RawJsonToggle } from "../shared/RawJsonToggle";

// --- Helpers ---

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function getScoreColor(score: number): string {
  if (score <= 25) return "bg-red-500";
  if (score <= 50) return "bg-amber-500";
  if (score <= 75) return "bg-blue-500";
  return "bg-green-500";
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

// --- Contact Row ---

function CrmContactRow({
  contact,
  onAction,
}: {
  contact: CrmContactStat;
  onAction?: ToolRendererProps["onAction"];
}) {
  const name = contact.displayName || "Unknown";
  const isStale = (contact.staleDays ?? 0) > 14;

  return (
    <div className="relative group flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <span className="text-[11px] font-medium text-muted-foreground">
          {getInitials(name)}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{name}</span>
          {isStale && (
            <Badge variant="destructive" className="text-[9px] px-1 py-0 shrink-0">
              Stale
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 text-[12px] text-muted-foreground mt-0.5">
          {contact.email && (
            <span className="truncate">{contact.email}</span>
          )}
          <span className="shrink-0">
            {formatRelativeDate(contact.lastInteraction)}
          </span>
        </div>

        {/* Relationship score bar */}
        <div className="flex items-center gap-1.5 mt-1">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getScoreColor(contact.relationshipScore)}`}
              style={{ width: `${Math.min(contact.relationshipScore, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">
            {contact.relationshipScore}
          </span>
        </div>
      </div>

      {/* Action bar - shows on hover */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionBar actions={[
          { icon: ExternalLinkIcon, label: "View profile", onClick: () => onAction?.({ type: "navigate", route: "/dashboard/contacts" }) },
          ...(contact.email ? [{
            icon: SendIcon,
            label: "Send email",
            onClick: () => onAction?.({ type: "navigate", route: `/dashboard/email/compose?to=${encodeURIComponent(contact.email)}` }),
          }] : []),
        ]} />
      </div>
    </div>
  );
}

// --- Main Renderer ---

/**
 * Smart renderer for get_relationship_stats tool.
 * Shows CRM contacts with relationship scores, last interaction, stale indicators.
 */
export function CrmRenderer({ output, errorText, onAction }: ToolRendererProps) {
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

  const result = output as CrmResult;

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

  if (!result.contacts?.length) {
    return (
      <div className="p-3">
        <EmptyState
          icon={UsersIcon}
          title="No relationship data"
          description={result.summary || "No contacts with relationship scores yet"}
        />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      {/* Summary header */}
      <ResultSummary
        count={result.totalContacts ?? result.contacts.length}
        noun="contact"
        badge={
          result.averageScore != null ? (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <TrendingUpIcon className="h-3 w-3" />
              Avg score: {result.averageScore}
            </span>
          ) : undefined
        }
      />

      {/* Contact list */}
      <div className="space-y-0.5">
        {result.contacts.map((contact) => (
          <CrmContactRow
            key={contact.contactId}
            contact={contact}
            onAction={onAction}
          />
        ))}
      </div>

      <RawJsonToggle data={output} />
    </div>
  );
}
