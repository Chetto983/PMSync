import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { emailApi } from '@/lib/api/email';
import { emailKeys } from '@/hooks/queries';
import { logger } from '@/lib/logger';
import type { Provider } from '@/lib/api/folders';
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
   * Handle label changes on an email - invalidates caches after API mutation completes
   * Note: The actual API call is made by ThreadDisplay using mutations
   */
  const handleLabelsChange = useCallback(async (emailId: string, labelIds: string[]) => {
    logger.debug('[Mailbox] handleLabelsChange - invalidating caches', { emailId, labelIds });

    // Invalidate caches to reflect label changes
    queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
    queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

    // Also invalidate thread if we know the thread ID
    const storeState = useEmailStore.getState();
    const selectedEmail = storeState.selectedEmail;
    if (selectedEmail?.id === emailId && selectedEmail.threadId) {
      queryClient.invalidateQueries({ queryKey: emailKeys.thread(selectedEmail.threadId) });
    }
  }, [queryClient]);

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
