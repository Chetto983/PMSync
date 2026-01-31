'use client';

/**
 * useHitlMutations - HITL Approval/Rejection Mutations Hook
 *
 * Extracted from InlineActionCard.tsx for reusability.
 * Handles approve and reject mutations with query invalidation.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { multiAgentApi, type ApprovalResponse } from '@/lib/api/ai';

export interface HitlMutationsResult {
  approveMutation: ReturnType<typeof useMutation<ApprovalResponse, Error, void>>;
  rejectMutation: ReturnType<typeof useMutation<ApprovalResponse, Error, void>>;
  isLoading: boolean;
}

export interface UseHitlMutationsOptions {
  actionId: string;
  editedPayload: Record<string, unknown>;
  onApproveSuccess?: (result: ApprovalResponse) => void;
  onRejectSuccess?: (result: ApprovalResponse) => void;
}

export function useHitlMutations({
  actionId,
  editedPayload,
  onApproveSuccess,
  onRejectSuccess,
}: UseHitlMutationsOptions): HitlMutationsResult {
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async () => {
      const response = await multiAgentApi.approveAction(actionId, editedPayload);
      return response.data;
    },
    onSuccess: (result: ApprovalResponse) => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
      onApproveSuccess?.(result);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const response = await multiAgentApi.rejectAction(actionId);
      return response.data;
    },
    onSuccess: (result: ApprovalResponse) => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
      onRejectSuccess?.(result);
    },
  });

  return {
    approveMutation,
    rejectMutation,
    isLoading: approveMutation.isPending || rejectMutation.isPending,
  };
}

export default useHitlMutations;
