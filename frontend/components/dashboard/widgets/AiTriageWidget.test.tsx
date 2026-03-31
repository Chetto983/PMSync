import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AiTriageWidget } from './AiTriageWidget';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/hooks/queries/use-consent', () => ({
  useConsent: () => ({
    data: [{ feature: 'ai_email_processing', granted: true }],
    isLoading: false,
  }),
}));

jest.mock('@/hooks/queries/use-dashboard', () => ({
  useTriagedEmails: () => ({
    data: {
      emails: [
        {
          id: 'email-1',
          subject: 'Renewal at risk',
          from: 'Alice Example <alice@example.com>',
          aiPriority: 1,
          aiPriorityReason: 'Customer mentioned a contract deadline this afternoon.',
          aiSentiment: 'negative',
          aiLabels: ['Renewal'],
          isRead: false,
          receivedAt: '2026-03-31T09:00:00.000Z',
        },
      ],
      total: 1,
      byPriority: { 1: 1 },
    },
    isLoading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
  useImportantEmails: () => ({
    data: { emails: [], total: 0 },
    isLoading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      widgets: {
        aiTriage: {
          title: 'Email Priority',
          viewAll: 'View All',
          aiTriagedSection: 'AI Priority',
          userPinnedSection: 'Starred',
          noSubject: '(No subject)',
          empty: 'No triaged emails',
          emptyDescription: 'Enable Auto-Triage in AI Settings',
        },
        common: {
          refreshWidget: 'Refresh widget',
          retry: 'Retry',
          showDetails: 'Show details',
          noItems: 'No items',
        },
      },
    },
    settings: {
      consentPanel: {
        features: {
          ai_email_processing: {
            description: 'Enable AI email processing.',
          },
        },
      },
    },
    threadMessage: {
      ai: {
        priority: 'Priority',
        positive: 'Positive',
        negative: 'Negative',
        neutral: 'Neutral',
        mixed: 'Mixed',
      },
    },
  }),
}));

describe('AiTriageWidget', () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it('renders AI reason and sentiment for triaged emails', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <AiTriageWidget />
      </ThemeProvider>,
    );

    expect(screen.getByText('Renewal at risk')).toBeInTheDocument();
    expect(screen.getByText('Renewal')).toBeInTheDocument();
    expect(screen.getByText('Negative')).toBeInTheDocument();
    expect(screen.getByText('Customer mentioned a contract deadline this afternoon.')).toBeInTheDocument();
  });

  it('navigates to the email detail and triaged inbox view', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <AiTriageWidget />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Renewal at risk'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/email?id=email-1');

    fireEvent.click(screen.getByText('View All'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/email?filter=triaged');
  });
});
