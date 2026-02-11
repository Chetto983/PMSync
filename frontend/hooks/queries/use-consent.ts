import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { complianceApi, type ConsentState } from '@/lib/api/compliance';
import { consentKeys } from './consent-keys';

/**
 * Query options for fetching consent state
 */
export function consentOptions() {
  return queryOptions({
    queryKey: consentKeys.list(),
    queryFn: () => complianceApi.getConsent(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Hook to fetch current consent state for all features
 */
export function useConsent() {
  return useQuery(consentOptions());
}

/**
 * Hook to update consent for a specific feature with optimistic updates
 */
export function useUpdateConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ feature, granted }: { feature: string; granted: boolean }) =>
      complianceApi.updateConsent(feature, granted),
    onMutate: async ({ feature, granted }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: consentKeys.list() });

      // Snapshot previous value
      const previous = queryClient.getQueryData<ConsentState[]>(consentKeys.list());

      // Optimistically update
      if (previous) {
        queryClient.setQueryData<ConsentState[]>(
          consentKeys.list(),
          previous.map((item) =>
            item.feature === feature
              ? { ...item, granted, lastUpdated: new Date().toISOString() }
              : item,
          ),
        );
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(consentKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      // Refetch after mutation settles
      queryClient.invalidateQueries({ queryKey: consentKeys.all });
    },
  });
}
