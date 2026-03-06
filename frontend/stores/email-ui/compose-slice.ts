/**
 * Compose Slice - Email compose state and actions
 */

import type { ComposeState, EmailUIState } from './email-ui-types';
import { initialComposeState } from './email-ui-types';

type SetFn = (fn: ((state: EmailUIState) => Partial<EmailUIState>) | Partial<EmailUIState>) => void;

export function createComposeSlice(set: SetFn) {
  return {
    compose: initialComposeState,

    openCompose: (options?: Partial<ComposeState>) =>
      set({
        compose: {
          ...initialComposeState,
          ...options,
          isOpen: true,
        },
      }),

    openReply: (emailId: string, replyAll = false) =>
      set({
        compose: {
          isOpen: true,
          mode: replyAll ? 'replyAll' : 'reply',
          replyToEmailId: emailId,
        },
      }),

    openForward: (emailId: string) =>
      set({
        compose: {
          isOpen: true,
          mode: 'forward',
          replyToEmailId: emailId,
        },
      }),

    openDraft: (draftId: string) =>
      set({
        compose: {
          isOpen: true,
          mode: 'draft',
          draftId,
        },
      }),

    closeCompose: () =>
      set({
        compose: initialComposeState,
      }),

    updateCompose: (updates: Partial<ComposeState>) =>
      set((state) => ({
        compose: { ...state.compose, ...updates },
      })),
  };
}
