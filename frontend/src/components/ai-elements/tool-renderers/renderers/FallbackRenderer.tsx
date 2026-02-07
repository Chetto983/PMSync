"use client";

import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react";
import type { ToolRendererProps, GenericToolResult } from "../types";
import { RawJsonToggle } from "../shared/RawJsonToggle";

/**
 * Improved fallback renderer for unknown tools.
 * Shows summary/message if available, otherwise collapsible raw JSON.
 * Much better than dumping raw JSON as the primary view.
 */
export function FallbackRenderer({ output, errorText }: ToolRendererProps) {
  // Error state
  if (errorText) {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{errorText}</p>
        </div>
        <RawJsonToggle data={output} />
      </div>
    );
  }

  if (!output) return null;

  const result = output as GenericToolResult;

  // Try to extract a human-readable message
  const displayMessage =
    result.summary || result.message || extractFirstString(result);

  // Error in result
  if (result.error) {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{result.error}</p>
        </div>
        <RawJsonToggle data={output} />
      </div>
    );
  }

  // Has a displayable message
  if (displayMessage) {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          {result.success === false ? (
            <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          ) : result.success === true ? (
            <CheckCircle2Icon className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
          ) : (
            <InfoIcon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          )}
          <p className="text-sm text-foreground">{displayMessage}</p>
        </div>
        <RawJsonToggle data={output} />
      </div>
    );
  }

  // No message found - show raw JSON with better framing
  return (
    <div className="p-3">
      <RawJsonToggle data={output} />
    </div>
  );
}

/**
 * Extract the first meaningful string value from an object.
 * Skips boolean/number fields and common non-display keys.
 */
function extractFirstString(obj: Record<string, unknown>): string | null {
  const skipKeys = new Set([
    "success",
    "error",
    "summary",
    "message",
    "requiresApproval",
    "actionType",
    "severity",
  ]);

  for (const [key, value] of Object.entries(obj)) {
    if (skipKeys.has(key)) continue;
    if (typeof value === "string" && value.length > 0 && value.length < 500) {
      return value;
    }
  }
  return null;
}
