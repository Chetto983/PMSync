import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { crmSuggestionsApi, type ListSuggestionsParams, type BulkSuggestionDto } from '@/lib/api/crm-suggestions';
import { crmSuggestionsKeys } from './crm-suggestions-keys';

// ---- Query Options ----

export function crmSuggestionsListOptions(params?: ListSuggestionsParams) {
  return queryOptions({
    queryKey: crmSuggestionsKeys.listFiltered(params),
    queryFn: () => crmSuggestionsApi.list(params).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmSuggestionsPendingOptions() {
  return queryOptions({
    queryKey: crmSuggestionsKeys.pending(),
    queryFn: () => crmSuggestionsApi.list({ status: 'pending', limit: 50 }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// ---- Hooks ----

export function usePendingSuggestions() {
  return useQuery(crmSuggestionsPendingOptions());
}

export function useAcceptSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmSuggestionsApi.accept(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmSuggestionsKeys.all });
    },
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmSuggestionsApi.dismiss(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmSuggestionsKeys.all });
    },
  });
}

export function useBulkSuggestionAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: BulkSuggestionDto) => crmSuggestionsApi.bulk(dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmSuggestionsKeys.all });
    },
  });
}
