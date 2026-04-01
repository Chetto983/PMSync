import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { EntityContextSidebar } from './EntityContextSidebar';

jest.mock('@/hooks/queries/use-crm-context', () => ({
  useCrmContextByContact: jest.fn(),
  useCrmContextByEmail: jest.fn(),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    crmContext: {
      sidebarTitle: 'CRM Context',
      linkedAccount: 'Account',
      openDeals: 'Open Deals',
      activeTickets: 'Active Tickets',
      relationshipStrength: 'Relationship',
      noAccount: 'No linked account',
      noDeals: 'No open deals',
      noTickets: 'No active tickets',
      unknownContact: 'Unknown Contact',
      createContact: 'Create Contact',
      noCrmData: 'No CRM data yet - AI will analyze after next sync.',
      emailCount: '{count} emails exchanged',
      collapse: 'Collapse sidebar',
      expand: 'Show CRM context',
      strengthWeak: 'Weak',
      strengthModerate: 'Moderate',
      strengthStrong: 'Strong',
    },
  }),
}));

jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en' }),
}));

const {
  useCrmContextByContact,
  useCrmContextByEmail,
} = jest.requireMock('@/hooks/queries/use-crm-context') as {
  useCrmContextByContact: jest.Mock;
  useCrmContextByEmail: jest.Mock;
};

function renderSidebar() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <div style={{ position: 'relative', minHeight: 600 }}>
        <EntityContextSidebar open onToggle={jest.fn()} email="alice@example.com" />
      </div>
    </ThemeProvider>,
  );
}

describe('EntityContextSidebar', () => {
  beforeEach(() => {
    useCrmContextByContact.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
  });

  it('shows unknown contact when by-email lookup returns null', () => {
    useCrmContextByEmail.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });

    renderSidebar();

    expect(screen.getByText('Unknown Contact')).toBeInTheDocument();
  });

  it('renders CRM context from the resolved contact payload', () => {
    useCrmContextByEmail.mockReturnValue({
      data: {
        contact: {
          id: 'contact-1',
          displayName: 'Alice Ops',
          company: 'Ops Co',
          email: 'alice@example.com',
        },
        account: {
          id: 'account-1',
          name: 'Ops Co',
          website: null,
          industry: 'Software',
        },
        deals: [
          {
            id: 'deal-1',
            name: 'Renewal 2026',
            amount: '1200.50',
            currency: 'EUR',
            stage: {
              id: 'stage-1',
              name: 'Proposal',
              color: '#009688',
              probability: 60,
            },
          },
        ],
        tickets: [
          {
            id: 'ticket-1',
            subject: 'Broken webhook',
            status: 'open',
            priority: 'high',
            createdAt: '2026-04-01T08:00:00.000Z',
          },
        ],
        recentActivities: [],
        emailCount: 14,
        lastInteraction: '2026-04-01T09:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    renderSidebar();

    expect(screen.getByText('Alice Ops')).toBeInTheDocument();
    expect(screen.getAllByText('Ops Co')).toHaveLength(2);
    expect(screen.getByText('Renewal 2026')).toBeInTheDocument();
    expect(screen.getByText('Broken webhook')).toBeInTheDocument();
    expect(screen.getByText(/14 emails exchanged/i)).toBeInTheDocument();
  });
});
