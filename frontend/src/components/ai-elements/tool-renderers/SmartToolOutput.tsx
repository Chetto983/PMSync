"use client";

import { useMemo } from "react";
import { getToolRenderer } from "./index";
import type { ToolRendererProps } from "./types";

/**
 * SmartToolOutput - Drop-in replacement for ToolOutput.
 * Dispatches to tool-specific renderers based on toolName.
 * Falls back to FallbackRenderer for unknown tools.
 */
export function SmartToolOutput({
  output,
  errorText,
  toolName,
  onAction,
}: ToolRendererProps) {
  // Memoize renderer lookup - toolName is stable per tool invocation
  const Renderer = useMemo(() => getToolRenderer(toolName), [toolName]);

  // Don't render anything if no output and no error
  if (!output && !errorText) return null;

  // eslint-disable-next-line react-hooks/static-components
  return <Renderer output={output} errorText={errorText} toolName={toolName} onAction={onAction} />;
}
