import { queryOptions, useQuery } from '@tanstack/react-query';
import { crmAnalyticsKeys } from './crm-analytics-keys';
import { getCsatAggregation, getServiceMetrics } from '@/lib/api/crm-analytics';

export function csatAggregationOptions(params?: {
  startDate?: string;
  endDate?: string;
  assigneeId?: string;
}) {
  return queryOptions({
    queryKey: crmAnalyticsKeys.csat(params),
    queryFn: () => getCsatAggregation(params),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function serviceMetricsOptions(params?: {
  startDate?: string;
  endDate?: string;
}) {
  return queryOptions({
    queryKey: crmAnalyticsKeys.service(params),
    queryFn: () => getServiceMetrics(params),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useCsatAggregation(params?: {
  startDate?: string;
  endDate?: string;
  assigneeId?: string;
}) {
  return useQuery(csatAggregationOptions(params));
}

export function useServiceMetrics(params?: {
  startDate?: string;
  endDate?: string;
}) {
  return useQuery(serviceMetricsOptions(params));
}
