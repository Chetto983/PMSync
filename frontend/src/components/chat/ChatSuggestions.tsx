'use client';

import {
  ThreadPrimitive,
  SuggestionPrimitive,
} from '@assistant-ui/react';

/**
 * Individual suggestion chip: subtle bordered pill.
 */
function SuggestionItem() {
  return (
    <SuggestionPrimitive.Trigger className="inline-flex items-center rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-xs hover:border-primary/40 hover:bg-primary/[0.03] transition-all cursor-pointer">
      <SuggestionPrimitive.Title />
    </SuggestionPrimitive.Trigger>
  );
}

/**
 * Suggested questions row above the composer.
 */
export function ChatSuggestions() {
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      <ThreadPrimitive.Suggestions
        components={{ Suggestion: SuggestionItem }}
      />
    </div>
  );
}
