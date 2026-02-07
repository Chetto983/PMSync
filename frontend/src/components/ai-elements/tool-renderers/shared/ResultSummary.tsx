"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

interface ResultSummaryProps extends ComponentProps<"div"> {
  count: number;
  noun: string;
  badge?: ReactNode;
}

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
        "flex items-center justify-between text-xs text-muted-foreground px-1 pb-2",
        className
      )}
      {...props}
    >
      <span>
        {count === 0 ? `No ${pluralNoun}` : `Found ${count} ${pluralNoun}`}
      </span>
      {badge}
    </div>
  );
}

export function SearchTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
      {type === "semantic" || type === "rag" ? "Smart Search" : "Text Search"}
    </Badge>
  );
}
