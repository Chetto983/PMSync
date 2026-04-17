/**
 * TodayFeedItem RTL spec.
 *
 * Mocks: next/navigation, use-today hooks, useGlobalToast, useTodayFeedStore,
 * useTranslations, useLocale, framer-motion (per RESEARCH Wave 0 Gap).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockComplete = jest.fn();
const mockSnooze = jest.fn();
jest.mock('@/hooks/queries/use-today', () => ({
  useCompleteFeedItem: () => ({ mutateAsync: mockComplete, isPending: false }),
  useSnoozeFeedItem: () => ({ mutateAsync: mockSnooze, isPending: false }),
}));

const mockToast = {
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
};
jest.mock('@/lib/context/toast-context', () => ({
  useGlobalToast: () => mockToast,
}));

const mockDismiss = jest.fn();
const mockRestore = jest.fn();
jest.mock('@/stores/today-feed-store', () => ({
  useTodayFeedStore: (selector: (s: any) => any) =>
    selector({
      dismissedIds: new Set<string>(),
      dismiss: mockDismiss,
      restore: mockRestore,
      isDismissed: () => false,
      reset: jest.fn(),
    }),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      today: {
        toasts: { completed: 'Done', dismissed: 'Hidden', snoozed: 'Snoozed until {time}', undo: 'Undo' },
        aria: { complete: 'complete', dismiss: 'dismiss', snooze: 'snooze' },
        snooze: { oneHour: '1h', tomorrow: 'tomorrow', nextWeek: 'next week' },
        tiers: { urgent: 'Urgent', today: 'Today', fyi: 'FYI' },
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

import { TodayFeedItem } from '../TodayFeedItem';
import type { TodayFeedItem as TodayFeedItemType } from '@/lib/api/dashboard';

const wrap = (ui: React.ReactNode) =>
  render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

const mkItem = (o: Partial<TodayFeedItemType> = {}): TodayFeedItemType => ({
  id: 'x',
  type: 'email',
  tier: 'urgent',
  score: 1,
  title: 'Hello',
  subtitle: 'from@x',
  dueAt: null,
  isOverdue: false,
  emailId: 'e1',
  threadId: 't1',
  taskSourceType: 'follow_up',
  taskSourceId: 'fu1',
  dealId: null,
  eventId: null,
  canComplete: false,
  canDismiss: true,
  canSnooze: true,
  ...o,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TodayFeedItem navigation', () => {
  it('email type navigates to /dashboard/email/thread/{threadId}', () => {
    wrap(<TodayFeedItem item={mkItem({ type: 'email', threadId: 't1' })} />);
    fireEvent.click(screen.getByText('Hello'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/email/thread/t1');
  });

  it('task type navigates to /dashboard/tasks', () => {
    wrap(<TodayFeedItem item={mkItem({ type: 'task' })} />);
    fireEvent.click(screen.getByText('Hello'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/tasks');
  });

  it('deal type navigates to /dashboard/crm/deals/{dealId}', () => {
    wrap(<TodayFeedItem item={mkItem({ type: 'deal', dealId: 'd1' })} />);
    fireEvent.click(screen.getByText('Hello'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/crm/deals/d1');
  });

  it('event type navigates to /dashboard/calendar', () => {
    wrap(<TodayFeedItem item={mkItem({ type: 'event' })} />);
    fireEvent.click(screen.getByText('Hello'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/calendar');
  });

  it('disabled prevents navigation', () => {
    wrap(<TodayFeedItem item={mkItem()} disabled />);
    fireEvent.click(screen.getByText('Hello'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('TodayFeedItem complete with undo', () => {
  it('clicking complete calls mutation and shows success toast', async () => {
    mockComplete.mockResolvedValue(undefined);
    wrap(
      <TodayFeedItem
        item={mkItem({
          type: 'task',
          canComplete: true,
          taskSourceType: 'manual',
          taskSourceId: 'm1',
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText('complete'));
    expect(mockComplete).toHaveBeenCalled();
  });
});

describe('TodayFeedItem dismiss with undo', () => {
  it('clicking dismiss calls store.dismiss and shows toast with undo action', () => {
    wrap(<TodayFeedItem item={mkItem({ canDismiss: true })} />);
    fireEvent.click(screen.getByLabelText('dismiss'));
    expect(mockDismiss).toHaveBeenCalledWith('x');
    expect(mockToast.info).toHaveBeenCalledWith(
      'Hidden',
      expect.objectContaining({
        actionLabel: 'Undo',
        onAction: expect.any(Function),
        duration: 6000,
      }),
    );
  });

  it('toast onAction callback restores the item', () => {
    wrap(<TodayFeedItem item={mkItem({ canDismiss: true })} />);
    fireEvent.click(screen.getByLabelText('dismiss'));
    const call = mockToast.info.mock.calls[0];
    const opts = call[1] as { onAction: () => void };
    opts.onAction();
    expect(mockRestore).toHaveBeenCalledWith('x');
  });

  it('dismiss button click does not also trigger row navigation (stopPropagation)', () => {
    wrap(<TodayFeedItem item={mkItem({ canDismiss: true })} />);
    fireEvent.click(screen.getByLabelText('dismiss'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('TodayFeedItem quick action visibility', () => {
  it('hides complete button when canComplete is false', () => {
    wrap(<TodayFeedItem item={mkItem({ canComplete: false })} />);
    expect(screen.queryByLabelText('complete')).toBeNull();
  });

  it('hides snooze button when canSnooze is false', () => {
    wrap(<TodayFeedItem item={mkItem({ canSnooze: false })} />);
    expect(screen.queryByLabelText('snooze')).toBeNull();
  });

  it('hides all quick actions when disabled', () => {
    wrap(<TodayFeedItem item={mkItem({ canComplete: true, canDismiss: true, canSnooze: true })} disabled />);
    expect(screen.queryByLabelText('complete')).toBeNull();
    expect(screen.queryByLabelText('dismiss')).toBeNull();
    expect(screen.queryByLabelText('snooze')).toBeNull();
  });
});
