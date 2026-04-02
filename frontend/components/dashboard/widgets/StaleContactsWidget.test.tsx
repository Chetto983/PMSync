import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { StaleContactsWidget } from './StaleContactsWidget';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/hooks/queries/use-dashboard', () => ({
  useStaleContacts: jest.fn(),
}));

jest.mock('@/hooks/queries/use-contacts', () => ({
  useContactCounts: jest.fn(),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      widgets: {
        common: {
          refreshWidget: 'Refresh widget',
        },
        crm: {
          title: 'CRM Alerts',
          subtitle: '{count} stale contact',
          subtitlePlural: '{count} stale contacts',
          avgScore: 'Avg score: {score}%',
          allActive: 'All contacts active',
          greatJob: 'Great job maintaining relationships!',
          noContactsSynced: 'No contacts synced yet',
          noContactsSyncedDescription: 'Connect and sync a provider before checking stale relationships.',
          reconnect: 'Reconnect',
          viewAll: 'View All Stale Contacts',
          lastContact: '{time} ago',
          monthAgo: '1 month ago',
          monthsAgo: '{months} months ago',
          yearAgo: '1 year ago',
          yearsAgo: '{years} years ago',
          daysAgo: '{days} days ago',
          frequencyDaily: 'was daily',
          frequencyWeekly: 'was weekly',
          frequencyMonthly: 'was monthly',
          frequencyOccasional: 'occasional',
          trendDecreasing: 'declining',
          trendStable: 'stable',
          trendIncreasing: 'growing',
          interactions: '{count} interactions',
          score: '{score}%',
        },
      },
    },
  }),
}));

const { useStaleContacts } = jest.requireMock('@/hooks/queries/use-dashboard') as {
  useStaleContacts: jest.Mock;
};
const { useContactCounts } = jest.requireMock('@/hooks/queries/use-contacts') as {
  useContactCounts: jest.Mock;
};

describe('StaleContactsWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStaleContacts.mockReturnValue({
      data: { contacts: [], total: 0, averageScore: 0 },
      isLoading: false,
      error: undefined,
      refetch: jest.fn(),
    });
  });

  it('shows a synced-data onboarding message when the tenant has no contacts yet', () => {
    useContactCounts.mockReturnValue({
      data: { total: 0, withEmail: 0, withPhone: 0, withCompany: 0 },
    });

    render(
      <ThemeProvider theme={createTheme()}>
        <StaleContactsWidget />
      </ThemeProvider>,
    );

    expect(screen.getByText('No contacts synced yet')).toBeInTheDocument();
    expect(screen.getByText('Connect and sync a provider before checking stale relationships.')).toBeInTheDocument();
  });

  it('keeps the all-active message when contacts exist but none are stale', () => {
    useContactCounts.mockReturnValue({
      data: { total: 12, withEmail: 12, withPhone: 3, withCompany: 4 },
    });

    render(
      <ThemeProvider theme={createTheme()}>
        <StaleContactsWidget />
      </ThemeProvider>,
    );

    expect(screen.getByText('All contacts active')).toBeInTheDocument();
    expect(screen.getByText('Great job maintaining relationships!')).toBeInTheDocument();
  });
});
