/**
 * TanStack Query keys for AI memory management
 */

export const memoryKeys = {
  all: ['memory'] as const,
  lists: () => [...memoryKeys.all, 'list'] as const,
  list: (type?: string) => [...memoryKeys.lists(), { type }] as const,
  search: (query: string) => [...memoryKeys.all, 'search', query] as const,
  stats: () => [...memoryKeys.all, 'stats'] as const,
  history: (id: string) => [...memoryKeys.all, 'history', id] as const,
  patterns: () => [...memoryKeys.all, 'patterns'] as const,
};
