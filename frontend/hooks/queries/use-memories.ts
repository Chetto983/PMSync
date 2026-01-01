/**
 * TanStack Query hooks for AI Memory Browser
 *
 * Best practices implemented:
 * - Uses existing personalizationApi for memories
 * - queryOptions for type-safe, reusable query configurations
 * - Proper staleTime and gcTime for optimal caching
 * - useMutation for store/delete operations
 *
 * NOTE: These hooks are specifically for the Memory Browser feature.
 * For simple memory queries by type, use useMemories from use-settings.ts
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { memoryKeys } from './memory-keys';
import {
  personalizationApi,
  type Memory,
  type MemoryType,
  type StoreMemoryPayload,
} from '@/lib/api/personalization';

// ============================================================================
// Types
// ============================================================================

export interface MemoryBrowserData {
  memories: Memory[];
  total: number;
}

export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
  lastUpdated: string;
}

// Re-export types for convenience
export type { Memory, MemoryType, StoreMemoryPayload };

// ============================================================================
// Query Options
// ============================================================================

/**
 * Query options for all memories (optionally filtered by type)
 * Used by Memory Browser for full list view
 */
export function allMemoriesOptions(type?: MemoryType) {
  return queryOptions({
    queryKey: memoryKeys.list(type),
    queryFn: async (): Promise<MemoryBrowserData> => {
      if (!type) {
        // Fetch all memory types and combine
        const types: MemoryType[] = ['PREFERENCE', 'FACT', 'PATTERN', 'INTERACTION', 'CONTACT_NOTE'];
        const results = await Promise.allSettled(
          types.map((t) => personalizationApi.getMemories({ type: t, limit: 100 }))
        );

        const allMemories: Memory[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.data?.memories) {
            allMemories.push(...result.value.data.memories);
          }
        }

        // Sort by updatedAt desc
        allMemories.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        return { memories: allMemories, total: allMemories.length };
      }

      try {
        const response = await personalizationApi.getMemories({ type, limit: 100 });
        return {
          memories: response.data?.memories || [],
          total: response.data?.memories?.length || 0,
        };
      } catch {
        return { memories: [], total: 0 };
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

/**
 * Query options for memory search
 */
export function memorySearchOptions(query: string) {
  return queryOptions({
    queryKey: memoryKeys.search(query),
    queryFn: async (): Promise<MemoryBrowserData> => {
      if (!query.trim()) {
        return { memories: [], total: 0 };
      }

      try {
        const response = await personalizationApi.searchMemories({ query, limit: 50 });
        return {
          memories: response.data?.memories || [],
          total: response.data?.memories?.length || 0,
        };
      } catch {
        return { memories: [], total: 0 };
      }
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000,
    retry: 1,
    enabled: query.trim().length > 0,
  });
}

/**
 * Query options for memory stats
 */
export function memoryStatsOptions() {
  return queryOptions({
    queryKey: memoryKeys.stats(),
    queryFn: async (): Promise<MemoryStats> => {
      const types: MemoryType[] = ['PREFERENCE', 'FACT', 'PATTERN', 'INTERACTION', 'CONTACT_NOTE'];
      const results = await Promise.allSettled(
        types.map((t) => personalizationApi.getMemories({ type: t, limit: 1 }))
      );

      const byType: Record<MemoryType, number> = {
        PREFERENCE: 0,
        FACT: 0,
        PATTERN: 0,
        INTERACTION: 0,
        CONTACT_NOTE: 0,
      };

      let total = 0;
      let lastUpdated = '';

      for (let i = 0; i < types.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          const memories = result.value.data?.memories || [];
          byType[types[i]] = memories.length;
          total += memories.length;
          if (memories[0]?.updatedAt && (!lastUpdated || memories[0].updatedAt > lastUpdated)) {
            lastUpdated = memories[0].updatedAt;
          }
        }
      }

      return {
        total,
        byType,
        lastUpdated: lastUpdated || new Date().toISOString(),
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for all memories (optionally by type)
 * Returns { memories, total } structure for Memory Browser
 */
export function useAllMemories(type?: MemoryType) {
  return useQuery(allMemoriesOptions(type));
}

/**
 * Hook for memory search
 */
export function useMemorySearch(query: string) {
  return useQuery(memorySearchOptions(query));
}

/**
 * Hook for memory stats
 */
export function useMemoryStats() {
  return useQuery(memoryStatsOptions());
}

/**
 * Hook for storing a new memory
 */
export function useStoreMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memory: StoreMemoryPayload) => {
      const response = await personalizationApi.storeMemory(memory);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all memory queries
      queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    },
  });
}

/**
 * Hook for deleting a memory
 */
export function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memoryId: string) => {
      const response = await personalizationApi.deleteMemory(memoryId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    },
  });
}

/**
 * Hook for clearing all memories
 */
export function useClearAllMemories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await personalizationApi.clearAllMemories();
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    },
  });
}

/**
 * Hook for memory history
 */
export interface MemoryHistoryItem {
  action: string;
  previousValue?: string;
  newValue?: string;
  createdAt: string;
}

export function useMemoryHistory(memoryId: string, enabled = false) {
  return useQuery({
    queryKey: memoryKeys.history(memoryId),
    queryFn: async () => {
      const response = await personalizationApi.getMemoryHistory(memoryId);
      return response.data?.history || [];
    },
    enabled: enabled && !!memoryId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for procedural patterns
 */
export interface ProceduralPattern {
  id: string;
  taskType: string;
  trigger: string;
  steps: unknown;
  successRate: number;
  lastUsedAt: string;
}

export function usePatterns() {
  return useQuery({
    queryKey: memoryKeys.patterns(),
    queryFn: async () => {
      const response = await personalizationApi.getPatterns();
      return response.data?.patterns || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
