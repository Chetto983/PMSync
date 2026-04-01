'use client';

import { BranchPickerPrimitive } from '@assistant-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Box from '@mui/material/Box';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Branch picker for navigating between message branches (edit + regenerate).
 * Shows branch number / count with previous/next navigation.
 */
export function ChatBranchPicker() {
  const t = useTranslations();
  const tu = t.ai?.toolUi;

  return (
    <BranchPickerPrimitive.Root className="chat-branch-picker" hideWhenSingleBranch>
      <BranchPickerPrimitive.Previous
        className="chat-branch-btn"
        aria-label={tu?.previousBranch ?? 'Previous branch'}
      >
        <ChevronLeft size={14} />
      </BranchPickerPrimitive.Previous>
      <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </Box>
      <BranchPickerPrimitive.Next
        className="chat-branch-btn"
        aria-label={tu?.nextBranch ?? 'Next branch'}
      >
        <ChevronRight size={14} />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}
