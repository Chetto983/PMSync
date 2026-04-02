/**
 * Reminder Realtime Hook
 *
 * Connects WebSocket reminder events to TanStack Query cache invalidation.
 * When backend emits reminder:upcoming/imminent/overdue/completed/telegram-sent,
 * this hook invalidates reminder queries to trigger refetch.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { websocketClient, type RealtimeReminderEvent } from '@/lib/websocket-client';
import { reminderKeys } from '@/hooks/queries/reminder-keys';

export type ReminderEventType =
  | 'upcoming'
  | 'imminent'
  | 'overdue'
  | 'completed'
  | 'telegram-sent'
  | 'delivery-failed';

export interface ReminderRealtimeCallbacks {
  /** Called on any reminder event with type + payload */
  onEvent?: (type: ReminderEventType, payload: RealtimeReminderEvent) => void;
}

export function useReminderRealtime(
  enabled = true,
  callbacks?: ReminderRealtimeCallbacks,
) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: reminderKeys.all });
  }, [queryClient]);

  const invalidateRef = useRef(invalidate);
  useEffect(() => {
    invalidateRef.current = invalidate;
  }, [invalidate]);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    if (!enabled) return;

    const makeHandler = (type: ReminderEventType) => (payload: RealtimeReminderEvent) => {
      invalidateRef.current();
      callbacksRef.current?.onEvent?.(type, payload);
    };

    const unsubs = [
      websocketClient.onReminderUpcoming(makeHandler('upcoming')),
      websocketClient.onReminderImminent(makeHandler('imminent')),
      websocketClient.onReminderOverdue(makeHandler('overdue')),
      websocketClient.onReminderCompleted(makeHandler('completed')),
      websocketClient.onReminderTelegramSent(makeHandler('telegram-sent')),
      websocketClient.onReminderDeliveryFailed(makeHandler('delivery-failed')),
    ];

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [enabled]);
}
