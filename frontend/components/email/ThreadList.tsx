import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { List, Box, Typography, CircularProgress } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThreadListItem } from './ThreadListItem';
import { DraggableThreadListItem } from './shared';
import { useEmailStore, type Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';
import { scrollContainerSx } from './shared/utils';

/**
 * Props for ThreadList component
 */
interface ThreadListProps {
  /**
   * List of threads to display (emails or conversations)
   */
  threads: (Email | Conversation)[];

  /**
   * Currently selected thread ID
   */
  selectedId?: string;

  /**
   * Set of multi-selected thread IDs
   */
  selectedIds?: Set<string>;

  /**
   * Whether data is loading
   */
  isLoading?: boolean;

  /**
   * Callback when thread is clicked
   */
  onThreadClick?: (thread: Email | Conversation) => void;

  /**
   * Callback to toggle selection
   */
  onToggleSelect?: (id: string) => void;

  /**
   * Callback to toggle star
   */
  onToggleStar?: (id: string, isStarred: boolean) => void;

  /**
   * Callback to toggle important
   */
  onToggleImportant?: (id: string, isImportant: boolean) => void;

  /**
   * Callback to toggle read status
   */
  onToggleRead?: (id: string, isRead: boolean) => void;

  /**
   * Callback to archive thread
   */
  onArchive?: (id: string) => void;

  /**
   * Callback to delete thread
   */
  onDelete?: (id: string) => void;

  /**
   * Custom provider icon renderer
   */
  getProviderIcon?: (providerId: string) => React.ReactNode;

  /**
   * Callback to load more emails (infinite scroll)
   */
  onLoadMore?: () => void;

  /**
   * Whether there are more emails to load
   */
  hasMore?: boolean;

  /**
   * Custom empty state title
   */
  emptyTitle?: string;

  /**
   * Custom empty state subtitle
   */
  emptySubtitle?: string;

  /**
   * Enable drag-to-folder functionality
   */
  isDragEnabled?: boolean;
}

/**
 * ThreadList - Unified component for displaying email threads
 *
 * Replaces both EmailList and ConversationList with a single, flexible component.
 * Supports both individual emails and conversation threads.
 *
 * Features:
 * - Virtualization support for large lists
 * - Floating action bar on each item
 * - Multi-selection support
 * - Loading states
 * - Empty states
 * - Optimized performance with React.memo
 *
 * @example
 * ```tsx
 * <ThreadList
 *   threads={emails}
 *   selectedId={selectedEmail?.id}
 *   selectedIds={selectedIds}
 *   onThreadClick={handleThreadClick}
 *   onToggleStar={handleToggleStar}
 *   onToggleImportant={handleToggleImportant}
 *   onArchive={handleArchive}
 *   onDelete={handleDelete}
 * />
 * ```
 */
export const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  selectedId,
  selectedIds = new Set(),
  isLoading = false,
  onThreadClick,
  onToggleSelect,
  onToggleRead,
  onToggleStar,
  onToggleImportant,
  onArchive,
  onDelete,
  getProviderIcon,
  onLoadMore,
  hasMore = false,
  emptyTitle,
  emptySubtitle,
  isDragEnabled = true,
}) => {
  const t = useTranslations();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Get thread data from store for thread count badges
  const emailStore = useEmailStore();

  // Enhance threads with email count for thread conversations
  const threadsWithCount = useMemo(() => {
    return threads.map(thread => {
      if ('providerId' in thread && thread.threadId) {
        // This is an Email with a threadId - check if it's part of a multi-email thread
        const threadEmails = emailStore.getThreadEmails(thread.threadId);
        if (threadEmails.length > 1) {
          // Add emailCount property for display (this is what ThreadListItem looks for)
          return {
            ...thread,
            emailCount: threadEmails.length,
          } as Email & { emailCount: number };
        }
      }
      return thread;
    });
  }, [threads, emailStore]);

  const handleThreadClick = useCallback(
    (thread: Email | Conversation) => {
      onThreadClick?.(thread);
    },
    [onThreadClick]
  );

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      {
        root: null,
        rootMargin: '100px', // Start loading 100px before reaching the end
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, hasMore, isLoading]);

  const isEmpty = threads.length === 0;

  // Loading state - only show full spinner if loading AND no threads
  // This prevents hiding existing emails during infinite scroll
  if (isLoading && isEmpty) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          minHeight: 200,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Empty state
  if (isEmpty) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          minHeight: 200,
          px: 3,
          textAlign: 'center',
        }}
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          {emptyTitle ?? 'No emails'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {emptySubtitle ?? t.common.allCaughtUp}
        </Typography>
      </Box>
    );
  }

  return (
    <List
      sx={{
        width: '100%',
        height: '100%',
        p: 0,
        ...scrollContainerSx,
      }}
    >
      {threadsWithCount.map((thread) => {
        const threadId = thread.threadId || ('id' in thread ? thread.id : '') || '';
        // Use unique email ID for React key to prevent duplicates when emails share threadId
        const uniqueKey = ('id' in thread ? thread.id : thread.latestEmailId) || threadId || `thread-${Math.random()}`;
        const isMultiSelected = selectedIds.has(threadId);

        return (
          <DraggableThreadListItem
            key={uniqueKey}
            thread={thread}
            isDragEnabled={isDragEnabled}
            isSelected={isMultiSelected}
          >
            <ThreadListItem
              thread={thread}
              selected={selectedId === threadId}
              multiSelected={isMultiSelected}
              onToggleSelect={onToggleSelect}
              onToggleRead={onToggleRead}
              onToggleStar={onToggleStar}
              onToggleImportant={onToggleImportant}
              onArchive={onArchive}
              onDelete={onDelete}
              getProviderIcon={getProviderIcon}
              onClick={() => handleThreadClick(thread)}
            />
          </DraggableThreadListItem>
        );
      })}

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <Box
          ref={sentinelRef}
          sx={{
            height: 1,
            width: '100%',
          }}
        />
      )}

      {/* Loading indicator for infinite scroll */}
      {hasMore && isLoading && threads.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            py: 2,
          }}
        >
          <CircularProgress size={24} />
        </Box>
      )}
    </List>
  );
};

// Export memoized version for performance
export default React.memo(ThreadList);
