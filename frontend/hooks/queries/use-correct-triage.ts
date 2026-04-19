/**
 * Phase 147 D-01 explicit-path mutation hook.
 * Sends a user-typed "this should be X" correction to the backend, which
 * records signal='correction' feedback and enqueues a debounced promotion run.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emailsApi } from '@/lib/api/emails';
import { emailKeys } from './email-keys';

export interface CorrectTriageVariables {
  id: string;
  body: {
    type: 'label_correction';
    oldValue?: string;
    newValue: string;
  };
}

export function useCorrectTriageMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: CorrectTriageVariables) =>
      emailsApi.correctTriage(id, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: emailKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: emailKeys.list() });
    },
  });
}
