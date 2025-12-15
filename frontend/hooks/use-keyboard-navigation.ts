import { useEffect } from 'react';
import { useEmailStore, type Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';

/**
 * Keyboard navigation hook for email list
 *
 * Supports:
 * - j/k: Navigate up/down
 * - Enter: Open email
 * - d: Delete
 * - s: Star
 * - r: Reply
 *
 * @example
 * ```tsx
 * const { handleDelete, handleReply } = useEmailActions();
 * useKeyboardNavigation({
 *   emails,
 *   onDelete: handleDelete,
 *   onReply: handleReply,
 * });
 * ```
 */
export function useKeyboardNavigation(options: {
  threads: (Email | Conversation)[];
  enabled?: boolean;
  onDelete?: (id: string) => void;
  onReply?: (email: Email) => void;
  onToggleStar?: (id: string, isStarred: boolean) => void;
  onThreadClick?: (thread: Email | Conversation) => void;
}) {
  const { threads, enabled = true, onDelete, onReply, onToggleStar, onThreadClick } = options;
  const { selectedEmail, setSelectedEmail } = useEmailStore();

  useEffect(() => {
    if (!enabled || threads.length === 0 || typeof window === 'undefined') return;

    const getThreadKey = (thread: Email | Conversation) => {
      if ('providerId' in thread) return thread.threadId || thread.id;
      return thread.threadId;
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if ((e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
      }

      const selectedKey = selectedEmail ? (selectedEmail.threadId || selectedEmail.id) : '';
      const currentIndex = selectedEmail ? threads.findIndex((thread) => getThreadKey(thread) === selectedKey) : -1;

      const openThreadAtIndex = (index: number) => {
        const thread = threads[index];
        if (!thread) return;

        if (onThreadClick) {
          onThreadClick(thread);
          return;
        }

        if ('providerId' in thread) {
          setSelectedEmail(thread);
        }
      };

      switch (e.key.toLowerCase()) {
        case 'j': // Next email
          e.preventDefault();
          if (currentIndex < threads.length - 1) {
            openThreadAtIndex(currentIndex + 1);
          }
          break;

        case 'k': // Previous email
          e.preventDefault();
          if (currentIndex > 0) {
            openThreadAtIndex(currentIndex - 1);
          } else if (currentIndex === -1 && threads.length > 0) {
            openThreadAtIndex(0);
          }
          break;

        case 'enter': // Open email
          if (selectedEmail && currentIndex !== -1) {
            openThreadAtIndex(currentIndex);
          }
          break;

        case 'd': // Delete
          if (selectedEmail && onDelete) {
            e.preventDefault();
            onDelete(selectedEmail.id);
          }
          break;

        case 's': // Toggle star
          if (selectedEmail && onToggleStar) {
            e.preventDefault();
            onToggleStar(selectedEmail.id, selectedEmail.isStarred || false);
          }
          break;

        case 'r': // Reply
          if (selectedEmail && onReply) {
            e.preventDefault();
            onReply(selectedEmail);
          }
          break;

        case 'escape': // Close detail view
          e.preventDefault();
          setSelectedEmail(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [enabled, threads, selectedEmail, setSelectedEmail, onDelete, onReply, onToggleStar, onThreadClick]);
}
