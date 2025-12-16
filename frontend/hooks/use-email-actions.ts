import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEmailStore, type Email } from '@/stores/email-store';
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
import { useTranslations } from '@/lib/hooks/use-translations';

export interface EmailActionsCallbacks {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

/**
 * Email actions hook
 *
 * Provides centralized email actions with optimistic updates and error handling.
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
  const {
    updateEmail,
    deleteEmail,
    markAsRead,
    markAsStarred,
    bulkDelete,
    moveToFolder,
    setSelectedEmail,
  } = useEmailStore();

  const deleteEmailMutation = useDeleteEmail();
  const bulkDeleteMutation = useBulkDelete();
  const bulkMarkReadMutation = useBulkMarkRead();
  const bulkStarMutation = useBulkStar();
  const bulkFlagMutation = useBulkFlag();
  const bulkMoveToFolderMutation = useBulkMoveToFolder();
  const updateEmailMutation = useUpdateEmail();

  // CRITICAL FIX: Use refs for callbacks to prevent stale closures
  // This prevents all handlers from recreating on every render
  const callbacksRef = useRef<EmailActionsCallbacks | undefined>(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const getFolderLabel = useCallback(
    (folderId: string) => {
      const normalized = folderId.toUpperCase();
      switch (normalized) {
        case 'INBOX':
          return t.folders.inbox;
        case 'SENT':
          return t.folders.sent;
        case 'DRAFTS':
          return t.folders.drafts;
        case 'TRASH':
          return t.folders.trash;
        case 'SPAM':
          return t.folders.spam;
        case 'ARCHIVE':
          return t.folders.archive;
        case 'OUTBOX':
          return t.folders.outbox;
        case 'STARRED':
          return t.folders.starred;
        case 'ALL':
          return t.folders.all;
        default:
          return folderId;
      }
    },
    [
      t.folders.all,
      t.folders.archive,
      t.folders.drafts,
      t.folders.inbox,
      t.folders.outbox,
      t.folders.sent,
      t.folders.spam,
      t.folders.starred,
      t.folders.trash,
    ]
  );

  const invalidateEmailCaches = useCallback(
    (emailIds: string[]) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

      const { emails } = useEmailStore.getState();
      const threadKeys = new Set<string>();

      for (const emailId of emailIds) {
        queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
        const email = emails.find((e) => e.id === emailId);
        threadKeys.add(email?.threadId || emailId);
      }

      for (const threadKey of threadKeys) {
        queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadKey) });
      }
    },
    [queryClient],
  );

  /**
   * Delete a single email
   */
  const handleDelete = useCallback(
    async (emailId: string) => {
      // Save email for potential rollback
      const { emails } = useEmailStore.getState();
      const emailToDelete = emails.find((e) => e.id === emailId);

      try {
        // Optimistic update
        deleteEmail(emailId);

        // API call
        await deleteEmailMutation.mutateAsync(emailId);
        invalidateEmailCaches([emailId]);

        callbacksRef.current?.onSuccess?.(t.email.messages.deleted.replace('{count}', '1'));
      } catch (error) {
        logger.error('[EmailActions] Failed to delete email', { emailId, error });
        // Rollback: restore the deleted email
        if (emailToDelete) {
          useEmailStore.getState().addEmail(emailToDelete);
        }
        callbacksRef.current?.onError?.(t.email.messages.deleteFailed);
      }
    },
    [deleteEmail, deleteEmailMutation, invalidateEmailCaches, t.email.messages.deleteFailed, t.email.messages.deleted]
  );

  /**
   * Delete multiple emails
   */
  const handleBulkDelete = useCallback(
    async (emailIds: string[]) => {
      // Save emails for potential rollback
      const { emails } = useEmailStore.getState();
      const emailsToDelete = emails.filter((e) => emailIds.includes(e.id));

      try {
        // Optimistic update
        bulkDelete(emailIds);

        // Use bulk API endpoint (more efficient than Promise.all)
        await bulkDeleteMutation.mutateAsync(emailIds);
        invalidateEmailCaches(emailIds);

        callbacksRef.current?.onSuccess?.(t.email.messages.deleted.replace('{count}', emailIds.length.toString()));
      } catch (error) {
        logger.error('[EmailActions] Failed to bulk delete emails', { count: emailIds.length, error });
        // Rollback: restore deleted emails
        if (emailsToDelete.length > 0) {
          const store = useEmailStore.getState();
          emailsToDelete.forEach((email) => store.addEmail(email));
        }
        callbacksRef.current?.onError?.(t.email.messages.deleteFailed);
      }
    },
    [bulkDelete, bulkDeleteMutation, invalidateEmailCaches, t.email.messages.deleteFailed, t.email.messages.deleted]
  );

  /**
   * Mark email(s) as read/unread
   * CRITICAL FIX: Actually respects the isRead parameter (store's markAsRead was always setting true)
   */
  const handleMarkAsRead = useCallback(
    async (emailIds: string[], isRead: boolean = true) => {
      // Save previous read states for potential rollback
      const { emails } = useEmailStore.getState();
      const previousStates = emails
        .filter((e) => emailIds.includes(e.id))
        .map((e) => ({ id: e.id, isRead: e.isRead }));

      try {
        // Optimistic update - use updateEmail to support both read and unread
        // The store's markAsRead only sets to true, so we need to handle unread case
        if (isRead) {
          markAsRead(emailIds);
        } else {
          // For marking as unread, use updateEmail for each
          const store = useEmailStore.getState();
          emailIds.forEach((id) => {
            store.updateEmail(id, { isRead: false });
          });
        }

        // Use bulk API endpoint (more efficient than Promise.all)
        await bulkMarkReadMutation.mutateAsync({ emailIds, isRead });
        invalidateEmailCaches(emailIds);

        callbacksRef.current?.onSuccess?.(
          (isRead ? t.email.messages.markRead : t.email.messages.markUnread).replace('{count}', emailIds.length.toString())
        );
      } catch (error) {
        logger.error('[EmailActions] Failed to mark emails as read', { count: emailIds.length, isRead, error });
        // Rollback: restore previous read states
        const store = useEmailStore.getState();
        previousStates.forEach(({ id, isRead: wasRead }) => {
          store.updateEmail(id, { isRead: wasRead });
        });
        callbacksRef.current?.onError?.(isRead ? t.email.messages.markReadFailed : t.email.messages.markUnreadFailed);
      }
    },
    [
      bulkMarkReadMutation,
      invalidateEmailCaches,
      markAsRead,
      t.email.messages.markRead,
      t.email.messages.markReadFailed,
      t.email.messages.markUnread,
      t.email.messages.markUnreadFailed,
    ]
  );

  /**
   * Toggle read status on email
   */
  const handleToggleRead = useCallback(
    async (emailId: string, currentRead: boolean) => {
      const newRead = !currentRead;

      try {
        // Optimistic update
        updateEmail(emailId, { isRead: newRead });

        // API call
        await updateEmailMutation.mutateAsync({ emailId, data: { isRead: newRead } });
        invalidateEmailCaches([emailId]);

        callbacksRef.current?.onSuccess?.(
          (newRead ? t.email.messages.markRead : t.email.messages.markUnread).replace('{count}', '1')
        );
      } catch (error) {
        logger.error('[EmailActions] Failed to toggle read status', { emailId, error });
        // Revert on error
        updateEmail(emailId, { isRead: currentRead });
        callbacksRef.current?.onError?.(newRead ? t.email.messages.markReadFailed : t.email.messages.markUnreadFailed);
      }
    },
    [
      invalidateEmailCaches,
      t.email.messages.markRead,
      t.email.messages.markReadFailed,
      t.email.messages.markUnread,
      t.email.messages.markUnreadFailed,
      updateEmail,
      updateEmailMutation,
    ]
  );

  /**
   * Toggle star on email
   * PERFORMANCE FIX: Use bulk API endpoint instead of single-email endpoint
   */
  const handleToggleStar = useCallback(
    async (emailId: string, currentStarred: boolean) => {
      const newStarred = !currentStarred;

      try {
        // Optimistic update
        markAsStarred([emailId], newStarred);

        // PERFORMANCE FIX: Use bulk API endpoint (more efficient)
        await bulkStarMutation.mutateAsync({ emailIds: [emailId], isStarred: newStarred });
        invalidateEmailCaches([emailId]);

        callbacksRef.current?.onSuccess?.(
          (newStarred ? t.email.messages.starred : t.email.messages.unstarred).replace('{count}', '1')
        );
      } catch (error) {
        logger.error('[EmailActions] Failed to toggle star', { emailId, error });
        // Revert on error
        markAsStarred([emailId], currentStarred);
        callbacksRef.current?.onError?.(newStarred ? t.email.messages.starFailed : t.email.messages.unstarFailed);
      }
    },
    [
      bulkStarMutation,
      invalidateEmailCaches,
      markAsStarred,
      t.email.messages.starFailed,
      t.email.messages.starred,
      t.email.messages.unstarFailed,
      t.email.messages.unstarred,
    ]
  );

  /**
   * Toggle important status on email
   * PERFORMANCE FIX: Use bulk API endpoint and markAsImportant store method
   */
  const handleToggleImportant = useCallback(
    async (emailId: string, currentImportant: boolean) => {
      const newImportant = !currentImportant;

      try {
        // Optimistic update - use the dedicated store method
        useEmailStore.getState().markAsImportant([emailId], newImportant);

        // PERFORMANCE FIX: Use bulk API endpoint (more efficient)
        await bulkFlagMutation.mutateAsync({ emailIds: [emailId], isFlagged: newImportant });
        invalidateEmailCaches([emailId]);

        callbacksRef.current?.onSuccess?.(
          (newImportant ? t.email.messages.markedImportant : t.email.messages.unmarkedImportant).replace('{count}', '1')
        );
      } catch (error) {
        logger.error('[EmailActions] Failed to toggle important', { emailId, error });
        // Revert on error
        useEmailStore.getState().markAsImportant([emailId], currentImportant);
        callbacksRef.current?.onError?.(
          newImportant ? t.email.messages.markedImportantFailed : t.email.messages.unmarkedImportantFailed
        );
      }
    },
    [
      bulkFlagMutation,
      invalidateEmailCaches,
      t.email.messages.markedImportant,
      t.email.messages.markedImportantFailed,
      t.email.messages.unmarkedImportant,
      t.email.messages.unmarkedImportantFailed,
    ]
  );

  /**
   * Archive email (move to Archive folder)
   */
  const handleArchive = useCallback(
    async (emailIds: string[]) => {
      // Save previous folders for potential rollback
      const { emails } = useEmailStore.getState();
      const previousFolders = emails
        .filter((e) => emailIds.includes(e.id))
        .map((e) => ({ id: e.id, folder: e.folder }));

      try {
        // Optimistic update
        moveToFolder(emailIds, 'ARCHIVE');

        // Use bulk API endpoint (more efficient than Promise.all)
        await bulkMoveToFolderMutation.mutateAsync({ emailIds, folder: 'ARCHIVE' });
        invalidateEmailCaches(emailIds);

        callbacksRef.current?.onSuccess?.(
          t.email.messages.moved
            .replace('{count}', emailIds.length.toString())
            .replace('{folder}', t.folders.archive)
        );
      } catch (error) {
        logger.error('[EmailActions] Failed to archive emails', { count: emailIds.length, error });
        // Rollback: restore previous folders
        const store = useEmailStore.getState();
        previousFolders.forEach(({ id, folder }) => {
          store.updateEmail(id, { folder });
        });
        callbacksRef.current?.onError?.(t.email.messages.moveFailed);
      }
    },
    [bulkMoveToFolderMutation, invalidateEmailCaches, moveToFolder, t.email.messages.moveFailed, t.email.messages.moved, t.folders.archive]
  );

  /**
   * Move email(s) to folder
   */
  const handleMoveToFolder = useCallback(
    async (emailIds: string[], folderId: string) => {
      // Save previous folders for potential rollback
      const { emails } = useEmailStore.getState();
      const previousFolders = emails
        .filter((e) => emailIds.includes(e.id))
        .map((e) => ({ id: e.id, folder: e.folder }));

      try {
        // Optimistic update
        moveToFolder(emailIds, folderId);

        // Use bulk API endpoint (more efficient than Promise.all)
        await bulkMoveToFolderMutation.mutateAsync({ emailIds, folder: folderId });
        invalidateEmailCaches(emailIds);

        callbacksRef.current?.onSuccess?.(
          t.email.messages.moved
            .replace('{count}', emailIds.length.toString())
            .replace('{folder}', getFolderLabel(folderId))
        );
      } catch (error) {
        logger.error('[EmailActions] Failed to move emails to folder', { count: emailIds.length, folderId, error });
        // Rollback: restore previous folders
        const store = useEmailStore.getState();
        previousFolders.forEach(({ id, folder }) => {
          store.updateEmail(id, { folder });
        });
        callbacksRef.current?.onError?.(t.email.messages.moveFailed);
      }
    },
    [bulkMoveToFolderMutation, getFolderLabel, invalidateEmailCaches, moveToFolder, t.email.messages.moveFailed, t.email.messages.moved]
  );

  /**
   * Reply to email - uses query params to trigger compose dialog
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
   * Forward email - uses query params to trigger compose dialog
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

  /**
   * Open email in detail view
   * CRITICAL FIX: Added rollback on API failure
   */
  const handleEmailClick = useCallback(
    async (email: Email) => {
      // Set as selected
      setSelectedEmail(email);

      // Mark as read if unread
      if (!email.isRead) {
        try {
          // Optimistic update
          updateEmail(email.id, { isRead: true });
          await updateEmailMutation.mutateAsync({ emailId: email.id, data: { isRead: true } });
          invalidateEmailCaches([email.id]);
        } catch (error) {
          logger.error('[EmailActions] Failed to mark email as read on click', { emailId: email.id, error });
          // CRITICAL FIX: Rollback on failure
          updateEmail(email.id, { isRead: false });
          callbacksRef.current?.onError?.(t.email.messages.markReadFailed);
        }
      }
    },
    [invalidateEmailCaches, setSelectedEmail, t.email.messages.markReadFailed, updateEmail, updateEmailMutation]
  );

  return {
    handleDelete,
    handleBulkDelete,
    handleMarkAsRead,
    handleToggleRead,
    handleToggleStar,
    handleToggleImportant,
    handleArchive,
    handleMoveToFolder,
    handleReply,
    handleForward,
    handleEmailClick,
  };
}
