/**
 * Tests for useTodayFeed / useCompleteFeedItem / useSnoozeFeedItem hooks.
 *
 * Pattern source: frontend/hooks/queries/use-contacts.test.ts (QueryClientProvider wrapper).
 * Mock targets: dashboardApi.getTodayFeed (data fetch), apiClient.post/patch (mutations).
 */

import React, { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/api/dashboard', () => ({
  dashboardApi: { getTodayFeed: jest.fn() },
}));
jest.mock('@/lib/api-client', () => ({
  apiClient: { post: jest.fn(), patch: jest.fn() },
}));

import { dashboardApi, type TodayFeedItem } from '@/lib/api/dashboard';
import { apiClient } from '@/lib/api-client';
import {
  todayFeedOptions,
  useTodayFeed,
  useCompleteFeedItem,
  useSnoozeFeedItem,
} from '../use-today';
import { todayKeys } from '../today-keys';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

const mkItem = (overrides: Partial<TodayFeedItem> = {}): TodayFeedItem => ({
  id: 'email_follow_up_fu1',
  type: 'email',
  stream: 'replies-needed',
  score: 800,
  title: 'subj',
  subtitle: 'from',
  routeUrl: '/dashboard/email/thread/t1',
  rationale: null,
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
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('todayFeedOptions', () => {
  it('uses todayKeys.feed for query key', () => {
    const opts = todayFeedOptions({ locale: 'en' });
    expect(opts.queryKey).toEqual(todayKeys.feed({ locale: 'en' }));
  });

  it('sets staleTime/gcTime/retry per UI-SPEC', () => {
    const opts = todayFeedOptions();
    expect(opts.staleTime).toBe(5 * 60 * 1000);
    expect(opts.gcTime).toBe(30 * 60 * 1000);
    expect(opts.retry).toBe(1);
  });
});

describe('useTodayFeed', () => {
  it('returns feed data after fetch (response wrapped in { data: ... })', async () => {
    (dashboardApi.getTodayFeed as jest.Mock).mockResolvedValue({
      data: {
        data: {
          items: [],
          counts: {
            repliesNeeded: 0,
            dueToday: 0,
            waitingOnOthers: 0,
            fyi: 0,
            total: 0,
            kpi: { inbox: 0, calendar: 0, deals: 0, tasks: 0 },
          },
          greeting: null,
          generatedAt: 'x',
        },
      },
    });
    const { result } = renderHook(() => useTodayFeed(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.counts.total).toBe(0);
  });

  it('returns feed data after fetch (response NOT wrapped — direct payload)', async () => {
    (dashboardApi.getTodayFeed as jest.Mock).mockResolvedValue({
      data: {
        items: [mkItem()],
        counts: {
          repliesNeeded: 1,
          dueToday: 0,
          waitingOnOthers: 0,
          fyi: 0,
          total: 1,
          kpi: { inbox: 0, calendar: 0, deals: 0, tasks: 0 },
        },
        greeting: 'hi',
        generatedAt: 'y',
      },
    });
    const { result } = renderHook(() => useTodayFeed(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.counts.total).toBe(1);
    expect(result.current.data?.greeting).toBe('hi');
  });
});

describe('useCompleteFeedItem', () => {
  it('POSTs to /tasks/{taskSourceType}/{taskSourceId}/complete for completable items', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { success: true } });
    const item = mkItem({ canComplete: true, taskSourceType: 'manual', taskSourceId: 'm1', type: 'task' });
    const { result } = renderHook(() => useCompleteFeedItem(), { wrapper: createWrapper() });
    await result.current.mutateAsync(item);
    expect(apiClient.post).toHaveBeenCalledWith('/tasks/manual/m1/complete');
  });

  it('rejects when canComplete is false', async () => {
    const item = mkItem({ canComplete: false });
    const { result } = renderHook(() => useCompleteFeedItem(), { wrapper: createWrapper() });
    await expect(result.current.mutateAsync(item)).rejects.toThrow();
  });

  it('rejects when taskSourceType is missing', async () => {
    const item = mkItem({ canComplete: true, taskSourceType: null, taskSourceId: 'm1' });
    const { result } = renderHook(() => useCompleteFeedItem(), { wrapper: createWrapper() });
    await expect(result.current.mutateAsync(item)).rejects.toThrow();
  });
});

describe('useSnoozeFeedItem (snooze follow-up)', () => {
  it('PATCHes /ai/follow-ups/{taskSourceId}/snooze with dueDate ISO string', async () => {
    (apiClient.patch as jest.Mock).mockResolvedValue({ data: { success: true } });
    const item = mkItem();
    const until = new Date('2026-04-17T09:00:00Z');
    const { result } = renderHook(() => useSnoozeFeedItem(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ item, until });
    expect(apiClient.patch).toHaveBeenCalledWith('/ai/follow-ups/fu1/snooze', {
      dueDate: until.toISOString(),
    });
  });

  it('rejects snooze for non-follow-up items', async () => {
    const item = mkItem({ taskSourceType: 'manual' });
    const { result } = renderHook(() => useSnoozeFeedItem(), { wrapper: createWrapper() });
    await expect(result.current.mutateAsync({ item, until: new Date() })).rejects.toThrow();
  });

  it('rejects snooze when canSnooze is false', async () => {
    const item = mkItem({ canSnooze: false });
    const { result } = renderHook(() => useSnoozeFeedItem(), { wrapper: createWrapper() });
    await expect(result.current.mutateAsync({ item, until: new Date() })).rejects.toThrow();
  });
});
