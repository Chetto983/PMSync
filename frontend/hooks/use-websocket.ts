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
        console.error('[fetchWithRetry] All retries exhausted:', error);
        return null;
      }
      console.warn(`[fetchWithRetry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
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
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsCleanupRef = useRef<(() => void) | null>(null);
  const retryAttemptRef = useRef(0);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Store actions
  const { addEmail, updateEmail, deleteEmail, setUnreadCount, updateThread } = useEmailStore();
  const { addEvent, updateEvent, deleteEvent } = useCalendarStore();
  const { addContact, updateContact, deleteContact } = useContactStore();
  const { handleLabelCreated, handleLabelUpdated, handleLabelDeleted } = useLabelStore();
  const { updateFolderCounts } = useFoldersStore();
  const { setStatus: setSyncStatus } = useSyncStore();

  /**
   * Connetti al WebSocket
   */
  const connect = useCallback(async function connectWithBackoff() {
    if (!token || !enabled || isConnectedRef.current) return;

    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[useWebSocket] Connecting...');
      }
      setConnectionStatus('connecting');
      await websocketClient.connect(token);
      isConnectedRef.current = true;
      retryAttemptRef.current = 0;
      setConnectionStatus('connected');
      if (process.env.NODE_ENV !== 'production') {
        console.log('[useWebSocket] Connected successfully, connectionStatus set to: connected');
      }

      // Listen for low-level close/error to flip status promptly
      const handleCloseOrError = () => {
        isConnectedRef.current = false;
        setConnectionStatus('disconnected');
        if (process.env.NODE_ENV !== 'production') {
          console.log('[useWebSocket] Socket closed/error - scheduling reconnect');
        }
        connectWithBackoff();
      };
      websocketClient.onClose(handleCloseOrError);
      websocketClient.onError(handleCloseOrError);
      wsCleanupRef.current = () => {
        websocketClient.offClose(handleCloseOrError);
        websocketClient.offError(handleCloseOrError);
      };
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[useWebSocket] Connection failed:', error);
      }
      isConnectedRef.current = false;
      setConnectionStatus('disconnected');

      // Basic exponential backoff for reconnect attempts
      const nextDelay = Math.min(1000 * 2 ** retryAttemptRef.current, 30000);
      retryAttemptRef.current += 1;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      retryTimeoutRef.current = setTimeout(() => {
        connectWithBackoff();
      }, nextDelay);
    }
  }, [token, enabled]);

  /**
   * Disconnetti dal WebSocket
   */
  const disconnect = useCallback(() => {
    if (isConnectedRef.current) {
      websocketClient.disconnect();
      isConnectedRef.current = false;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[useWebSocket] Disconnected');
      }
    }
    setConnectionStatus('disconnected');
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (wsCleanupRef.current) {
      wsCleanupRef.current();
      wsCleanupRef.current = null;
    }
  }, []);

  /**
   * Setup connection
   */
  useEffect(() => {
    if (!token || !enabled) return;

    // Connect
    connect();

    // Cleanup on unmount
    return () => {
      console.log('[useWebSocket] Cleaning up connection...');
      disconnect();
    };
  }, [token, enabled, connect, disconnect]);

  /**
   * Setup event listeners - Only register AFTER connection is established
   */
  useEffect(() => {
    // CRITICAL: Only register listeners when WebSocket is connected
    if (!token || !enabled || connectionStatus !== 'connected') {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[useWebSocket] Registering event listeners...');
    }

    const emitFolderRefresh = debounce((detail?: { type: 'created' | 'renamed' | 'deleted'; payload: any }) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('folders:refresh', { detail }));
      }
    }, 300);

    // EMAIL EVENTS - with error recovery
    const unsubEmailNew = websocketClient.onEmailNew(async (data) => {
      console.log('[WS] Email new:', data);
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
        console.error('[WS] Error processing email new event:', error);
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
      console.log('[WS] Email update:', data);
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
        console.error('[WS] Error processing email update event:', error);
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
      console.log('[WS] Email delete:', data);
      try {
        if (data.emailId) {
          deleteEmail(data.emailId);
        }
      } catch (error) {
        console.error('[WS] Error processing email delete event:', error);
        // Delete operations are idempotent - no fallback needed
      }
    });

    const unsubUnreadCount = websocketClient.onUnreadCountUpdate((data) => {
      console.log('[WS] Unread count update:', data);
      try {
        setUnreadCount(data.count);
      } catch (error) {
        console.error('[WS] Error processing unread count update:', error);
      }
    });

    const unsubFolderCounts = websocketClient.onFolderCountsUpdate((data) => {
      console.log('[WS] Folder counts update:', data);
      try {
        updateFolderCounts(data.providerId, data.folderId, {
          totalCount: data.totalCount,
          unreadCount: data.unreadCount,
          folderName: data.folderName,
        });
      } catch (error) {
        console.error('[WS] Error processing folder counts update:', error);
      }
    });

    // FOLDER EVENTS - trigger global refresh for sidebar
    const unsubFolderCreated = websocketClient.onFolderCreated((data) => {
      console.log('[WS] Folder created:', data);
      emitFolderRefresh({ type: 'created', payload: data });
    });
    const unsubFolderRenamed = websocketClient.onFolderRenamed((data) => {
      console.log('[WS] Folder renamed:', data);
      emitFolderRefresh({ type: 'renamed', payload: data });
    });
    const unsubFolderDeleted = websocketClient.onFolderDeleted((data) => {
      console.log('[WS] Folder deleted:', data);
      emitFolderRefresh({ type: 'deleted', payload: data });
    });

    const unsubThreadUpdate = websocketClient.onThreadUpdate((data) => {
      console.log('[WS] Thread update:', data);
      try {
        if (data.threadId && data.emailIds) {
          updateThread(data.threadId, data.emailIds);
        }
      } catch (error) {
        console.error('[WS] Error processing thread update:', error);
      }
    });

    const unsubBatchProcessed = websocketClient.onEmailBatchProcessed((data) => {
      console.log('[WS] Email batch processed:', data);
      try {
        // Update sync status with batch info
        setSyncStatus({
          providerId: data.providerId,
          status: 'completed',
          progress: 100,
          timestamp: data.timestamp,
        });
      } catch (error) {
        console.error('[WS] Error processing batch processed event:', error);
      }
    });

    // CALENDAR EVENTS - with error recovery
    const unsubCalendarNew = websocketClient.onCalendarEventNew((data) => {
      console.log('[WS] Calendar event new:', data);
      try {
        if (data.event) {
          addEvent(data.event);
        }
      } catch (error) {
        console.error('[WS] Error processing calendar event new:', error);
      }
    });

    const unsubCalendarUpdate = websocketClient.onCalendarEventUpdate((data) => {
      console.log('[WS] Calendar event update:', data);
      try {
        if (data.eventId && data.updates) {
          updateEvent(data.eventId, data.updates);
        }
      } catch (error) {
        console.error('[WS] Error processing calendar event update:', error);
      }
    });

    const unsubCalendarDelete = websocketClient.onCalendarEventDelete((data) => {
      console.log('[WS] Calendar event delete:', data);
      try {
        if (data.eventId) {
          deleteEvent(data.eventId);
        }
      } catch (error) {
        console.error('[WS] Error processing calendar event delete:', error);
      }
    });

    // CONTACT EVENTS - with error recovery
    const unsubContactNew = websocketClient.onContactNew((data) => {
      console.log('[WS] Contact new:', data);
      try {
        if (data.contact) {
          addContact(data.contact);
        }
      } catch (error) {
        console.error('[WS] Error processing contact new:', error);
      }
    });

    const unsubContactUpdate = websocketClient.onContactUpdate((data) => {
      console.log('[WS] Contact update:', data);
      try {
        if (data.contactId && data.updates) {
          updateContact(data.contactId, data.updates);
        }
      } catch (error) {
        console.error('[WS] Error processing contact update:', error);
      }
    });

    const unsubContactDelete = websocketClient.onContactDelete((data) => {
      console.log('[WS] Contact delete:', data);
      try {
        if (data.contactId) {
          deleteContact(data.contactId);
        }
      } catch (error) {
        console.error('[WS] Error processing contact delete:', error);
      }
    });

    // LABEL EVENTS - with error recovery
    const unsubLabelNew = websocketClient.onLabelNew((data) => {
      console.log('[WS] Label new:', data);
      try {
        if (data.label) {
          handleLabelCreated(data.label);
        }
      } catch (error) {
        console.error('[WS] Error processing label new:', error);
      }
    });

    const unsubLabelUpdate = websocketClient.onLabelUpdate((data) => {
      console.log('[WS] Label update:', data);
      try {
        if (data.label) {
          handleLabelUpdated(data.label);
        }
      } catch (error) {
        console.error('[WS] Error processing label update:', error);
      }
    });

    const unsubLabelDelete = websocketClient.onLabelDelete((data) => {
      console.log('[WS] Label delete:', data);
      try {
        if (data.labelId) {
          handleLabelDeleted(data.labelId);
        }
      } catch (error) {
        console.error('[WS] Error processing label delete:', error);
      }
    });

    // SYNC STATUS - with error recovery
    const unsubSyncStatus = websocketClient.onSyncStatus((data) => {
      console.log('[WS] Sync status:', data);
      try {
        setSyncStatus({
          providerId: data.providerId,
          status: data.status,
          progress: data.progress,
          error: data.error,
          timestamp: data.timestamp,
        });
      } catch (error) {
        console.error('[WS] Error processing sync status:', error);
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('[useWebSocket] All event listeners registered successfully');
    }

    // Cleanup on unmount or when connection drops
    return () => {
      console.log('[useWebSocket] Cleaning up event listeners...');
      unsubEmailNew();
      unsubEmailUpdate();
      unsubEmailDelete();
      unsubUnreadCount();
      unsubFolderCounts();
      unsubFolderCreated();
      unsubFolderRenamed();
      unsubFolderDeleted();
      unsubThreadUpdate();
      unsubBatchProcessed();
      unsubCalendarNew();
      unsubCalendarUpdate();
      unsubCalendarDelete();
      unsubContactNew();
      unsubContactUpdate();
      unsubContactDelete();
      unsubLabelNew();
      unsubLabelUpdate();
      unsubLabelDelete();
      unsubSyncStatus();
      unsubFolderCreated();
      unsubFolderRenamed();
      unsubFolderDeleted();
    };
  }, [
    connectionStatus, // Re-register listeners when connection state changes
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
    setSyncStatus,
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
