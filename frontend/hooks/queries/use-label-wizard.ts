import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { labelsApi, type CreateLabelWizardDto } from '@/lib/api/labels';
import { labelKeys } from './use-labels';

export const labelWizardKeys = {
  options: [...labelKeys.all, 'wizard-options'] as const,
} as const;

export function labelWizardOptionsQuery() {
  return queryOptions({
    queryKey: labelWizardKeys.options,
    queryFn: () => labelsApi.getWizardOptions(),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  });
}

export function useLabelWizardOptions() {
  return useQuery(labelWizardOptionsQuery());
}

export function useCreateLabelWizard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateLabelWizardDto) => labelsApi.createFromWizard(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelKeys.all });
    },
  });
}

export function useUpdateLabelWizard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateLabelWizardDto }) =>
      labelsApi.updateFromWizard(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelKeys.all });
    },
  });
}
