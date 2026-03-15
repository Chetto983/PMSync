/**
 * Email Realtime Hook
 *
 * Connects WebSocket events to TanStack Query cache invalidation.
 * When backend emits realtime events (email:new, email:update, etc.),
 * this hook invalidates relevant queries to trigger refetch.
 *
 * RATE LIMIT FIX: All list/stats invalidations are debounced to prevent
 * burst events (batch processed + folder counts + unread count) from
 * triggering N parallel refetches that 429 the backend.
 *
 * @see https://tkdodo.eu/blog/using-web-sockets-with-react-query
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { websocketClient, RealtimeEmailEvent, RealtimeFolderCountsEvent } from '@/lib/websocket-client';
import { emailKeys } from '@/hooks/queries/email-keys';
import { folderKeys } from '@/hooks/queries/use-folders';
import { labelKeys } from '@/hooks/queries/use-labels';
import { useSyncStore } from '@/stores/sync-store';

interface UseEmailRealtimeOptions {
  /** Specific folder to watch (optional, watches all if not provided) */
  folder?: string;
  /** Whether realtime updates are enabled */
  enabled?: boolean;
}

/**
 * Debounced invalidation helper.
 * Collects invalidation requests and fires them once after a quiet period.
 * Prevents Socket.IO event bursts from triggering N parallel refetches.
 */
function createDebouncedInvalidator(delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingKeys = new Set<string>();

  return {
    /**
     * Schedule an invalidation. Multiple calls within `delayMs` are coalesced.
     * @param tag - A string tag identifying the invalidation group (e.g. 'list', 'stats')
     */
    schedule(tag: string) {
      pendingKeys.add(tag);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const keys = new Set(pendingKeys);
        pendingKeys.clear();
        timer = null;
        // Return keys so the caller can execute invalidation
        this._flush?.(keys);
      }, delayMs);
    },
    _flush: null as ((keys: Set<string>) => void) | null,
    /** Register the flush callback that actually invalidates queries */
    onFlush(fn: (keys: Set<string>) => void) {
      this._flush = fn;
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingKeys.clear();
    },
  };
}

function executeInvalidations(
  queryClient: QueryClient,
  keys: Set<string>,
  folder?: string,
  providerId?: string,
) {
  if (keys.has('all')) {
    queryClient.invalidateQueries({ queryKey: emailKeys.all });
  } else if (keys.has('list')) {
    queryClient.invalidateQueries({ queryKey: emailKeys.list() });
  }
  if (keys.has('stats')) {
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
  }
  if (keys.has('folders')) {
    queryClient.invalidateQueries({ queryKey: folderKeys.lists() });
  }
  if (keys.has('labels')) {
    queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
  }
  if (keys.has('threads')) {
    queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
  }
  if (keys.has('folder-specific') && folder) {
    queryClient.invalidateQueries({ queryKey: emailKeys.byFolder(folder) });
  }
  if (keys.has('provider-folders') && providerId) {
    queryClient.invalidateQueries({ queryKey: folderKeys.byProvider(providerId) });
  }
  // Dynamic keys: thread:{id} and detail:{id} — coalesced by debouncer
  for (const key of keys) {
    if (key.startsWith('thread:')) {
      const id = key.slice(7);
      queryClient.invalidateQueries({ queryKey: emailKeys.thread(id) });
    } else if (key.startsWith('detail:')) {
      const id = key.slice(7);
      queryClient.invalidateQueries({ queryKey: emailKeys.detail(id) });
    }
  }
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

  // Debounced invalidator - coalesces burst events into a single invalidation
  const invalidatorRef = useRef(createDebouncedInvalidator(500));
  const folderRef = useRef(folder);
  const providerIdRef = useRef<string | undefined>(undefined);

  // Keep refs updated
  useEffect(() => { folderRef.current = folder; }, [folder]);

  // Wire up the flush callback to use current queryClient
  useEffect(() => {
    invalidatorRef.current.onFlush((keys) => {
      executeInvalidations(queryClient, keys, folderRef.current, providerIdRef.current);
    });
  }, [queryClient]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    const inv = invalidatorRef.current;
    return () => inv.clear();
  }, []);

  /** Schedule debounced list+stats+folders invalidation (most common pattern) */
  const invalidateListAndStats = useCallback(() => {
    const inv = invalidatorRef.current;
    inv.schedule('list');
    inv.schedule('stats');
    inv.schedule('folders');
  }, []);

  // Handler for new email events
  const handleEmailNew = useCallback(
    (event: RealtimeEmailEvent) => {
      if (folder && event.folder !== folder) {
        return;
      }
      invalidateListAndStats();
    },
    [folder, invalidateListAndStats]
  );

  // Handler for email update events (read, starred, flagged, etc.)
  // ALL invalidations go through the debouncer to prevent 429 storms during sync
  const handleEmailUpdate = useCallback(
    (event: RealtimeEmailEvent) => {
      const inv = invalidatorRef.current;

      // Debounced detail + thread invalidations (coalesced by ID)
      if (event.emailId) {
        inv.schedule(`detail:${event.emailId}`);
        inv.schedule(`thread:${event.emailId}`);
      }
      if (event.threadId && event.threadId !== event.emailId) {
        inv.schedule(`thread:${event.threadId}`);
      }

      // For read/starred/flagged updates, always invalidate list and stats
      if (
        event.reason === 'read-status-updated' ||
        event.reason === 'starred-updated' ||
        event.reason === 'flagged-updated'
      ) {
        invalidateListAndStats();
        return;
      }

      if (event.reason === 'labels-updated') {
        inv.schedule('labels');
        if (!folder || !event.folder || event.folder === folder) {
          inv.schedule('list');
        }
        return;
      }

      // For other updates (labels, folder move), only invalidate if folder matches
      if (folder && event.folder && event.folder !== folder) {
        return;
      }

      inv.schedule('list');
    },
    [folder, invalidateListAndStats]
  );

  // Handler for email delete events
  const handleEmailDelete = useCallback(
    (event: RealtimeEmailEvent) => {
      // Remove detail from cache immediately (it's gone)
      if (event.emailId) {
        queryClient.removeQueries({
          queryKey: emailKeys.detail(event.emailId),
        });
      }

      invalidateListAndStats();

      // Debounce thread invalidation — multiple deletes in a batch shouldn't flood
      if (event.threadId) {
        invalidatorRef.current.schedule(`thread:${event.threadId}`);
      }
    },
    [queryClient, invalidateListAndStats]
  );

  // Handler for batch processed events (sync complete)
  const handleBatchProcessed = useCallback(
    (event: { providerId: string; processed: number; created?: number; syncType?: string }) => {
      // Full sync completed - invalidate all email queries (debounced)
      const inv = invalidatorRef.current;
      inv.schedule('all');
      inv.schedule('folders');
      if (event.providerId) {
        providerIdRef.current = event.providerId;
        inv.schedule('provider-folders');
      }

      setStatus({
        providerId: event.providerId,
        status: 'completed',
        progress: 100,
        timestamp: new Date().toISOString(),
      });
    },
    [setStatus]
  );

  // Handler for folder counts update
  const handleFolderCountsUpdate = useCallback(
    (event: RealtimeFolderCountsEvent) => {
      const inv = invalidatorRef.current;
      inv.schedule('stats');
      inv.schedule('folders');

      if (folder && event.folderName === folder) {
        inv.schedule('folder-specific');
      }
    },
    [folder]
  );

  // Handler for thread update
  const handleThreadUpdate = useCallback(
    (event: { threadId: string; emailIds: string[] }) => {
      queryClient.invalidateQueries({
        queryKey: emailKeys.thread(event.threadId),
      });
      invalidatorRef.current.schedule('threads');
    },
    [queryClient]
  );

  // Handler for unread count update
  const handleUnreadCountUpdate = useCallback(
    (event: { folder: string; count: number; providerId: string }) => {
      const inv = invalidatorRef.current;
      inv.schedule('stats');
      inv.schedule('folders');

      if (event.providerId) {
        providerIdRef.current = event.providerId;
        inv.schedule('provider-folders');
      }

      if (folder && event.folder === folder) {
        inv.schedule('folder-specific');
      }
    },
    [folder]
  );

  // CRITICAL FIX: Store handlers in refs to prevent race conditions
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
  useEffect(() => {
    if (!enabled) {
      return;
    }

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

    return () => {
      unsubNew();
      unsubUpdate();
      unsubDelete();
      unsubBatch();
      unsubFolderCounts();
      unsubThread();
      unsubUnread();
    };
  }, [enabled]);

  return {
    isConnected: websocketClient.isConnected(),
  };
}

export default useEmailRealtime;
