import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { labelsApi, type CreateLabelWizardDto, type LabelWizardPreviewRequest } from '@/lib/api/labels';
import { labelKeys } from './use-labels';

export const labelWizardKeys = {
  options: [...labelKeys.all, 'wizard-options'] as const,
  preview: (labelId: string, emailId: string, locale?: string) =>
    [...labelKeys.all, 'wizard-preview', labelId, emailId, locale ?? 'default'] as const,
  draftPreview: (request: LabelWizardPreviewRequest) =>
    [...labelKeys.all, 'wizard-preview-draft', request] as const,
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

export function useLabelPreview(
  labelId?: string,
  emailId?: string,
  locale?: string,
) {
  return useQuery({
    queryKey: labelId && emailId
      ? labelWizardKeys.preview(labelId, emailId, locale)
      : [...labelKeys.all, 'wizard-preview', 'idle'] as const,
    queryFn: () => labelsApi.previewLabel(labelId!, { emailId: emailId!, locale }),
    enabled: Boolean(labelId && emailId),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useWizardLabelPreview(
  request?: LabelWizardPreviewRequest,
  enabled = true,
) {
  return useQuery({
    queryKey: request
      ? labelWizardKeys.draftPreview(request)
      : [...labelKeys.all, 'wizard-preview-draft', 'idle'] as const,
    queryFn: () => labelsApi.previewWizardLabel(request!),
    enabled: Boolean(request?.emailId) && enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
