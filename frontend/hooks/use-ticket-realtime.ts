/**
 * Ticket Realtime Hook
 *
 * Connects WebSocket ticket events to TanStack Query cache invalidation.
 * When backend emits crm:ticket:created/updated/assigned, this hook
 * invalidates ticket queries to trigger refetch on the agent dashboard.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { websocketClient } from '@/lib/websocket-client';
import { crmTicketsKeys } from '@/hooks/queries/crm-tickets-keys';

export function useTicketRealtime(enabled = true) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: crmTicketsKeys.all });
  }, [queryClient]);

  const handlerRef = useRef(invalidate);
  useEffect(() => {
    handlerRef.current = invalidate;
  }, [invalidate]);

  useEffect(() => {
    if (!enabled) return;

    const handler = () => handlerRef.current();

    const unsubs = [
      websocketClient.onTicketCreated(handler),
      websocketClient.onTicketUpdated(handler),
      websocketClient.onTicketAssigned(handler),
    ];

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [enabled]);
}
