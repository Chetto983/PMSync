/**
 * TanStack Query keys for email operations
 *
 * Following 2025 best practices:
 * - Hierarchical key structure for granular invalidation
 * - Factory pattern for consistent key generation
 * - Type-safe with const assertions
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
 */

import type { EmailListParams } from '@/lib/api/email';

export const emailKeys = {
  // Root key for all email queries
  all: ['emails'] as const,

  // Lists with filters
  lists: () => [...emailKeys.all, 'list'] as const,
  list: (params?: EmailListParams) => [...emailKeys.lists(), params ?? {}] as const,

  // Single email details
  details: () => [...emailKeys.all, 'detail'] as const,
  detail: (id: string) => [...emailKeys.details(), id] as const,

  // Thread/conversation queries
  threads: () => [...emailKeys.all, 'thread'] as const,
  thread: (threadId: string) => [...emailKeys.threads(), threadId] as const,

  // Conversations list
  conversations: () => [...emailKeys.all, 'conversations'] as const,
  conversationList: (params?: { page?: number; limit?: number; providerId?: string; folder?: string }) =>
    [...emailKeys.conversations(), params ?? {}] as const,
  conversationInfinite: (params?: { limit?: number; providerId?: string; folder?: string }) =>
    [...emailKeys.conversations(), 'infinite', params ?? {}] as const,

  // Search queries
  search: () => [...emailKeys.all, 'search'] as const,
  searchResults: (query: string, providerId?: string, limit?: number) =>
    [...emailKeys.search(), { query, providerId, limit }] as const,

  // Statistics
  stats: () => [...emailKeys.all, 'stats'] as const,
  statsByProvider: (providerId?: string) => [...emailKeys.stats(), providerId ?? 'all'] as const,

  // Drafts
  drafts: () => [...emailKeys.all, 'drafts'] as const,
  draft: (id: string) => [...emailKeys.drafts(), id] as const,

  // Sync status
  syncStatus: () => [...emailKeys.all, 'sync-status'] as const,

  // Retention stats (admin)
  retention: () => [...emailKeys.all, 'retention'] as const,
} as const;
