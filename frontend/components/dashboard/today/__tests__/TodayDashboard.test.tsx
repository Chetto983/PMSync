/**
 * TodayDashboard RTL spec — covers loading / 3-tier rendering / empty / error / tz pass-through.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const mockUseTodayFeed = jest.fn();
jest.mock('@/hooks/queries/use-today', () => ({
  useTodayFeed: (...args: unknown[]) => mockUseTodayFeed(...args),
  useCompleteFeedItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSnoozeFeedItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-user-timezone', () => ({
  useUserTimezone: () => 'America/New_York',
}));
jest.mock('@/stores/today-feed-store', () => ({
  useTodayFeedStore: (selector: (s: any) => any) =>
    selector({
      dismissedIds: new Set<string>(),
      dismiss: jest.fn(),
      restore: jest.fn(),
      isDismissed: () => false,
      reset: jest.fn(),
    }),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: { div: 'div', li: 'li' },
}));
jest.mock('@/lib/context/toast-context', () => ({
  useGlobalToast: () => ({
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  }),
}));
jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', changeLocale: jest.fn() }),
}));
jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: { retry: 'Retry' },
    errors: { fetchErrorTitle: 'Error', fetchErrorDescription: 'Try again' },
    dashboard: {
      today: {
        title: 'Today',
        subtitle: 'Sub',
        greeting: 'Hi {urgent} {today} {fyi}',
        tiers: { urgent: 'Urgent', today: 'Today', fyi: 'FYI' },
        empty: { title: 'All caught up!', body: 'No urgent.', bodyClean: 'Nothing.' },
        error: 'Error loading',
        toasts: { completed: '', dismissed: '', snoozed: '', undo: 'Undo' },
        snooze: { oneHour: '1h', tomorrow: 'tomorrow', nextWeek: 'next week' },
        aria: { complete: 'complete', dismiss: 'dismiss', snooze: 'snooze' },
      },
    },
  }),
}));

import { TodayDashboard } from '../TodayDashboard';
import type { TodayFeedItem } from '@/lib/api/dashboard';

const wrap = (ui: React.ReactNode) =>
  render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

const mkItem = (o: Partial<TodayFeedItem> = {}): TodayFeedItem => ({
  id: 'i1',
  type: 'task',
  tier: 'today',
  score: 100,
  title: 'Item one',
  subtitle: null,
  dueAt: null,
  isOverdue: false,
  emailId: null,
  threadId: null,
  taskSourceType: 'manual',
  taskSourceId: 'm1',
  dealId: null,
  eventId: null,
  canComplete: true,
  canDismiss: true,
  canSnooze: false,
  ...o,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TodayDashboard', () => {
  it('renders loading skeleton when isLoading', () => {
    mockUseTodayFeed.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });
    wrap(<TodayDashboard />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.queryByText('Item one')).toBeNull();
  });

  it('renders three tier sections with counts when feed has urgent + today + fyi items', () => {
    mockUseTodayFeed.mockReturnValue({
      data: {
        items: [
          mkItem({ id: 'u', tier: 'urgent', title: 'Urgent item' }),
          mkItem({ id: 't', tier: 'today', title: 'Today item' }),
          mkItem({ id: 'f', tier: 'fyi', title: 'FYI item' }),
        ],
        counts: { urgent: 1, today: 1, fyi: 1, total: 3 },
        greeting: null,
        generatedAt: 'x',
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    wrap(<TodayDashboard />);
    // Tier headers are rendered as "URGENT (1)", "TODAY (1)", "FYI (1)".
    // Item titles ("Urgent item", "Today item", "FYI item") also match the regex,
    // so use getAllByText with explicit > 0 assertions instead of getByText.
    expect(screen.getAllByText(/URGENT/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TODAY/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/FYI/i).length).toBeGreaterThan(0);
    // Tier headers carry the count parenthetical — assert that explicitly.
    expect(screen.getByText(/URGENT \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/TODAY \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/FYI \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Urgent item')).toBeInTheDocument();
    expect(screen.getByText('Today item')).toBeInTheDocument();
    expect(screen.getByText('FYI item')).toBeInTheDocument();
  });

  it('renders empty state when items array is empty', () => {
    mockUseTodayFeed.mockReturnValue({
      data: {
        items: [],
        counts: { urgent: 0, today: 0, fyi: 0, total: 0 },
        greeting: null,
        generatedAt: 'x',
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    wrap(<TodayDashboard />);
    expect(screen.getByText('All caught up!')).toBeInTheDocument();
  });

  it('renders QueryErrorAlert when error is present', () => {
    mockUseTodayFeed.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
      refetch: jest.fn(),
    });
    wrap(<TodayDashboard />);
    // QueryErrorAlert renders the title prop we pass
    expect(screen.getByText('Error loading')).toBeInTheDocument();
  });

  it('passes user timezone + includeGreeting=true to useTodayFeed', () => {
    mockUseTodayFeed.mockReturnValue({
      data: {
        items: [],
        counts: { urgent: 0, today: 0, fyi: 0, total: 0 },
        greeting: null,
        generatedAt: 'x',
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    wrap(<TodayDashboard />);
    expect(mockUseTodayFeed).toHaveBeenCalledWith(
      expect.objectContaining({ tz: 'America/New_York', includeGreeting: true }),
    );
  });
});
