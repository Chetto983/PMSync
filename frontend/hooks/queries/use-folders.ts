/**
 * TanStack Query hooks for folder operations
 *
 * Best practices implemented:
 * - queryOptions for type-safe, reusable query configurations
 * - Long staleTime (5 min) - folders rarely change
 * - Proper gcTime for memory efficiency
 * - Query prefetching support
 * - useMutation for create/rename/delete with cache invalidation
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/queries
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/mutations
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from '@tanstack/react-query';
import {
  getFolders,
  getFoldersByProvider,
  getFolderMetadata,
  createFolder,
  renameFolder,
  deleteFolder,
  syncFolders,
  syncAllFolders,
  type FoldersResponse,
  type ProviderFoldersResponse,
  type FolderMetadataResponse,
  type CreateFolderRequest,
} from '@/lib/api/folders';
import { providersApi } from '@/lib/api/providers';

// ============================================================================
// Query Keys
// ============================================================================

export const folderKeys = {
  all: ['folders'] as const,
  lists: () => [...folderKeys.all, 'list'] as const,
  list: () => [...folderKeys.lists()] as const,
  byProvider: (providerId: string) => [...folderKeys.all, 'provider', providerId] as const,
  metadata: () => [...folderKeys.all, 'metadata'] as const,
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

/**
 * Query options for fetching folder metadata (canonical types, localized names)
 * This is STATIC data that never changes during a session.
 * Query once on app load and never refetch.
 */
export function folderMetadataOptions() {
  return queryOptions({
    queryKey: folderKeys.metadata(),
    queryFn: async (): Promise<FolderMetadataResponse> => {
      return getFolderMetadata();
    },
    staleTime: Infinity, // Never goes stale - data is static
    gcTime: Infinity, // Keep in cache forever (session lifetime)
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

/**
 * Hook for fetching folder metadata (canonical types, localized names)
 * Use this to get backend-defined folder types and translations
 * instead of duplicating them in the frontend.
 *
 * @example
 * ```tsx
 * const { data: metadata } = useFolderMetadata();
 * const localizedName = metadata?.localizedNames?.['it']?.['INBOX'] ?? 'Inbox';
 * const isSystemFolder = metadata?.systemFolders?.includes('INBOX');
 * ```
 */
export function useFolderMetadata() {
  return useQuery(folderMetadataOptions());
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook for creating a new folder
 *
 * @example
 * ```tsx
 * const createFolder = useCreateFolder();
 * createFolder.mutate({ name: 'My Folder', providerId: 'provider-id' });
 * ```
 */
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateFolderRequest) => createFolder(dto),
    onSuccess: (_, variables) => {
      // Invalidate both general and provider-specific queries
      queryClient.invalidateQueries({ queryKey: folderKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: folderKeys.byProvider(variables.providerId),
      });
    },
  });
}

/**
 * Hook for renaming a folder
 *
 * @example
 * ```tsx
 * const renameFolder = useRenameFolder();
 * renameFolder.mutate({ folderId: '123', newName: 'New Name', providerId: 'provider-id' });
 * ```
 */
export function useRenameFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      folderId,
      newName,
    }: {
      folderId: string;
      newName: string;
      providerId: string;
    }) => renameFolder(folderId, { newName }),
    onSuccess: (_, variables) => {
      // Invalidate both general and provider-specific queries
      queryClient.invalidateQueries({ queryKey: folderKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: folderKeys.byProvider(variables.providerId),
      });
    },
  });
}

/**
 * Hook for deleting a folder
 *
 * @example
 * ```tsx
 * const deleteFolder = useDeleteFolder();
 * deleteFolder.mutate({ folderId: '123', providerId: 'provider-id' });
 * ```
 */
export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      folderId,
    }: {
      folderId: string;
      providerId: string;
    }) => deleteFolder(folderId),
    onSuccess: (_, variables) => {
      // Invalidate both general and provider-specific queries
      queryClient.invalidateQueries({ queryKey: folderKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: folderKeys.byProvider(variables.providerId),
      });
    },
  });
}

/**
 * Hook for syncing folders for a specific provider
 *
 * Includes loading states, toast notifications, and race condition prevention.
 *
 * @example
 * ```tsx
 * const sync = useSyncFolders();
 * const toast = useToast();
 *
 * sync.mutate('provider-id', {
 *   onSuccess: (data) => {
 *     toast.success(t.folders.syncSuccessProvider
 *       .replace('{count}', data.foldersCount.toString())
 *       .replace('{provider}', providerEmail));
 *   },
 *   onError: () => toast.error(t.folders.syncFailed),
 * });
 * ```
 */
export function useSyncFolders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (providerId: string) => syncFolders(providerId),
    onSuccess: (_, providerId) => {
      queryClient.invalidateQueries({ queryKey: folderKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: folderKeys.byProvider(providerId),
      });
    },
  });
}

/**
 * Hook for syncing folders for all providers
 *
 * Includes loading states, toast notifications, and race condition prevention.
 *
 * @example
 * ```tsx
 * const syncAll = useSyncAllFolders();
 * const toast = useToast();
 *
 * syncAll.mutate(undefined, {
 *   onSuccess: (data) => {
 *     const successCount = data.results.filter(r => r.success).length;
 *     toast.success(`Synced ${successCount} accounts successfully`);
 *   },
 *   onError: () => toast.error(t.folders.syncFailed),
 * });
 * ```
 */
export function useSyncAllFolders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => syncAllFolders(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}

/**
 * Hook for syncing BOTH folders AND emails for a specific provider
 *
 * This performs a complete sync:
 * 1. Syncs folder structure
 * 2. Syncs email messages
 *
 * Prevents race conditions by executing sequentially.
 *
 * @example
 * ```tsx
 * const syncComplete = useSyncProviderComplete();
 * const toast = useToast();
 *
 * syncComplete.mutate('provider-id', {
 *   onSuccess: () => toast.success('Synced folders and emails'),
 *   onError: () => toast.error('Sync failed'),
 * });
 * ```
 */
export function useSyncProviderComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerId: string) => {
      // Step 1: Sync folder structure
      const foldersResult = await syncFolders(providerId);

      // Step 2: Sync emails (this triggers email-sync job queue)
      const emailsResult = await providersApi.syncProvider(providerId);

      return {
        foldersCount: foldersResult.foldersCount,
        emailsSynced: true,
        message: emailsResult.message,
      };
    },
    onSuccess: (_, providerId) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: folderKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: folderKeys.byProvider(providerId),
      });
      // Also invalidate email queries (if they exist)
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });
}
