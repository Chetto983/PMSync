import type { ListAccountsParams } from '@/lib/api/crm-accounts';

export const crmAccountsKeys = {
  all: ['crm-accounts'] as const,
  list: () => [...crmAccountsKeys.all, 'list'] as const,
  listFiltered: (params?: ListAccountsParams) => [...crmAccountsKeys.list(), params ?? {}] as const,
  details: () => [...crmAccountsKeys.all, 'detail'] as const,
  detail: (id: string) => [...crmAccountsKeys.details(), id] as const,
  children: (id: string) => [...crmAccountsKeys.all, 'children', id] as const,
  contacts: (id: string) => [...crmAccountsKeys.all, 'contacts', id] as const,
  byContact: (contactId: string) => [...crmAccountsKeys.all, 'by-contact', contactId] as const,
  activities: (accountId: string) => [...crmAccountsKeys.all, 'activities', accountId] as const,
} as const;
