import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmChurnApi,
  type ListChurnQuery,
} from '@/lib/api/crm-churn';
import { crmChurnKeys } from './crm-churn-keys';

// ---- Query Options ----

export function crmChurnListOptions(filters?: ListChurnQuery) {
  return queryOptions({
    queryKey: crmChurnKeys.list(filters as Record<string, unknown>),
    queryFn: () => crmChurnApi.listAtRisk(filters).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmChurnContactOptions(contactId: string) {
  return queryOptions({
    queryKey: crmChurnKeys.contactSignal(contactId),
    queryFn: () => crmChurnApi.getContactSignal(contactId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!contactId,
  });
}

export function crmChurnAccountOptions(accountId: string) {
  return queryOptions({
    queryKey: crmChurnKeys.accountSignal(accountId),
    queryFn: () => crmChurnApi.getAccountSignal(accountId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!accountId,
  });
}

// ---- Hooks ----

export function useChurnAtRisk(filters?: ListChurnQuery) {
  return useQuery(crmChurnListOptions(filters));
}

export function useChurnContactSignal(contactId: string) {
  return useQuery(crmChurnContactOptions(contactId));
}

export function useChurnAccountSignal(accountId: string) {
  return useQuery(crmChurnAccountOptions(accountId));
}

export function useComputeChurnContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      crmChurnApi.computeContact(contactId).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmChurnKeys.all });
    },
  });
}

export function useAcknowledgeChurn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      crmChurnApi.acknowledge(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmChurnKeys.all });
    },
  });
}
