/**
 * useUndoSend Hook
 *
 * Phase 9: Undo Send Feature (30s delay)
 *
 * Provides delayed email sending with ability to cancel within 30 seconds.
 * Uses a queue system to track pending sends.
 *
 * Usage:
 *   const { queueSend, cancelSend, pendingSend } = useUndoSend();
 *   // Instead of sending immediately, queue it:
 *   queueSend({ sendFn: () => sendEmail.mutateAsync(data), onSuccess, onCancel });
 *   // User can cancel within 30 seconds:
 *   cancelSend();
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const UNDO_DELAY_MS = 30000; // 30 seconds
const UPDATE_INTERVAL_MS = 1000; // Update countdown every second

export interface PendingSendState {
  /** Unique ID for this pending send */
  id: string;
  /** Seconds remaining until send */
  secondsRemaining: number;
  /** Whether the send is being cancelled */
  isCancelling: boolean;
}

interface QueueSendOptions {
  /** Function that performs the actual send (should return a Promise) */
  sendFn: () => Promise<void>;
  /** Called after successful send */
  onSuccess?: () => void;
  /** Called if user cancels */
  onCancel?: () => void;
  /** Called on send error */
  onError?: (error: Error) => void;
}

interface UseUndoSendReturn {
  /** Queue an email for delayed sending */
  queueSend: (options: QueueSendOptions) => void;
  /** Cancel the pending send */
  cancelSend: () => void;
  /** Current pending send state (null if none) */
  pendingSend: PendingSendState | null;
  /** Whether there's a pending send */
  hasPending: boolean;
}

/**
 * Hook for managing delayed email sending with undo capability
 */
export function useUndoSend(): UseUndoSendReturn {
  const [pendingSend, setPendingSend] = useState<PendingSendState | null>(null);

  // Refs to store callbacks and timer IDs
  const optionsRef = useRef<QueueSendOptions | null>(null);
  const sendTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Execute the actual send
  const executeSend = useCallback(async () => {
    const options = optionsRef.current;
    if (!options) return;

    try {
      await options.sendFn();
      options.onSuccess?.();
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      // Clean up state
      setPendingSend(null);
      optionsRef.current = null;
    }
  }, []);

  // Queue a new send
  const queueSend = useCallback((options: QueueSendOptions) => {
    // Cancel any existing pending send
    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    // Store options
    optionsRef.current = options;

    // Create unique ID
    const id = `send-${Date.now()}`;

    // Set initial state
    setPendingSend({
      id,
      secondsRemaining: Math.ceil(UNDO_DELAY_MS / 1000),
      isCancelling: false,
    });

    // Start countdown interval
    countdownIntervalRef.current = setInterval(() => {
      setPendingSend((prev) => {
        if (!prev) return null;
        const newSeconds = prev.secondsRemaining - 1;
        if (newSeconds <= 0) {
          // Time's up - clear interval (send will happen via timeout)
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return { ...prev, secondsRemaining: 0 };
        }
        return { ...prev, secondsRemaining: newSeconds };
      });
    }, UPDATE_INTERVAL_MS);

    // Set timeout to execute send
    sendTimeoutRef.current = setTimeout(() => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      executeSend();
    }, UNDO_DELAY_MS);
  }, [executeSend]);

  // Cancel pending send
  const cancelSend = useCallback(() => {
    // Mark as cancelling
    setPendingSend((prev) => prev ? { ...prev, isCancelling: true } : null);

    // Clear timers
    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
      sendTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Call cancel callback
    const options = optionsRef.current;
    if (options?.onCancel) {
      options.onCancel();
    }

    // Clear state after brief delay for UI feedback
    setTimeout(() => {
      setPendingSend(null);
      optionsRef.current = null;
    }, 500);
  }, []);

  return {
    queueSend,
    cancelSend,
    pendingSend,
    hasPending: pendingSend !== null,
  };
}

export default useUndoSend;
