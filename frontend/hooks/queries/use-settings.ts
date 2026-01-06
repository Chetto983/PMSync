/**
 * TanStack Query hooks for Settings
 *
 * Best practices:
 * - Uses existing API modules (usersApi, providersApi, personalizationApi)
 * - queryOptions for type-safe, reusable query configurations
 * - useMutation for updates with optimistic updates
 * - Proper staleTime and gcTime for optimal caching
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { settingsKeys } from './settings-keys';
import { usersApi, type UserPreferences, type UpdatePreferencesData } from '@/lib/api/users';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import {
  personalizationApi,
  type JobRole,
  type CommunicationStyle,
  type ResponseLength,
  type ProactivityLevel,
  type MemoryType,
  type Memory,
  type LearnInteractionPayload,
  type WorkingHoursResponse,
} from '@/lib/api/ai';

// ============================================================================
// Types
// ============================================================================

export interface AiProfile {
  jobRole: JobRole;
  jobTitle?: string;
  department?: string;
  industry?: string;
  companySize?: string;
  communicationStyle: CommunicationStyle;
  responseLength: ResponseLength;
  proactivityLevel: ProactivityLevel;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: string[];
  timezone?: string;
  language?: string;
}

export interface UpdateAiProfileData {
  jobRole?: JobRole;
  communicationStyle?: CommunicationStyle;
  responseLength?: ResponseLength;
  proactivityLevel?: ProactivityLevel;
}

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
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  });
}

/**
 * Query options for AI personalization profile
 * Uses personalizationApi.getProfile()
 */
export function aiProfileOptions() {
  return queryOptions({
    queryKey: settingsKeys.aiProfile(),
    queryFn: async (): Promise<AiProfile> => {
      try {
        const response = await personalizationApi.getProfile();
        const profile = response.data?.profile;
        return {
          jobRole: profile?.jobRole || 'IC',
          communicationStyle: profile?.communicationStyle || 'CASUAL',
          responseLength: profile?.responseLength || 'MODERATE',
          proactivityLevel: profile?.proactivityLevel || 'MEDIUM',
        };
      } catch {
        // Return defaults if profile doesn't exist yet
        return {
          jobRole: 'IC',
          communicationStyle: 'CASUAL',
          responseLength: 'MODERATE',
          proactivityLevel: 'MEDIUM',
        };
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 0, // Profile may not exist
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
    staleTime: 30 * 1000, // 30 seconds - providers can change via sync
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
 * Hook for AI profile
 */
export function useAiProfile() {
  return useQuery(aiProfileOptions());
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
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: settingsKeys.preferences() });

      // Snapshot previous value
      const previousPrefs = queryClient.getQueryData<UserPreferences>(settingsKeys.preferences());

      // Optimistically update
      if (previousPrefs) {
        queryClient.setQueryData<UserPreferences>(settingsKeys.preferences(), {
          ...previousPrefs,
          ...newData,
        });
      }

      return { previousPrefs };
    },
    onError: (_err, _newData, context) => {
      // Rollback on error
      if (context?.previousPrefs) {
        queryClient.setQueryData(settingsKeys.preferences(), context.previousPrefs);
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: settingsKeys.preferences() });
    },
  });
}

/**
 * Mutation hook for updating AI personalization profile
 */
export function useUpdateAiProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateAiProfileData): Promise<void> => {
      await personalizationApi.updateProfile(data);
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.aiProfile() });
      const previousProfile = queryClient.getQueryData<AiProfile>(settingsKeys.aiProfile());

      if (previousProfile) {
        queryClient.setQueryData<AiProfile>(settingsKeys.aiProfile(), {
          ...previousProfile,
          ...newData,
        });
      }

      return { previousProfile };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(settingsKeys.aiProfile(), context.previousProfile);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.aiProfile() });
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
      // Invalidate providers after sync started
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

// ============================================================================
// Personalization Memory Hooks
// ============================================================================

/**
 * Query options for working hours status
 */
export function workingHoursOptions() {
  return queryOptions({
    queryKey: settingsKeys.workingHours(),
    queryFn: async (): Promise<WorkingHoursResponse> => {
      const response = await personalizationApi.getWorkingHours();
      return response.data;
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for working hours status
 */
export function useWorkingHours() {
  return useQuery(workingHoursOptions());
}

/**
 * Query options for memories by type
 */
export function memoriesOptions(type: MemoryType, limit?: number) {
  return queryOptions({
    queryKey: settingsKeys.memories(type),
    queryFn: async (): Promise<Memory[]> => {
      const response = await personalizationApi.getMemories({ type, limit });
      return response.data?.memories || [];
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for memories by type
 */
export function useMemories(type: MemoryType, limit?: number) {
  return useQuery(memoriesOptions(type, limit));
}

/**
 * Mutation hook for learning from interaction
 */
export function useLearnFromInteraction() {
  return useMutation({
    mutationFn: async (payload: LearnInteractionPayload): Promise<void> => {
      await personalizationApi.learnFromInteraction(payload);
    },
  });
}
