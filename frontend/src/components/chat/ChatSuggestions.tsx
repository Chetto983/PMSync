'use client';

import {
  ThreadPrimitive,
  SuggestionPrimitive,
} from '@assistant-ui/react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Individual suggestion item rendered by ThreadPrimitive.Suggestions.
 * Uses SuggestionPrimitive to display title and trigger action.
 */
function SuggestionItem() {
  return (
    <SuggestionPrimitive.Trigger className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer">
      <SuggestionPrimitive.Title />
    </SuggestionPrimitive.Trigger>
  );
}

/**
 * Suggested questions rendered as pill/chip buttons.
 * Shown when the thread is empty or after the last assistant message.
 */
export function ChatSuggestions() {
  const t = useTranslations();

  return (
    <div className="px-3 pb-2">
      <p className="text-xs text-muted-foreground mb-1.5">
        {t.chat.suggestions.label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <ThreadPrimitive.Suggestions
          components={{ Suggestion: SuggestionItem }}
        />
      </div>
    </div>
  );
}
