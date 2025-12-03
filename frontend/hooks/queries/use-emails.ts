/**
 * TanStack Query hooks for email operations
 *
 * Best practices implemented:
 * - queryOptions for type-safe, reusable query configurations
 * - Proper staleTime and gcTime for optimal caching
 * - Automatic background refetching
 * - Error handling with retry configuration
 * - Integration with WebSocket for real-time invalidation
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/queries
 */

import { useQuery, useInfiniteQuery, queryOptions } from '@tanstack/react-query';
import { emailApi, type EmailListParams } from '@/lib/api/email';
import { emailKeys } from './email-keys';

// ============================================================================
// Query Options (for sharing between hooks and prefetching)
// ============================================================================

/**
 * Query options for fetching email list
 */
export function emailListOptions(params?: EmailListParams) {
  return queryOptions({
    queryKey: emailKeys.list(params),
    queryFn: async () => {
      const response = await emailApi.listEmails(params);
      return response.data;
    },
    staleTime: 60 * 1000, // 1 minute - emails change frequently
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
  });
}

/**
 * Query options for fetching single email
 */
export function emailDetailOptions(id: string) {
  return queryOptions({
    queryKey: emailKeys.detail(id),
    queryFn: async () => {
      const response = await emailApi.getEmail(id);
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - single emails are more stable
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!id,
  });
}

/**
 * Query options for email statistics
 */
export function emailStatsOptions(providerId?: string) {
  return queryOptions({
    queryKey: emailKeys.statsByProvider(providerId),
    queryFn: async () => {
      const response = await emailApi.getStats(providerId);
      return response.data;
    },
    staleTime: 30 * 1000, // 30 seconds - stats can change often
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Query options for email thread
 */
export function emailThreadOptions(threadId: string) {
  return queryOptions({
    queryKey: emailKeys.thread(threadId),
    queryFn: async () => {
      const response = await emailApi.getThread(threadId);
      return response.data;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!threadId,
  });
}

/**
 * Query options for draft
 */
export function draftOptions(id: string) {
  return queryOptions({
    queryKey: emailKeys.draft(id),
    queryFn: async () => {
      const response = await emailApi.getDraft(id);
      return response.data;
    },
    staleTime: 0, // Always fetch fresh draft
    gcTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook for fetching paginated email list
 *
 * @example
 * ```tsx
 * const { data, isPending, error } = useEmails({
 *   folder: 'INBOX',
 *   page: 1,
 *   limit: 50
 * });
 * ```
 */
export function useEmails(params?: EmailListParams) {
  return useQuery(emailListOptions(params));
}

/**
 * Hook for fetching single email by ID
 *
 * @example
 * ```tsx
 * const { data: email, isPending } = useEmail('email-id');
 * ```
 */
export function useEmail(id: string) {
  return useQuery(emailDetailOptions(id));
}

/**
 * Hook for fetching email statistics
 *
 * @example
 * ```tsx
 * const { data: stats } = useEmailStats();
 * // or for specific provider
 * const { data: stats } = useEmailStats('provider-id');
 * ```
 */
export function useEmailStats(providerId?: string) {
  return useQuery(emailStatsOptions(providerId));
}

/**
 * Hook for fetching email thread
 *
 * @example
 * ```tsx
 * const { data: threadEmails } = useEmailThread('thread-id');
 * ```
 */
export function useEmailThread(threadId: string) {
  return useQuery(emailThreadOptions(threadId));
}

/**
 * Hook for searching emails
 *
 * @example
 * ```tsx
 * const { data, isPending } = useEmailSearch('from:john@example.com');
 * ```
 */
export function useEmailSearch(query: string, providerId?: string, limit?: number) {
  return useQuery({
    queryKey: emailKeys.searchResults(query, providerId, limit),
    queryFn: async () => {
      const response = await emailApi.searchEmails(query, providerId, limit);
      return response.data;
    },
    staleTime: 30 * 1000, // Search results are relatively stable
    gcTime: 5 * 60 * 1000,
    enabled: query.length >= 2, // Only search with 2+ characters
  });
}

/**
 * Hook for fetching conversations (threaded view)
 *
 * @example
 * ```tsx
 * const { data } = useConversations({ folder: 'INBOX', page: 1 });
 * ```
 */
export function useConversations(params?: { page?: number; limit?: number; providerId?: string; folder?: string }) {
  return useQuery({
    queryKey: emailKeys.conversationList(params),
    queryFn: async () => {
      const response = await emailApi.getConversations(params);
      return response.data;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for infinite scroll email list
 *
 * @example
 * ```tsx
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage
 * } = useInfiniteEmails({ folder: 'INBOX', limit: 50 });
 *
 * // Flatten pages for rendering
 * const emails = data?.pages.flatMap(page => page.emails) ?? [];
 * ```
 */
export function useInfiniteEmails(params?: Omit<EmailListParams, 'page'>) {
  return useInfiniteQuery({
    queryKey: [...emailKeys.lists(), 'infinite', params ?? {}],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await emailApi.listEmails({ ...params, page: pageParam });
      return response.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    getPreviousPageParam: (firstPage) => {
      const { page } = firstPage.pagination;
      return page > 1 ? page - 1 : undefined;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for fetching draft by ID
 */
export function useDraft(id: string) {
  return useQuery(draftOptions(id));
}

/**
 * Hook for fetching sync status
 */
export function useSyncStatus() {
  return useQuery({
    queryKey: emailKeys.syncStatus(),
    queryFn: async () => {
      const response = await emailApi.getSyncStatus();
      return response.data;
    },
    staleTime: 10 * 1000, // Refresh every 10 seconds
    gcTime: 60 * 1000,
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
  });
}

/**
 * Hook for fetching retention statistics (admin only)
 */
export function useRetentionStats() {
  return useQuery({
    queryKey: emailKeys.retention(),
    queryFn: async () => {
      const response = await emailApi.getRetentionStats();
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - admin stats don't change often
    gcTime: 30 * 60 * 1000,
  });
}
