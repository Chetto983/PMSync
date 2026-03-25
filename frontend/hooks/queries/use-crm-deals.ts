import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmDealsApi,
  type ListDealsQuery,
  type CreateDealDto,
  type UpdateDealDto,
  type LinkDealContactDto,
  type CreateActivityDto,
  type ListActivitiesQuery,
} from '@/lib/api/crm-deals';
import { crmDealsKeys } from './crm-deals-keys';

// ---- Query Options ----

export function crmDealListOptions(filters?: ListDealsQuery) {
  return queryOptions({
    queryKey: crmDealsKeys.list(filters as Record<string, unknown>),
    queryFn: () => crmDealsApi.list(filters).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmDealDetailOptions(id: string) {
  return queryOptions({
    queryKey: crmDealsKeys.detail(id),
    queryFn: () => crmDealsApi.getById(id).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!id,
  });
}

export function crmDealContactsOptions(dealId: string) {
  return queryOptions({
    queryKey: crmDealsKeys.contacts(dealId),
    queryFn: () => crmDealsApi.getContacts(dealId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!dealId,
  });
}

// ---- Hooks ----

export function useDeals(filters?: ListDealsQuery) {
  return useQuery(crmDealListOptions(filters));
}

export function useDeal(id: string) {
  return useQuery(crmDealDetailOptions(id));
}

export function useDealContacts(dealId: string) {
  return useQuery(crmDealContactsOptions(dealId));
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateDealDto) =>
      crmDealsApi.create(dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmDealsKeys.all });
    },
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateDealDto }) =>
      crmDealsApi.update(id, dto).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: crmDealsKeys.all });
      queryClient.invalidateQueries({
        queryKey: crmDealsKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      crmDealsApi.delete(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmDealsKeys.all });
    },
  });
}

export function useChangeDealStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      crmDealsApi.changeStage(dealId, stageId).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: crmDealsKeys.all });
      queryClient.invalidateQueries({
        queryKey: crmDealsKeys.detail(variables.dealId),
      });
    },
  });
}

export function useLinkDealContact(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: LinkDealContactDto) =>
      crmDealsApi.linkContact(dealId, dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmDealsKeys.contacts(dealId) });
      queryClient.invalidateQueries({ queryKey: crmDealsKeys.detail(dealId) });
    },
  });
}

export function useUnlinkDealContact(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      crmDealsApi.unlinkContact(dealId, contactId).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmDealsKeys.contacts(dealId) });
      queryClient.invalidateQueries({ queryKey: crmDealsKeys.detail(dealId) });
    },
  });
}

// ---- Activities ----

export function crmDealActivitiesOptions(dealId: string, query?: ListActivitiesQuery) {
  return queryOptions({
    queryKey: crmDealsKeys.activities(dealId),
    queryFn: () => crmDealsApi.listActivities(dealId, query).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!dealId,
  });
}

export function useDealActivities(dealId: string, query?: ListActivitiesQuery) {
  return useQuery(crmDealActivitiesOptions(dealId, query));
}

export function useCreateDealActivity(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateActivityDto) =>
      crmDealsApi.createActivity(dealId, dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmDealsKeys.activities(dealId) });
    },
  });
}
