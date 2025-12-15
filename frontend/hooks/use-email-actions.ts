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

        callbacksRef.current?.onSuccess?.('Email deleted successfully ✓');
      } catch (error) {
        logger.error('[EmailActions] Failed to delete email', { emailId, error });
        // Rollback: restore the deleted email
        if (emailToDelete) {
          useEmailStore.getState().addEmail(emailToDelete);
        }
        callbacksRef.current?.onError?.('Failed to delete email. Please try again.');
      }
    },
    [deleteEmail, deleteEmailMutation, invalidateEmailCaches]
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

        callbacksRef.current?.onSuccess?.(`${emailIds.length} email${emailIds.length > 1 ? 's' : ''} deleted successfully ✓`);
      } catch (error) {
        logger.error('[EmailActions] Failed to bulk delete emails', { count: emailIds.length, error });
        // Rollback: restore deleted emails
        if (emailsToDelete.length > 0) {
          const store = useEmailStore.getState();
          emailsToDelete.forEach((email) => store.addEmail(email));
        }
        callbacksRef.current?.onError?.('Failed to delete emails. Please try again.');
      }
    },
    [bulkDelete, bulkDeleteMutation, invalidateEmailCaches]
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

        const action = isRead ? 'read' : 'unread';
        callbacksRef.current?.onSuccess?.(`Marked as ${action} ✓`);
      } catch (error) {
        logger.error('[EmailActions] Failed to mark emails as read', { count: emailIds.length, isRead, error });
        // Rollback: restore previous read states
        const store = useEmailStore.getState();
        previousStates.forEach(({ id, isRead: wasRead }) => {
          store.updateEmail(id, { isRead: wasRead });
        });
        callbacksRef.current?.onError?.('Failed to update email status. Please try again.');
      }
    },
    [bulkMarkReadMutation, invalidateEmailCaches, markAsRead]
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

        callbacksRef.current?.onSuccess?.(newRead ? 'Marked as read ✓' : 'Marked as unread ✓');
      } catch (error) {
        logger.error('[EmailActions] Failed to toggle read status', { emailId, error });
        // Revert on error
        updateEmail(emailId, { isRead: currentRead });
        callbacksRef.current?.onError?.('Failed to update read status. Please try again.');
      }
    },
    [invalidateEmailCaches, updateEmail, updateEmailMutation]
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

        callbacksRef.current?.onSuccess?.(newStarred ? 'Email starred ✓' : 'Email unstarred ✓');
      } catch (error) {
        logger.error('[EmailActions] Failed to toggle star', { emailId, error });
        // Revert on error
        markAsStarred([emailId], currentStarred);
        callbacksRef.current?.onError?.('Failed to update star status. Please try again.');
      }
    },
    [bulkStarMutation, invalidateEmailCaches, markAsStarred]
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

        callbacksRef.current?.onSuccess?.(newImportant ? 'Marked as important ✓' : 'Unmarked as important ✓');
      } catch (error) {
        logger.error('[EmailActions] Failed to toggle important', { emailId, error });
        // Revert on error
        useEmailStore.getState().markAsImportant([emailId], currentImportant);
        callbacksRef.current?.onError?.('Failed to update important status. Please try again.');
      }
    },
    [bulkFlagMutation, invalidateEmailCaches]
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

        callbacksRef.current?.onSuccess?.(`${emailIds.length} email${emailIds.length > 1 ? 's' : ''} archived ✓`);
      } catch (error) {
        logger.error('[EmailActions] Failed to archive emails', { count: emailIds.length, error });
        // Rollback: restore previous folders
        const store = useEmailStore.getState();
        previousFolders.forEach(({ id, folder }) => {
          store.updateEmail(id, { folder });
        });
        callbacksRef.current?.onError?.('Failed to archive emails. Please try again.');
      }
    },
    [bulkMoveToFolderMutation, invalidateEmailCaches, moveToFolder]
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

        callbacksRef.current?.onSuccess?.(`${emailIds.length} email${emailIds.length > 1 ? 's' : ''} moved ✓`);
      } catch (error) {
        logger.error('[EmailActions] Failed to move emails to folder', { count: emailIds.length, folderId, error });
        // Rollback: restore previous folders
        const store = useEmailStore.getState();
        previousFolders.forEach(({ id, folder }) => {
          store.updateEmail(id, { folder });
        });
        callbacksRef.current?.onError?.('Failed to move emails. Please try again.');
      }
    },
    [bulkMoveToFolderMutation, invalidateEmailCaches, moveToFolder]
  );

  /**
   * Reply to email - uses query params to trigger compose dialog
   */
  const handleReply = useCallback(
    (email: Email) => {
      router.push({
        pathname: '/dashboard/email',
        query: {
          compose: 'reply',
          replyTo: email.id,
          to: email.from,
          subject: `Re: ${email.subject}`,
        },
      });
    },
    [router]
  );

  /**
   * Forward email - uses query params to trigger compose dialog
   */
  const handleForward = useCallback(
    (email: Email) => {
      router.push({
        pathname: '/dashboard/email',
        query: {
          compose: 'forward',
          forward: email.id,
          subject: `Fwd: ${email.subject}`,
        },
      });
    },
    [router]
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
          callbacksRef.current?.onError?.('Failed to mark email as read.');
        }
      }
    },
    [invalidateEmailCaches, setSelectedEmail, updateEmail, updateEmailMutation]
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
