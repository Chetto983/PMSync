/**
 * Email Realtime Hook
 *
 * Connects WebSocket events to TanStack Query cache invalidation.
 * When backend emits realtime events (email:new, email:update, etc.),
 * this hook invalidates relevant queries to trigger refetch.
 *
 * Best Practice: Invalidate queries instead of manual cache updates
 * @see https://tkdodo.eu/blog/using-web-sockets-with-react-query
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { websocketClient, RealtimeEmailEvent, RealtimeFolderCountsEvent } from '@/lib/websocket-client';
import { emailKeys } from '@/hooks/queries/email-keys';
import { useSyncStore } from '@/stores/sync-store';

interface UseEmailRealtimeOptions {
  /** Specific folder to watch (optional, watches all if not provided) */
  folder?: string;
  /** Whether realtime updates are enabled */
  enabled?: boolean;
}

/**
 * Hook for handling email realtime updates via WebSocket
 *
 * @example
 * ```tsx
 * function EmailList() {
 *   useEmailRealtime({ folder: 'INBOX' });
 *   const { data } = useEmails({ specialUse: 'INBOX' });
 *   // ...
 * }
 * ```
 */
export function useEmailRealtime(options: UseEmailRealtimeOptions = {}) {
  const { folder, enabled = true } = options;
  const queryClient = useQueryClient();
  const { setStatus } = useSyncStore();

  // Handler for new email events
  const handleEmailNew = useCallback(
    (event: RealtimeEmailEvent) => {
      // If folder filter is set, only invalidate if event matches
      if (folder && event.folder !== folder) {
        return;
      }

      // Invalidate list queries to show new email
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });

      // Invalidate stats for updated counts
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

      // If we have the full email object, we could prefetch the detail
      if (event.emailId) {
        // Prefetch is optional - can be enabled for faster detail loading
        // queryClient.prefetchQuery(emailDetailOptions(event.emailId));
      }
    },
    [queryClient, folder]
  );

  // Handler for email update events (read, starred, flagged, etc.)
  const handleEmailUpdate = useCallback(
    (event: RealtimeEmailEvent) => {
      if (folder && event.folder !== folder) {
        return;
      }

      // Invalidate detail if we have the ID
      if (event.emailId) {
        queryClient.invalidateQueries({
          queryKey: emailKeys.detail(event.emailId),
        });
      }

      // Invalidate list for flag changes
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });

      // Invalidate thread if threadId is provided
      if (event.threadId) {
        queryClient.invalidateQueries({
          queryKey: emailKeys.thread(event.threadId),
        });
      }

      // Stats may change for read/unread updates
      if (event.reason === 'read-status-updated') {
        queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      }
    },
    [queryClient, folder]
  );

  // Handler for email delete events
  const handleEmailDelete = useCallback(
    (event: RealtimeEmailEvent) => {
      // Remove from cache if we have the ID
      if (event.emailId) {
        queryClient.removeQueries({
          queryKey: emailKeys.detail(event.emailId),
        });
      }

      // Invalidate list to remove deleted email
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });

      // Invalidate stats for count update
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

      // Invalidate thread if provided
      if (event.threadId) {
        queryClient.invalidateQueries({
          queryKey: emailKeys.thread(event.threadId),
        });
      }
    },
    [queryClient]
  );

  // Handler for batch processed events (sync complete)
  const handleBatchProcessed = useCallback(
    (event: { providerId: string; processed: number; created?: number; syncType?: string }) => {
      // Full sync completed - invalidate everything
      queryClient.invalidateQueries({ queryKey: emailKeys.all });

      // Update sync status in store
      setStatus({
        providerId: event.providerId,
        status: 'completed',
        progress: 100,
        timestamp: new Date().toISOString(),
      });
    },
    [queryClient, setStatus]
  );

  // Handler for folder counts update
  const handleFolderCountsUpdate = useCallback(
    (event: RealtimeFolderCountsEvent) => {
      // Invalidate stats and folder-specific queries
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

      // If watching specific folder, invalidate its list
      if (folder && event.folderName === folder) {
        queryClient.invalidateQueries({ queryKey: emailKeys.byFolder(folder) });
      }
    },
    [queryClient, folder]
  );

  // Handler for thread update
  const handleThreadUpdate = useCallback(
    (event: { threadId: string; emailIds: string[] }) => {
      queryClient.invalidateQueries({
        queryKey: emailKeys.thread(event.threadId),
      });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    },
    [queryClient]
  );

  // Handler for unread count update
  const handleUnreadCountUpdate = useCallback(
    (event: { folder: string; count: number; providerId: string }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

      if (folder && event.folder === folder) {
        queryClient.invalidateQueries({ queryKey: emailKeys.byFolder(folder) });
      }
    },
    [queryClient, folder]
  );

  // CRITICAL FIX: Store handlers in refs to prevent race conditions
  // When callbacks change, we update refs instead of re-registering WebSocket handlers
  // This prevents stale closures and duplicate subscriptions
  const handlersRef = useRef({
    handleEmailNew,
    handleEmailUpdate,
    handleEmailDelete,
    handleBatchProcessed,
    handleFolderCountsUpdate,
    handleThreadUpdate,
    handleUnreadCountUpdate,
  });

  // Update refs when callbacks change (no WebSocket re-registration)
  useEffect(() => {
    handlersRef.current = {
      handleEmailNew,
      handleEmailUpdate,
      handleEmailDelete,
      handleBatchProcessed,
      handleFolderCountsUpdate,
      handleThreadUpdate,
      handleUnreadCountUpdate,
    };
  }, [
    handleEmailNew,
    handleEmailUpdate,
    handleEmailDelete,
    handleBatchProcessed,
    handleFolderCountsUpdate,
    handleThreadUpdate,
    handleUnreadCountUpdate,
  ]);

  // Register WebSocket handlers ONCE with stable wrappers
  // Wrappers delegate to current ref values, always using latest callbacks
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Subscribe with stable wrapper functions that delegate to refs
    const unsubNew = websocketClient.onEmailNew((event) =>
      handlersRef.current.handleEmailNew(event)
    );
    const unsubUpdate = websocketClient.onEmailUpdate((event) =>
      handlersRef.current.handleEmailUpdate(event)
    );
    const unsubDelete = websocketClient.onEmailDelete((event) =>
      handlersRef.current.handleEmailDelete(event)
    );
    const unsubBatch = websocketClient.onEmailBatchProcessed((event) =>
      handlersRef.current.handleBatchProcessed(event)
    );
    const unsubFolderCounts = websocketClient.onFolderCountsUpdate((event) =>
      handlersRef.current.handleFolderCountsUpdate(event)
    );
    const unsubThread = websocketClient.onThreadUpdate((event) =>
      handlersRef.current.handleThreadUpdate(event)
    );
    const unsubUnread = websocketClient.onUnreadCountUpdate((event) =>
      handlersRef.current.handleUnreadCountUpdate(event)
    );

    // Cleanup subscriptions on unmount or when disabled
    return () => {
      unsubNew();
      unsubUpdate();
      unsubDelete();
      unsubBatch();
      unsubFolderCounts();
      unsubThread();
      unsubUnread();
    };
  }, [enabled]); // Only re-register when enabled changes

  // Note: isConnected is a snapshot at render time, not reactive.
  // For reactive connection state, use useWebSocket hook instead.
  return {
    isConnected: websocketClient.isConnected(),
  };
}

export default useEmailRealtime;
