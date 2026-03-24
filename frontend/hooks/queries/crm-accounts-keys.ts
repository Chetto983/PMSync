import type { ListAccountsParams } from '@/lib/api/crm-accounts';

export const crmAccountsKeys = {
  all: ['crm-accounts'] as const,
  list: () => [...crmAccountsKeys.all, 'list'] as const,
  listFiltered: (params?: ListAccountsParams) => [...crmAccountsKeys.list(), params ?? {}] as const,
  details: () => [...crmAccountsKeys.all, 'detail'] as const,
  detail: (id: string) => [...crmAccountsKeys.details(), id] as const,
  children: (id: string) => [...crmAccountsKeys.all, 'children', id] as const,
  contacts: (id: string) => [...crmAccountsKeys.all, 'contacts', id] as const,
} as const;
