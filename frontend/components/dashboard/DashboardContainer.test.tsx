import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import DashboardContainer from './DashboardContainer';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Your personal command center',
      actions: {
        customize: 'Customize',
      },
    },
    common: {
      done: 'Done',
    },
    crmSuggestions: {
      title: 'AI Suggestions',
    },
  }),
}));

jest.mock('@/hooks/queries/use-dashboard', () => ({
  useDashboardPreferences: () => ({
    data: {
      widgets: [
        { widgetId: 'briefing' },
      ],
    },
    isLoading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
  useSaveDashboardLayout: () => ({
    mutate: jest.fn(),
  }),
}));

jest.mock('@/hooks/queries/use-crm-suggestions', () => ({
  usePendingSuggestions: () => ({
    data: {
      data: [{ id: 'suggestion-1' }],
      total: 1,
    },
  }),
}));

jest.mock('@/stores/dashboard-store', () => ({
  ALL_WIDGETS: ['briefing', 'crmSuggestions'],
}));

jest.mock('@/components/common', () => ({
  PageContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/common/QueryErrorAlert', () => ({
  QueryErrorAlert: () => <div>query error</div>,
}));

jest.mock('./dashboard/WidgetCard', () => ({
  WidgetCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('./dashboard/WidgetSkeleton', () => ({
  WidgetSkeleton: () => <div>widget skeleton</div>,
}));

jest.mock('./dashboard/CustomizeDrawer', () => ({
  CustomizeDrawer: () => null,
}));

jest.mock('./dashboard/DashboardEmptyState', () => ({
  DashboardEmptyState: () => <div>empty dashboard</div>,
}));

jest.mock('./dashboard/AiQuickAccess', () => ({
  AiQuickAccess: () => <div>quick access</div>,
}));

jest.mock('./dashboard/widget-registry', () => ({
  WIDGETS: [
    {
      id: 'briefing',
      component: () => <div>Briefing widget</div>,
    },
    {
      id: 'crmSuggestions',
      component: () => <div>CRM Suggestions widget</div>,
    },
  ],
}));

describe('DashboardContainer', () => {
  it('forces the CRM suggestions widget into the dashboard when pending suggestions exist', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DashboardContainer />
      </ThemeProvider>,
    );

    expect(screen.getByText('Briefing widget')).toBeInTheDocument();
    expect(screen.getByText('CRM Suggestions widget')).toBeInTheDocument();
  });
});
