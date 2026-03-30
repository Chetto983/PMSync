import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { crmForecastApi } from '@/lib/api/crm-forecast';
import { crmForecastKeys } from './crm-forecast-keys';

export function crmForecastOptions(
  pipelineId: string,
  period: 'month' | 'quarter' = 'quarter',
) {
  return queryOptions({
    queryKey: crmForecastKeys.forecast(pipelineId, period),
    queryFn: () =>
      crmForecastApi.getForecast(pipelineId, period).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!pipelineId,
  });
}

export function useForecast(
  pipelineId: string,
  period: 'month' | 'quarter' = 'quarter',
) {
  return useQuery(crmForecastOptions(pipelineId, period));
}

export function useForecastRefresh() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pipelineId,
      period,
    }: {
      pipelineId?: string;
      period?: 'month' | 'quarter';
    }) => crmForecastApi.refresh(pipelineId, period).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmForecastKeys.all });
    },
  });
}
