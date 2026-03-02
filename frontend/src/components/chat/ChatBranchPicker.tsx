'use client';

import { BranchPickerPrimitive } from '@assistant-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Branch picker for navigating between message branches (edit + regenerate).
 * Shows branch number / count with previous/next navigation.
 */
export function ChatBranchPicker() {
  return (
    <BranchPickerPrimitive.Root className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <BranchPickerPrimitive.Previous
        className="p-0.5 rounded hover:bg-muted transition-colors disabled:opacity-30"
        aria-label="Previous branch"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </BranchPickerPrimitive.Previous>
      <span className="tabular-nums">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next
        className="p-0.5 rounded hover:bg-muted transition-colors disabled:opacity-30"
        aria-label="Next branch"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}
