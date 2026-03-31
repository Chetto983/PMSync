import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BriefingWidget } from './BriefingWidget';

jest.mock('@/hooks/queries/use-consent', () => ({
  useConsent: () => ({
    data: [{ feature: 'ai_email_processing', granted: true }],
    isLoading: false,
  }),
}));

jest.mock('@/hooks/queries/use-dashboard', () => ({
  useBriefing: () => ({
    data: {
      summary: 'Unable to generate briefing at this time.',
      urgentEmails: 0,
      deadlinesToday: 0,
      pendingFollowUps: 0,
      staleContacts: 0,
      highlights: [],
      generatedAt: '2026-03-31T12:00:00.000Z',
    },
    isLoading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
  useTriagedEmails: () => ({
    data: {
      emails: [
        {
          id: 'email-1',
          subject: 'Contract approval needed today',
          from: 'Alice <alice@example.com>',
          aiPriority: 1,
          aiPriorityReason: 'Customer is waiting for approval.',
          aiSentiment: 'negative',
          aiLabels: ['Contract'],
          isRead: false,
          receivedAt: '2026-03-31T09:00:00.000Z',
        },
      ],
      total: 1,
      byPriority: { 1: 1 },
    },
    isLoading: false,
  }),
  useRecentUnreadEmails: () => ({
    data: { emails: [], total: 0 },
    isLoading: false,
  }),
}));

jest.mock('@/hooks/queries/use-follow-ups', () => ({
  usePendingFollowUps: () => ({
    data: {
      followUps: [
        {
          id: 'fu-1',
          emailId: 'email-1',
          followUpType: 'TODO',
          dueDate: '2026-03-31T12:00:00.000Z',
          status: 'PENDING',
          reason: 'Need to answer before noon.',
        },
      ],
      count: 1,
    },
    isLoading: false,
  }),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      widgets: {
        briefing: {
          title: 'Daily Briefing',
          urgent: 'urgent',
          deadlines: 'deadlines',
          followUps: 'follow-ups',
          staleContacts: 'stale contacts',
          highlights: "Today's Highlights",
        },
        common: {
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
    common: {
      noSubject: '(No subject)',
    },
  }),
}));

jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({
    locale: 'en',
    changeLocale: jest.fn(),
  }),
}));

describe('BriefingWidget', () => {
  it('uses a factual fallback summary when the AI briefing is weak', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <BriefingWidget />
      </ThemeProvider>,
    );

    expect(screen.getByText(/Inbox summary:/)).toBeInTheDocument();
    expect(screen.getByText(/Contract approval needed today - follow-up due/)).toBeInTheDocument();
  });
});
