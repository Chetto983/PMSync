import { useQuery, queryOptions } from '@tanstack/react-query';
import { crmContextApi, type CrmContactContext } from '@/lib/api/crm-context';
import { crmContextKeys } from './crm-context-keys';

// ---- Query Options ----

export function crmContextByContactOptions(contactId: string) {
  return queryOptions({
    queryKey: crmContextKeys.byContact(contactId),
    queryFn: () => crmContextApi.getByContactId(contactId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!contactId,
  });
}

export function crmContextByEmailOptions(email: string) {
  return queryOptions({
    queryKey: crmContextKeys.byEmail(email),
    queryFn: () => crmContextApi.getByEmail(email).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!email,
  });
}

// ---- Hooks ----

export function useCrmContextByContact(contactId: string) {
  return useQuery(crmContextByContactOptions(contactId));
}

export function useCrmContextByEmail(email: string) {
  return useQuery(crmContextByEmailOptions(email));
}

export type { CrmContactContext };
