'use client';

import { BranchPickerPrimitive } from '@assistant-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Box from '@mui/material/Box';

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
        <ChevronLeft size={14} />
      </BranchPickerPrimitive.Previous>
      <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </Box>
      <BranchPickerPrimitive.Next
        className="chat-branch-btn"
        aria-label="Next branch"
      >
        <ChevronRight size={14} />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}
