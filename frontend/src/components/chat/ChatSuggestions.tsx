'use client';

import { useSuggestionTrigger } from '@assistant-ui/core/react';
import { useAuiState } from '@assistant-ui/store';
import { useTranslations } from '@/lib/hooks/use-translations';

type ChatSuggestionState = {
  label?: string;
  prompt: string;
  title: string;
};

type ResolvedSuggestionCopy = {
  prompt: string;
  title: string;
};

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function buildFallbackSuggestions(
  t: ReturnType<typeof useTranslations>,
): ChatSuggestionState[] {
  return [
    {
      title: t.chat.suggestions.summarizeInboxLabel,
      prompt: t.chat.suggestions.summarizeInboxPrompt,
    },
    {
      title: t.chat.suggestions.triageLabel,
      prompt: t.chat.suggestions.triagePrompt,
    },
    {
      title: t.chat.suggestions.followUpsLabel,
      prompt: t.chat.suggestions.followUpsPrompt,
    },
    {
      title: t.chat.suggestions.todayScheduleLabel,
      prompt: t.chat.suggestions.todaySchedulePrompt,
    },
    {
      title: t.chat.suggestions.recentContactsLabel,
      prompt: t.chat.suggestions.recentContactsPrompt,
    },
    {
      title: t.chat.suggestions.briefingLabel,
      prompt: t.chat.suggestions.briefingPrompt,
    },
  ];
}

function resolveSuggestionCopy(
  suggestion: ChatSuggestionState,
  t: ReturnType<typeof useTranslations>,
): ResolvedSuggestionCopy {
  const normalizedTitle = normalize(suggestion.title);
  const normalizedPrompt = normalize(suggestion.prompt);

  const presets = [
    {
      titles: ['summarize inbox'],
      prompts: ['show my unread emails from today'],
      title: t.chat.suggestions.summarizeInboxLabel,
      prompt: t.chat.suggestions.summarizeInboxPrompt,
    },
    {
      titles: ['what needs attention', 'important emails'],
      prompts: ['triage my inbox', 'what needs attention'],
      title: t.chat.suggestions.triageLabel,
      prompt: t.chat.suggestions.triagePrompt,
    },
    {
      titles: ['show follow-ups', 'pending follow-ups'],
      prompts: ['show my follow-ups', 'what do i need to follow up on'],
      title: t.chat.suggestions.followUpsLabel,
      prompt: t.chat.suggestions.followUpsPrompt,
    },
    {
      titles: ["today's schedule"],
      prompts: ['what meetings do i have today?', "what's on my agenda today?"],
      title: t.chat.suggestions.todayScheduleLabel,
      prompt: t.chat.suggestions.todaySchedulePrompt,
    },
    {
      titles: ['recent contacts', 'search contacts'],
      prompts: ['who are my most recent contacts?', "find john's contact info"],
      title: t.chat.suggestions.recentContactsLabel,
      prompt: t.chat.suggestions.recentContactsPrompt,
    },
    {
      titles: ['give me a briefing', "what's new?", 'ai suggestions'],
      prompts: ['give me a briefing', "what's new?"],
      title: t.chat.suggestions.briefingLabel,
      prompt: t.chat.suggestions.briefingPrompt,
    },
  ];

  const preset = presets.find((entry) => (
    entry.titles.includes(normalizedTitle) || entry.prompts.includes(normalizedPrompt)
  ));

  if (!preset) {
    return {
      prompt: suggestion.prompt,
      title: suggestion.title || suggestion.label || suggestion.prompt,
    };
  }

  return {
    prompt: preset.prompt,
    title: preset.title,
  };
}

/**
 * Individual suggestion chip: subtle bordered pill.
 */
function SuggestionItem({
  suggestion,
  forceDisabled = false,
}: {
  suggestion: ChatSuggestionState;
  forceDisabled?: boolean;
}) {
  const t = useTranslations();
  const copy = resolveSuggestionCopy(suggestion, t);
  const { trigger, disabled } = useSuggestionTrigger({
    prompt: copy.prompt,
  });

  return (
    <button
      type="button"
      className="chat-suggestion-chip"
      onClick={trigger}
      disabled={disabled || forceDisabled}
      aria-label={copy.title}
    >
      {copy.title}
    </button>
  );
}

/**
 * Suggested questions row above the composer.
 */
export function ChatSuggestions({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations();
  const runtimeSuggestions = useAuiState((s) => s.suggestions.suggestions);
  const fallbackSuggestions = buildFallbackSuggestions(t);
  const visibleSuggestions = runtimeSuggestions.length > 0
    ? runtimeSuggestions.slice(0, 4)
    : fallbackSuggestions.slice(0, 4);

  return (
    <div className="chat-suggestions-row" aria-label={t.chat.suggestions.label}>
      {visibleSuggestions.map((suggestion) => (
        <SuggestionItem
          key={suggestion.title}
          suggestion={suggestion as ChatSuggestionState}
          forceDisabled={disabled}
        />
      ))}
    </div>
  );
}

export { buildFallbackSuggestions, resolveSuggestionCopy };
