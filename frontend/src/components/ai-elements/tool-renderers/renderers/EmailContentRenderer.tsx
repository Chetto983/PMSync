"use client";

import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  ExternalLinkIcon,
  MailIcon,
  PaperclipIcon,
  ReplyIcon,
  StarIcon,
} from "lucide-react";
import type { ToolRendererProps, EmailContentResult } from "../types";
import { ActionBar } from "../shared/ActionBar";
import { EmptyState } from "../shared/EmptyState";
import { RawJsonToggle } from "../shared/RawJsonToggle";

const MAX_BODY_CHARS = 500;

/**
 * Smart renderer for get_email_content tool.
 * Shows email cards with headers, body preview, and attachment chips.
 */
export function EmailContentRenderer({ output, errorText, onAction }: ToolRendererProps) {
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

  const result = output as EmailContentResult;

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

  if (!result.emails?.length) {
    return (
      <div className="p-3">
        <EmptyState icon={MailIcon} title="Email not found" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {result.emails.map((email) => (
        <div key={email.id} className="border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 bg-muted/30 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">
                {email.subject || "(No subject)"}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {email.isStarred && (
                  <StarIcon className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                )}
                {email.hasAttachments && (
                  <PaperclipIcon className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <ActionBar actions={[
                  { icon: ReplyIcon, label: "Reply", onClick: () => onAction?.({ type: "send-message", message: `Reply to the email "${email.subject}" from ${email.from}` }) },
                  { icon: ArchiveIcon, label: "Archive", onClick: () => onAction?.({ type: "send-message", message: `Archive the email "${email.subject}"` }) },
                  { icon: ExternalLinkIcon, label: "Open", onClick: () => onAction?.({ type: "navigate", route: `/dashboard/email?threadId=${email.id}` }) },
                ]} />
              </div>
            </div>

            {/* From/To */}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>
                <span className="font-medium">From:</span> {email.from}
              </div>
              {email.to.length > 0 && (
                <div>
                  <span className="font-medium">To:</span>{" "}
                  {email.to.join(", ")}
                </div>
              )}
              {email.cc.length > 0 && (
                <div>
                  <span className="font-medium">Cc:</span>{" "}
                  {email.cc.join(", ")}
                </div>
              )}
              <div className="flex items-center gap-2">
                {email.date && (
                  <span>{new Date(email.date).toLocaleString()}</span>
                )}
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {email.folder}
                </Badge>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-3 py-2">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {email.content.length > MAX_BODY_CHARS
                ? `${email.content.substring(0, MAX_BODY_CHARS)}...`
                : email.content}
            </p>
          </div>

          {/* Attachments */}
          {email.attachments.length > 0 && (
            <div className="px-3 py-2 border-t bg-muted/20">
              <div className="flex items-center gap-1.5 flex-wrap">
                <PaperclipIcon className="h-3 w-3 text-muted-foreground" />
                {email.attachments.map((att) => (
                  <Badge
                    key={att}
                    variant="secondary"
                    className="text-[11px] px-1.5 py-0"
                  >
                    {att}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <RawJsonToggle data={output} />
    </div>
  );
}
