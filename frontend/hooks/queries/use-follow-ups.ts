/**
 * TanStack Query hooks for Follow-Up Tracker
 *
 * Supports: pending list, stats, status update, snooze, delete.
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { followUpKeys } from './follow-up-keys';
import { aiChatApi } from '@/lib/api/ai';

// ============================================================================
// Types
// ============================================================================

export type EmailFollowUpStatus = 'PENDING' | 'REMINDED' | 'RESOLVED' | 'EXPIRED';

export interface EmailFollowUp {
  id: string;
  tenantId: string;
  userId: string;
  emailId: string;
  reason?: string;
  status: EmailFollowUpStatus;
  followUpType?: 'WAITING_FOR' | 'TODO';
  dueDate?: string;
  reminderCount?: number;
  lastRemindedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  commitments?: Array<{
    commitment: string;
    deadline: string | null;
    recipient: string | null;
  }>;
  waitingFor?: Array<{
    waitingFor: string;
    fromWhom: string | null;
    deadline: string | null;
  }>;
  actionItems?: Array<{
    action: string;
    deadline: string | null;
    priority: 'high' | 'medium' | 'low';
    category: string;
  }>;
  emailType?: string;
  confidence?: number;
  detectedDeadline?: string;
  deadlineSource?: 'nlp' | 'manual' | 'extraction';
  email?: {
    id: string;
    subject?: string;
    from?: string;
    receivedAt?: string;
    to?: string[];
  };
}

export interface EmailFollowUpListData {
  followUps: EmailFollowUp[];
  count: number;
}

export interface FollowUpStats {
  pending: number;
  reminded: number;
  resolved: number;
  expired: number;
  overdue: number;
  dueToday: number;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Query options for pending follow-ups
 * Backend: GET /api/v1/ai/follow-ups/pending
 */
export function pendingFollowUpsOptions(limit = 20, includeResolved = false) {
  return queryOptions({
    queryKey: [...followUpKeys.pending(), { includeResolved }],
    queryFn: async (): Promise<EmailFollowUpListData> => {
      const response = await aiChatApi.getPendingFollowUps({ limit, includeResolved });
      const followUps = response.data?.followUps || [];
      return {
        followUps: followUps as unknown as EmailFollowUp[],
        count: response.data?.count || 0,
      };
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function followUpStatsOptions() {
  return queryOptions({
    queryKey: followUpKeys.stats(),
    queryFn: async (): Promise<FollowUpStats> => {
      const response = await aiChatApi.getFollowUpStats();
      return response.data?.stats || { pending: 0, reminded: 0, resolved: 0, expired: 0, overdue: 0, dueToday: 0 };
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ============================================================================
// Hooks
// ============================================================================

/** Hook for pending follow-ups */
export function usePendingFollowUps(limit = 20, includeResolved = false) {
  return useQuery(pendingFollowUpsOptions(limit, includeResolved));
}

/** Hook for follow-up stats (counts by status) */
export function useFollowUpStats() {
  return useQuery(followUpStatsOptions());
}

/** Mutation: update follow-up status */
export function useUpdateFollowUpStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await aiChatApi.updateFollowUpStatus(id, status);
      if (!res.data?.success) throw new Error(res.data?.error || 'Failed to update status');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.all });
    },
  });
}

/** Mutation: snooze follow-up */
export function useSnoozeFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dueDate }: { id: string; dueDate: string }) => {
      const res = await aiChatApi.snoozeFollowUp(id, dueDate);
      if (!res.data?.success) throw new Error(res.data?.error || 'Failed to snooze');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.all });
    },
  });
}

/** Hook for follow-up by email ID */
export function useFollowUpForEmail(emailId: string | undefined) {
  return useQuery({
    queryKey: [...followUpKeys.all, 'by-email', emailId],
    queryFn: async (): Promise<EmailFollowUp | null> => {
      if (!emailId) return null;
      const response = await aiChatApi.getFollowUpByEmail(emailId);
      return (response.data?.followUp as EmailFollowUp) || null;
    },
    enabled: !!emailId,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/** Mutation: soft-delete follow-up */
export function useDeleteFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await aiChatApi.deleteFollowUp(id);
      if (!res.data?.success) throw new Error(res.data?.error || 'Failed to delete');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.all });
    },
  });
}
