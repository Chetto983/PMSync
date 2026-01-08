/**
 * useAiActions Hook
 *
 * React hook for Human-in-the-Loop (HITL) AI action management.
 * Implements 2025 best practices with React Query integration.
 *
 * Features:
 * - List pending AI actions
 * - Approve/reject actions
 * - Real-time updates via WebSocket
 * - Action statistics
 * - Learning profile stats
 * - Caching with React Query
 */
import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  voltAgentApi,
  PendingAction,
  ActionCounts,
  LearningProfileStats,
  AggregateStats,
} from '@/lib/api/ai';
import { websocketClient } from '@/lib/websocket-client';
import { useAuthStore } from '@/stores/auth-store';

// Query key factory for consistent caching
export const aiActionsKeys = {
  all: ['aiActions'] as const,
  pending: () => [...aiActionsKeys.all, 'pending'] as const,
  action: (id: string) => [...aiActionsKeys.all, 'action', id] as const,
  counts: () => [...aiActionsKeys.all, 'counts'] as const,
  learning: (userId?: string) => [...aiActionsKeys.all, 'learning', userId] as const,
  aggregate: () => [...aiActionsKeys.all, 'aggregate'] as const,
};

interface UseAiActionsOptions {
  /** Auto-fetch pending actions on mount */
  autoFetch?: boolean;
  /** Enable WebSocket real-time updates */
  enableRealtime?: boolean;
  /** Stale time in milliseconds */
  staleTime?: number;
  /** Callback when action is approved */
  onApprove?: (actionId: string) => void;
  /** Callback when action is rejected */
  onReject?: (actionId: string) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

interface UseAiActionsReturn {
  // Pending Actions
  pendingActions: PendingAction[];
  pendingCount: number;
  pendingLoading: boolean;
  pendingError: Error | null;
  refetchPending: () => void;

  // Single Action
  getAction: (id: string) => PendingAction | undefined;
  fetchAction: (id: string) => Promise<PendingAction | undefined>;

  // Action Mutations
  approveAction: (id: string, payload?: Record<string, unknown>) => Promise<void>;
  rejectAction: (id: string, reason?: string) => Promise<void>;
  isApproving: boolean;
  isRejecting: boolean;

  // Statistics
  actionCounts: ActionCounts | null;
  countsLoading: boolean;
  refetchCounts: () => void;

  // Learning Stats
  learningStats: LearningProfileStats[];
  learningLoading: boolean;
  refetchLearning: () => void;

  // Aggregate Stats
  aggregateStats: AggregateStats | null;
  aggregateLoading: boolean;
  refetchAggregate: () => void;

  // Bulk
  isLoading: boolean;
  invalidateAll: () => void;
}

export function useAiActions(options: UseAiActionsOptions = {}): UseAiActionsReturn {
  const {
    autoFetch = true,
    enableRealtime = true,
    staleTime = 30 * 1000, // 30 seconds
    onApprove,
    onReject,
    onError,
  } = options;

  const queryClient = useQueryClient();
  const { token } = useAuthStore();

  // Pending Actions Query
  const pendingQuery = useQuery({
    queryKey: aiActionsKeys.pending(),
    queryFn: async () => {
      const response = await voltAgentApi.getPendingActions();
      return response.data;
    },
    enabled: autoFetch,
    staleTime,
  });

  // Action Counts Query
  const countsQuery = useQuery({
    queryKey: aiActionsKeys.counts(),
    queryFn: async () => {
      const response = await voltAgentApi.getActionCounts();
      if (!response.data.success) throw new Error('Failed to get action counts');
      return response.data.counts;
    },
    enabled: autoFetch,
    staleTime,
  });

  // NOTE: Learning Stats Query REMOVED - endpoint returns 404 (in-memory only, no persistence)
  // See CONSOLIDATION-PLAN.md for details

  // Aggregate Stats Query
  const aggregateQuery = useQuery({
    queryKey: aiActionsKeys.aggregate(),
    queryFn: async () => {
      const response = await voltAgentApi.getAggregateStats();
      if (!response.data.success) throw new Error('Failed to get aggregate stats');
      return response.data.stats;
    },
    enabled: autoFetch,
    staleTime: 60 * 1000, // 1 minute
  });

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: async ({ executionId, payload }: { executionId: string; payload?: Record<string, unknown> }) => {
      await voltAgentApi.approveAction(executionId, payload);
      return executionId;
    },
    onSuccess: (executionId) => {
      // Invalidate pending actions
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.pending() });
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.counts() });
      onApprove?.(executionId);
    },
    onError: (error: Error) => {
      onError?.(error);
    },
  });

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ executionId, reason }: { executionId: string; reason?: string }) => {
      await voltAgentApi.rejectAction(executionId, reason);
      return executionId;
    },
    onSuccess: (executionId) => {
      // Invalidate pending actions
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.pending() });
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.counts() });
      onReject?.(executionId);
    },
    onError: (error: Error) => {
      onError?.(error);
    },
  });

  // WebSocket real-time updates
  useEffect(() => {
    if (!enableRealtime || !token || !websocketClient.isConnected()) return;

    const unsubCreated = websocketClient.onAiActionCreated(() => {
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.pending() });
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.counts() });
    });

    const unsubApproved = websocketClient.onAiActionApproved(() => {
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.pending() });
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.counts() });
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.learning() });
    });

    const unsubRejected = websocketClient.onAiActionRejected(() => {
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.pending() });
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.counts() });
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.learning() });
    });

    const unsubExecuted = websocketClient.onAiActionExecuted(() => {
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.pending() });
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.counts() });
      queryClient.invalidateQueries({ queryKey: aiActionsKeys.aggregate() });
    });

    return () => {
      unsubCreated();
      unsubApproved();
      unsubRejected();
      unsubExecuted();
    };
  }, [enableRealtime, token, queryClient]);

  // Action functions
  const getAction = useCallback(
    (id: string): PendingAction | undefined => {
      return pendingQuery.data?.actions.find((a) => a.executionId === id || a.id === id);
    },
    [pendingQuery.data],
  );

  const fetchAction = useCallback(
    async (id: string): Promise<PendingAction | undefined> => {
      try {
        const response = await voltAgentApi.getPendingAction(id);
        return response.data;
      } catch {
        return undefined;
      }
    },
    [],
  );

  const approveAction = useCallback(
    async (id: string, payload?: Record<string, unknown>): Promise<void> => {
      await approveMutation.mutateAsync({ executionId: id, payload });
    },
    [approveMutation],
  );

  const rejectAction = useCallback(
    async (id: string, reason?: string): Promise<void> => {
      await rejectMutation.mutateAsync({ executionId: id, reason });
    },
    [rejectMutation],
  );

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: aiActionsKeys.all });
  }, [queryClient]);

  const isLoading =
    pendingQuery.isLoading ||
    countsQuery.isLoading ||
    aggregateQuery.isLoading;

  return {
    // Pending Actions
    pendingActions: pendingQuery.data?.actions ?? [],
    pendingCount: pendingQuery.data?.total ?? 0,
    pendingLoading: pendingQuery.isLoading,
    pendingError: pendingQuery.error,
    refetchPending: () => queryClient.invalidateQueries({ queryKey: aiActionsKeys.pending() }),

    // Single Action
    getAction,
    fetchAction,

    // Action Mutations
    approveAction,
    rejectAction,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,

    // Statistics
    actionCounts: countsQuery.data ?? null,
    countsLoading: countsQuery.isLoading,
    refetchCounts: () => queryClient.invalidateQueries({ queryKey: aiActionsKeys.counts() }),

    // NOTE: Learning Stats REMOVED - endpoint returns 404 (in-memory only)
    learningStats: [], // Always empty - learning is in-memory only
    learningLoading: false,
    refetchLearning: () => {}, // No-op

    // Aggregate Stats
    aggregateStats: aggregateQuery.data ?? null,
    aggregateLoading: aggregateQuery.isLoading,
    refetchAggregate: () => queryClient.invalidateQueries({ queryKey: aiActionsKeys.aggregate() }),

    // Bulk
    isLoading,
    invalidateAll,
  };
}

export default useAiActions;
