import { useEffect, useRef, useCallback, useState } from 'react';
import { debounce } from 'lodash-es';
import { websocketClient } from '@/lib/websocket-client';
import { useEmailStore } from '@/stores/email-store';
import { useCalendarStore } from '@/stores/calendar-store';
import { useContactStore } from '@/stores/contact-store';
import { useLabelStore } from '@/stores/label-store';
import { useFoldersStore } from '@/stores/folders-store';
import { useSyncStore } from '@/stores/sync-store';
import { emailApi } from '@/lib/api/email';
import { logger } from '@/lib/logger';

/**
 * Helper function to retry failed operations with exponential backoff
 */
const fetchWithRetry = async <T,>(
  fn: () => Promise<T>,
  retries = 2,
  delay = 1000
): Promise<T | null> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) {
        logger.error('[fetchWithRetry] All retries exhausted', { error });
        return null;
      }
      logger.warn(`[fetchWithRetry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
    }
  }
  return null;
};

/**
 * Hook per gestire la connessione WebSocket e gli eventi realtime
 *
 * Caratteristiche:
 * - Connessione automatica con JWT
 * - Disconnessione automatica al unmount
 * - Event listeners per Email, Calendar, Contacts
 * - Aggiornamento automatico degli store globali
 *
 * @param token - JWT token per autenticazione
 * @param enabled - Abilita/disabilita la connessione (default: true)
 */
export function useWebSocket(token: string | null, enabled = true) {
  const isConnectedRef = useRef(false);
  const cleanupRef = useRef<(() => void)[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'auth_failed'>('disconnected');

  // Store actions
  const { addEmail, updateEmail, deleteEmail, setUnreadCount, updateThread } = useEmailStore();
  const { addEvent, updateEvent, deleteEvent } = useCalendarStore();
  const { addContact, updateContact, deleteContact } = useContactStore();
  const { handleLabelCreated, handleLabelUpdated, handleLabelDeleted } = useLabelStore();
  const {
    updateFolderCounts,
    upsertFolder,
    renameFolder,
    deleteFolder,
  } = useFoldersStore();
  const { setStatus: setSyncStatus } = useSyncStore();

  /**
   * Connetti al WebSocket
   * Relies on socket.io's built-in reconnection - no manual backoff needed
   */
  const connect = useCallback(async () => {
    if (!token || !enabled || isConnectedRef.current) return;

    try {
      logger.debug('[useWebSocket] Connecting...');
      setConnectionStatus('connecting');

      // Register auth failure handler before connecting
      const unsubAuthFailure = websocketClient.onAuthFailure(() => {
        logger.error('[useWebSocket] Auth failure - token may be expired');
        isConnectedRef.current = false;
        setConnectionStatus('auth_failed');
        // Emit event for app to handle (e.g., logout, refresh token)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('websocket:auth_failed'));
        }
      });
      cleanupRef.current.push(unsubAuthFailure);

      // Register reconnect handler
      const unsubReconnect = websocketClient.onReconnect(() => {
        logger.debug('[useWebSocket] Reconnected successfully');
        setConnectionStatus('connected');
        // Emit event for app to refresh data if needed
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('websocket:reconnected'));
        }
      });
      cleanupRef.current.push(unsubReconnect);

      // Listen for disconnect to update status (socket.io handles reconnection)
      const unsubClose = websocketClient.onClose(() => {
        logger.debug('[useWebSocket] Disconnected - socket.io will handle reconnection');
        setConnectionStatus('disconnected');
      });
      cleanupRef.current.push(unsubClose);

      await websocketClient.connect(token);
      isConnectedRef.current = true;
      setConnectionStatus('connected');

      logger.debug('[useWebSocket] Connected successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[useWebSocket] Connection failed', { message });
      isConnectedRef.current = false;

      // Check if auth failure
      if (message.includes('Authentication failed')) {
        setConnectionStatus('auth_failed');
      } else {
        setConnectionStatus('disconnected');
      }
    }
  }, [token, enabled]);

  /**
   * Disconnetti dal WebSocket
   */
  const disconnect = useCallback(() => {
    // Run all cleanup handlers
    cleanupRef.current.forEach(cleanup => cleanup());
    cleanupRef.current = [];

    if (isConnectedRef.current) {
      websocketClient.disconnect();
      isConnectedRef.current = false;
      logger.debug('[useWebSocket] Disconnected');
    }
    setConnectionStatus('disconnected');
  }, []);

  /**
   * Setup connection
   */
  useEffect(() => {
    if (!token || !enabled) return;

    // Connect asynchronously to avoid sync setState in effect (eslint react-hooks/set-state-in-effect)
    // queueMicrotask schedules the connect call after the current synchronous block
    queueMicrotask(() => {
      connect();
    });

    // Cleanup on unmount
    return () => {
      logger.debug('[useWebSocket] Cleaning up connection...');
      disconnect();
    };
  }, [token, enabled, connect, disconnect]);

  /**
   * Setup event listeners - Register BEFORE connection is established
   * to avoid race condition where early events are lost.
   * Listeners are registered when token is available, not when connected.
   */
  useEffect(() => {
    // Register listeners as soon as token is available, BEFORE connection
    // This prevents race condition where events fire before listeners are ready
    if (!token || !enabled) {
      return;
    }

    logger.debug('[useWebSocket] Registering event listeners (before/during connection)...');

    interface FolderRefreshDetail {
      type: 'created' | 'renamed' | 'deleted';
      payload: {
        folderId: string;
        providerId: string;
        folderName: string;
        folderPath: string;
      };
    }
    const emitFolderRefresh = debounce((detail?: FolderRefreshDetail) => {
      if (detail?.type === 'created') {
        upsertFolder({
          id: detail.payload.folderId,
          providerId: detail.payload.providerId,
          name: detail.payload.folderName,
          path: detail.payload.folderPath,
        });
      } else if (detail?.type === 'renamed') {
        renameFolder(detail.payload.folderId, detail.payload.folderName);
      } else if (detail?.type === 'deleted') {
        deleteFolder(detail.payload.folderId);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('folders:refresh', { detail }));
      }
    }, 300);

    // EMAIL EVENTS - with error recovery
    const unsubEmailNew = websocketClient.onEmailNew(async (data) => {
      logger.debug('[WS] Email new', { emailId: data.emailId });
      try {
        if (data.email) {
          addEmail(data.email);
        } else if (data.emailId) {
          // Fallback: fetch from API if email data not included
          const response = await fetchWithRetry(() => emailApi.getEmail(data.emailId!));
          if (response?.data) {
            addEmail(response.data);
          }
        }
      } catch (error) {
        logger.error('[WS] Error processing email new event', { error });
        // Attempt to fetch fresh data from API
        if (data.emailId) {
          const response = await fetchWithRetry(() => emailApi.getEmail(data.emailId!));
          if (response?.data) {
            addEmail(response.data);
          }
        }
      }
    });

    const unsubEmailUpdate = websocketClient.onEmailUpdate(async (data) => {
      logger.debug('[WS] Email update', { emailId: data.emailId });
      try {
        // Handle complete email object from backend
        if (data.email) {
          // Replace the entire email with the updated version from backend
          updateEmail(data.emailId || data.email.id, data.email);
        } else if (data.emailId) {
          // Fallback: fetch from API if email data not included
          const response = await fetchWithRetry(() => emailApi.getEmail(data.emailId!));
          if (response?.data) {
            updateEmail(data.emailId, response.data);
          }
        }
      } catch (error) {
        logger.error('[WS] Error processing email update event', { error });
        // Attempt to fetch fresh data from API
        const emailId = data.emailId || data.email?.id;
        if (emailId) {
          const response = await fetchWithRetry(() => emailApi.getEmail(emailId));
          if (response?.data) {
            updateEmail(emailId, response.data);
          }
        }
      }
    });

    const unsubEmailDelete = websocketClient.onEmailDelete((data) => {
      logger.debug('[WS] Email delete', { emailId: data.emailId });
      try {
        if (data.emailId) {
          deleteEmail(data.emailId);
        }
      } catch (error) {
        logger.error('[WS] Error processing email delete event', { error });
        // Delete operations are idempotent - no fallback needed
      }
    });

    const unsubUnreadCount = websocketClient.onUnreadCountUpdate((data) => {
      logger.debug('[WS] Unread count update', { count: data.count });
      try {
        setUnreadCount(data.count);
      } catch (error) {
        logger.error('[WS] Error processing unread count update', { error });
      }
    });

    const unsubFolderCounts = websocketClient.onFolderCountsUpdate((data) => {
      logger.debug('[WS] Folder counts update', { providerId: data.providerId, folderId: data.folderId });
      try {
        updateFolderCounts(data.providerId, data.folderId, {
          totalCount: data.totalCount,
          unreadCount: data.unreadCount,
          folderName: data.folderName,
        });
      } catch (error) {
        logger.error('[WS] Error processing folder counts update', { error });
      }
    });

    // FOLDER EVENTS - trigger global refresh for sidebar
    const unsubFolderCreated = websocketClient.onFolderCreated((data) => {
      logger.debug('[WS] Folder created', { folderId: data.folderId });
      emitFolderRefresh({ type: 'created', payload: { folderId: data.folderId, providerId: data.providerId, folderName: data.folderName, folderPath: data.folderPath } });
    });
    const unsubFolderRenamed = websocketClient.onFolderRenamed((data) => {
      logger.debug('[WS] Folder renamed', { folderId: data.folderId });
      emitFolderRefresh({ type: 'renamed', payload: { folderId: data.folderId, providerId: data.providerId, folderName: data.folderName, folderPath: data.folderPath } });
    });
    const unsubFolderDeleted = websocketClient.onFolderDeleted((data) => {
      logger.debug('[WS] Folder deleted', { folderId: data.folderId });
      emitFolderRefresh({ type: 'deleted', payload: { folderId: data.folderId, providerId: data.providerId, folderName: data.folderName, folderPath: data.folderPath } });
    });

    const emitAiEvent = (type: string, payload: unknown) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ai:event', { detail: { type, payload } }));
      }
    };

    const unsubAiActionCreated = websocketClient.onAiActionCreated((data) => {
      logger.debug('[WS] AI action created', { actionId: data.actionId });
      emitAiEvent('action:created', data);
    });
    const unsubAiActionApproved = websocketClient.onAiActionApproved((data) => {
      logger.debug('[WS] AI action approved', { actionId: data.actionId });
      emitAiEvent('action:approved', data);
    });
    const unsubAiActionRejected = websocketClient.onAiActionRejected((data) => {
      logger.debug('[WS] AI action rejected', { actionId: data.actionId });
      emitAiEvent('action:rejected', data);
    });
    const unsubAiActionExecuted = websocketClient.onAiActionExecuted((data) => {
      logger.debug('[WS] AI action executed', { actionId: data.actionId });
      emitAiEvent('action:executed', data);
    });
    const unsubAiActionFailed = websocketClient.onAiActionFailed((data) => {
      logger.debug('[WS] AI action failed', { actionId: data.actionId });
      emitAiEvent('action:failed', data);
    });
    const unsubAiSessionUpdate = websocketClient.onAiSessionUpdate((data) => {
      logger.debug('[WS] AI session update', { sessionId: data.sessionId });
      emitAiEvent('session:update', data);
    });

    const unsubThreadUpdate = websocketClient.onThreadUpdate((data) => {
      logger.debug('[WS] Thread update', { threadId: data.threadId });
      try {
        if (data.threadId && data.emailIds) {
          updateThread(data.threadId, data.emailIds);
        }
      } catch (error) {
        logger.error('[WS] Error processing thread update', { error });
      }
    });

    const unsubBatchProcessed = websocketClient.onEmailBatchProcessed((data) => {
      logger.debug('[WS] Email batch processed', { providerId: data.providerId });
      try {
        // Update sync status with batch info
        setSyncStatus({
          providerId: data.providerId,
          status: 'completed',
          progress: 100,
          timestamp: data.timestamp,
        });
      } catch (error) {
        logger.error('[WS] Error processing batch processed event', { error });
      }
    });

    // CALENDAR EVENTS - with error recovery
    const unsubCalendarNew = websocketClient.onCalendarEventNew((data) => {
      logger.debug('[WS] Calendar event new', { eventId: data.event?.id });
      try {
        if (data.event) {
          addEvent(data.event);
        }
      } catch (error) {
        logger.error('[WS] Error processing calendar event new', { error });
      }
    });

    const unsubCalendarUpdate = websocketClient.onCalendarEventUpdate((data) => {
      logger.debug('[WS] Calendar event update', { eventId: data.eventId });
      try {
        if (data.eventId && data.updates) {
          updateEvent(data.eventId, data.updates);
        }
      } catch (error) {
        logger.error('[WS] Error processing calendar event update', { error });
      }
    });

    const unsubCalendarDelete = websocketClient.onCalendarEventDelete((data) => {
      logger.debug('[WS] Calendar event delete', { eventId: data.eventId });
      try {
        if (data.eventId) {
          deleteEvent(data.eventId);
        }
      } catch (error) {
        logger.error('[WS] Error processing calendar event delete', { error });
      }
    });

    // CALENDAR LIST EVENTS - refresh calendars list in UI
    const unsubCalendarListUpdate = websocketClient.onCalendarListUpdate((data) => {
      logger.debug('[WS] Calendar list update', { calendarId: data.calendarId, reason: data.reason });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('calendars:refresh', { detail: data }));
      }
    });

    // CONTACT EVENTS - with error recovery
    const unsubContactNew = websocketClient.onContactNew((data) => {
      logger.debug('[WS] Contact new', { contactId: data.contact?.id });
      try {
        if (data.contact) {
          addContact(data.contact);
        }
      } catch (error) {
        logger.error('[WS] Error processing contact new', { error });
      }
    });

    const unsubContactUpdate = websocketClient.onContactUpdate((data) => {
      logger.debug('[WS] Contact update', { contactId: data.contactId });
      try {
        if (data.contactId && data.updates) {
          updateContact(data.contactId, data.updates);
        }
      } catch (error) {
        logger.error('[WS] Error processing contact update', { error });
      }
    });

    const unsubContactDelete = websocketClient.onContactDelete((data) => {
      logger.debug('[WS] Contact delete', { contactId: data.contactId });
      try {
        if (data.contactId) {
          deleteContact(data.contactId);
        }
      } catch (error) {
        logger.error('[WS] Error processing contact delete', { error });
      }
    });

    // LABEL EVENTS - with error recovery
    const unsubLabelNew = websocketClient.onLabelNew((data) => {
      logger.debug('[WS] Label new', { labelId: data.label?.id });
      try {
        if (data.label) {
          handleLabelCreated(data.label);
        }
      } catch (error) {
        logger.error('[WS] Error processing label new', { error });
      }
    });

    const unsubLabelUpdate = websocketClient.onLabelUpdate((data) => {
      logger.debug('[WS] Label update', { labelId: data.label?.id });
      try {
        if (data.label) {
          handleLabelUpdated(data.label);
        }
      } catch (error) {
        logger.error('[WS] Error processing label update', { error });
      }
    });

    const unsubLabelDelete = websocketClient.onLabelDelete((data) => {
      logger.debug('[WS] Label delete', { labelId: data.labelId });
      try {
        if (data.labelId) {
          handleLabelDeleted(data.labelId);
        }
      } catch (error) {
        logger.error('[WS] Error processing label delete', { error });
      }
    });

    // SYNC STATUS - with error recovery
    const unsubSyncStatus = websocketClient.onSyncStatus((data) => {
      logger.debug('[WS] Sync status', { providerId: data.providerId, status: data.status });
      try {
        setSyncStatus({
          providerId: data.providerId,
          status: data.status,
          progress: data.progress,
          error: data.error,
          timestamp: data.timestamp || new Date().toISOString(),
        });
      } catch (error) {
        logger.error('[WS] Error processing sync status', { error });
      }
    });

    logger.debug('[useWebSocket] All event listeners registered successfully');

    // Cleanup on unmount or when connection drops
    return () => {
      logger.debug('[useWebSocket] Cleaning up event listeners...');
      unsubEmailNew();
      unsubEmailUpdate();
      unsubEmailDelete();
      unsubUnreadCount();
      unsubFolderCounts();
      unsubFolderCreated();
      unsubFolderRenamed();
      unsubFolderDeleted();
      unsubAiActionCreated();
      unsubAiActionApproved();
      unsubAiActionRejected();
      unsubAiActionExecuted();
      unsubAiActionFailed();
      unsubAiSessionUpdate();
      unsubThreadUpdate();
      unsubBatchProcessed();
      unsubCalendarNew();
      unsubCalendarUpdate();
      unsubCalendarDelete();
      unsubCalendarListUpdate();
      unsubContactNew();
      unsubContactUpdate();
      unsubContactDelete();
      unsubLabelNew();
      unsubLabelUpdate();
      unsubLabelDelete();
      unsubSyncStatus();
      // Note: folder unsubscriptions already called above (lines 476-478)
    };
  }, [
    // Note: connectionStatus removed - listeners registered once when token available
    // This fixes both race condition (P0) and memory leak from re-registration (P1)
    addEmail,
    updateEmail,
    deleteEmail,
    setUnreadCount,
    updateThread,
    addEvent,
    updateEvent,
    deleteEvent,
    addContact,
    updateContact,
    deleteContact,
    handleLabelCreated,
    handleLabelUpdated,
    handleLabelDeleted,
    updateFolderCounts,
    upsertFolder,
    renameFolder,
    deleteFolder,
    setSyncStatus,
    // AI event dispatchers are local to the effect
    token,
    enabled,
  ]);

  return {
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    connect,
    disconnect,
    ping: typeof window !== 'undefined' ? websocketClient.ping.bind(websocketClient) : () => {},
    joinRoom: typeof window !== 'undefined' ? websocketClient.joinRoom.bind(websocketClient) : () => {},
    leaveRoom: typeof window !== 'undefined' ? websocketClient.leaveRoom.bind(websocketClient) : () => {},
  };
}
