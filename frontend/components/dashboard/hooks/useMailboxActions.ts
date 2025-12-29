import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { emailApi } from '@/lib/api/email';
import { emailKeys } from '@/hooks/queries';
import { logger } from '@/lib/logger';
import type { Provider } from '@/lib/api/folders';
import type { Email } from '@/stores/email-store';
import { useEmailStore } from '@/stores/email-store';
import type { UseMailboxStateReturn } from './useMailboxState';

/**
 * Props for useMailboxActions hook
 */
interface UseMailboxActionsProps {
  state: UseMailboxStateReturn;
  t: {
    email: {
      messages: {
        syncTriggered: string;
        syncFailed: string;
        labelsUpdated: string;
        failedToOpenEmail: string;
      };
    };
  };
}

/**
 * Centralized action handlers for Mailbox component
 * Handles sync, cache invalidation, and common operations
 */
export function useMailboxActions({ state, t }: UseMailboxActionsProps) {
  const queryClient = useQueryClient();
  const { showSnackbar, setSyncLoading } = state;

  /**
   * Invalidate all email-related caches
   */
  const invalidateEmailCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
  }, [queryClient]);

  /**
   * Handle sync for all providers
   */
  const handleSyncProviders = useCallback(async (providers: Provider[]) => {
    if (!providers || providers.length === 0) return;

    setSyncLoading(true);
    try {
      await Promise.all(providers.map((p) => emailApi.syncProvider(p.id)));
      showSnackbar(t.email.messages.syncTriggered, 'success');
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.syncStatus() });
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    } catch {
      showSnackbar(t.email.messages.syncFailed, 'error');
    } finally {
      setSyncLoading(false);
    }
  }, [queryClient, setSyncLoading, showSnackbar, t.email.messages]);

  /**
   * Handle label changes on an email
   */
  const handleLabelsChange = useCallback(async (emailId: string, labelIds: string[], updatedEmail?: Email) => {
    if (!updatedEmail) {
      logger.warn('[Mailbox] No updated email provided - this should not happen');
      return;
    }

    logger.debug('[Mailbox] handleLabelsChange', { emailId, labelIds });

    const storeState = useEmailStore.getState();
    const selectedEmail = storeState.selectedEmail;

    // Keep selected email in sync immediately
    if (selectedEmail?.id === emailId) {
      storeState.setSelectedEmail(updatedEmail);
    }

    // Store cache for compose/reply prefill and keyboard actions
    storeState.updateEmail(emailId, updatedEmail);

    // Ensure list/detail reflect the new labels
    queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
    queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

    const threadKey = updatedEmail.threadId || emailId;
    queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadKey) });

    showSnackbar(t.email.messages.labelsUpdated, 'success');
  }, [queryClient, showSnackbar, t.email.messages.labelsUpdated]);

  /**
   * Refresh email lists
   */
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
  }, [queryClient]);

  return {
    invalidateEmailCache,
    handleSyncProviders,
    handleLabelsChange,
    handleRefresh,
  };
}

export type UseMailboxActionsReturn = ReturnType<typeof useMailboxActions>;
