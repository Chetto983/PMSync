"use client";

import { AlertTriangleIcon, InboxIcon, MailIcon, MailOpenIcon } from "lucide-react";
import type { ToolRendererProps, CountResult } from "../types";
import { RawJsonToggle } from "../shared/RawJsonToggle";

/**
 * Smart renderer for count_emails tool.
 * Shows stat cards with total, unread, read counts.
 */
export function CountRenderer({ output, errorText }: ToolRendererProps) {
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

  const result = output as CountResult;

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

  const { data } = result;
  if (!data) return null;

  return (
    <div className="p-3 space-y-3">
      {/* Period context */}
      <p className="text-xs text-muted-foreground px-1">
        {data.period} · {data.folder}
      </p>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          icon={InboxIcon}
          label="Total"
          value={data.total}
          color="text-foreground"
        />
        <StatCard
          icon={MailIcon}
          label="Unread"
          value={data.unread}
          color="text-blue-600"
        />
        <StatCard
          icon={MailOpenIcon}
          label="Read"
          value={data.read}
          color="text-muted-foreground"
        />
      </div>

      <RawJsonToggle data={output} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border p-2.5 bg-muted/20">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className={`text-xl font-semibold ${color}`}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
