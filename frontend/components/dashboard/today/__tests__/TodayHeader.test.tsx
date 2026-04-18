/**
 * TodayHeader RTL spec (145.1-05).
 *
 * Exercises the greeting hour-bucket selection, KPI chip anchor hrefs/aria
 * labels, and the loading skeleton path. useLocale + useTranslations are
 * mocked at `@/lib/hooks/*` per the real component import paths.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      today: {
        greeting: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
        kpi: { inbox: 'Inbox', calendar: 'Calendar', deals: 'Deals', tasks: 'Tasks' },
      },
    },
  }),
}));
jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en' }),
}));

import { TodayHeader } from '../TodayHeader';
import type { TodayFeedCounts } from '@/lib/api/dashboard';

const theme = createTheme();
const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const kpiCounts: TodayFeedCounts = {
  repliesNeeded: 0,
  dueToday: 0,
  waitingOnOthers: 0,
  fyi: 0,
  total: 0,
  kpi: { inbox: 47, calendar: 6, deals: 12, tasks: 9 },
};

describe('TodayHeader', () => {
  it('renders 4 KPI chips with correct aria-labels and hrefs', () => {
    wrap(<TodayHeader counts={kpiCounts} loading={false} />);
    const inbox = screen.getByLabelText('Inbox');
    expect(inbox.tagName).toBe('A');
    expect(inbox).toHaveAttribute('href', '/dashboard/email');
    expect(screen.getByLabelText('Calendar')).toHaveAttribute('href', '/dashboard/calendar');
    expect(screen.getByLabelText('Deals')).toHaveAttribute('href', '/dashboard/crm/deals');
    expect(screen.getByLabelText('Tasks')).toHaveAttribute('href', '/dashboard/tasks');
  });

  it('picks morning greeting when hour < 12', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-17T09:00:00'));
    wrap(<TodayHeader counts={kpiCounts} loading={false} />);
    expect(screen.getByText('Good morning')).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('picks afternoon greeting when 12 <= hour < 18', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-17T14:00:00'));
    wrap(<TodayHeader counts={kpiCounts} loading={false} />);
    expect(screen.getByText('Good afternoon')).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('picks evening greeting when hour >= 18', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-17T20:00:00'));
    wrap(<TodayHeader counts={kpiCounts} loading={false} />);
    expect(screen.getByText('Good evening')).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('renders skeletons when loading', () => {
    wrap(<TodayHeader counts={undefined} loading={true} />);
    // KPI chips replaced by Skeleton — at least 4 skeleton nodes rendered.
    const skeletons = document.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });
});
