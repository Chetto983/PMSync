/**
 * TanStack Query hooks for writing style profile and draft statistics.
 * Phase 19-04: Writing Style Settings panel.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiChatApi, type WritingStyleProfile, type DraftStats } from '@/lib/api/ai';

// ============ Query Keys ============

export const writingStyleKeys = {
  all: ['ai', 'writing-style'] as const,
  profile: (providerId?: string) =>
    [...writingStyleKeys.all, providerId ?? 'default'] as const,
  draftStats: ['ai', 'draft-stats'] as const,
};

// ============ Query Hooks ============

/**
 * Fetch the user's writing style profile, optionally filtered by provider.
 */
export function useWritingStyle(providerId?: string, options?: { enabled?: boolean }) {
  return useQuery<WritingStyleProfile | null>({
    queryKey: writingStyleKeys.profile(providerId),
    queryFn: async () => {
      try {
        const { data } = await aiChatApi.getWritingStyle(providerId);
        return data.profile ?? null;
      } catch {
        // If no profile exists yet, return null instead of throwing
        return null;
      }
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Mutation to update manual writing samples.
 * Invalidates the writing style profile cache on success.
 */
export function useUpdateManualSamples() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { samples: string; providerId?: string }) => {
      const { data } = await aiChatApi.updateManualSamples(params);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: writingStyleKeys.all });
    },
  });
}

/**
 * Fetch AI draft quality statistics (accept rate, edit rate, etc.).
 */
export function useDraftStats(options?: { enabled?: boolean }) {
  return useQuery<DraftStats | null>({
    queryKey: writingStyleKeys.draftStats,
    queryFn: async () => {
      try {
        const { data } = await aiChatApi.getDraftStats();
        return data.stats ?? null;
      } catch {
        return null;
      }
    },
    enabled: options?.enabled !== false,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
