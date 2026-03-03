/**
 * TanStack Query hooks for Follow-Up Tracker
 *
 * Only pending follow-ups are supported by the backend.
 * Other follow-up operations (list, overdue, stats, CRUD) were removed
 * as part of ghost code cleanup — no backend endpoints exist for them.
 */

import { useQuery, queryOptions } from '@tanstack/react-query';
import { followUpKeys } from './follow-up-keys';
import { voltAgentApi } from '@/lib/api/ai';

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

// ============================================================================
// Query Options
// ============================================================================

/**
 * Query options for pending follow-ups
 * Backend: GET /api/v1/ai/follow-ups/pending
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
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for pending follow-ups
 */
export function usePendingFollowUps(limit = 20) {
  return useQuery(pendingFollowUpsOptions(limit));
}
