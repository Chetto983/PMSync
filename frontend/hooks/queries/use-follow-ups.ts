/**
 * TanStack Query hooks for Follow-Up Tracker
 *
 * Best practices implemented:
 * - Uses existing voltAgentApi for follow-ups
 * - queryOptions for type-safe, reusable query configurations
 * - Proper staleTime and gcTime for optimal caching
 * - useMutation for create/resolve/snooze operations
 *
 * NOTE: Types are named with Email prefix to avoid conflicts with dashboard FollowUp type
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { followUpKeys } from './follow-up-keys';
import { voltAgentApi } from '@/lib/api/ai';

// ============================================================================
// Types (prefixed with Email to avoid conflicts with dashboard types)
// ============================================================================

export type EmailFollowUpStatus = 'PENDING' | 'REMINDED' | 'RESOLVED' | 'EXPIRED';

export interface EmailFollowUp {
  id: string;
  tenantId: string;
  userId: string;
  emailId: string;
  reason?: string;
  status: EmailFollowUpStatus;
  dueDate?: string;
  reminderCount?: number;
  lastRemindedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  email?: {
    id: string;
    subject?: string;
    from?: string;
    receivedAt?: string;
    to?: string[];
  };
}

export interface EmailFollowUpStats {
  total: number;
  pending: number;
  reminded: number;
  resolved: number;
  expired: number;
  dueToday: number;
  overdue: number;
}

export interface EmailFollowUpListData {
  followUps: EmailFollowUp[];
  count: number;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Query options for all follow-ups (optionally filtered by status)
 */
export function followUpsListOptions(status?: string, limit = 50) {
  return queryOptions({
    queryKey: followUpKeys.list(status),
    queryFn: async (): Promise<EmailFollowUpListData> => {
      try {
        const response = await voltAgentApi.listFollowUps({ status, limit });
        const followUps = response.data?.followUps || [];
        return {
          followUps: followUps as unknown as EmailFollowUp[],
          count: response.data?.count || 0,
        };
      } catch {
        return { followUps: [], count: 0 };
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

/**
 * Query options for pending follow-ups
 */
export function pendingFollowUpsOptions(limit = 20) {
  return queryOptions({
    queryKey: followUpKeys.pending(),
    queryFn: async (): Promise<EmailFollowUpListData> => {
      try {
        const response = await voltAgentApi.getPendingFollowUps({ limit });
        const followUps = response.data?.followUps || [];
        return {
          followUps: followUps as unknown as EmailFollowUp[],
          count: response.data?.count || 0,
        };
      } catch {
        return { followUps: [], count: 0 };
      }
    },
    staleTime: 60 * 1000, // 1 minute (more frequent for pending)
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Query options for overdue follow-ups
 */
export function overdueFollowUpsOptions(limit = 20) {
  return queryOptions({
    queryKey: followUpKeys.overdue(),
    queryFn: async (): Promise<EmailFollowUpListData> => {
      try {
        const response = await voltAgentApi.getOverdueFollowUps({ limit });
        const followUps = response.data?.followUps || [];
        return {
          followUps: followUps as unknown as EmailFollowUp[],
          count: response.data?.count || 0,
        };
      } catch {
        return { followUps: [], count: 0 };
      }
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Query options for follow-up stats
 */
export function followUpStatsOptions() {
  return queryOptions({
    queryKey: followUpKeys.stats(),
    queryFn: async (): Promise<EmailFollowUpStats> => {
      try {
        const response = await voltAgentApi.getFollowUpStats();
        const data = response.data as Record<string, unknown>;
        return {
          total: (data.total as number) || 0,
          pending: (data.pending as number) || 0,
          reminded: (data.reminded as number) || 0,
          resolved: (data.resolved as number) || 0,
          expired: (data.expired as number) || 0,
          dueToday: (data.dueToday as number) || 0,
          overdue: (data.overdue as number) || 0,
        };
      } catch {
        return {
          total: 0,
          pending: 0,
          reminded: 0,
          resolved: 0,
          expired: 0,
          dueToday: 0,
          overdue: 0,
        };
      }
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Query options for single follow-up detail
 */
export function followUpDetailOptions(id: string) {
  return queryOptions({
    queryKey: followUpKeys.detail(id),
    queryFn: async (): Promise<EmailFollowUp | null> => {
      try {
        const response = await voltAgentApi.getFollowUp(id);
        const followUp = response.data?.followUp;
        return followUp ? (followUp as unknown as EmailFollowUp) : null;
      } catch {
        return null;
      }
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    enabled: !!id,
  });
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for all follow-ups (optionally by status)
 */
export function useFollowUpsList(status?: string, limit = 50) {
  return useQuery(followUpsListOptions(status, limit));
}

/**
 * Hook for pending follow-ups
 */
export function usePendingFollowUps(limit = 20) {
  return useQuery(pendingFollowUpsOptions(limit));
}

/**
 * Hook for overdue follow-ups
 */
export function useOverdueFollowUps(limit = 20) {
  return useQuery(overdueFollowUpsOptions(limit));
}

/**
 * Hook for follow-up stats
 */
export function useFollowUpStats() {
  return useQuery(followUpStatsOptions());
}

/**
 * Hook for single follow-up detail
 */
export function useFollowUpDetail(id: string) {
  return useQuery(followUpDetailOptions(id));
}

/**
 * Hook for creating a follow-up
 */
export function useCreateFollowUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { emailId: string; reason?: string; dueDate?: string }) => {
      const response = await voltAgentApi.createFollowUp(payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.all });
    },
  });
}

/**
 * Hook for resolving a follow-up
 */
export function useResolveFollowUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await voltAgentApi.resolveFollowUp(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.all });
    },
  });
}

/**
 * Hook for snoozing a follow-up
 */
export function useSnoozeFollowUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dueDate }: { id: string; dueDate: string }) => {
      const response = await voltAgentApi.snoozeFollowUp(id, dueDate);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.all });
    },
  });
}
