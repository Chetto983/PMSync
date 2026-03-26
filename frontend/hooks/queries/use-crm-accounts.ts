import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmAccountsApi,
  type ListAccountsParams,
  type CreateAccountDto,
  type UpdateAccountDto,
  type LinkContactDto,
  type CreateAccountActivityDto,
} from '@/lib/api/crm-accounts';
import { crmAccountsKeys } from './crm-accounts-keys';

// ---- Query Options ----

export function crmAccountListOptions(params?: ListAccountsParams) {
  return queryOptions({
    queryKey: crmAccountsKeys.listFiltered(params),
    queryFn: () => crmAccountsApi.list(params).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmAccountDetailOptions(id: string) {
  return queryOptions({
    queryKey: crmAccountsKeys.detail(id),
    queryFn: () => crmAccountsApi.getById(id).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!id,
  });
}

// ---- Hooks ----

export function useAccounts(params?: ListAccountsParams) {
  return useQuery(crmAccountListOptions(params));
}

export function useAccount(id: string) {
  return useQuery(crmAccountDetailOptions(id));
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAccountDto) =>
      crmAccountsApi.create(dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmAccountsKeys.all });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAccountDto }) =>
      crmAccountsApi.update(id, dto).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: crmAccountsKeys.all });
      queryClient.invalidateQueries({
        queryKey: crmAccountsKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      crmAccountsApi.delete(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmAccountsKeys.all });
    },
  });
}

// ---- By Contact (reverse lookup) ----

export function crmAccountsByContactOptions(contactId: string) {
  return queryOptions({
    queryKey: crmAccountsKeys.byContact(contactId),
    queryFn: () => crmAccountsApi.getAccountsByContact(contactId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!contactId,
  });
}

export function useContactAccounts(contactId: string) {
  return useQuery(crmAccountsByContactOptions(contactId));
}

// ---- Children & Contacts ----

export function crmAccountChildrenOptions(id: string) {
  return queryOptions({
    queryKey: crmAccountsKeys.children(id),
    queryFn: () => crmAccountsApi.getChildren(id).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!id,
  });
}

export function useAccountChildren(id: string) {
  return useQuery(crmAccountChildrenOptions(id));
}

export function crmAccountContactsOptions(accountId: string) {
  return queryOptions({
    queryKey: crmAccountsKeys.contacts(accountId),
    queryFn: () => crmAccountsApi.getContacts(accountId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!accountId,
  });
}

export function useAccountContacts(accountId: string) {
  return useQuery(crmAccountContactsOptions(accountId));
}

export function useLinkContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, dto }: { accountId: string; dto: LinkContactDto }) =>
      crmAccountsApi.linkContact(accountId, dto).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: crmAccountsKeys.contacts(variables.accountId),
      });
      queryClient.invalidateQueries({
        queryKey: crmAccountsKeys.detail(variables.accountId),
      });
      queryClient.invalidateQueries({
        queryKey: crmAccountsKeys.byContact(variables.dto.contactId),
      });
    },
  });
}

export function useUnlinkContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, contactId }: { accountId: string; contactId: string }) =>
      crmAccountsApi.unlinkContact(accountId, contactId).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: crmAccountsKeys.contacts(variables.accountId),
      });
      queryClient.invalidateQueries({
        queryKey: crmAccountsKeys.detail(variables.accountId),
      });
    },
  });
}

// ---- Activities ----

export function crmAccountActivitiesOptions(accountId: string, query?: { limit?: number; offset?: number }) {
  return queryOptions({
    queryKey: [...crmAccountsKeys.activities(accountId), query ?? {}],
    queryFn: () => crmAccountsApi.listActivities(accountId, query).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!accountId,
  });
}

export function useAccountActivities(accountId: string) {
  return useQuery(crmAccountActivitiesOptions(accountId));
}

export function useCreateAccountActivity(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAccountActivityDto) =>
      crmAccountsApi.createActivity(accountId, dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: crmAccountsKeys.activities(accountId),
      });
    },
  });
}
