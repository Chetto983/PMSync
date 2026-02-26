"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  TagIcon,
  ClockIcon,
  XCircleIcon,
  ZapIcon,
  MailIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useTranslations } from "@/lib/hooks/use-translations";
import type { ToolRendererProps, BulkActionResult } from "../types";
import { ActionBar } from "../shared/ActionBar";
import { EmptyState } from "../shared/EmptyState";
import { RawJsonToggle } from "../shared/RawJsonToggle";

type Translations = ReturnType<typeof useTranslations>;

/**
 * Smart renderer for bulk_email_actions tool.
 * Displays triage results as structured cards with approval / completed states.
 */
export function TriageRenderer({ output, errorText, onAction }: ToolRendererProps) {
  const t = useTranslations();
  const parsed = useMemo<BulkActionResult | null>(() => {
    if (!output) return null;
    if (typeof output === "object") return output as BulkActionResult;
    try { return JSON.parse(String(output)) as BulkActionResult; } catch { return null; }
  }, [output]);

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

  if (!parsed) return null;

  if (parsed.error) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{parsed.error}</p>
        </div>
      </div>
    );
  }

  const isLabel = parsed.actionType === "BULK_APPLY_LABELS";
  const isFollowUp = parsed.actionType === "BULK_CREATE_FOLLOW_UPS";

  if (parsed.requiresApproval) {
    return (
      <div className="p-3 space-y-2">
        <PendingCard parsed={parsed} isLabel={isLabel} isFollowUp={isFollowUp} t={t} />
        <ActionBar actions={buildActions(isLabel, isFollowUp, onAction)} className="mt-1" />
        <RawJsonToggle data={output} />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <CompletedCard parsed={parsed} t={t} />
      <RawJsonToggle data={output} />
    </div>
  );
}

// --- Sub-components ---

interface PendingProps {
  parsed: BulkActionResult;
  isLabel: boolean;
  isFollowUp: boolean;
  t: Translations;
}

function PendingCard({ parsed, isLabel, isFollowUp, t }: PendingProps) {
  const emailCount = parsed.payload?.count ?? parsed.payload?.emailIds?.length ?? 0;
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldAlertIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm font-medium text-foreground">
          {t.ai.triage.title} &mdash; Awaiting Approval
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <TypeBadge isLabel={isLabel} isFollowUp={isFollowUp} actionType={parsed.actionType} />
        {parsed.severity && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
            {parsed.severity}
          </Badge>
        )}
      </div>
      {parsed.summary && <p className="text-sm text-muted-foreground">{parsed.summary}</p>}
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {emailCount > 0 && (
          <div className="flex items-center gap-1.5">
            <MailIcon className="h-3 w-3 shrink-0" />
            <span>{emailCount} {t.ai.triage.emailCount}</span>
          </div>
        )}
        {isLabel && parsed.payload?.labelNames && parsed.payload.labelNames.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <TagIcon className="h-3 w-3 shrink-0" />
            <span>{t.ai.triage.labelSuggestion}:</span>
            {parsed.payload.labelNames.map((name) => (
              <Badge key={name} variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                {name}
              </Badge>
            ))}
          </div>
        )}
        {isFollowUp && parsed.payload?.dueDays != null && (
          <div className="flex items-center gap-1.5">
            <ClockIcon className="h-3 w-3 shrink-0" />
            <span>Due in {parsed.payload.dueDays} days</span>
            {parsed.payload.reason && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span className="truncate">{parsed.payload.reason}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CompletedCard({ parsed, t }: { parsed: BulkActionResult; t: Translations }) {
  const count = parsed.data?.count ?? parsed.payload?.count ?? 0;
  if (!parsed.summary && count === 0) {
    return <EmptyState icon={ZapIcon} title={t.ai.triage.noSuggestions} />;
  }
  return (
    <div className="rounded-lg border border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/20 p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <CheckCircle2Icon className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
        <span className="text-sm font-medium text-foreground">
          {parsed.summary || "Bulk action completed"}
        </span>
      </div>
      {count > 0 && (
        <p className="text-xs text-muted-foreground ml-6">{count} {t.ai.triage.emailCount}</p>
      )}
    </div>
  );
}

function TypeBadge({ isLabel, isFollowUp, actionType }: { isLabel: boolean; isFollowUp: boolean; actionType?: string }) {
  if (isLabel) {
    return (
      <Badge className="text-[10px] px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" variant="outline">
        <TagIcon className="h-3 w-3 mr-1" />Apply Labels
      </Badge>
    );
  }
  if (isFollowUp) {
    return (
      <Badge className="text-[10px] px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" variant="outline">
        <ClockIcon className="h-3 w-3 mr-1" />Create Follow-ups
      </Badge>
    );
  }
  if (actionType) {
    return (
      <Badge variant="outline" className="text-[10px] px-2 py-0.5 capitalize">
        <ZapIcon className="h-3 w-3 mr-1" />{actionType.replace(/_/g, " ").toLowerCase()}
      </Badge>
    );
  }
  return null;
}

function buildActions(isLabel: boolean, isFollowUp: boolean, onAction?: ToolRendererProps["onAction"]) {
  const actions = [];
  if (isLabel) {
    actions.push({
      icon: TagIcon, label: "Apply Labels",
      onClick: () => onAction?.({ type: "send-message", message: "Approve and apply the label suggestions" }),
    });
  } else if (isFollowUp) {
    actions.push({
      icon: ClockIcon, label: "Create Follow-ups",
      onClick: () => onAction?.({ type: "send-message", message: "Approve and create the follow-ups" }),
    });
  }
  actions.push({
    icon: XCircleIcon, label: "Dismiss", variant: "destructive" as const,
    onClick: () => onAction?.({ type: "send-message", message: "Dismiss the triage suggestion" }),
  });
  return actions;
}
