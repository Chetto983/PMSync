import type { ListAccountsParams } from '@/lib/api/crm-accounts';

export const crmAccountsKeys = {
  all: ['crm-accounts'] as const,
  list: () => [...crmAccountsKeys.all, 'list'] as const,
  listFiltered: (params?: ListAccountsParams) => [...crmAccountsKeys.list(), params ?? {}] as const,
  details: () => [...crmAccountsKeys.all, 'detail'] as const,
  detail: (id: string) => [...crmAccountsKeys.details(), id] as const,
} as const;
