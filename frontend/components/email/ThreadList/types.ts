/**
 * Type definitions for ThreadList component
 */

import type { Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';

/**
 * Props for ThreadList component
 */
export interface ThreadListProps {
  /** List of threads to display (emails or conversations) */
  threads: (Email | Conversation)[];

  /** Currently selected thread ID */
  selectedId?: string;

  /** Set of multi-selected thread IDs */
  selectedIds?: Set<string>;

  /** Whether data is loading */
  isLoading?: boolean;

  /** Callback when thread is clicked */
  onThreadClick?: (thread: Email | Conversation) => void;

  /** Callback to toggle selection */
  onToggleSelect?: (id: string) => void;

  /** Callback to toggle star */
  onToggleStar?: (id: string, isStarred: boolean) => void;

  /** Callback to toggle important */
  onToggleImportant?: (id: string, isImportant: boolean) => void;

  /** Callback to toggle read status */
  onToggleRead?: (id: string, isRead: boolean) => void;

  /** Callback to archive thread */
  onArchive?: (id: string) => void;

  /** Callback to delete thread */
  onDelete?: (id: string) => void;

  /** Custom provider icon renderer */
  getProviderIcon?: (providerId: string) => React.ReactNode;

  /** Callback to load more emails (infinite scroll) */
  onLoadMore?: () => void;

  /** Whether there are more emails to load */
  hasMore?: boolean;

  /** Custom empty state title */
  emptyTitle?: string;

  /** Custom empty state subtitle */
  emptySubtitle?: string;

  /** Enable drag-to-folder functionality */
  isDragEnabled?: boolean;

  /**
   * Enable virtualization for large lists
   * @default true for lists > 50 items
   */
  enableVirtualization?: boolean;

  /** Search query to highlight in subject and snippet */
  searchQuery?: string;
}

/**
 * Thread children state for expanded threads
 */
export type ThreadChildrenState = Record<string, { emails: Email[]; count: number }>;

/**
 * Get unique key for thread item
 * Best practice: use unique IDs instead of indices
 */
export function getThreadKey(thread: Email | Conversation): string {
  return ('id' in thread ? thread.id : thread.latestEmailId) || thread.threadId || '';
}

/**
 * Get thread ID from thread object
 */
export function getThreadId(thread: Email | Conversation): string {
  return thread.threadId || ('id' in thread ? thread.id : '') || '';
}
