/**
 * TanStack Query hooks for folder operations
 *
 * Best practices implemented:
 * - queryOptions for type-safe, reusable query configurations
 * - Long staleTime (5 min) - folders rarely change
 * - Proper gcTime for memory efficiency
 * - Query prefetching support
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/queries
 */

import { useQuery, queryOptions } from '@tanstack/react-query';
import { getFolders, getFoldersByProvider, type FoldersResponse, type ProviderFoldersResponse } from '@/lib/api/folders';

// ============================================================================
// Query Keys
// ============================================================================

export const folderKeys = {
  all: ['folders'] as const,
  lists: () => [...folderKeys.all, 'list'] as const,
  list: () => [...folderKeys.lists()] as const,
  byProvider: (providerId: string) => [...folderKeys.all, 'provider', providerId] as const,
} as const;

// ============================================================================
// Query Options (for sharing between hooks and prefetching)
// ============================================================================

/**
 * Query options for fetching all folders across providers
 * Long staleTime since folders rarely change
 */
export function foldersListOptions() {
  return queryOptions({
    queryKey: folderKeys.list(),
    queryFn: async (): Promise<FoldersResponse> => {
      return getFolders();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - folders rarely change
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Query options for fetching folders for a specific provider
 */
export function foldersByProviderOptions(providerId: string) {
  return queryOptions({
    queryKey: folderKeys.byProvider(providerId),
    queryFn: async (): Promise<ProviderFoldersResponse> => {
      return getFoldersByProvider(providerId);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!providerId,
  });
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook for fetching all folders
 * Replaces direct getFolders() calls for caching benefits
 *
 * @example
 * ```tsx
 * const { data, isPending, error } = useFolders();
 * const folders = data?.foldersByProvider ?? {};
 * const providers = data?.providers ?? [];
 * ```
 */
export function useFolders() {
  return useQuery(foldersListOptions());
}

/**
 * Hook for fetching folders for a specific provider
 *
 * @example
 * ```tsx
 * const { data } = useFoldersByProvider('provider-id');
 * const folders = data?.folders ?? [];
 * ```
 */
export function useFoldersByProvider(providerId: string) {
  return useQuery(foldersByProviderOptions(providerId));
}
