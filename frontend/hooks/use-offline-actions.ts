import { useEffect } from 'react';
import { getAllActions, removeAction, isExpired } from '@/lib/offline-action-queue';
import { useOfflineQueueStore } from '@/stores/offline-queue-store';
import { emailsApi } from '@/lib/api/emails';
import { getGlobalToast, getGlobalTranslations } from '@/lib/context/toast-context';
import { getQueryClient } from '@/lib/query-client';
import { emailKeys } from '@/hooks/queries/email-keys';
import { folderKeys } from '@/hooks/queries/use-folders';
import { labelKeys } from '@/hooks/queries/use-labels';
import type { UpdateEmailDto } from '@/lib/api/emails';

let replayLock = false;

export async function replayQueuedActions(): Promise<void> {
  // Prevent double-replay from online event + SW sync firing simultaneously
  if (replayLock) return;
  replayLock = true;

  try {
    const actions = await getAllActions();
    if (actions.length === 0) return;

    const expired = actions.filter(isExpired);
    const valid = actions.filter((a) => !isExpired(a));
    const t = getGlobalTranslations();

    // Discard expired actions (SYNC-03)
    if (expired.length > 0) {
      for (const action of expired) {
        await removeAction(action.id);
      }
      const msg = t.offlineQueue?.expiredActions?.replace('{count}', String(expired.length))
        || `${expired.length} offline action(s) expired and were discarded.`;
      getGlobalToast().warning(msg);
    }

    if (valid.length === 0) {
      useOfflineQueueStore.getState().setPendingCount(0);
      // Still invalidate to sync UI with server after expiry
      invalidateEmailQueries();
      return;
    }

    // Show replay started toast
    const startMsg = t.offlineQueue?.replayStarted?.replace('{count}', String(valid.length))
      || `Syncing ${valid.length} queued action(s)...`;
    getGlobalToast().info(startMsg);

    // Replay valid actions sequentially (order matters)
    let successCount = 0;
    for (const action of valid) {
      try {
        if (action.type === 'update-email') {
          await emailsApi.updateEmail(action.emailId, action.dto as UpdateEmailDto);
        }
        await removeAction(action.id);
        successCount++;
      } catch (err) {
        // Stop on first failure -- will retry on next online event
        console.warn('[OfflineQueue] Replay failed, will retry:', err);
        break;
      }
    }

    // Update store count
    const remaining = await getAllActions();
    useOfflineQueueStore.getState().setPendingCount(remaining.length);

    // Show result toast
    if (successCount === valid.length) {
      const successMsg = t.offlineQueue?.replaySuccess?.replace('{count}', String(successCount))
        || `${successCount} offline action(s) synced successfully.`;
      getGlobalToast().success(successMsg);
    } else if (successCount > 0) {
      const partialMsg = t.offlineQueue?.replayPartialFailure
        || 'Some actions could not be synced. They will retry on next connection.';
      getGlobalToast().warning(partialMsg);
    }

    // Refresh email data after replay
    invalidateEmailQueries();
  } finally {
    replayLock = false;
  }
}

function invalidateEmailQueries(): void {
  const queryClient = getQueryClient();
  queryClient.invalidateQueries({ queryKey: emailKeys.list() });
  queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
  queryClient.invalidateQueries({ queryKey: folderKeys.list() });
  queryClient.invalidateQueries({ queryKey: labelKeys.list() });
}

/**
 * Hook that wires up online event + SW message listeners for automatic replay.
 * Mount once in Layout or App component.
 */
export function useOfflineActions(): void {
  useEffect(() => {
    const handleOnline = () => {
      void replayQueuedActions();
    };

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'replay-email-actions') {
        void replayQueuedActions();
      }
    };

    window.addEventListener('online', handleOnline);
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    // On mount, sync the store with actual queue state
    void getAllActions().then((actions) => {
      useOfflineQueueStore.getState().setPendingCount(actions.length);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, []);
}

// Export for testing
export function _resetReplayLock(): void {
  replayLock = false;
}
