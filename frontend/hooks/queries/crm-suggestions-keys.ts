import type { ListSuggestionsParams } from '@/lib/api/crm-suggestions';

export const crmSuggestionsKeys = {
  all: ['crm-suggestions'] as const,
  list: () => [...crmSuggestionsKeys.all, 'list'] as const,
  listFiltered: (params?: ListSuggestionsParams) => [...crmSuggestionsKeys.list(), params ?? {}] as const,
  pending: () => [...crmSuggestionsKeys.all, 'pending'] as const,
  forEmail: (emailId: string) => [...crmSuggestionsKeys.all, 'for-email', emailId] as const,
} as const;
