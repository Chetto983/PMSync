/**
 * TanStack Query hooks for the Today dashboard feed.
 *
 * Backend: GET /dashboard/today (Phase 145 Plan 01)
 * - useTodayFeed: primary feed read
 * - useCompleteFeedItem: POST /tasks/{taskSourceType}/{taskSourceId}/complete
 * - useSnoozeFeedItem: PATCH /ai/follow-ups/{taskSourceId}/snooze (follow-up items only per Open Q1)
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  dashboardApi,
  type GetTodayFeedQuery,
  type TodayFeedItem,
  type TodayFeedResponse,
} from '@/lib/api/dashboard';
import { todayKeys } from './today-keys';

/**
 * Query options for the Today feed.
 *
 * Cache tier per UI-SPEC § State Management: staleTime 5min, gcTime 30min, retry 1.
 */
export function todayFeedOptions(opts?: GetTodayFeedQuery) {
  return queryOptions({
    queryKey: todayKeys.feed(opts),
    queryFn: async (): Promise<TodayFeedResponse> => {
      const res = await dashboardApi.getTodayFeed(opts);
      // Backend response interceptor wraps payloads as { data: T } OR returns T directly
      // depending on the route. Unwrap defensively.
      const raw = res.data as unknown as TodayFeedResponse | { data: TodayFeedResponse };
      if (raw && typeof raw === 'object' && 'data' in raw && raw.data && typeof raw.data === 'object' && 'items' in (raw.data as TodayFeedResponse)) {
        return (raw as { data: TodayFeedResponse }).data;
      }
      return raw as TodayFeedResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  });
}

/** Hook — Today feed primary read. */
export function useTodayFeed(opts?: GetTodayFeedQuery) {
  return useQuery(todayFeedOptions(opts));
}

/**
 * Mutation: complete a feed item's underlying task.
 *
 * Only valid when `item.canComplete === true` (backend ownership check) AND
 * `item.taskSourceType` + `item.taskSourceId` are present.
 */
export function useCompleteFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TodayFeedItem) => {
      if (!item.canComplete || !item.taskSourceType || !item.taskSourceId) {
        throw new Error('Item is not completable');
      }
      await apiClient.post(`/tasks/${item.taskSourceType}/${item.taskSourceId}/complete`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: todayKeys.all }),
  });
}

/**
 * Mutation: snooze a feed item.
 *
 * Per Phase 145 Plan 01 Open Q1: snooze only persists for follow-up-derived
 * items in MVP. Non-follow-up items will have `canSnooze=false` from backend,
 * but we double-check here to fail-fast.
 */
export function useSnoozeFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, until }: { item: TodayFeedItem; until: Date }) => {
      if (!item.canSnooze) {
        throw new Error('Item is not snoozeable');
      }
      if (item.taskSourceType !== 'follow_up' || !item.taskSourceId) {
        throw new Error('Snooze is only persisted for follow-up items in this release');
      }
      await apiClient.patch(`/ai/follow-ups/${item.taskSourceId}/snooze`, {
        dueDate: until.toISOString(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: todayKeys.all }),
  });
}
