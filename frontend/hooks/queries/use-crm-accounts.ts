import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmAccountsApi,
  type ListAccountsParams,
  type CreateAccountDto,
  type UpdateAccountDto,
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
