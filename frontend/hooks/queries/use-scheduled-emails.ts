/**
 * Scheduled Emails Query Hooks
 *
 * TanStack Query hooks for scheduled email list, cancel, and reschedule.
 */
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { scheduledEmailsApi, ScheduledEmail } from '@/lib/api/scheduled-emails';

// Query key factory
export const scheduledEmailKeys = {
  all: ['scheduled-emails'] as const,
  list: () => [...scheduledEmailKeys.all, 'list'] as const,
};

// Query options
export function scheduledEmailsListOptions() {
  return queryOptions({
    queryKey: scheduledEmailKeys.list(),
    queryFn: async (): Promise<ScheduledEmail[]> => {
      const response = await scheduledEmailsApi.list();
      return response.data;
    },
    staleTime: 30 * 1000, // 30 seconds — scheduled emails change frequently
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// Hooks
export function useScheduledEmails() {
  return useQuery(scheduledEmailsListOptions());
}

export function useCancelScheduledEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await scheduledEmailsApi.cancel(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduledEmailKeys.all });
    },
  });
}

export function useRescheduleScheduledEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, scheduledAt }: { id: string; scheduledAt: string }) => {
      const response = await scheduledEmailsApi.reschedule(id, scheduledAt);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduledEmailKeys.all });
    },
  });
}
