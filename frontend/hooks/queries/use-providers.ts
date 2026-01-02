/**
 * TanStack Query hooks for providers
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { providersApi, type UpdateProviderDto } from '@/lib/api/providers';
import { providersKeys } from './providers-keys';

/**
 * Query options for providers list
 */
export function providersListOptions() {
  return queryOptions({
    queryKey: providersKeys.list(),
    queryFn: async () => {
      return await providersApi.getProviders();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Query options for single provider
 */
export function providerDetailOptions(id: string) {
  return queryOptions({
    queryKey: providersKeys.detail(id),
    queryFn: async () => {
      return await providersApi.getProvider(id);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
  });
}

/**
 * Query options for provider aliases
 */
export function providerAliasesOptions(id: string) {
  return queryOptions({
    queryKey: providersKeys.aliases(id),
    queryFn: async () => {
      return await providersApi.getAliases(id);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
  });
}

/**
 * Hook to fetch all providers
 */
export function useProviders() {
  return useQuery(providersListOptions());
}

/**
 * Hook to fetch single provider
 */
export function useProvider(id: string) {
  return useQuery(providerDetailOptions(id));
}

/**
 * Hook to fetch provider aliases
 */
export function useProviderAliases(id: string) {
  return useQuery(providerAliasesOptions(id));
}

/**
 * Hook to update provider
 */
export function useUpdateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateProviderDto }) => {
      return await providersApi.updateProvider(id, dto);
    },
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(providersKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: providersKeys.list() });
    },
  });
}

/**
 * Hook to delete provider
 */
export function useDeleteProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await providersApi.deleteProvider(id);
      return id;
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: providersKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: providersKeys.list() });
    },
  });
}

/**
 * Hook to sync a provider
 */
export function useSyncProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return await providersApi.syncProvider(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providersKeys.list() });
    },
  });
}

/**
 * Hook to sync all providers
 */
export function useSyncAllProviders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await providersApi.syncAll();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providersKeys.list() });
    },
  });
}
