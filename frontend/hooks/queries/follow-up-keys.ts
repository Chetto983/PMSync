/**
 * Query Key Factory for Follow-Up Tracker
 *
 * Best practices:
 * - Factory pattern for type-safe keys
 * - Hierarchical structure for cache invalidation
 * - All keys derive from a base key
 */

export const followUpKeys = {
  all: ['follow-ups'] as const,
  lists: () => [...followUpKeys.all, 'list'] as const,
  list: (status?: string, type?: 'WAITING_FOR' | 'TODO') => [...followUpKeys.lists(), { status, type }] as const,
  pending: () => [...followUpKeys.all, 'pending'] as const,
  overdue: () => [...followUpKeys.all, 'overdue'] as const,
  stats: () => [...followUpKeys.all, 'stats'] as const,
  detail: (id: string) => [...followUpKeys.all, 'detail', id] as const,
  smartTiming: (id: string) => [...followUpKeys.all, 'smart-timing', id] as const,
};
