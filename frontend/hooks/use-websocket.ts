import { useEffect, useRef, useCallback, useState } from 'react';
import { websocketClient } from '@/lib/websocket-client';
import { useEmailStore } from '@/stores/email-store';
import { useCalendarStore } from '@/stores/calendar-store';
import { useContactStore } from '@/stores/contact-store';
import { useLabelStore } from '@/stores/label-store';
import { useFoldersStore } from '@/stores/folders-store';
import { useSyncStore } from '@/stores/sync-store';

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
        console.log('[useWebSocket] Connected successfully');
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
      if (process.env.NODE_ENV !== 'production') {
        console.log('[useWebSocket] Skipping listener setup, connection status:', connectionStatus);
      }
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[useWebSocket] Registering event listeners...');
    }

    // EMAIL EVENTS
    const unsubEmailNew = websocketClient.onEmailNew((data) => {
      console.log('[WS] Email new:', data);
      if (data.email) {
        addEmail(data.email);
      }
    });

    const unsubEmailUpdate = websocketClient.onEmailUpdate((data) => {
      console.log('[WS] Email update:', data);

      // Handle complete email object from backend
      if (data.email) {
        // Replace the entire email with the updated version from backend
        updateEmail(data.emailId || data.email.id, data.email);
      }
    });

    const unsubEmailDelete = websocketClient.onEmailDelete((data) => {
      console.log('[WS] Email delete:', data);
      if (data.emailId) {
        deleteEmail(data.emailId);
      }
    });

    const unsubUnreadCount = websocketClient.onUnreadCountUpdate((data) => {
      console.log('[WS] Unread count update:', data);
      setUnreadCount(data.count);
    });

    const unsubFolderCounts = websocketClient.onFolderCountsUpdate((data) => {
      console.log('[WS] Folder counts update:', data);
      updateFolderCounts(data.providerId, data.folderId, {
        totalCount: data.totalCount,
        unreadCount: data.unreadCount,
        folderName: data.folderName,
      });
    });

    const unsubThreadUpdate = websocketClient.onThreadUpdate((data) => {
      console.log('[WS] Thread update:', data);
      if (data.threadId && data.emailIds) {
        updateThread(data.threadId, data.emailIds);
      }
    });

    const unsubBatchProcessed = websocketClient.onEmailBatchProcessed((data) => {
      console.log('[WS] Email batch processed:', data);
      // Update sync status with batch info
      setSyncStatus({
        providerId: data.providerId,
        status: 'completed',
        progress: 100,
        timestamp: data.timestamp,
      });
    });

    // CALENDAR EVENTS
    const unsubCalendarNew = websocketClient.onCalendarEventNew((data) => {
      console.log('[WS] Calendar event new:', data);
      if (data.event) {
        addEvent(data.event);
      }
    });

    const unsubCalendarUpdate = websocketClient.onCalendarEventUpdate((data) => {
      console.log('[WS] Calendar event update:', data);
      if (data.eventId && data.updates) {
        updateEvent(data.eventId, data.updates);
      }
    });

    const unsubCalendarDelete = websocketClient.onCalendarEventDelete((data) => {
      console.log('[WS] Calendar event delete:', data);
      if (data.eventId) {
        deleteEvent(data.eventId);
      }
    });

    // CONTACT EVENTS
    const unsubContactNew = websocketClient.onContactNew((data) => {
      console.log('[WS] Contact new:', data);
      if (data.contact) {
        addContact(data.contact);
      }
    });

    const unsubContactUpdate = websocketClient.onContactUpdate((data) => {
      console.log('[WS] Contact update:', data);
      if (data.contactId && data.updates) {
        updateContact(data.contactId, data.updates);
      }
    });

    const unsubContactDelete = websocketClient.onContactDelete((data) => {
      console.log('[WS] Contact delete:', data);
      if (data.contactId) {
        deleteContact(data.contactId);
      }
    });

    // LABEL EVENTS
    const unsubLabelNew = websocketClient.onLabelNew((data) => {
      console.log('[WS] Label new:', data);
      if (data.label) {
        handleLabelCreated(data.label);
      }
    });

    const unsubLabelUpdate = websocketClient.onLabelUpdate((data) => {
      console.log('[WS] Label update:', data);
      if (data.label) {
        handleLabelUpdated(data.label);
      }
    });

    const unsubLabelDelete = websocketClient.onLabelDelete((data) => {
      console.log('[WS] Label delete:', data);
      if (data.labelId) {
        handleLabelDeleted(data.labelId);
      }
    });

    // SYNC STATUS
    const unsubSyncStatus = websocketClient.onSyncStatus((data) => {
      console.log('[WS] Sync status:', data);
      setSyncStatus({
        providerId: data.providerId,
        status: data.status,
        progress: data.progress,
        error: data.error,
        timestamp: data.timestamp,
      });
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
