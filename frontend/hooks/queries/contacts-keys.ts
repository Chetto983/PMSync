/**
 * TanStack Query keys for contacts operations
 *
 * Following 2025 best practices:
 * - Hierarchical key structure for granular invalidation
 * - Factory pattern for consistent key generation
 * - Type-safe with const assertions
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
 */

import type { ListContactsParams } from '@/lib/api/contacts';

export const contactsKeys = {
  // Root key for all contacts queries
  all: ['contacts'] as const,

  // Contact list with filters
  list: () => [...contactsKeys.all, 'list'] as const,
  listFiltered: (params?: ListContactsParams) => [...contactsKeys.list(), params ?? {}] as const,

  // Single contact details
  details: () => [...contactsKeys.all, 'detail'] as const,
  detail: (id: string) => [...contactsKeys.details(), id] as const,

  // Contact counts/statistics
  counts: () => [...contactsKeys.all, 'counts'] as const,

  // Search contacts
  search: (query: string) => [...contactsKeys.all, 'search', query] as const,

  // Contacts by provider
  byProvider: (providerId: string) => [...contactsKeys.all, 'provider', providerId] as const,

  // Contacts by company
  byCompany: (company: string) => [...contactsKeys.all, 'company', company] as const,

  // Sync status
  syncStatus: () => [...contactsKeys.all, 'sync-status'] as const,
  providerSync: (providerId: string) => [...contactsKeys.syncStatus(), providerId] as const,

  // Contact photo (lazy-loaded from provider)
  photo: (id: string) => [...contactsKeys.all, 'photo', id] as const,

  // Sender photos lookup (batch)
  senderPhotos: (emails: string[]) => [...contactsKeys.all, 'sender-photos', emails.sort().join(',')] as const,

  // VIP contacts
  vip: () => [...contactsKeys.all, 'vip'] as const,
} as const;
