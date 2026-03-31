import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AiActionButtons } from './AiActionButtons';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    threadMessage: {
      ai: {
        summarize: 'Summarize',
        summarizing: 'Summarizing...',
        priority: 'Priority',
        sentiment: 'Sentiment',
        highPriority: 'High priority',
        mediumPriority: 'Medium priority',
        lowPriority: 'Low priority',
        positive: 'Positive',
        negative: 'Negative',
        neutral: 'Neutral',
        mixed: 'Mixed',
        error: 'Failed to analyze',
        consentRequired: 'Consent required',
      },
    },
  }),
}));

jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en' }),
}));

jest.mock('@/lib/context/toast-context', () => ({
  useGlobalToast: () => ({ error: jest.fn() }),
}));

jest.mock('@/hooks/ai', () => ({
  useEmailSummarizeMutation: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
}));

jest.mock('@/lib/api/ai', () => ({
  aiApi: {
    calculatePriority: jest.fn(),
    analyzeSentiment: jest.fn(),
  },
}));

function renderButtons(overrides: Partial<ComponentProps<typeof AiActionButtons>> = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <AiActionButtons
        emailId="email-1"
        onSummaryGenerated={jest.fn()}
        showSummary={false}
        onToggleSummary={jest.fn()}
        hasSummary={false}
        {...overrides}
      />
    </ThemeProvider>,
  );
}

describe('AiActionButtons', () => {
  it('resyncs existing triage state when the selected email changes', () => {
    const { rerender } = renderButtons({
      existingPriority: 1,
      existingPriorityReason: 'Customer asked for a same-day reply.',
      existingSentiment: 'negative',
    });

    expect(screen.getByText('High priority')).toBeInTheDocument();
    expect(screen.getByText('Negative')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={createTheme()}>
        <AiActionButtons
          emailId="email-2"
          onSummaryGenerated={jest.fn()}
          showSummary={false}
          onToggleSummary={jest.fn()}
          hasSummary={false}
          existingPriority={5}
          existingPriorityReason="Routine newsletter."
          existingSentiment="positive"
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Low priority')).toBeInTheDocument();
    expect(screen.getByText('Positive')).toBeInTheDocument();
    expect(screen.queryByText('High priority')).not.toBeInTheDocument();
    expect(screen.queryByText('Negative')).not.toBeInTheDocument();
  });

  it('clears derived AI state when the next email has no triage metadata', () => {
    const { rerender } = renderButtons({
      existingPriority: 2,
      existingPriorityReason: 'Customer is waiting for a quote.',
      existingSentiment: 'negative',
    });

    expect(screen.getByText('High priority')).toBeInTheDocument();
    expect(screen.getByText('Negative')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={createTheme()}>
        <AiActionButtons
          emailId="email-3"
          onSummaryGenerated={jest.fn()}
          showSummary={false}
          onToggleSummary={jest.fn()}
          hasSummary={false}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Sentiment')).toBeInTheDocument();
    expect(screen.queryByText('High priority')).not.toBeInTheDocument();
    expect(screen.queryByText('Negative')).not.toBeInTheDocument();
  });
});
