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

import { useQuery, useMutation, useQueryClient, queryOptions, keepPreviousData } from '@tanstack/react-query';
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
import { folderKeys } from './use-folders';
import { labelKeys } from './use-labels';
import { getGlobalToast, getGlobalTranslations } from '@/lib/context/toast-context';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

type EmailListSnapshot = [QueryKey, { emails: Email[]; pagination: { page: number; limit: number; total: number; totalPages: number } } | undefined];

function snapshotEmailLists(queryClient: QueryClient): EmailListSnapshot[] {
  return queryClient.getQueriesData<{ emails: Email[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>({
    queryKey: emailKeys.list(),
  });
}

function restoreEmailLists(queryClient: QueryClient, snapshots: EmailListSnapshot[]) {
  snapshots.forEach(([queryKey, data]) => {
    queryClient.setQueryData(queryKey, data);
  });
}

function patchEmailLists(
  queryClient: QueryClient,
  matcher: (email: Email) => boolean,
  updater: (email: Email) => Email
) {
  queryClient.setQueriesData<{ emails: Email[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
    { queryKey: emailKeys.list() },
    (old) =>
      old
        ? {
            ...old,
            emails: old.emails.map((email) => (matcher(email) ? updater(email) : email)),
          }
        : old
  );
}

function removeFromEmailLists(queryClient: QueryClient, ids: Set<string>) {
  queryClient.setQueriesData<{ emails: Email[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
    { queryKey: emailKeys.list() },
    (old) =>
      old
        ? {
            ...old,
            emails: old.emails.filter((email) => !ids.has(email.id)),
          }
        : old
  );
}

// =============================================================================
// Query Options (for sharing between hooks and prefetching)
// =============================================================================

/**
 * Query options for fetching email list
 */
export function emailsListOptions(params?: ListEmailsParams) {
  return queryOptions({
    queryKey: emailKeys.listFiltered(params),
    queryFn: async ({ signal }) => {
      return await emailsApi.listEmails(params, { signal });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    placeholderData: keepPreviousData, // Show old list while new data loads (no skeleton flash)
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
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
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
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
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
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
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
      getGlobalToast().error(getGlobalTranslations().errors.sendEmailFailed);
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
      getGlobalToast().error(getGlobalTranslations().errors.replyFailed);
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
      getGlobalToast().error(getGlobalTranslations().errors.forwardFailed);
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
      await Promise.all([
        queryClient.cancelQueries({ queryKey: emailKeys.detail(emailId) }),
        queryClient.cancelQueries({ queryKey: emailKeys.list() }),
      ]);

      const previousEmail = queryClient.getQueryData<Email>(emailKeys.detail(emailId));
      const previousLists = snapshotEmailLists(queryClient);

      if (previousEmail) {
        queryClient.setQueryData<Email>(emailKeys.detail(emailId), {
          ...previousEmail,
          ...dto,
          updatedAt: new Date().toISOString(),
        });
      }

      patchEmailLists(
        queryClient,
        (email) => email.id === emailId,
        (email) => ({
          ...email,
          ...dto,
          updatedAt: new Date().toISOString(),
        })
      );

      return { previousEmail, previousLists };
    },
    onError: (_, { emailId }, context) => {
      if (context?.previousEmail) {
        queryClient.setQueryData(emailKeys.detail(emailId), context.previousEmail);
      }
      if (context?.previousLists) {
        restoreEmailLists(queryClient, context.previousLists);
      }
      getGlobalToast().error(getGlobalTranslations().errors.updateEmailFailed);
    },
    onSettled: (_, __, { emailId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      // Refresh sidebar folder unread counts
      queryClient.invalidateQueries({ queryKey: folderKeys.list() });
      // Refresh sidebar label counts
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
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
    onMutate: async (emailId: string) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.list() });
      const previousLists = snapshotEmailLists(queryClient);
      removeFromEmailLists(queryClient, new Set([emailId]));
      return { previousLists };
    },
    onSuccess: (emailId) => {
      queryClient.removeQueries({ queryKey: emailKeys.detail(emailId) });
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      // Refresh sidebar folder unread counts
      queryClient.invalidateQueries({ queryKey: folderKeys.list() });
      // Refresh sidebar label counts
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
    onError: (_, __, context) => {
      if (context?.previousLists) {
        restoreEmailLists(queryClient, context.previousLists);
      }
      getGlobalToast().error(getGlobalTranslations().errors.deleteEmailFailed);
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
    onMutate: async (emailIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.list() });
      const previousLists = snapshotEmailLists(queryClient);
      removeFromEmailLists(queryClient, new Set(emailIds));
      return { previousLists };
    },
    onSuccess: (_, emailIds) => {
      emailIds.forEach((id) => {
        queryClient.removeQueries({ queryKey: emailKeys.detail(id) });
      });
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
      // Refresh sidebar folder + label counts
      queryClient.invalidateQueries({ queryKey: folderKeys.list() });
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
    onError: (_, __, context) => {
      if (context?.previousLists) {
        restoreEmailLists(queryClient, context.previousLists);
      }
      getGlobalToast().error(getGlobalTranslations().errors.deleteEmailsFailed);
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
    onMutate: async ({ emailIds, isRead }) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.list() });
      const previousLists = snapshotEmailLists(queryClient);
      const ids = new Set(emailIds);
      patchEmailLists(
        queryClient,
        (email) => ids.has(email.id),
        (email) => ({ ...email, isRead })
      );
      return { previousLists };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
      // Refresh sidebar folder + label counts
      queryClient.invalidateQueries({ queryKey: folderKeys.list() });
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
    onError: (_, __, context) => {
      if (context?.previousLists) {
        restoreEmailLists(queryClient, context.previousLists);
      }
      getGlobalToast().error(getGlobalTranslations().errors.updateReadStatusFailed);
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
    onMutate: async ({ emailIds, isImportant }) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.list() });
      const previousLists = snapshotEmailLists(queryClient);
      const ids = new Set(emailIds);
      patchEmailLists(
        queryClient,
        (email) => ids.has(email.id),
        (email) => ({ ...email, isFlagged: isImportant })
      );
      return { previousLists };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.list() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
      // Refresh sidebar folder + label counts
      queryClient.invalidateQueries({ queryKey: folderKeys.list() });
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
    onError: (_, __, context) => {
      if (context?.previousLists) {
        restoreEmailLists(queryClient, context.previousLists);
      }
      getGlobalToast().error(getGlobalTranslations().errors.markEmailsFailed);
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
      // Refresh sidebar folder + label counts
      queryClient.invalidateQueries({ queryKey: folderKeys.list() });
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().errors.moveEmailsFailed);
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
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().errors.addLabelsFailed);
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
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().errors.removeLabelsFailed);
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
      getGlobalToast().error(getGlobalTranslations().errors.saveDraftFailed);
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
      getGlobalToast().error(getGlobalTranslations().errors.deleteDraftFailed);
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
      getGlobalToast().error(getGlobalTranslations().errors.calendarInviteFailed);
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
