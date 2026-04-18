/**
 * TanStack Query hooks for the Today dashboard feed (Phase 145.1 v2).
 *
 * Backend: GET /dashboard/today (Phase 145.1 Plan 01 contract — 4-stream DTO)
 * - useTodayFeed            : primary feed read
 * - useCompleteFeedItem     : POST /tasks/{sourceType}/{id}/complete with
 *                             optimistic update + rollback (fixes WR-05 real undo)
 * - useUncompleteFeedItem   : POST /tasks/{sourceType}/{id}/uncomplete
 *                             (real undo for complete). If the backend endpoint
 *                             does not yet exist the row component (Plan 04)
 *                             falls back to cache-restore-only undo using the
 *                             snapshot captured by useCompleteFeedItem.onMutate.
 * - useSnoozeFeedItem       : dispatcher — follow_up -> /ai/follow-ups/:id/snooze,
 *                             else -> /tasks/:sourceType/:id/snooze
 * - useSnoozeTask           : alias of useSnoozeFeedItem for semantic clarity
 *                             at call sites (per phase CONTEXT §"Files expected
 *                             to change"). Zero runtime divergence.
 *
 * Dismiss is intentionally NOT a hook — rows call
 * useTodayFeedStore.getState().dismiss(id) directly (session-only Zustand state).
 * Only add a hook if toast-with-undo logic needs to be co-located.
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
      if (
        raw &&
        typeof raw === 'object' &&
        'data' in raw &&
        raw.data &&
        typeof raw.data === 'object' &&
        'items' in (raw.data as TodayFeedResponse)
      ) {
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
 * Mutation: complete a feed item's underlying task with OPTIMISTIC UPDATE +
 * ROLLBACK (fixes WR-05 — "Undo" was a visual no-op).
 *
 * Contract:
 * - onMutate captures a snapshot of every `todayKeys.all` cache entry, then
 *   optimistically removes the item from every matching cache.
 * - onError restores every captured snapshot (rollback).
 * - onSettled invalidates `todayKeys.all` so the server is the final source of
 *   truth (server wins eventually; no permanent client-side divergence).
 *
 * Real undo: the row component (Plan 04) either calls useUncompleteFeedItem OR
 * relies on the rollback snapshot path by re-triggering the cache restore.
 */
export function useCompleteFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TodayFeedItem) => {
      if (!item.canComplete || !item.taskSourceType || !item.taskSourceId) {
        throw new Error('Item is not completable');
      }
      await apiClient.post(`/tasks/${item.taskSourceType}/${item.taskSourceId}/complete`);
      return item;
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: todayKeys.all });
      const queries = qc.getQueriesData<TodayFeedResponse>({ queryKey: todayKeys.all });
      const snapshots = queries.map(([k, d]) => [k, d] as const);
      for (const [key, data] of queries) {
        if (!data) continue;
        qc.setQueryData<TodayFeedResponse>(key, {
          ...data,
          items: data.items.filter((i) => i.id !== item.id),
        });
      }
      return { snapshots };
    },
    onError: (_err, _item, ctx) => {
      if (ctx?.snapshots) {
        for (const [k, d] of ctx.snapshots) qc.setQueryData(k, d);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: todayKeys.all });
    },
  });
}

/**
 * Mutation: uncomplete a previously completed task — enables real undo on the
 * complete toast (Plan 04 wires the toast action to this).
 *
 * NOTE: if the `/tasks/:sourceType/:id/uncomplete` endpoint does not yet exist
 * on the backend, the row component catches the 404 and falls back to
 * cache-restore-only undo using the snapshot captured by
 * useCompleteFeedItem.onMutate. This hook is intentionally thin so the fallback
 * path stays in one place (Plan 04 row component).
 */
export function useUncompleteFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TodayFeedItem) => {
      if (!item.taskSourceType || !item.taskSourceId) {
        throw new Error('Item missing source for uncomplete');
      }
      await apiClient.post(`/tasks/${item.taskSourceType}/${item.taskSourceId}/uncomplete`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: todayKeys.all }),
  });
}

/**
 * Mutation: snooze a feed item — DISPATCHER.
 *
 * - follow_up items  -> PATCH /ai/follow-ups/{id}/snooze      (existing)
 * - manual/reminder  -> PATCH /tasks/{sourceType}/{id}/snooze (Plan 01)
 *
 * Both endpoints accept `{ dueDate: ISO-8601 }`.
 */
export function useSnoozeFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, until }: { item: TodayFeedItem; until: Date }) => {
      if (!item.canSnooze || !item.taskSourceType || !item.taskSourceId) {
        throw new Error('Item is not snoozeable');
      }
      if (item.taskSourceType === 'follow_up') {
        await apiClient.patch(`/ai/follow-ups/${item.taskSourceId}/snooze`, {
          dueDate: until.toISOString(),
        });
        return;
      }
      await apiClient.patch(
        `/tasks/${item.taskSourceType}/${item.taskSourceId}/snooze`,
        { dueDate: until.toISOString() },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: todayKeys.all }),
  });
}

/**
 * Alias of useSnoozeFeedItem with a task-specific name for call-site clarity
 * (per phase CONTEXT.md §"Files expected to change" — add `useSnoozeTask`).
 * Zero-overhead re-export; the dispatcher inside useSnoozeFeedItem already
 * handles both follow_up and manual/reminder sources.
 */
export const useSnoozeTask = useSnoozeFeedItem;
