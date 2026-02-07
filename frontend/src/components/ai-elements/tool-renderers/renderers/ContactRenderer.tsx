"use client";

import {
  AlertTriangleIcon,
  BuildingIcon,
  MailIcon,
  UsersIcon,
} from "lucide-react";
import type { ToolRendererProps, ContactSearchResult } from "../types";
import { EmptyState } from "../shared/EmptyState";
import { ResultSummary } from "../shared/ResultSummary";
import { RawJsonToggle } from "../shared/RawJsonToggle";

/**
 * Smart renderer for search_contacts tool.
 * Shows contact cards with avatar, name, role, company, email.
 */
export function ContactRenderer({ output, errorText }: ToolRendererProps) {
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

  const result = output as ContactSearchResult;

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
          icon={UsersIcon}
          title="No contacts found"
          description={result.summary || "Try a different search query"}
        />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <ResultSummary count={result.data.length} noun="contact" />

      <div className="space-y-0.5">
        {result.data.map((contact) => {
          const name =
            contact.displayName ||
            [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
            "Unknown";
          const primaryEmail = contact.emails?.[0]?.value;

          return (
            <div
              key={contact.id}
              className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {getInitials(name)}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block truncate">
                  {name}
                </span>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  {contact.jobTitle && contact.company && (
                    <span className="flex items-center gap-1 truncate">
                      <BuildingIcon className="h-3 w-3 shrink-0" />
                      {contact.jobTitle} @ {contact.company}
                    </span>
                  )}
                  {!contact.jobTitle && contact.company && (
                    <span className="flex items-center gap-1 truncate">
                      <BuildingIcon className="h-3 w-3 shrink-0" />
                      {contact.company}
                    </span>
                  )}
                  {primaryEmail && (
                    <span className="flex items-center gap-1 truncate">
                      <MailIcon className="h-3 w-3 shrink-0" />
                      {primaryEmail}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <RawJsonToggle data={output} />
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}
