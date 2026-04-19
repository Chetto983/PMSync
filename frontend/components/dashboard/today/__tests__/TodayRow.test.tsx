/**
 * TodayRow RTL spec (145.1-05).
 *
 * Critical regression guards:
 *   - WR-06 guard: title is a real <a href> equal to item.routeUrl — Cmd/Ctrl/
 *     middle-click opens in a new tab natively (no programmatic navigation).
 *   - role="listitem" on outer box.
 *   - data-today-row attribute for keyboard nav hook.
 *   - Dismiss wires Zustand `dismiss` + 6s undo toast; undo calls `restore`.
 *
 * Mock variable names are prefixed with `mock` to satisfy jest/ts-jest's
 * hoisting rule for out-of-scope references inside jest.mock factories.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { TodayFeedItem } from '@/lib/api/dashboard';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      today: {
        actions: { complete: 'Mark done', snooze: 'Snooze', dismiss: 'Dismiss' },
        toast: {
          completed: 'Marked done',
          snoozed: 'Snoozed until {when}',
          dismissed: 'Dismissed',
          failed: 'Action failed',
          undo: 'Undo',
          unsnooze: 'Unsnooze',
          retry: 'Retry',
        },
        snooze: {
          quarterHour: '15 min',
          oneHour: '1 hr',
          tonight: 'Tonight',
          tomorrow: 'Tomorrow',
          nextWeek: 'Next week',
          custom: 'Custom…',
        },
      },
    },
  }),
}));

const mockCompleteMutateAsync = jest.fn();
const mockCompleteMutate = jest.fn();
const mockUncompleteMutate = jest.fn();
const mockSnoozeMutateAsync = jest.fn();
jest.mock('@/hooks/queries/use-today', () => ({
  useCompleteFeedItem: () => ({
    mutateAsync: mockCompleteMutateAsync,
    mutate: mockCompleteMutate,
    isPending: false,
  }),
  useUncompleteFeedItem: () => ({ mutate: mockUncompleteMutate }),
  useSnoozeFeedItem: () => ({ mutateAsync: mockSnoozeMutateAsync, isPending: false }),
}));

const mockDismiss = jest.fn();
const mockRestore = jest.fn();
jest.mock('@/stores/today-feed-store', () => ({
  useTodayFeedStore: (selector: (s: unknown) => unknown) =>
    selector({ dismiss: mockDismiss, restore: mockRestore }),
}));

const mockToastInfo = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('@/lib/context/toast-context', () => ({
  useGlobalToast: () => ({
    info: mockToastInfo,
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

import { TodayRow } from '../TodayRow';

const theme = createTheme();
const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

function mkItem(overrides: Partial<TodayFeedItem> = {}): TodayFeedItem {
  return {
    id: 'i1',
    type: 'email',
    stream: 'replies-needed',
    score: 0,
    title: 'ACME RFP',
    subtitle: null,
    routeUrl: '/dashboard/email/thread/abc123',
    rationale: null,
    dueAt: null,
    isOverdue: false,
    emailId: 'e1',
    threadId: 'abc123',
    taskSourceType: 'follow_up',
    taskSourceId: 's1',
    dealId: null,
    eventId: null,
    canComplete: true,
    canDismiss: true,
    canSnooze: true,
    ...overrides,
  };
}

beforeEach(() => {
  mockCompleteMutateAsync.mockReset();
  mockCompleteMutateAsync.mockResolvedValue(undefined);
  mockCompleteMutate.mockReset();
  mockUncompleteMutate.mockReset();
  mockSnoozeMutateAsync.mockReset();
  mockSnoozeMutateAsync.mockResolvedValue(undefined);
  mockDismiss.mockReset();
  mockRestore.mockReset();
  mockToastInfo.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
});

describe('TodayRow', () => {
  it('WR-06 guard: title is a real anchor with href === item.routeUrl', () => {
    wrap(<TodayRow item={mkItem()} />);
    const link = screen.getByRole('link', { name: 'ACME RFP' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/dashboard/email/thread/abc123');
  });

  it('has role="listitem" on outer box', () => {
    wrap(<TodayRow item={mkItem()} />);
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  it('has data-today-row attribute for keyboard nav', () => {
    wrap(<TodayRow item={mkItem({ id: 'x42' })} />);
    expect(document.querySelector('[data-today-row="x42"]')).toBeInTheDocument();
  });

  it('prefers rationale text over subtitle for the secondary line', () => {
    wrap(
      <TodayRow
        item={mkItem({
          subtitle: 'Fallback subtitle',
          rationale: 'Waiting for pricing confirmation',
        })}
      />,
    );
    expect(screen.getByText('Waiting for pricing confirmation')).toBeInTheDocument();
    expect(screen.queryByText('Fallback subtitle')).not.toBeInTheDocument();
  });

  it('renders 3-button action trio when canSnooze=true', () => {
    wrap(<TodayRow item={mkItem({ canSnooze: true })} />);
    expect(screen.getByLabelText('Mark done')).toBeInTheDocument();
    expect(screen.getByLabelText('Snooze')).toBeInTheDocument();
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('hides snooze button entirely when canSnooze=false', () => {
    wrap(<TodayRow item={mkItem({ canSnooze: false })} />);
    expect(screen.queryByLabelText('Snooze')).not.toBeInTheDocument();
  });

  it('fires complete mutation on click', async () => {
    wrap(<TodayRow item={mkItem()} />);
    fireEvent.click(screen.getByLabelText('Mark done'));
    // handleComplete awaits completeMutation.mutateAsync; the call itself is synchronous.
    expect(mockCompleteMutateAsync).toHaveBeenCalled();
  });

  it('dismissal updates Zustand + shows 6-second undo toast', () => {
    wrap(<TodayRow item={mkItem()} />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(mockDismiss).toHaveBeenCalledWith('i1');
    expect(mockToastInfo).toHaveBeenCalled();
    expect(mockToastInfo.mock.calls[0][1]).toMatchObject({ duration: 6000 });
  });

  it('undo action on dismiss calls restore', () => {
    wrap(<TodayRow item={mkItem()} />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    const opts = mockToastInfo.mock.calls[0][1] as { onAction: () => void };
    opts.onAction();
    expect(mockRestore).toHaveBeenCalledWith('i1');
  });
});
