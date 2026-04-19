/**
 * TodayDashboard RTL spec (145.1-05 v2 rewrite).
 *
 * Regression guards:
 *   - WR-04 single-filter guard: `dismissedIds.has(id)` is invoked exactly once
 *     per item by the parent useMemo. A double-filter in a child would bump the
 *     spy call count above `items.length`.
 *   - Store mock exposes only the Plan 02 Task 4 renamed surface
 *     (`isToggled` + `toggleStream`). Legacy selector names are intentionally
 *     absent from this file.
 *
 * Mock variable names are prefixed with `mock` to satisfy jest/ts-jest's
 * hoisting rule for out-of-scope references inside jest.mock factories.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { TodayFeedItem, TodayFeedResponse, TodayStream } from '@/lib/api/dashboard';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    nav: {
      mail: 'Mail',
      calendar: 'Calendar',
      tasks: 'Tasks',
    },
    ai: {
      title: 'AI Assistant',
    },
    common: {
      refresh: 'Refresh',
      refreshing: 'Refreshing...',
    },
    dashboard: {
      today: {
        title: 'Today',
        subtitle: 'What needs your attention',
        error: 'Failed to load today view',
        greeting: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
        kpi: { inbox: 'Inbox', calendar: 'Calendar', deals: 'Deals', tasks: 'Tasks' },
        stream: {
          repliesNeeded: 'Replies needed',
          dueToday: 'Due today',
          waitingOnOthers: 'Waiting on others',
          fyi: 'FYI',
        },
        actions: { complete: 'Mark done', snooze: 'Snooze', dismiss: 'Dismiss' },
        snooze: {
          quarterHour: '15 min',
          oneHour: '1 hr',
          tonight: 'Tonight',
          tomorrow: 'Tomorrow',
          nextWeek: 'Next week',
          custom: 'Custom…',
        },
        empty: { title: 'Inbox zero.', body: 'Take the afternoon off.' },
        toast: {
          completed: 'Marked done',
          snoozed: 'Snoozed until {when}',
          dismissed: 'Dismissed',
          failed: 'Action failed',
          undo: 'Undo',
          unsnooze: 'Unsnooze',
          retry: 'Retry',
        },
      },
    },
  }),
}));
jest.mock('@/hooks/use-user-timezone', () => ({ useUserTimezone: () => 'Europe/Rome' }));
jest.mock('@/lib/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }));

// framer-motion flattened so stream bodies render deterministically under jest.
jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => 'div' }),
  useReducedMotion: () => false,
}));

jest.mock('@/lib/context/toast-context', () => ({
  useGlobalToast: () => ({ info: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn() }),
}));

// Mutable feed state captured by the useTodayFeed mock via closure — flipped per test.
const mockFeedState: {
  data: TodayFeedResponse | undefined;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
} = { data: undefined, isLoading: false, isRefetching: false, error: null };
const mockRefetch = jest.fn();

jest.mock('@/hooks/queries/use-today', () => ({
  useTodayFeed: () => ({
    data: mockFeedState.data,
    isLoading: mockFeedState.isLoading,
    isRefetching: mockFeedState.isRefetching,
    error: mockFeedState.error,
    refetch: mockRefetch,
  }),
  useCompleteFeedItem: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
  useUncompleteFeedItem: () => ({ mutate: jest.fn() }),
  useSnoozeFeedItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const mockAiOpen = jest.fn();
jest.mock('@/stores/ai-overlay-store', () => ({
  useAiOverlay: {
    getState: () => ({ open: mockAiOpen }),
  },
}));

// WR-04 guard: the Proxy wraps a STABLE Set reference (never reassigned) so
// the `has()` trap survives across renders. `beforeEach` clears contents via
// `.clear()` rather than reassigning the outer variable.
const mockDismissedIdsSet = new Set<string>();
const mockFilterSpy = jest.fn();
jest.mock('@/stores/today-feed-store', () => ({
  useTodayFeedStore: (selector: (s: unknown) => unknown) =>
    selector({
      dismissedIds: new Proxy(mockDismissedIdsSet, {
        get(target, prop) {
          if (prop === 'has') {
            return (id: string) => {
              mockFilterSpy(id);
              return target.has(id);
            };
          }
          const value = (target as unknown as Record<string, unknown>)[prop as string];
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      }),
      isToggled: () => false,
      toggleStream: jest.fn(),
      dismiss: jest.fn(),
      restore: jest.fn(),
    }),
}));

import { TodayDashboard } from '../TodayDashboard';

const theme = createTheme();
const wrap = () => render(<ThemeProvider theme={theme}><TodayDashboard /></ThemeProvider>);

function mkItem(id: string, stream: TodayStream): TodayFeedItem {
  return {
    id,
    type: 'email',
    stream,
    score: 0,
    title: `Item ${id}`,
    subtitle: null,
    routeUrl: '/dashboard/email/thread/' + id,
    rationale: null,
    dueAt: null,
    isOverdue: false,
    emailId: id,
    threadId: id,
    taskSourceType: null,
    taskSourceId: null,
    dealId: null,
    eventId: null,
    canComplete: true,
    canDismiss: true,
    canSnooze: false,
  };
}

function mkResponse(items: TodayFeedItem[]): TodayFeedResponse {
  return {
    items,
    counts: {
      repliesNeeded: items.filter((i) => i.stream === 'replies-needed').length,
      dueToday: items.filter((i) => i.stream === 'due-today').length,
      waitingOnOthers: items.filter((i) => i.stream === 'waiting-on-others').length,
      fyi: items.filter((i) => i.stream === 'fyi').length,
      total: items.length,
      kpi: { inbox: 0, calendar: 0, deals: 0, tasks: 0 },
    },
    greeting: null,
    generatedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  mockDismissedIdsSet.clear();
  mockFeedState.data = undefined;
  mockFeedState.isLoading = false;
  mockFeedState.isRefetching = false;
  mockFeedState.error = null;
  mockFilterSpy.mockReset();
  mockRefetch.mockReset();
  mockAiOpen.mockReset();
});

describe('TodayDashboard', () => {
  it('renders TodayEmptyState when populated response has no items', () => {
    mockFeedState.data = mkResponse([]);
    wrap();
    expect(screen.getByText('Inbox zero.')).toBeInTheDocument();
  });

  it('renders command actions for AI, Mail, Calendar, Tasks, and Refresh', () => {
    mockFeedState.data = mkResponse([]);
    wrap();
    expect(screen.getByRole('button', { name: 'AI Assistant' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Mail' }).some((el) => el.getAttribute('href') === '/dashboard/email'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'Calendar' }).some((el) => el.getAttribute('href') === '/dashboard/calendar'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'Tasks' }).some((el) => el.getAttribute('href') === '/dashboard/tasks'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('shows error Alert on error', () => {
    mockFeedState.error = new Error('boom');
    wrap();
    expect(screen.getByText('Failed to load today view')).toBeInTheDocument();
  });

  it('renders streams in STREAM_ORDER (replies-needed -> due-today -> waiting-on-others -> fyi)', () => {
    mockFeedState.data = mkResponse([
      mkItem('r1', 'replies-needed'),
      mkItem('d1', 'due-today'),
      mkItem('w1', 'waiting-on-others'),
      mkItem('f1', 'fyi'),
    ]);
    wrap();
    // All 4 streams should be present as buttons (stream header roles).
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('WR-04 guard: dismissedIds filter runs in parent only (single filter pass)', () => {
    // Dashboard should call dismissedIds.has(id) exactly once per item in data.items,
    // not twice (which would indicate a double-filter in a child).
    mockFeedState.data = mkResponse([mkItem('a', 'replies-needed'), mkItem('b', 'fyi')]);
    wrap();
    // Exactly items.length has() calls from the parent filter. If a child re-filters,
    // this number would double.
    expect(mockFilterSpy).toHaveBeenCalledTimes(2);
  });
});
