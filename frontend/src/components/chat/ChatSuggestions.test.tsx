import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatSuggestions } from './ChatSuggestions';

let mockSuggestion = {
  label: 'Summarize inbox',
  prompt: 'Show my unread emails from today',
  title: 'Summarize inbox',
};
let mockSuggestionCount = 1;

const triggerSpy = jest.fn();
const useSuggestionTriggerMock = jest.fn((_options: { prompt: string }) => ({
  disabled: false,
  trigger: triggerSpy,
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    chat: {
      suggestions: {
        label: 'Domande suggerite',
        summarizeInboxLabel: 'Riepiloga casella',
        summarizeInboxPrompt: 'Mostrami le email non lette di oggi',
        triageLabel: 'Cosa richiede attenzione',
        triagePrompt: 'Fai triage della mia casella',
        followUpsLabel: 'Mostra follow-up',
        followUpsPrompt: 'Mostrami i miei follow-up',
        todayScheduleLabel: 'Programma di oggi',
        todaySchedulePrompt: 'Quali riunioni ho oggi?',
        recentContactsLabel: 'Contatti recenti',
        recentContactsPrompt: 'Chi sono i miei contatti piu recenti?',
        briefingLabel: 'Dammi un briefing',
        briefingPrompt: 'Dammi un briefing',
      },
    },
  }),
}));

jest.mock('@assistant-ui/core/react', () => ({
  useSuggestionTrigger: (options: { prompt: string }) => useSuggestionTriggerMock(options),
}));

jest.mock('@assistant-ui/store', () => ({
  useAuiState: () => mockSuggestionCount,
}));

jest.mock('@assistant-ui/react', () => ({
  ThreadPrimitive: {
    Suggestions: ({ children }: { children: ({ suggestion }: { suggestion: typeof mockSuggestion }) => React.ReactNode }) => (
      <>{children({ suggestion: mockSuggestion })}</>
    ),
  },
}));

describe('ChatSuggestions', () => {
  beforeEach(() => {
    mockSuggestion = {
      label: 'Summarize inbox',
      prompt: 'Show my unread emails from today',
      title: 'Summarize inbox',
    };
    mockSuggestionCount = 1;
    triggerSpy.mockClear();
    useSuggestionTriggerMock.mockClear();
  });

  it('translates known suggestion chips and sends the localized prompt', () => {
    render(<ChatSuggestions />);

    expect(screen.getByRole('button', { name: 'Riepiloga casella' })).toBeInTheDocument();
    expect(useSuggestionTriggerMock).toHaveBeenCalledWith({
      prompt: 'Mostrami le email non lette di oggi',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Riepiloga casella' }));
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown suggestions unchanged', () => {
    mockSuggestion = {
      label: 'Custom prompt',
      prompt: 'Custom prompt',
      title: 'Custom prompt',
    };

    render(<ChatSuggestions />);

    expect(screen.getByRole('button', { name: 'Custom prompt' })).toBeInTheDocument();
    expect(useSuggestionTriggerMock).toHaveBeenCalledWith({
      prompt: 'Custom prompt',
    });
  });

  it('renders localized fallback suggestions when the runtime has none', () => {
    mockSuggestionCount = 0;

    render(<ChatSuggestions />);

    expect(screen.getByRole('button', { name: 'Riepiloga casella' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cosa richiede attenzione' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostra follow-up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Programma di oggi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contatti recenti' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dammi un briefing' })).toBeInTheDocument();
    expect(useSuggestionTriggerMock).toHaveBeenCalledTimes(6);
  });
});
