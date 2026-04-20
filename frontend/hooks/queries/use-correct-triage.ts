/**
 * Phase 147 D-01 explicit-path mutation hook.
 * Sends a user-typed "this should be X" correction to the backend, which
 * records signal='correction' feedback and enqueues a debounced promotion run.
 *
 * WR-03: surfaces success + error via the global toast singleton. The previous
 * version silently swallowed errors with a comment claiming "devtools / network
 * tab" were sufficient affordances — they are not, end users have no such
 * tooling. Now the user sees an explicit toast on either outcome.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emailsApi } from '@/lib/api/emails';
import {
  getGlobalToast,
  getGlobalTranslations,
} from '@/lib/context/toast-context';
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
      const t = getGlobalTranslations();
      getGlobalToast().success(
        t.email?.labels?.correctTriageSuccess ?? 'Correction recorded',
      );
    },
    onError: () => {
      const t = getGlobalTranslations();
      getGlobalToast().error(
        t.email?.labels?.correctTriageError ?? t.common.genericError,
      );
    },
  });
}
