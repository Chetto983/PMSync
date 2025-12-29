/**
 * TanStack Query hooks for label operations
 *
 * Best practices implemented:
 * - queryOptions for type-safe, reusable query configurations
 * - useMutation for create/update/delete with cache invalidation
 * - Optimistic updates for better UX
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/mutations
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from '@tanstack/react-query';
import {
  labelsApi,
  type Label,
  type CreateLabelDto,
  type UpdateLabelDto,
} from '@/lib/api/labels';

// ============================================================================
// Query Keys
// ============================================================================

export const labelKeys = {
  all: ['labels'] as const,
  lists: () => [...labelKeys.all, 'list'] as const,
  list: () => [...labelKeys.lists()] as const,
  detail: (id: string) => [...labelKeys.all, 'detail', id] as const,
  emails: (id: string) => [...labelKeys.all, 'emails', id] as const,
} as const;

// ============================================================================
// Query Options
// ============================================================================

/**
 * Query options for fetching all labels
 */
export function labelsListOptions() {
  return queryOptions({
    queryKey: labelKeys.list(),
    queryFn: async () => {
      const response = await labelsApi.listLabels();
      return response.labels;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Query options for fetching a single label
 */
export function labelDetailOptions(labelId: string) {
  return queryOptions({
    queryKey: labelKeys.detail(labelId),
    queryFn: async () => {
      const response = await labelsApi.getLabel(labelId);
      return response.label;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!labelId,
  });
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook for fetching all labels
 *
 * @example
 * ```tsx
 * const { data: labels, isLoading } = useLabels();
 * ```
 */
export function useLabels() {
  return useQuery(labelsListOptions());
}

/**
 * Hook for fetching a single label by ID
 */
export function useLabel(labelId: string) {
  return useQuery(labelDetailOptions(labelId));
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook for creating a new label
 *
 * @example
 * ```tsx
 * const createLabel = useCreateLabel();
 * createLabel.mutate({ name: 'Work', color: { backgroundColor: '#1976D2', textColor: '#fff' } });
 * ```
 */
export function useCreateLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateLabelDto) => labelsApi.createLabel(dto),
    onSuccess: () => {
      // Invalidate labels list to refetch
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
}

/**
 * Hook for updating a label
 *
 * @example
 * ```tsx
 * const updateLabel = useUpdateLabel();
 * updateLabel.mutate({ labelId: '123', dto: { name: 'Updated Name' } });
 * ```
 */
export function useUpdateLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ labelId, dto }: { labelId: string; dto: UpdateLabelDto }) =>
      labelsApi.updateLabel(labelId, dto),
    onSuccess: (_, variables) => {
      // Invalidate both list and detail
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: labelKeys.detail(variables.labelId),
      });
    },
  });
}

/**
 * Hook for deleting a label
 *
 * @example
 * ```tsx
 * const deleteLabel = useDeleteLabel();
 * deleteLabel.mutate('label-id');
 * ```
 */
export function useDeleteLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (labelId: string) => labelsApi.deleteLabel(labelId),
    onSuccess: () => {
      // Invalidate labels list
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
}

/**
 * Hook for adding emails to a label
 */
export function useAddEmailsToLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ labelId, emailIds }: { labelId: string; emailIds: string[] }) =>
      labelsApi.addEmailsToLabel(labelId, { emailIds }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: labelKeys.emails(variables.labelId),
      });
    },
  });
}

/**
 * Hook for removing an email from a label
 */
export function useRemoveEmailFromLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ labelId, emailId }: { labelId: string; emailId: string }) =>
      labelsApi.removeEmailFromLabel(labelId, emailId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: labelKeys.emails(variables.labelId),
      });
    },
  });
}

/**
 * Hook for reordering labels
 */
export function useReorderLabels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (labelIds: string[]) => labelsApi.reorderLabels({ labelIds }),
    onMutate: async (labelIds) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: labelKeys.lists() });

      // Snapshot the previous value
      const previousLabels = queryClient.getQueryData<Label[]>(labelKeys.list());

      // Optimistically update to the new order
      if (previousLabels) {
        const reorderedLabels = labelIds
          .map((id) => previousLabels.find((l) => l.id === id))
          .filter(Boolean) as Label[];

        // Include any labels not in the reorder list
        const remainingLabels = previousLabels.filter(
          (l) => !labelIds.includes(l.id)
        );

        queryClient.setQueryData(
          labelKeys.list(),
          [...reorderedLabels, ...remainingLabels]
        );
      }

      return { previousLabels };
    },
    onError: (_, __, context) => {
      // Rollback on error
      if (context?.previousLabels) {
        queryClient.setQueryData(labelKeys.list(), context.previousLabels);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
}
