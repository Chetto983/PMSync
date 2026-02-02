/**
 * TanStack Query hooks for email operations
 *
 * Best practices implemented:
 * - queryOptions for type-safe, reusable query configurations
 * - Proper staleTime and gcTime for optimal caching
 * - Optimistic updates for mutations
 * - Error handling with retry configuration
 *
 * Key Decision: Uses `isImportant` (consolidated from star/flag)
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/queries
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  emailsApi,
  type ListEmailsParams,
  type Email,
  type SendEmailDto,
  type ReplyEmailDto,
  type ForwardEmailDto,
  type UpdateEmailDto,
  type SaveDraftDto,
  type RespondToInviteDto,
} from '@/lib/api/emails';
import { emailKeys } from './email-keys';
import { getGlobalToast } from '@/lib/context/toast-context';

// =============================================================================
// Query Options (for sharing between hooks and prefetching)
// =============================================================================

/**
 * Query options for fetching email list
 */
export function emailsListOptions(params?: ListEmailsParams) {
  return queryOptions({
    queryKey: emailKeys.listFiltered(params),
    queryFn: async () => {
      return await emailsApi.listEmails(params);
    },
    staleTime: 1 * 60 * 1000, // 1 minute - emails change frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Query options for fetching single email
 */
export function emailDetailOptions(id: string) {
  return queryOptions({
    queryKey: emailKeys.detail(id),
    queryFn: async () => {
      return await emailsApi.getEmail(id);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!id,
  });
}

/**
 * Query options for fetching email thread
 */
export function emailThreadOptions(threadId: string) {
  return queryOptions({
    queryKey: emailKeys.thread(threadId),
    queryFn: async () => {
      return await emailsApi.getThread(threadId);
    },
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: !!threadId,
  });
}

/**
 * Query options for email conversations
 */
export function emailConversationsOptions(params?: ListEmailsParams) {
  return queryOptions({
    queryKey: emailKeys.conversations(params),
    queryFn: async () => {
      return await emailsApi.getConversations(params);
    },
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Query options for email stats
 */
export function emailStatsOptions() {
  return queryOptions({
    queryKey: emailKeys.stats(),
    queryFn: async () => {
      return await emailsApi.getStats();
    },
    staleTime: 30 * 1000, // 30 seconds - stats should update often
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Query options for searching emails
 */
export function emailSearchOptions(query: string) {
  return queryOptions({
    queryKey: emailKeys.search(query),
    queryFn: async () => {
      return await emailsApi.searchEmails(query);
    },
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: query.length >= 2,
  });
}

/**
 * Query options for fetching draft
 */
export function emailDraftOptions(draftId: string) {
  return queryOptions({
    queryKey: emailKeys.draft(draftId),
    queryFn: async () => {
      return await emailsApi.getDraft(draftId);
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: !!draftId,
  });
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Hook for fetching email list with filters
 *
 * @example
 * ```tsx
 * const { data, isPending } = useEmails({ specialUse: 'INBOX', limit: 50 });
 * const emails = data?.emails ?? [];
 * ```
 */
export function useEmails(params?: ListEmailsParams) {
  return useQuery(emailsListOptions(params));
}

/**
 * Hook for fetching single email
 *
 * @example
 * ```tsx
 * const { data: email, isPending } = useEmail('email-id');
 * ```
 */
export function useEmail(id: string) {
  return useQuery(emailDetailOptions(id));
}

/**
 * Hook for fetching email thread
 *
 * @example
 * ```tsx
 * const { data: emails, isPending } = useEmailThread('thread-id');
 * ```
 */
export function useEmailThread(threadId: string) {
  return useQuery(emailThreadOptions(threadId));
}

/**
 * Hook for fetching email conversations (grouped by thread)
 *
 * @example
 * ```tsx
 * const { data: threads } = useEmailConversations({ specialUse: 'INBOX' });
 * ```
 */
export function useEmailConversations(params?: ListEmailsParams) {
  return useQuery(emailConversationsOptions(params));
}

/**
 * Hook for fetching email stats
 *
 * @example
 * ```tsx
 * const { data: stats } = useEmailStats();
 * console.log(stats?.unread);
 * ```
 */
export function useEmailStats() {
  return useQuery(emailStatsOptions());
}

/**
 * Hook for searching emails
 *
 * @example
 * ```tsx
 * const { data: results } = useEmailSearch('invoice');
 * ```
 */
export function useEmailSearch(query: string) {
  return useQuery(emailSearchOptions(query));
}

/**
 * Hook for fetching draft
 */
export function useEmailDraft(draftId: string) {
  return useQuery(emailDraftOptions(draftId));
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Hook for sending email
 *
 * @example
 * ```tsx
 * const sendEmail = useSendEmail();
 * await sendEmail.mutateAsync({
 *   providerId: 'provider-id',
 *   to: ['recipient@example.com'],
 *   subject: 'Hello',
 *   bodyHtml: '<p>Hello world</p>',
 * });
 * ```
 */
export function useSendEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: SendEmailDto) => {
      return await emailsApi.sendEmail(dto);
    },
    onSuccess: () => {
      // Invalidate sent folder and stats
      queryClient.invalidateQueries({ queryKey: emailKeys.byFolder('SENT') });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.drafts() });
    },
    onError: () => {
      getGlobalToast().error('Failed to send email.');
    },
  });
}

/**
 * Hook for replying to email
 */
export function useReplyToEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailId, dto }: { emailId: string; dto: ReplyEmailDto }) => {
      return await emailsApi.replyToEmail(emailId, dto);
    },
    onSuccess: (_, { emailId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
    onError: () => {
      getGlobalToast().error('Failed to send reply.');
    },
  });
}

/**
 * Hook for forwarding email
 */
export function useForwardEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailId, dto }: { emailId: string; dto: ForwardEmailDto }) => {
      return await emailsApi.forwardEmail(emailId, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.byFolder('SENT') });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
    onError: () => {
      getGlobalToast().error('Failed to forward email.');
    },
  });
}

/**
 * Hook for updating email (read, starred, flagged, archived)
 * Uses optimistic updates for instant feedback
 */
export function useUpdateEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailId, dto }: { emailId: string; dto: UpdateEmailDto }) => {
      return await emailsApi.updateEmail(emailId, dto);
    },
    onMutate: async ({ emailId, dto }) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.detail(emailId) });

      const previousEmail = queryClient.getQueryData<Email>(emailKeys.detail(emailId));

      if (previousEmail) {
        queryClient.setQueryData<Email>(emailKeys.detail(emailId), {
          ...previousEmail,
          ...dto,
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousEmail };
    },
    onError: (_, { emailId }, context) => {
      if (context?.previousEmail) {
        queryClient.setQueryData(emailKeys.detail(emailId), context.previousEmail);
      }
      getGlobalToast().error('Failed to update email. Changes reverted.');
    },
    onSettled: (_, __, { emailId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
  });
}

/**
 * Hook for deleting email
 */
export function useDeleteEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (emailId: string) => {
      await emailsApi.deleteEmail(emailId);
      return emailId;
    },
    onSuccess: (emailId) => {
      queryClient.removeQueries({ queryKey: emailKeys.detail(emailId) });
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
    onError: () => {
      getGlobalToast().error('Failed to delete email.');
    },
  });
}

// =============================================================================
// Bulk Mutation Hooks
// =============================================================================

/**
 * Hook for bulk deleting emails
 */
export function useBulkDeleteEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (emailIds: string[]) => {
      return await emailsApi.bulkDelete(emailIds);
    },
    onSuccess: (_, emailIds) => {
      emailIds.forEach((id) => {
        queryClient.removeQueries({ queryKey: emailKeys.detail(id) });
      });
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
    },
    onError: () => {
      getGlobalToast().error('Failed to delete emails.');
    },
  });
}

/**
 * Hook for bulk marking emails as read/unread
 */
export function useBulkMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailIds, isRead }: { emailIds: string[]; isRead: boolean }) => {
      return await emailsApi.bulkMarkRead(emailIds, isRead);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
    },
    onError: () => {
      getGlobalToast().error('Failed to update read status.');
    },
  });
}

/**
 * Hook for bulk marking emails as important
 * Uses isFlagged on backend, exposed as isImportant on frontend
 */
export function useBulkMarkImportant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailIds, isImportant }: { emailIds: string[]; isImportant: boolean }) => {
      return await emailsApi.bulkMarkImportant(emailIds, isImportant);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
    },
    onError: () => {
      getGlobalToast().error('Failed to mark emails.');
    },
  });
}

/**
 * Hook for bulk moving emails
 */
export function useBulkMoveEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailIds, targetFolder }: { emailIds: string[]; targetFolder: string }) => {
      return await emailsApi.bulkMove(emailIds, targetFolder);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
    },
    onError: () => {
      getGlobalToast().error('Failed to move emails.');
    },
  });
}

/**
 * Hook for bulk adding labels
 */
export function useBulkAddLabels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailIds, labelIds }: { emailIds: string[]; labelIds: string[] }) => {
      return await emailsApi.bulkAddLabels(emailIds, labelIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
    },
    onError: () => {
      getGlobalToast().error('Failed to add labels.');
    },
  });
}

/**
 * Hook for bulk removing labels
 */
export function useBulkRemoveLabels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailIds, labelIds }: { emailIds: string[]; labelIds: string[] }) => {
      return await emailsApi.bulkRemoveLabels(emailIds, labelIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
    },
    onError: () => {
      getGlobalToast().error('Failed to remove labels.');
    },
  });
}

// =============================================================================
// Draft Mutation Hooks
// =============================================================================

/**
 * Hook for saving draft (create or update)
 */
export function useSaveDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: SaveDraftDto) => {
      return await emailsApi.saveDraft(dto);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(emailKeys.draft(data.id), data.email);
      queryClient.invalidateQueries({ queryKey: emailKeys.drafts() });
      queryClient.invalidateQueries({ queryKey: emailKeys.byFolder('DRAFTS') });
    },
    onError: () => {
      getGlobalToast().error('Failed to save draft.');
    },
  });
}

/**
 * Hook for deleting draft
 */
export function useDeleteDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      await emailsApi.deleteDraft(draftId);
      return draftId;
    },
    onSuccess: (draftId) => {
      queryClient.removeQueries({ queryKey: emailKeys.draft(draftId) });
      queryClient.invalidateQueries({ queryKey: emailKeys.drafts() });
      queryClient.invalidateQueries({ queryKey: emailKeys.byFolder('DRAFTS') });
    },
    onError: () => {
      getGlobalToast().error('Failed to delete draft.');
    },
  });
}

// =============================================================================
// Calendar Invite Hooks
// =============================================================================

/**
 * Hook for responding to calendar invite
 */
export function useRespondToCalendarInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailId, dto }: { emailId: string; dto: RespondToInviteDto }) => {
      return await emailsApi.respondToCalendarInvite(emailId, dto);
    },
    onSuccess: (_, { emailId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
      queryClient.invalidateQueries({ queryKey: emailKeys.calendarInvite(emailId) });
    },
    onError: () => {
      getGlobalToast().error('Failed to respond to calendar invite.');
    },
  });
}

// =============================================================================
// Convenience Hooks (common patterns)
// =============================================================================

/**
 * Hook for marking single email as read with optimistic update
 */
export function useMarkEmailRead() {
  const updateEmail = useUpdateEmail();

  return {
    ...updateEmail,
    mutate: (emailId: string, isRead: boolean) => {
      updateEmail.mutate({ emailId, dto: { isRead } });
    },
    mutateAsync: async (emailId: string, isRead: boolean) => {
      return updateEmail.mutateAsync({ emailId, dto: { isRead } });
    },
  };
}

/**
 * Hook for marking single email as important with optimistic update
 * Maps to isFlagged on backend
 */
export function useMarkEmailImportant() {
  const updateEmail = useUpdateEmail();

  return {
    ...updateEmail,
    mutate: (emailId: string, isImportant: boolean) => {
      updateEmail.mutate({ emailId, dto: { isFlagged: isImportant } });
    },
    mutateAsync: async (emailId: string, isImportant: boolean) => {
      return updateEmail.mutateAsync({ emailId, dto: { isFlagged: isImportant } });
    },
  };
}
