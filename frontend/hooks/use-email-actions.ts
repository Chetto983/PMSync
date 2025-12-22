/**
 * Email Actions Hook
 *
 * Centralized hook for email operations with optimistic updates and error handling.
 * Uses TanStack Query mutations with fire-and-forget pattern for better UX.
 *
 * Best practices implemented:
 * - Fire-and-forget mutations (mutate vs mutateAsync)
 * - TanStack Query handles cache rollback and error notification
 * - Zustand store for immediate UI feedback
 * - Proper error extraction using getApiErrorMessage
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/mutations
 * @see https://dev.to/emann/beautiful-error-handling-with-tanstack-query-and-axios-the-best-combo-1ai5
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEmailStore, type Email } from '@/stores/email-store';
import { type EmailListResponse } from '@/lib/api/email';
import { emailKeys } from '@/hooks/queries';
import {
  useBulkDelete,
  useBulkFlag,
  useBulkMarkRead,
  useBulkMoveToFolder,
  useBulkStar,
  useDeleteEmail,
  useUpdateEmail,
} from '@/hooks/mutations';
import { useRouter } from 'next/router';
import { logger } from '@/lib/logger';
import { getApiErrorMessage } from '@/lib/api-client';

import { useTranslations } from '@/lib/hooks/use-translations';

// ============================================================================
// Types
// ============================================================================

export interface EmailActionsCallbacks {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Replace count placeholder in translation string
 */
const replaceCount = (template: string, count: number) =>
  template.replace('{count}', String(count));

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Email actions hook providing centralized operations with optimistic updates.
 *
 * @example
 * ```tsx
 * const { handleDelete, handleMarkAsRead, handleToggleStar } = useEmailActions({
 *   onSuccess: (msg) => showSnackbar(msg, 'success'),
 *   onError: (msg) => showSnackbar(msg, 'error')
 * });
 *
 * <Button onClick={() => handleDelete(email.id)}>Delete</Button>
 * ```
 */
export function useEmailActions(callbacks?: EmailActionsCallbacks) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Zustand store actions
  const {
    updateEmail,
    deleteEmail,
    markAsRead,
    markAsStarred,
    bulkDelete,
    moveToFolder,
    setSelectedEmail,
  } = useEmailStore();

  // TanStack Query mutations
  const deleteEmailMutation = useDeleteEmail();
  const bulkDeleteMutation = useBulkDelete();
  const bulkMarkReadMutation = useBulkMarkRead();
  const bulkStarMutation = useBulkStar();
  const bulkFlagMutation = useBulkFlag();
  const bulkMoveToFolderMutation = useBulkMoveToFolder();
  const updateEmailMutation = useUpdateEmail();

  // Use refs for callbacks to prevent stale closures
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Get localized folder label
   */
  const getFolderLabel = useCallback(
    (folderId: string): string => {
      const normalized = folderId.toUpperCase();
      const folderMap: Record<string, string> = {
        INBOX: t.folders.inbox,
        SENT: t.folders.sent,
        DRAFTS: t.folders.drafts,
        TRASH: t.folders.trash,
        SPAM: t.folders.spam,
        ARCHIVE: t.folders.archive,
        OUTBOX: t.folders.outbox,
        STARRED: t.folders.starred,
        ALL: t.folders.all,
      };
      return folderMap[normalized] ?? folderId;
    },
    [t.folders]
  );

  /**
   * Invalidate email caches for the given email IDs
   */
  const invalidateEmailCaches = useCallback(
    (emailIds: string[]) => {
      // Invalidate list and stat queries
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

      // Invalidate individual email and thread queries
      const { emails } = useEmailStore.getState();
      const threadKeys = new Set<string>();

      for (const emailId of emailIds) {
        queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
        const email = emails.find((e) => e.id === emailId);
        if (email?.threadId) {
          threadKeys.add(email.threadId);
        }
      }

      for (const threadKey of threadKeys) {
        queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadKey) });
      }
    },
    [queryClient]
  );

  // ============================================================================
  // Single Email Actions
  // ============================================================================

  /**
   * Delete a single email
   */
  const handleDelete = useCallback(
    (emailId: string) => {
      const { emails } = useEmailStore.getState();
      const emailToDelete = emails.find((e) => e.id === emailId);

      // Optimistic update - Zustand
      deleteEmail(emailId);

      // Optimistic update - React Query (Infinite Lists & Flat Lists)
      queryClient.setQueriesData<any>(
        { queryKey: emailKeys.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;

          try {
            // Handle Infinite Query
            if (oldData.pages && Array.isArray(oldData.pages)) {
              return {
                ...oldData,
                pages: oldData.pages.map((page: EmailListResponse) => ({
                  ...page,
                  emails: page.emails ? page.emails.filter((email) => email.id !== emailId) : [],
                })),
              };
            }

            // Handle Flat Query
            if (oldData.emails && Array.isArray(oldData.emails)) {
              return {
                ...oldData,
                emails: oldData.emails.filter((email: Email) => email.id !== emailId),
              };
            }
          } catch (error) {
            console.error('[Optimistic Update Failed] Single Delete:', error);
            return oldData;
          }

          return oldData;
        }
      );

      // Fire mutation
      deleteEmailMutation.mutate(emailId, {
        onSuccess: () => {
          invalidateEmailCaches([emailId]);
          callbacksRef.current?.onSuccess?.(replaceCount(t.email.messages.deleted, 1));
        },
        onError: (error) => {
          // Rollback Zustand
          if (emailToDelete) {
            useEmailStore.getState().addEmail(emailToDelete);
          }
          // Rollback React Query
          queryClient.invalidateQueries({ queryKey: emailKeys.lists() });

          logger.error('[EmailActions] Failed to delete email', {
            emailId,
            errorMessage: getApiErrorMessage(error),
          });
          callbacksRef.current?.onError?.(t.email.messages.deleteFailed);
        },
      });
    },
    [deleteEmail, deleteEmailMutation, invalidateEmailCaches, queryClient, t.email.messages]
  );

  /**
   * Toggle read status on email
   */
  const handleToggleRead = useCallback(
    (emailId: string, currentRead: boolean) => {
      const newRead = !currentRead;

      // Optimistic update
      updateEmail(emailId, { isRead: newRead });

      // Fire mutation
      updateEmailMutation.mutate(
        { emailId, data: { isRead: newRead } },
        {
          onSuccess: () => {
            invalidateEmailCaches([emailId]);
            callbacksRef.current?.onSuccess?.(
              replaceCount(newRead ? t.email.messages.markRead : t.email.messages.markUnread, 1)
            );
          },
          onError: (error) => {
            // Rollback
            updateEmail(emailId, { isRead: currentRead });
            logger.error('[EmailActions] Failed to toggle read status', {
              emailId,
              errorMessage: getApiErrorMessage(error),
            });
            callbacksRef.current?.onError?.(
              newRead ? t.email.messages.markReadFailed : t.email.messages.markUnreadFailed
            );
          },
        }
      );
    },
    [invalidateEmailCaches, t.email.messages, updateEmail, updateEmailMutation]
  );

  /**
   * Toggle star on email
   */
  const handleToggleStar = useCallback(
    (emailId: string, currentStarred: boolean) => {
      const newStarred = !currentStarred;

      // Optimistic update
      markAsStarred([emailId], newStarred);

      // Fire mutation (use bulk endpoint - more efficient)
      bulkStarMutation.mutate(
        { emailIds: [emailId], isStarred: newStarred },
        {
          onSuccess: () => {
            invalidateEmailCaches([emailId]);
            callbacksRef.current?.onSuccess?.(
              replaceCount(newStarred ? t.email.messages.starred : t.email.messages.unstarred, 1)
            );
          },
          onError: (error) => {
            // Rollback
            markAsStarred([emailId], currentStarred);
            logger.error('[EmailActions] Failed to toggle star', {
              emailId,
              errorMessage: getApiErrorMessage(error),
            });
            callbacksRef.current?.onError?.(
              newStarred ? t.email.messages.starFailed : t.email.messages.unstarFailed
            );
          },
        }
      );
    },
    [bulkStarMutation, invalidateEmailCaches, markAsStarred, t.email.messages]
  );

  /**
   * Toggle important status on email
   */
  const handleToggleImportant = useCallback(
    (emailId: string, currentImportant: boolean) => {
      const newImportant = !currentImportant;

      // Optimistic update
      useEmailStore.getState().markAsImportant([emailId], newImportant);

      // Fire mutation (use bulk endpoint - more efficient)
      bulkFlagMutation.mutate(
        { emailIds: [emailId], isFlagged: newImportant },
        {
          onSuccess: () => {
            invalidateEmailCaches([emailId]);
            callbacksRef.current?.onSuccess?.(
              replaceCount(
                newImportant ? t.email.messages.markedImportant : t.email.messages.unmarkedImportant,
                1
              )
            );
          },
          onError: (error) => {
            // Rollback
            useEmailStore.getState().markAsImportant([emailId], currentImportant);
            logger.error('[EmailActions] Failed to toggle important', {
              emailId,
              errorMessage: getApiErrorMessage(error),
            });
            callbacksRef.current?.onError?.(
              newImportant ? t.email.messages.markedImportantFailed : t.email.messages.unmarkedImportantFailed
            );
          },
        }
      );
    },
    [bulkFlagMutation, invalidateEmailCaches, t.email.messages]
  );

  /**
   * Open email in detail view and mark as read
   */
  const handleEmailClick = useCallback(
    (email: Email) => {
      setSelectedEmail(email);

      // Mark as read if unread (fire-and-forget)
      if (!email.isRead) {
        updateEmail(email.id, { isRead: true });

        updateEmailMutation.mutate(
          { emailId: email.id, data: { isRead: true } },
          {
            onSuccess: () => invalidateEmailCaches([email.id]),
            onError: (error) => {
              updateEmail(email.id, { isRead: false });
              logger.error('[EmailActions] Failed to mark email as read', {
                emailId: email.id,
                errorMessage: getApiErrorMessage(error),
              });
            },
          }
        );
      }
    },
    [invalidateEmailCaches, setSelectedEmail, updateEmail, updateEmailMutation]
  );

  // ============================================================================
  // Bulk Email Actions
  // ============================================================================

  /**
   * Delete multiple emails
   */
  const handleBulkDelete = useCallback(
    (emailIds: string[]) => {
      const { emails } = useEmailStore.getState();
      const emailsToDelete = emails.filter((e) => emailIds.includes(e.id));

      // Optimistic update - Zustand
      bulkDelete(emailIds);

      // Optimistic update - React Query (Infinite Lists & Flat Lists)
      queryClient.setQueriesData<any>(
        { queryKey: emailKeys.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;

          try {
            // Handle Infinite Query
            if (oldData.pages && Array.isArray(oldData.pages)) {
              return {
                ...oldData,
                pages: oldData.pages.map((page: EmailListResponse) => ({
                  ...page,
                  emails: page.emails ? page.emails.filter((email) => !emailIds.includes(email.id)) : [],
                })),
              };
            }

            // Handle Flat Query
            if (oldData.emails && Array.isArray(oldData.emails)) {
              return {
                ...oldData,
                emails: oldData.emails.filter((email: Email) => !emailIds.includes(email.id)),
              };
            }
          } catch (error) {
            console.error('[Optimistic Update Failed] Bulk Delete:', error);
            return oldData;
          }

          return oldData;
        }
      );

      // Fire mutation
      bulkDeleteMutation.mutate(emailIds, {
        onSuccess: () => {
          invalidateEmailCaches(emailIds);
          callbacksRef.current?.onSuccess?.(replaceCount(t.email.messages.deleted, emailIds.length));
        },
        onError: (error) => {
          // Rollback Zustand
          const store = useEmailStore.getState();
          emailsToDelete.forEach((email) => store.addEmail(email));

          // Rollback React Query (refetch)
          queryClient.invalidateQueries({ queryKey: emailKeys.lists() });

          logger.error('[EmailActions] Failed to bulk delete emails', {
            count: emailIds.length,
            errorMessage: getApiErrorMessage(error),
          });
          callbacksRef.current?.onError?.(t.email.messages.deleteFailed);
        },
      });
    },
    [bulkDelete, bulkDeleteMutation, invalidateEmailCaches, queryClient, t.email.messages]
  );

  /**
   * Mark email(s) as read/unread
   */
  const handleMarkAsRead = useCallback(
    (emailIds: string[], isRead: boolean = true) => {
      const { emails } = useEmailStore.getState();
      const previousStates = emails
        .filter((e) => emailIds.includes(e.id))
        .map((e) => ({ id: e.id, isRead: e.isRead }));

      // Optimistic update
      if (isRead) {
        markAsRead(emailIds);
      } else {
        const store = useEmailStore.getState();
        emailIds.forEach((id) => store.updateEmail(id, { isRead: false }));
      }

      // Fire mutation
      bulkMarkReadMutation.mutate(
        { emailIds, isRead },
        {
          onSuccess: () => {
            invalidateEmailCaches(emailIds);
            callbacksRef.current?.onSuccess?.(
              replaceCount(isRead ? t.email.messages.markRead : t.email.messages.markUnread, emailIds.length)
            );
          },
          onError: (error) => {
            // Rollback
            const store = useEmailStore.getState();
            previousStates.forEach(({ id, isRead: wasRead }) => {
              store.updateEmail(id, { isRead: wasRead });
            });
            logger.error('[EmailActions] Failed to mark emails as read', {
              count: emailIds.length,
              isRead,
              errorMessage: getApiErrorMessage(error),
            });
            callbacksRef.current?.onError?.(
              isRead ? t.email.messages.markReadFailed : t.email.messages.markUnreadFailed
            );
          },
        }
      );
    },
    [bulkMarkReadMutation, invalidateEmailCaches, markAsRead, t.email.messages]
  );

  /**
   * Archive email(s) - move to Archive folder
   */
  const handleArchive = useCallback(
    (emailIds: string[]) => {
      const { emails } = useEmailStore.getState();
      const previousFolders = emails
        .filter((e) => emailIds.includes(e.id))
        .map((e) => ({ id: e.id, folder: e.folder }));

      // Optimistic update
      moveToFolder(emailIds, 'ARCHIVE');

      // Fire mutation
      bulkMoveToFolderMutation.mutate(
        { emailIds, folder: 'ARCHIVE' },
        {
          onSuccess: () => {
            invalidateEmailCaches(emailIds);
            callbacksRef.current?.onSuccess?.(
              replaceCount(t.email.messages.moved, emailIds.length).replace('{folder}', t.folders.archive)
            );
          },
          onError: (error) => {
            // Rollback
            const store = useEmailStore.getState();
            previousFolders.forEach(({ id, folder }) => store.updateEmail(id, { folder }));
            logger.error('[EmailActions] Failed to archive emails', {
              count: emailIds.length,
              errorMessage: getApiErrorMessage(error),
            });
            callbacksRef.current?.onError?.(t.email.messages.moveFailed);
          },
        }
      );
    },
    [bulkMoveToFolderMutation, invalidateEmailCaches, moveToFolder, t.email.messages, t.folders.archive]
  );

  /**
   * Move email(s) to folder
   */
  const handleMoveToFolder = useCallback(
    (emailIds: string[], folderId: string) => {
      const { emails } = useEmailStore.getState();
      const previousFolders = emails
        .filter((e) => emailIds.includes(e.id))
        .map((e) => ({ id: e.id, folder: e.folder }));

      // Optimistic update
      moveToFolder(emailIds, folderId);

      // Fire mutation
      bulkMoveToFolderMutation.mutate(
        { emailIds, folder: folderId },
        {
          onSuccess: () => {
            invalidateEmailCaches(emailIds);
            callbacksRef.current?.onSuccess?.(
              replaceCount(t.email.messages.moved, emailIds.length).replace('{folder}', getFolderLabel(folderId))
            );
          },
          onError: (error) => {
            // Rollback
            const store = useEmailStore.getState();
            previousFolders.forEach(({ id, folder }) => store.updateEmail(id, { folder }));
            logger.error('[EmailActions] Failed to move emails', {
              count: emailIds.length,
              folderId,
              errorMessage: getApiErrorMessage(error),
            });
            callbacksRef.current?.onError?.(t.email.messages.moveFailed);
          },
        }
      );
    },
    [bulkMoveToFolderMutation, getFolderLabel, invalidateEmailCaches, moveToFolder, t.email.messages]
  );

  // ============================================================================
  // Navigation Actions
  // ============================================================================

  /**
   * Reply to email - navigates with compose params
   */
  const handleReply = useCallback(
    (email: Email) => {
      const replyPrefix = t.email.composer.replyPrefix;
      const subject = email.subject?.trim() || '';
      const replySubject = subject.toLowerCase().startsWith(replyPrefix.toLowerCase())
        ? subject
        : `${replyPrefix} ${subject}`.trim();

      router.push({
        pathname: '/dashboard/email',
        query: {
          compose: 'reply',
          replyTo: email.id,
          to: email.from,
          subject: replySubject,
        },
      });
    },
    [router, t.email.composer.replyPrefix]
  );

  /**
   * Forward email - navigates with compose params
   */
  const handleForward = useCallback(
    (email: Email) => {
      const forwardPrefix = t.email.composer.forwardPrefix;
      const subject = email.subject?.trim() || '';
      const forwardSubject = subject.toLowerCase().startsWith(forwardPrefix.toLowerCase())
        ? subject
        : `${forwardPrefix} ${subject}`.trim();

      router.push({
        pathname: '/dashboard/email',
        query: {
          compose: 'forward',
          forward: email.id,
          subject: forwardSubject,
        },
      });
    },
    [router, t.email.composer.forwardPrefix]
  );

  // ============================================================================
  // Return API
  // ============================================================================

  return {
    // Single email actions
    handleDelete,
    handleToggleRead,
    handleToggleStar,
    handleToggleImportant,
    handleEmailClick,
    // Bulk actions
    handleBulkDelete,
    handleMarkAsRead,
    handleArchive,
    handleMoveToFolder,
    // Navigation
    handleReply,
    handleForward,
  };
}
