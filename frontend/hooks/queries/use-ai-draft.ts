import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { voltAgentApi } from '@/lib/api/ai';

/**
 * Fetches an AI-generated reply draft for a given email.
 * Enabled only when emailId is provided and options.enabled !== false.
 */
export function useAiDraft(
  emailId?: string,
  options?: { tone?: string; locale?: string; enabled?: boolean },
) {
  return useQuery({
    queryKey: ['ai', 'draft', emailId, options?.tone],
    queryFn: async () => {
      const { data } = await voltAgentApi.generateReplyDraft({
        emailId: emailId!,
        tone: options?.tone,
        locale: options?.locale,
      });
      return data;
    },
    enabled: !!emailId && options?.enabled !== false,
    staleTime: 0, // Always fresh draft
    gcTime: 5 * 60 * 1000, // Keep 5 min in cache
    retry: 1,
  });
}

/**
 * Mutation to regenerate a draft with optional instructions.
 * Invalidates the draft cache for the given email after success.
 */
export function useRegenerateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      emailId: string;
      tone?: string;
      instructions?: string;
      locale?: string;
    }) => {
      const { data } = await voltAgentApi.generateReplyDraft(params);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'draft', variables.emailId] });
    },
  });
}

/**
 * Records feedback on a draft (accepted, edited, rejected, regenerated).
 */
export function useRecordDraftFeedback() {
  return useMutation({
    mutationFn: (params: {
      draftId: string;
      action: 'accepted' | 'edited' | 'rejected' | 'regenerated';
      sentBody?: string;
    }) => voltAgentApi.recordDraftFeedback(params),
  });
}
