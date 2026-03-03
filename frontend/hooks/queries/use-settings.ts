/**
 * TanStack Query hooks for Settings
 *
 * Uses existing API modules (usersApi, providersApi).
 * Personalization hooks (AI profile, working hours, memories) removed —
 * no backend endpoints exist for them.
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { settingsKeys } from './settings-keys';
import { usersApi, type UserPreferences, type UpdatePreferencesData } from '@/lib/api/users';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';

// ============================================================================
// Query Options
// ============================================================================

/**
 * Query options for user preferences
 * Uses usersApi.getPreferences()
 */
export function userPreferencesOptions() {
  return queryOptions({
    queryKey: settingsKeys.preferences(),
    queryFn: async (): Promise<UserPreferences> => {
      return usersApi.getPreferences();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Query options for email providers
 * Uses providersApi.getProviders()
 */
export function providersOptions() {
  return queryOptions({
    queryKey: settingsKeys.providers(),
    queryFn: async (): Promise<ProviderConfig[]> => {
      return providersApi.getProviders();
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for user preferences
 */
export function useUserPreferences() {
  return useQuery(userPreferencesOptions());
}

/**
 * Hook for email providers
 */
export function useProviders() {
  return useQuery(providersOptions());
}

/**
 * Mutation hook for updating user preferences
 * Includes optimistic updates
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdatePreferencesData): Promise<UserPreferences> => {
      return usersApi.updatePreferences(data);
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.preferences() });
      const previousPrefs = queryClient.getQueryData<UserPreferences>(
        settingsKeys.preferences(),
      );
      if (previousPrefs) {
        queryClient.setQueryData<UserPreferences>(settingsKeys.preferences(), {
          ...previousPrefs,
          ...newData,
        });
      }
      return { previousPrefs };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousPrefs) {
        queryClient.setQueryData(settingsKeys.preferences(), context.previousPrefs);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.preferences() });
    },
  });
}

/**
 * Mutation hook for syncing all providers
 */
export function useSyncAllProviders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return providersApi.syncAll();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.providers() });
    },
  });
}

/**
 * Mutation hook for deleting a provider
 */
export function useDeleteProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerId: string) => {
      return providersApi.deleteProvider(providerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.providers() });
    },
  });
}
