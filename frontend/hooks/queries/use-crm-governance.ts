import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmGovernanceApi,
  type TimeRange,
} from '@/lib/api/crm-governance';
import { crmGovernanceKeys } from './crm-governance-keys';

// ---- Query Options ----

export function crmGovernanceOverviewOptions() {
  return queryOptions({
    queryKey: crmGovernanceKeys.overview(),
    queryFn: () => crmGovernanceApi.getOverview().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmGovernanceAccuracyOptions(range: TimeRange = '30d') {
  return queryOptions({
    queryKey: crmGovernanceKeys.accuracy(range),
    queryFn: () => crmGovernanceApi.getAccuracy(range).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmGovernanceCostsOptions(range: TimeRange = '30d') {
  return queryOptions({
    queryKey: crmGovernanceKeys.costs(range),
    queryFn: () => crmGovernanceApi.getCostBreakdown(range).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// ---- Hooks ----

export function useGovernanceOverview() {
  return useQuery(crmGovernanceOverviewOptions());
}

export function useGovernanceAccuracy(range: TimeRange = '30d') {
  return useQuery(crmGovernanceAccuracyOptions(range));
}

export function crmGovernanceCostTrendOptions() {
  return queryOptions({
    queryKey: crmGovernanceKeys.costTrend(),
    queryFn: () => crmGovernanceApi.getMonthlyCostTrend().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useGovernanceCosts(range: TimeRange = '30d') {
  return useQuery(crmGovernanceCostsOptions(range));
}

export function useGovernanceCostTrend() {
  return useQuery(crmGovernanceCostTrendOptions());
}

export function crmGovernanceDriftOptions() {
  return queryOptions({
    queryKey: crmGovernanceKeys.drift(),
    queryFn: () => crmGovernanceApi.getDriftResults().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useGovernanceDrift() {
  return useQuery(crmGovernanceDriftOptions());
}

export function useRunDriftCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => crmGovernanceApi.runDriftCheck().then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmGovernanceKeys.drift() });
    },
  });
}

export function crmGovernanceModelsOptions() {
  return queryOptions({
    queryKey: crmGovernanceKeys.models(),
    queryFn: () => crmGovernanceApi.getModels().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useGovernanceModels() {
  return useQuery(crmGovernanceModelsOptions());
}

export function useTriggerRetrain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (modelType: string) =>
      crmGovernanceApi.triggerRetrain(modelType).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmGovernanceKeys.models() });
    },
  });
}
