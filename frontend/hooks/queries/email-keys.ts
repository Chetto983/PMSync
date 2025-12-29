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

import type { ListEmailsParams } from '@/lib/api/emails';

export const emailKeys = {
  // Root key for all email queries
  all: ['emails'] as const,

  // Email list with filters
  list: () => [...emailKeys.all, 'list'] as const,
  listFiltered: (params?: ListEmailsParams) => [...emailKeys.list(), params ?? {}] as const,

  // Single email details
  details: () => [...emailKeys.all, 'detail'] as const,
  detail: (id: string) => [...emailKeys.details(), id] as const,

  // Email threads
  threads: () => [...emailKeys.all, 'threads'] as const,
  thread: (threadId: string) => [...emailKeys.threads(), threadId] as const,
  conversations: (params?: ListEmailsParams) => [...emailKeys.threads(), 'conversations', params ?? {}] as const,

  // Search
  search: (query: string) => [...emailKeys.all, 'search', query] as const,

  // Stats
  stats: () => [...emailKeys.all, 'stats'] as const,

  // Drafts
  drafts: () => [...emailKeys.all, 'drafts'] as const,
  draft: (draftId: string) => [...emailKeys.drafts(), draftId] as const,

  // By folder (specialUse)
  byFolder: (folder: string) => [...emailKeys.all, 'folder', folder] as const,

  // By provider
  byProvider: (providerId: string) => [...emailKeys.all, 'provider', providerId] as const,

  // By label
  byLabel: (labelId: string) => [...emailKeys.all, 'label', labelId] as const,

  // Calendar invites
  calendarInvite: (emailId: string) => [...emailKeys.all, 'calendar-invite', emailId] as const,

  // Attachments
  attachmentMetadata: (attachmentId: string) => [...emailKeys.all, 'attachment', attachmentId] as const,
} as const;
