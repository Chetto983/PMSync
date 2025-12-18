/**
 * TanStack Query mutation hooks for email operations
 *
 * Best practices implemented:
 * - Optimistic updates with rollback on error
 * - Proper cache invalidation after mutations
 * - Type-safe mutation variables and context
 * - Integration with existing Zustand stores for UI updates
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/mutations
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  emailApi,
  type Email,
  type EmailUpdateData,
  type SendEmailPayload,
  type ReplyForwardEmailPayload,
  type EmailListResponse,
} from '@/lib/api/email';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { AppTranslations } from '@/locales';
import { emailKeys } from '../queries/email-keys';

const replaceCount = (template: string, count: number) => template.replace('{count}', String(count));

const resolveFolderLabel = (folders: AppTranslations['folders'], folderId: string) => {
  const normalized = folderId.toUpperCase();
  switch (normalized) {
    case 'INBOX':
      return folders.inbox;
    case 'SENT':
      return folders.sent;
    case 'DRAFTS':
      return folders.drafts;
    case 'TRASH':
      return folders.trash;
    case 'SPAM':
      return folders.spam;
    case 'ARCHIVE':
      return folders.archive;
    case 'OUTBOX':
      return folders.outbox;
    case 'STARRED':
      return folders.starred;
    case 'ALL':
      return folders.all;
    default:
      return folderId;
  }
};

// ============================================================================
// Types
// ============================================================================

interface MutationCallbacks {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

// ============================================================================
// Single Email Mutations
// ============================================================================

/**
 * Hook for updating email flags (read, starred, flagged, folder)
 *
 * @example
 * ```tsx
 * const { mutate: updateEmail, isPending } = useUpdateEmail({
 *   onSuccess: (msg) => toast.success(msg),
 *   onError: (msg) => toast.error(msg),
 * });
 *
 * updateEmail({ emailId: 'abc', data: { isRead: true } });
 * ```
 */
export function useUpdateEmail(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ emailId, data }: { emailId: string; data: EmailUpdateData }) => {
      const response = await emailApi.updateEmail(emailId, data);
      return response.data;
    },
    onMutate: async ({ emailId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: emailKeys.lists() });
      await queryClient.cancelQueries({ queryKey: emailKeys.detail(emailId) });

      // Snapshot previous value for rollback
      const previousEmail = queryClient.getQueryData<Email>(emailKeys.detail(emailId));

      // Optimistically update single email cache
      if (previousEmail) {
        queryClient.setQueryData<Email>(emailKeys.detail(emailId), {
          ...previousEmail,
          ...data,
        });
      }

      // Optimistically update list caches (all matching lists)
      queryClient.setQueriesData<EmailListResponse>(
        { queryKey: emailKeys.lists() },
        (old) => {
          if (!old?.emails) return old;
          return {
            ...old,
            emails: old.emails.map((email) =>
              email.id === emailId ? { ...email, ...data } : email
            ),
          };
        }
      );

      return { previousEmail };
    },
    onError: (_error, { emailId, data }, context) => {
      // Rollback on error
      if (context?.previousEmail) {
        queryClient.setQueryData(emailKeys.detail(emailId), context.previousEmail);
      }
      // Invalidate lists to refetch correct state
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });

      const message =
        data.isRead !== undefined
          ? data.isRead
            ? t.email.messages.markReadFailed
            : t.email.messages.markUnreadFailed
          : data.isStarred !== undefined
            ? data.isStarred
              ? t.email.messages.starFailed
              : t.email.messages.unstarFailed
            : data.isFlagged !== undefined
              ? data.isFlagged
                ? t.email.messages.markedImportantFailed
                : t.email.messages.unmarkedImportantFailed
              : data.folder !== undefined
                ? t.email.messages.moveFailed
                : data.isDeleted !== undefined && data.isDeleted
                  ? t.email.messages.deleteFailed
                  : t.errors.processingError;

      callbacks?.onError?.(message);
    },
    onSuccess: (_, { data }) => {
      const message =
        data.isRead !== undefined
          ? replaceCount(data.isRead ? t.email.messages.markRead : t.email.messages.markUnread, 1)
          : data.isStarred !== undefined
            ? replaceCount(data.isStarred ? t.email.messages.starred : t.email.messages.unstarred, 1)
            : data.isFlagged !== undefined
              ? replaceCount(
                  data.isFlagged ? t.email.messages.markedImportant : t.email.messages.unmarkedImportant,
                  1,
                )
              : data.folder !== undefined
                ? replaceCount(t.email.messages.moved, 1).replace(
                    '{folder}',
                    resolveFolderLabel(t.folders, data.folder),
                  )
                : data.isDeleted !== undefined && data.isDeleted
                  ? replaceCount(t.email.messages.deleted, 1)
                  : undefined;

      if (message) {
        callbacks?.onSuccess?.(message);
      }
    },
    onSettled: (_, __, { emailId }) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
  });
}

/**
 * Hook for deleting a single email
 */
export function useDeleteEmail(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (emailId: string) => {
      await emailApi.deleteEmail(emailId);
      return emailId;
    },
    onMutate: async (emailId) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.lists() });

      // Remove from all list caches
      queryClient.setQueriesData<EmailListResponse>(
        { queryKey: emailKeys.lists() },
        (old) => {
          if (!old?.emails || !old?.pagination) return old;
          return {
            ...old,
            emails: old.emails.filter((email) => email.id !== emailId),
            pagination: {
              ...old.pagination,
              total: old.pagination.total - 1,
            },
          };
        }
      );

      return {};
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      callbacks?.onError?.(t.email.messages.deleteFailed);
    },
    onSuccess: () => {
      callbacks?.onSuccess?.(replaceCount(t.email.messages.deleted, 1));
    },
    onSettled: (emailId) => {
      // Remove from detail cache
      if (emailId) {
        queryClient.removeQueries({ queryKey: emailKeys.detail(emailId) });
      }
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
  });
}

// ============================================================================
// Bulk Email Mutations
// ============================================================================

/**
 * Hook for bulk marking emails as read/unread
 */
export function useBulkMarkRead(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ emailIds, isRead }: { emailIds: string[]; isRead: boolean }) => {
      const response = await emailApi.bulkMarkRead(emailIds, isRead);
      return response.data;
    },
    onMutate: async ({ emailIds, isRead }) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.lists() });

      queryClient.setQueriesData<EmailListResponse>(
        { queryKey: emailKeys.lists() },
        (old) => {
          if (!old?.emails) return old;
          return {
            ...old,
            emails: old.emails.map((email) =>
              emailIds.includes(email.id) ? { ...email, isRead } : email
            ),
          };
        }
      );

      return {};
    },
    onError: (_error, { isRead }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      callbacks?.onError?.(isRead ? t.email.messages.markReadFailed : t.email.messages.markUnreadFailed);
    },
    onSuccess: (_, { emailIds, isRead }) => {
      callbacks?.onSuccess?.(
        replaceCount(isRead ? t.email.messages.markRead : t.email.messages.markUnread, emailIds.length)
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
  });
}

/**
 * Hook for bulk starring/unstarring emails
 */
export function useBulkStar(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ emailIds, isStarred }: { emailIds: string[]; isStarred: boolean }) => {
      const response = await emailApi.bulkStar(emailIds, isStarred);
      return response.data;
    },
    onMutate: async ({ emailIds, isStarred }) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.lists() });

      queryClient.setQueriesData<EmailListResponse>(
        { queryKey: emailKeys.lists() },
        (old) => {
          if (!old?.emails) return old;
          return {
            ...old,
            emails: old.emails.map((email) =>
              emailIds.includes(email.id) ? { ...email, isStarred } : email
            ),
          };
        }
      );

      return {};
    },
    onError: (_error, { isStarred }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      callbacks?.onError?.(isStarred ? t.email.messages.starFailed : t.email.messages.unstarFailed);
    },
    onSuccess: (_, { emailIds, isStarred }) => {
      callbacks?.onSuccess?.(
        replaceCount(isStarred ? t.email.messages.starred : t.email.messages.unstarred, emailIds.length)
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
  });
}

/**
 * Hook for bulk flagging/unflagging emails (mark as important)
 */
export function useBulkFlag(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ emailIds, isFlagged }: { emailIds: string[]; isFlagged: boolean }) => {
      const response = await emailApi.bulkFlag(emailIds, isFlagged);
      return response.data;
    },
    onMutate: async ({ emailIds, isFlagged }) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.lists() });

      queryClient.setQueriesData<EmailListResponse>(
        { queryKey: emailKeys.lists() },
        (old) => {
          if (!old?.emails) return old;
          return {
            ...old,
            emails: old.emails.map((email) =>
              emailIds.includes(email.id) ? { ...email, isFlagged } : email
            ),
          };
        }
      );

      return {};
    },
    onError: (_error, { isFlagged }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      callbacks?.onError?.(isFlagged ? t.email.messages.markedImportantFailed : t.email.messages.unmarkedImportantFailed);
    },
    onSuccess: (_, { emailIds, isFlagged }) => {
      callbacks?.onSuccess?.(
        replaceCount(
          isFlagged ? t.email.messages.markedImportant : t.email.messages.unmarkedImportant,
          emailIds.length,
        )
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    },
  });
}

/**
 * Hook for bulk moving emails to a folder
 */
export function useBulkMoveToFolder(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ emailIds, folder }: { emailIds: string[]; folder: string }) => {
      const response = await emailApi.bulkMoveToFolder(emailIds, folder);
      return response.data;
    },
    onMutate: async ({ emailIds, folder }) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.lists() });

      queryClient.setQueriesData<EmailListResponse>(
        { queryKey: emailKeys.lists() },
        (old) => {
          if (!old?.emails) return old;
          return {
            ...old,
            emails: old.emails.map((email) =>
              emailIds.includes(email.id) ? { ...email, folder } : email
            ),
          };
        }
      );

      return {};
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      callbacks?.onError?.(t.email.messages.moveFailed);
    },
    onSuccess: (_, { emailIds, folder }) => {
      callbacks?.onSuccess?.(
        replaceCount(t.email.messages.moved, emailIds.length).replace('{folder}', resolveFolderLabel(t.folders, folder))
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
  });
}

/**
 * Hook for bulk deleting emails
 */
export function useBulkDelete(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (emailIds: string[]) => {
      const response = await emailApi.bulkDelete(emailIds);
      return { ...response.data, emailIds };
    },
    onMutate: async (emailIds) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.lists() });

      queryClient.setQueriesData<EmailListResponse>(
        { queryKey: emailKeys.lists() },
        (old) => {
          if (!old?.emails || !old?.pagination) return old;
          return {
            ...old,
            emails: old.emails.filter((email) => !emailIds.includes(email.id)),
            pagination: {
              ...old.pagination,
              total: old.pagination.total - emailIds.length,
            },
          };
        }
      );

      return {};
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      callbacks?.onError?.(t.email.messages.deleteFailed);
    },
    onSuccess: (result) => {
      callbacks?.onSuccess?.(replaceCount(t.email.messages.deleted, result.emailIds.length));
    },
    onSettled: (result) => {
      // Remove from detail caches
      result?.emailIds.forEach((emailId) => {
        queryClient.removeQueries({ queryKey: emailKeys.detail(emailId) });
      });
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
  });
}

/**
 * Hook for bulk adding labels to emails
 */
export function useBulkAddLabels(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ emailIds, labelIds }: { emailIds: string[]; labelIds: string[] }) => {
      const response = await emailApi.bulkAddLabels(emailIds, labelIds);
      return response.data;
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      callbacks?.onError?.(t.email.messages.labelsFailed);
    },
    onSuccess: (_, { emailIds }) => {
      callbacks?.onSuccess?.(replaceCount(t.email.messages.labelsAdded, emailIds.length));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    },
  });
}

/**
 * Hook for bulk removing labels from emails
 */
export function useBulkRemoveLabels(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ emailIds, labelIds }: { emailIds: string[]; labelIds: string[] }) => {
      const response = await emailApi.bulkRemoveLabels(emailIds, labelIds);
      return response.data;
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      callbacks?.onError?.(t.email.messages.labelsFailed);
    },
    onSuccess: () => {
      callbacks?.onSuccess?.(t.email.messages.labelsUpdated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    },
  });
}

// ============================================================================
// Send/Reply/Forward Mutations
// ============================================================================

/**
 * Hook for sending a new email
 */
export function useSendEmail(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (payload: SendEmailPayload) => {
      const response = await emailApi.sendEmail(payload);
      return response.data;
    },
    onError: () => {
      callbacks?.onError?.(t.email.composer.sendError);
    },
    onSuccess: () => {
      callbacks?.onSuccess?.(t.email.messages.emailSent);
    },
    onSettled: () => {
      // Invalidate sent folder
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.drafts() });
    },
  });
}

/**
 * Hook for replying to an email
 */
export function useReplyEmail(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ emailId, payload }: { emailId: string; payload: ReplyForwardEmailPayload }) => {
      const response = await emailApi.replyToEmail(emailId, payload);
      return response.data;
    },
    onError: () => {
      callbacks?.onError?.(t.email.composer.sendError);
    },
    onSuccess: () => {
      callbacks?.onSuccess?.(t.email.messages.emailSent);
    },
    onSettled: (_, __, { emailId }) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
      queryClient.invalidateQueries({ queryKey: emailKeys.threads() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
  });
}

/**
 * Hook for forwarding an email
 */
export function useForwardEmail(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ emailId, payload }: { emailId: string; payload: ReplyForwardEmailPayload }) => {
      const response = await emailApi.forwardEmail(emailId, payload);
      return response.data;
    },
    onError: () => {
      callbacks?.onError?.(t.email.composer.sendError);
    },
    onSuccess: () => {
      callbacks?.onSuccess?.(t.email.messages.emailSent);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    },
  });
}

// ============================================================================
// Draft Mutations
// ============================================================================

/**
 * Hook for saving/updating a draft
 */
export function useSaveDraft(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      providerId: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
    }) => {
      const response = await emailApi.saveDraft(payload);
      return response.data;
    },
    onSuccess: () => {
      callbacks?.onSuccess?.(t.email.composer.draftSaved);
    },
    onError: () => {
      callbacks?.onError?.(t.email.composer.draftSaveFailed);
    },
    onSettled: (data) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.drafts() });
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: emailKeys.draft(data.id) });
      }
    },
  });
}

/**
 * Hook for deleting a draft
 */
export function useDeleteDraft(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (draftId: string) => {
      await emailApi.deleteDraft(draftId);
      return draftId;
    },
    onSuccess: () => {
      callbacks?.onSuccess?.(t.email.composer.draftDeleted);
    },
    onError: () => {
      callbacks?.onError?.(t.email.composer.draftDeleteFailed);
    },
    onSettled: (draftId) => {
      if (draftId) {
        queryClient.removeQueries({ queryKey: emailKeys.draft(draftId) });
      }
      queryClient.invalidateQueries({ queryKey: emailKeys.drafts() });
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    },
  });
}

// ============================================================================
// Sync Mutations
// ============================================================================

/**
 * Hook for triggering email sync for a provider
 */
export function useSyncProvider(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (providerId: string) => {
      const response = await emailApi.syncProvider(providerId);
      return response.data;
    },
    onSuccess: () => {
      callbacks?.onSuccess?.(t.email.messages.syncTriggered);
    },
    onError: () => {
      callbacks?.onError?.(t.email.messages.syncFailed);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.syncStatus() });
    },
  });
}

/**
 * Hook for fetching archived email from server
 */
export function useFetchArchivedEmail(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (emailId: string) => {
      const response = await emailApi.fetchArchivedEmail(emailId);
      return response.data;
    },
    onSuccess: (data) => {
      // Update the cache with the restored email
      queryClient.setQueryData(emailKeys.detail(data.id), data);
    },
    onError: () => {
      callbacks?.onError?.(t.errors.processingError);
    },
    onSettled: (data) => {
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: emailKeys.detail(data.id) });
      }
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    },
  });
}
