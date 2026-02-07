"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangleIcon, BrainIcon } from "lucide-react";
import type { ToolRendererProps, MemorySearchResult } from "../types";
import { EmptyState } from "../shared/EmptyState";
import { ResultSummary } from "../shared/ResultSummary";
import { RawJsonToggle } from "../shared/RawJsonToggle";

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  FACT: { label: "Fact", color: "bg-blue-100 text-blue-700" },
  PREFERENCE: { label: "Preference", color: "bg-purple-100 text-purple-700" },
  CONTACT_NOTE: { label: "Contact", color: "bg-green-100 text-green-700" },
  PATTERN: { label: "Pattern", color: "bg-amber-100 text-amber-700" },
};

/**
 * Smart renderer for search_memory / memory_search tool.
 * Shows memory cards with type badge, content preview, relevance score.
 */
export function MemoryRenderer({ output, errorText }: ToolRendererProps) {
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

  const result = output as MemorySearchResult;

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

  if (!result.memories?.length) {
    return (
      <div className="p-3">
        <EmptyState
          icon={BrainIcon}
          title={result.message || "No memories found"}
          description="No relevant memories for this query"
        />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <ResultSummary count={result.memories.length} noun="memory" />

      <div className="space-y-1">
        {result.memories.map((memory, i) => {
          const typeCfg = TYPE_CONFIG[memory.type] || {
            label: memory.type,
            color: "bg-muted text-muted-foreground",
          };

          return (
            <div
              key={i}
              className="px-2.5 py-2 rounded-md border bg-muted/20 space-y-1"
            >
              {/* Header: type badge + category + score */}
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 py-0 ${typeCfg.color}`}
                >
                  {typeCfg.label}
                </Badge>
                {memory.category && (
                  <span className="text-[11px] text-muted-foreground">
                    {memory.category}
                  </span>
                )}
                {memory.score > 0 && (
                  <span className="text-[10px] text-muted-foreground/60 ml-auto">
                    {Math.round(memory.score * 100)}% match
                  </span>
                )}
              </div>

              {/* Content */}
              <p className="text-sm text-foreground leading-relaxed">
                {memory.content.length > 300
                  ? `${memory.content.substring(0, 300)}...`
                  : memory.content}
              </p>

              {/* Date */}
              {memory.createdAt && (
                <p className="text-[11px] text-muted-foreground/60">
                  {new Date(memory.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <RawJsonToggle data={output} />
    </div>
  );
}
