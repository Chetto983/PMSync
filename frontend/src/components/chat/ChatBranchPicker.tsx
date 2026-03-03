'use client';

import { BranchPickerPrimitive } from '@assistant-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Branch picker for navigating between message branches (edit + regenerate).
 * Shows branch number / count with previous/next navigation.
 */
export function ChatBranchPicker() {
  return (
    <BranchPickerPrimitive.Root className="chat-branch-picker" hideWhenSingleBranch>
      <BranchPickerPrimitive.Previous
        className="chat-branch-btn"
        aria-label="Previous branch"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </BranchPickerPrimitive.Previous>
      <span className="tabular-nums">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next
        className="chat-branch-btn"
        aria-label="Next branch"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}
