import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { labelsApi } from '@/lib/api/labels';

export const overrideKeys = {
  all: ['triage-overrides'] as const,
} as const;

export function triageOverridesQuery() {
  return queryOptions({
    queryKey: overrideKeys.all,
    queryFn: async () => {
      const res = await labelsApi.getOverrides();
      return res.overrides;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useTriageOverrides() {
  return useQuery(triageOverridesQuery());
}

export function useCreateOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { type: string; pattern: string; action: string }) =>
      labelsApi.createOverride(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: overrideKeys.all });
    },
  });
}

export function useDeleteOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => labelsApi.deleteOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: overrideKeys.all });
    },
  });
}
