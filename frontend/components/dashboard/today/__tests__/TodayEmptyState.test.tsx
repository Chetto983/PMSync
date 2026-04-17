/**
 * TodayEmptyState RTL spec — verifies celebratory copy + next-item preview branch.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      today: {
        empty: { title: 'All caught up!', body: 'No urgent items.', bodyClean: 'Nothing today.' },
        aria: { complete: 'complete', dismiss: 'dismiss', snooze: 'snooze' },
        snooze: { oneHour: '1h', tomorrow: 'tomorrow', nextWeek: 'next week' },
        tiers: { urgent: 'Urgent', today: 'Today', fyi: 'FYI' },
        toasts: { completed: '', dismissed: '', snoozed: '', undo: '' },
      },
    },
  }),
}));
jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', changeLocale: jest.fn() }),
}));
jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: { div: 'div', li: 'li' },
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/context/toast-context', () => ({
  useGlobalToast: () => ({ info: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn() }),
}));
jest.mock('@/stores/today-feed-store', () => ({
  useTodayFeedStore: (selector: (s: any) => any) =>
    selector({ dismissedIds: new Set(), dismiss: jest.fn(), restore: jest.fn(), isDismissed: () => false, reset: jest.fn() }),
}));
jest.mock('@/hooks/queries/use-today', () => ({
  useCompleteFeedItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSnoozeFeedItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import { TodayEmptyState } from '../TodayEmptyState';
import type { TodayFeedItem } from '@/lib/api/dashboard';

const wrap = (ui: React.ReactNode) =>
  render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

const mkItem = (o: Partial<TodayFeedItem> = {}): TodayFeedItem => ({
  id: 'n',
  type: 'task',
  tier: 'fyi',
  score: 0,
  title: 'Coming up',
  subtitle: null,
  dueAt: null,
  isOverdue: false,
  emailId: null,
  threadId: null,
  taskSourceType: null,
  taskSourceId: null,
  dealId: null,
  eventId: null,
  canComplete: false,
  canDismiss: false,
  canSnooze: false,
  ...o,
});

describe('TodayEmptyState', () => {
  it('renders all-caught-up title', () => {
    wrap(<TodayEmptyState />);
    expect(screen.getByText('All caught up!')).toBeInTheDocument();
  });

  it('renders bodyClean when no nextItem provided', () => {
    wrap(<TodayEmptyState />);
    expect(screen.getByText('Nothing today.')).toBeInTheDocument();
  });

  it('renders body and a dimmed next item preview when nextItem provided', () => {
    wrap(<TodayEmptyState nextItem={mkItem()} />);
    expect(screen.getByText('No urgent items.')).toBeInTheDocument();
    expect(screen.getByText('Coming up')).toBeInTheDocument();
  });
});
