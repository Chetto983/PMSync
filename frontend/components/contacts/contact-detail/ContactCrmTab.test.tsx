import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ContactCrmTab } from './ContactCrmTab';

jest.mock('@/hooks/queries/use-crm-context', () => ({
  useCrmContextByContact: jest.fn(),
}));

jest.mock('@/hooks/queries/use-crm-activities', () => ({
  useActivityTimeline: jest.fn(),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    crmContext: {
      linkedAccount: 'Account',
      noAccount: 'No linked account',
      openDeals: 'Open Deals',
      noDeals: 'No open deals',
      activeTickets: 'Active Tickets',
      noTickets: 'No active tickets',
      noCrmData: 'No CRM data yet',
    },
    activityTimeline: {
      title: 'Activity Timeline',
      noActivities: 'No activities yet',
      loadMore: 'Load more',
      eventTypes: {
        email_received: 'Email received',
      },
    },
    crmDeals: {
      columns: {
        name: 'Name',
        stage: 'Stage',
        amount: 'Value',
      },
    },
    crmTickets: {
      columns: {
        subject: 'Subject',
        status: 'Status',
        createdAt: 'Date',
      },
    },
  }),
}));

jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en' }),
}));

const { useCrmContextByContact } = jest.requireMock('@/hooks/queries/use-crm-context') as {
  useCrmContextByContact: jest.Mock;
};

const { useActivityTimeline } = jest.requireMock('@/hooks/queries/use-crm-activities') as {
  useActivityTimeline: jest.Mock;
};

describe('ContactCrmTab', () => {
  beforeEach(() => {
    useActivityTimeline.mockReturnValue({
      data: undefined,
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
    });
  });

  it('shows the timeline section from recent CRM activity even without a linked account', () => {
    useCrmContextByContact.mockReturnValue({
      data: {
        contact: {
          id: 'contact-1',
          displayName: 'Alice Example',
          company: null,
          email: 'alice@example.com',
        },
        account: null,
        deals: [],
        tickets: [],
        recentActivities: [
          {
            id: 'activity-1',
            type: 'email_received',
            content: 'Imported from recent activity feed',
            createdAt: '2026-04-01T09:00:00.000Z',
          },
        ],
        emailCount: 4,
        lastInteraction: '2026-04-01T09:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    render(
      <ThemeProvider theme={createTheme()}>
        <ContactCrmTab contactId="contact-1" />
      </ThemeProvider>,
    );

    expect(screen.getByText('No linked account')).toBeInTheDocument();
    expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
    expect(screen.getByText('Email received')).toBeInTheDocument();
    expect(screen.getByText('Imported from recent activity feed')).toBeInTheDocument();
  });
});
