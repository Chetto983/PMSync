"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

interface ResultSummaryProps extends ComponentProps<"div"> {
  count: number;
  noun: string;
  badge?: ReactNode;
}

/**
 * Result count header - assistant-ui style.
 * Minimal: count + noun with optional trailing badge.
 */
export function ResultSummary({
  count,
  noun,
  badge,
  className,
  ...props
}: ResultSummaryProps) {
  const pluralNoun = count === 1 ? noun : `${noun}s`;
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 pb-2 text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span>
        {count === 0 ? `No ${pluralNoun}` : `${count} ${pluralNoun}`}
      </span>
      {badge}
    </div>
  );
}

export function SearchTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {type === "semantic" || type === "rag" ? "Smart" : "Text"}
    </span>
  );
}
