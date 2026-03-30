import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { crmNbaApi, type NBAStatus } from '@/lib/api/crm-nba';
import { crmNbaKeys } from './crm-nba-keys';

// ---- Query Options ----

export function crmNbaRecommendationsOptions(dealId: string) {
  return queryOptions({
    queryKey: crmNbaKeys.recommendations(dealId),
    queryFn: () => crmNbaApi.getRecommendations(dealId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!dealId,
  });
}

export function crmNbaEffectivenessOptions() {
  return queryOptions({
    queryKey: crmNbaKeys.effectiveness(),
    queryFn: () => crmNbaApi.getEffectiveness().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// ---- Hooks ----

export function useNbaRecommendations(dealId: string) {
  return useQuery(crmNbaRecommendationsOptions(dealId));
}

export function useNbaEffectiveness() {
  return useQuery(crmNbaEffectivenessOptions());
}

export function useUpdateNbaStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, status }: { actionId: string; status: NBAStatus }) =>
      crmNbaApi.updateStatus(actionId, status).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmNbaKeys.all });
    },
  });
}
