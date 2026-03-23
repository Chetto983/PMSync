/**
 * WebSocket Connection Hook
 *
 * Manages WebSocket connection lifecycle based on auth state.
 * Connects when authenticated, disconnects on logout.
 * Handles reconnection and auth failures.
 *
 * @see lib/websocket-client.ts for the singleton client
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { websocketClient } from '@/lib/websocket-client';
import { authClient } from '@/lib/auth-client';
import { clearOfflineData } from '@/lib/logout-cleanup';
import { logger } from '@/lib/logger';

interface UseWebSocketOptions {
  /** Whether to auto-connect when authenticated */
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  /** Whether WebSocket is currently connected */
  isConnected: boolean;
  /** Whether connection is in progress */
  isConnecting: boolean;
  /** Last connection error */
  error: Error | null;
  /** Manually connect */
  connect: () => Promise<void>;
  /** Manually disconnect */
  disconnect: () => void;
}

/**
 * Hook for managing WebSocket connection based on auth state
 *
 * @example
 * ```tsx
 * function Layout() {
 *   const { isConnected, error } = useWebSocket({ autoConnect: true });
 *
 *   if (error) {
 *     console.error('WebSocket error:', error);
 *   }
 *
 *   return <div>Connected: {isConnected ? 'Yes' : 'No'}</div>;
 * }
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { autoConnect = true } = options;
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session;
  const handleLogout = useCallback(async () => {
    // Clear offline data BEFORE destroying session (SYNC-04: prevent data leaks)
    await clearOfflineData();
    const result = await authClient.signOut();
    if (result.error) {
      logger.warn('[useWebSocket] Sign out returned an error', {
        message: result.error.message,
      });
    }
    await router.replace('/auth/login');
  }, [router]);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track if we've attempted connection for this auth state
  const connectionAttemptedRef = useRef(false);
  const wasAuthenticatedRef = useRef(false);

  // Connect function -- cookie sent via withCredentials, no token param needed
  const connect = useCallback(async () => {
    if (websocketClient.isConnected()) {
      setIsConnected(true);
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      await websocketClient.connect();
      setIsConnected(true);
      logger.debug('[useWebSocket] Connected successfully');
    } catch (err) {
      const connectError = err instanceof Error ? err : new Error(String(err));
      setError(connectError);
      setIsConnected(false);
      logger.error('[useWebSocket] Connection failed', { error: connectError.message });
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Disconnect function
  const disconnect = useCallback(() => {
    websocketClient.disconnect();
    setIsConnected(false);
    setIsConnecting(false);
    logger.debug('[useWebSocket] Disconnected');
  }, []);

  // Handle auth failures (expired token, etc.)
  useEffect(() => {
    const unsubAuthFailure = websocketClient.onAuthFailure(() => {
      logger.warn('[useWebSocket] Auth failure - logging out');
      disconnect();
      void handleLogout();
    });

    return () => {
      unsubAuthFailure();
    };
  }, [disconnect, handleLogout]);

  // Note: reconnect data refresh is handled by useEmailRealtime's debounced
  // invalidation via sync:status events — no blanket invalidateQueries here.
  // A blanket invalidation on reconnect floods the API when many connections
  // reconnect simultaneously (caused 429 storms with 500+ zombie sockets).

  // Track connection state changes
  useEffect(() => {
    const handleConnected = () => {
      setIsConnected(true);
      setIsConnecting(false);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleError = (err: Error) => {
      setError(err);
      setIsConnected(false);
    };

    const unsubConnected = websocketClient.onConnected(handleConnected);
    const unsubClose = websocketClient.onClose(handleDisconnect);
    const unsubError = websocketClient.onError(handleError);

    return () => {
      unsubConnected();
      unsubClose();
      unsubError();
    };
  }, []);

  // Auto-connect when authenticated (cookie-based)
  useEffect(() => {
    // Skip if auto-connect is disabled
    if (!autoConnect) {
      return;
    }

    // If auth state changed, reset connection attempt flag
    if (isAuthenticated !== wasAuthenticatedRef.current) {
      connectionAttemptedRef.current = false;
      wasAuthenticatedRef.current = isAuthenticated;
    }

    // Connect if authenticated and not yet attempted
    if (isAuthenticated && !connectionAttemptedRef.current) {
      connectionAttemptedRef.current = true;
      connect();
    }

    // Disconnect if logged out
    if (!isAuthenticated && websocketClient.isConnected()) {
      disconnect();
    }
  }, [autoConnect, isAuthenticated, connect, disconnect]);

  // Note: We intentionally don't disconnect on unmount because:
  // 1. WebSocket connection is managed at Layout level (singleton)
  // 2. Multiple components may use this hook simultaneously
  // 3. Disconnecting would break realtime for other components

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}

export default useWebSocket;
