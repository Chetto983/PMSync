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
    <SuggestionPrimitive.Trigger className="chat-suggestion-chip">
      <SuggestionPrimitive.Title />
    </SuggestionPrimitive.Trigger>
  );
}

/**
 * Suggested questions row above the composer.
 */
export function ChatSuggestions() {
  return (
    <div className="chat-suggestions-row">
      <ThreadPrimitive.Suggestions
        components={{ Suggestion: SuggestionItem }}
      />
    </div>
  );
}
