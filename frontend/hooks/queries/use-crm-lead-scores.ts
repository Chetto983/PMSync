import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmLeadScoresApi,
  type ListLeadScoresParams,
} from '@/lib/api/crm-lead-scores';
import { crmLeadScoresKeys } from './crm-lead-scores-keys';

// ---- Query Options ----

export function leadScoreHistoryOptions(contactId: string) {
  return queryOptions({
    queryKey: crmLeadScoresKeys.history(contactId),
    queryFn: () =>
      crmLeadScoresApi.getScoreHistory(contactId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!contactId,
  });
}

export function leadScoresListOptions(params?: ListLeadScoresParams) {
  return queryOptions({
    queryKey: params
      ? crmLeadScoresKeys.listFiltered(params as Record<string, unknown>)
      : crmLeadScoresKeys.list(),
    queryFn: () => crmLeadScoresApi.list(params).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function leadScoreDetailOptions(contactId: string) {
  return queryOptions({
    queryKey: crmLeadScoresKeys.detail(contactId),
    queryFn: () => crmLeadScoresApi.getByContact(contactId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!contactId,
  });
}

// ---- Hooks ----

export function useLeadScores(params?: ListLeadScoresParams) {
  return useQuery(leadScoresListOptions(params));
}

export function useLeadScore(contactId: string) {
  return useQuery(leadScoreDetailOptions(contactId));
}

export function useLeadScoreHistory(contactId: string) {
  return useQuery(leadScoreHistoryOptions(contactId));
}

export function useComputeLeadScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: string) =>
      crmLeadScoresApi.computeScore(contactId).then((r) => r.data),
    onSuccess: (_data, contactId) => {
      queryClient.invalidateQueries({
        queryKey: crmLeadScoresKeys.detail(contactId),
      });
      queryClient.invalidateQueries({
        queryKey: crmLeadScoresKeys.list(),
      });
    },
  });
}
