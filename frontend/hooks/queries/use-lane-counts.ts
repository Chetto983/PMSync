import { useQuery, queryOptions } from '@tanstack/react-query';
import { labelsApi } from '@/lib/api/labels';

export const laneCountKeys = {
  all: ['lane-counts'] as const,
} as const;

export function laneCountsQuery() {
  return queryOptions({
    queryKey: laneCountKeys.all,
    queryFn: () => labelsApi.getLaneCounts(),
    staleTime: 2 * 60 * 1000, // 2 minutes — counts change on triage
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useLaneCounts() {
  return useQuery(laneCountsQuery());
}
