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
import { useQueryClient } from '@tanstack/react-query';
import { websocketClient } from '@/lib/websocket-client';
import { authClient } from '@/lib/auth-client';

import { emailKeys } from '@/hooks/queries/email-keys';
import { logger } from '@/lib/logger';

interface UseWebSocketOptions {
  /** Whether to auto-connect when authenticated */
  autoConnect?: boolean;
  /** Whether to refetch data on reconnect */
  refetchOnReconnect?: boolean;
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
  const { autoConnect = true, refetchOnReconnect = true } = options;
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session;
  const handleLogout = () => authClient.signOut();
  const queryClient = useQueryClient();

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
      handleLogout();
    });

    return () => {
      unsubAuthFailure();
    };
  }, [disconnect, handleLogout]);

  // Handle reconnection - refetch stale data
  useEffect(() => {
    if (!refetchOnReconnect) {
      return;
    }

    const unsubReconnect = websocketClient.onReconnect(() => {
      logger.debug('[useWebSocket] Reconnected - refetching data');
      // Invalidate all email queries to get fresh data
      queryClient.invalidateQueries({ queryKey: emailKeys.all });
    });

    return () => {
      unsubReconnect();
    };
  }, [refetchOnReconnect, queryClient]);

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
