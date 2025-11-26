import { useCallback } from 'react';
import { useEmailStore, type Email } from '@/stores/email-store';
import { emailApi } from '@/lib/api/email';
import { useRouter } from 'next/router';

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
  const {
    updateEmail,
    deleteEmail,
    markAsRead,
    markAsStarred,
    bulkDelete,
    moveToFolder,
    setSelectedEmail,
  } = useEmailStore();

  /**
   * Delete a single email
   */
  const handleDelete = useCallback(
    async (emailId: string) => {
      try {
        // Optimistic update
        deleteEmail(emailId);

        // API call
        await emailApi.deleteEmail(emailId);

        callbacks?.onSuccess?.('Email deleted successfully ✓');
      } catch (error) {
        console.error('Failed to delete email:', error);
        callbacks?.onError?.('Failed to delete email. Please try again.');
      }
    },
    [deleteEmail, callbacks]
  );

  /**
   * Delete multiple emails
   */
  const handleBulkDelete = useCallback(
    async (emailIds: string[]) => {
      try {
        // Optimistic update
        bulkDelete(emailIds);

        // Use bulk API endpoint (more efficient than Promise.all)
        await emailApi.bulkDelete(emailIds);

        callbacks?.onSuccess?.(`${emailIds.length} email${emailIds.length > 1 ? 's' : ''} deleted successfully ✓`);
      } catch (error) {
        console.error('Failed to bulk delete emails:', error);
        callbacks?.onError?.('Failed to delete emails. Please try again.');
      }
    },
    [bulkDelete, callbacks]
  );

  /**
   * Mark email(s) as read/unread
   */
  const handleMarkAsRead = useCallback(
    async (emailIds: string[], isRead: boolean = true) => {
      try {
        // Optimistic update
        markAsRead(emailIds);

        // Use bulk API endpoint (more efficient than Promise.all)
        await emailApi.bulkMarkRead(emailIds, isRead);

        const action = isRead ? 'read' : 'unread';
        callbacks?.onSuccess?.(`Marked as ${action} ✓`);
      } catch (error) {
        console.error('Failed to mark emails as read:', error);
        callbacks?.onError?.('Failed to update email status. Please try again.');
      }
    },
    [markAsRead, callbacks]
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
        await emailApi.updateEmail(emailId, { isRead: newRead });

        callbacks?.onSuccess?.(newRead ? 'Marked as read ✓' : 'Marked as unread ✓');
      } catch (error) {
        console.error('Failed to toggle read status:', error);
        // Revert on error
        updateEmail(emailId, { isRead: currentRead });
        callbacks?.onError?.('Failed to update read status. Please try again.');
      }
    },
    [updateEmail, callbacks]
  );

  /**
   * Toggle star on email
   */
  const handleToggleStar = useCallback(
    async (emailId: string, currentStarred: boolean) => {
      const newStarred = !currentStarred;

      try {
        // Optimistic update
        markAsStarred([emailId], newStarred);

        // API call
        await emailApi.updateEmail(emailId, { isStarred: newStarred });

        callbacks?.onSuccess?.(newStarred ? 'Email starred ✓' : 'Email unstarred ✓');
      } catch (error) {
        console.error('Failed to toggle star:', error);
        // Revert on error
        markAsStarred([emailId], currentStarred);
        callbacks?.onError?.('Failed to update star status. Please try again.');
      }
    },
    [markAsStarred, callbacks]
  );

  /**
   * Toggle important status on email
   */
  const handleToggleImportant = useCallback(
    async (emailId: string, currentImportant: boolean) => {
      const newImportant = !currentImportant;

      try {
        // Optimistic update (using updateEmail for now)
        updateEmail(emailId, { isImportant: newImportant });

        // API call (backend uses isFlagged instead of isImportant)
        await emailApi.updateEmail(emailId, { isFlagged: newImportant });

        callbacks?.onSuccess?.(newImportant ? 'Marked as important ✓' : 'Unmarked as important ✓');
      } catch (error) {
        console.error('Failed to toggle important:', error);
        // Revert on error
        updateEmail(emailId, { isImportant: currentImportant });
        callbacks?.onError?.('Failed to update important status. Please try again.');
      }
    },
    [updateEmail, callbacks]
  );

  /**
   * Archive email (move to Archive folder)
   */
  const handleArchive = useCallback(
    async (emailIds: string[]) => {
      try {
        // Optimistic update
        moveToFolder(emailIds, 'ARCHIVE');

        // Use bulk API endpoint (more efficient than Promise.all)
        await emailApi.bulkMoveToFolder(emailIds, 'ARCHIVE');

        callbacks?.onSuccess?.(`${emailIds.length} email${emailIds.length > 1 ? 's' : ''} archived ✓`);
      } catch (error) {
        console.error('Failed to archive emails:', error);
        callbacks?.onError?.('Failed to archive emails. Please try again.');
      }
    },
    [moveToFolder, callbacks]
  );

  /**
   * Move email(s) to folder
   */
  const handleMoveToFolder = useCallback(
    async (emailIds: string[], folderId: string) => {
      try {
        // Optimistic update
        moveToFolder(emailIds, folderId);

        // Use bulk API endpoint (more efficient than Promise.all)
        await emailApi.bulkMoveToFolder(emailIds, folderId);

        callbacks?.onSuccess?.(`${emailIds.length} email${emailIds.length > 1 ? 's' : ''} moved ✓`);
      } catch (error) {
        console.error('Failed to move emails to folder:', error);
        callbacks?.onError?.('Failed to move emails. Please try again.');
      }
    },
    [moveToFolder, callbacks]
  );

  /**
   * Reply to email
   */
  const handleReply = useCallback(
    (email: Email) => {
      router.push({
        pathname: '/dashboard/email/compose',
        query: {
          replyTo: email.id,
          to: email.from,
          subject: `Re: ${email.subject}`,
        },
      });
    },
    [router]
  );

  /**
   * Forward email
   */
  const handleForward = useCallback(
    (email: Email) => {
      router.push({
        pathname: '/dashboard/email/compose',
        query: {
          forward: email.id,
          subject: `Fwd: ${email.subject}`,
          body: email.body,
        },
      });
    },
    [router]
  );

  /**
   * Open email in detail view
   */
  const handleEmailClick = useCallback(
    async (email: Email) => {
      // Set as selected
      setSelectedEmail(email);

      // Mark as read if unread
      if (!email.isRead) {
        try {
          updateEmail(email.id, { isRead: true });
          await emailApi.updateEmail(email.id, { isRead: true });
        } catch (error) {
          console.error('Failed to mark email as read:', error);
        }
      }
    },
    [setSelectedEmail, updateEmail]
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
