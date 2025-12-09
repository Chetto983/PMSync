import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { List, Box, Typography, CircularProgress } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThreadListItem } from './ThreadListItem';
import { ThreadListSkeleton } from './ThreadListSkeleton';
import { DraggableThreadListItem } from './shared';
import { useEmailStore, type Email } from '@/stores/email-store';
import { emailApi, type Conversation } from '@/lib/api/email';

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

  /**
   * Enable virtualization for large lists
   * @default true for lists > 50 items
   */
  enableVirtualization?: boolean;

  /**
   * Search query to highlight in subject and snippet
   */
  searchQuery?: string;
}

/**
 * Get unique key for thread item
 * Best practice: use unique IDs instead of indices
 * @see https://borstch.com/blog/development/achieving-smooth-scrolling-in-react-with-tanstack-virtual-best-practices
 */
function getThreadKey(thread: Email | Conversation): string {
  return ('id' in thread ? thread.id : thread.latestEmailId) || thread.threadId || '';
}

/**
 * ThreadList - Unified component for displaying email threads
 *
 * Replaces both EmailList and ConversationList with a single, flexible component.
 * Supports both individual emails and conversation threads.
 *
 * Features:
 * - TanStack Virtual for efficient rendering of large lists (2025 best practice)
 * - Skeleton loading states for better perceived performance
 * - Floating action bar on each item
 * - Multi-selection support
 * - Infinite scroll with Intersection Observer
 * - Optimized with React.memo
 *
 * @see https://tanstack.com/virtual/latest
 * @see https://borstch.com/blog/development/achieving-smooth-scrolling-in-react-with-tanstack-virtual-best-practices
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
  enableVirtualization,
  searchQuery,
}) => {
  const t = useTranslations();
  const parentRef = useRef<HTMLDivElement>(null);

  // Track expanded threads and their child emails
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [threadChildEmails, setThreadChildEmails] = useState<Map<string, Email[]>>(new Map());

  // Get thread data from store for thread count badges
  const emailStore = useEmailStore();

  // Pre-compute thread email counts in O(n) instead of O(n²)
  // Build a Map of threadId -> email count once, then use it for all threads
  const threadEmailCounts = useMemo(() => {
    const counts = new Map<string, number>();
    // Count emails per threadId from the store's threads map
    emailStore.threads.forEach((emailIds, threadId) => {
      counts.set(threadId, emailIds.length);
    });
    return counts;
  }, [emailStore.threads]);

  // Enhance threads with email count for thread conversations
  const threadsWithCount = useMemo(() => {
    return threads.map(thread => {
      if ('providerId' in thread && thread.threadId) {
        // This is an Email with a threadId - check if it's part of a multi-email thread
        const count = threadEmailCounts.get(thread.threadId) || 1;
        if (count > 1) {
          // Add emailCount property for display (this is what ThreadListItem looks for)
          return {
            ...thread,
            emailCount: count,
          } as Email & { emailCount: number };
        }
      }
      return thread;
    });
  }, [threads, threadEmailCounts]);

  // Clean up expansion state when threads change (e.g., after bulk delete)
  // This prevents stale expanded state for deleted threads
  useEffect(() => {
    const validThreadIds = new Set(
      threads.map(t => t.threadId || ('id' in t ? t.id : ''))
    );

    // Clean up expandedThreads - remove deleted thread IDs
    setExpandedThreads(prev => {
      let hasChanges = false;
      const cleaned = new Set(prev);
      for (const threadId of cleaned) {
        if (!validThreadIds.has(threadId)) {
          cleaned.delete(threadId);
          hasChanges = true;
        }
      }
      return hasChanges ? cleaned : prev;
    });

    // Clean up threadChildEmails - remove deleted thread entries
    setThreadChildEmails(prev => {
      let hasChanges = false;
      const cleaned = new Map(prev);
      for (const threadId of cleaned.keys()) {
        if (!validThreadIds.has(threadId)) {
          cleaned.delete(threadId);
          hasChanges = true;
        }
      }
      return hasChanges ? cleaned : prev;
    });
  }, [threads]);

  // Auto-enable virtualization for lists > 50 items (2025 best practice)
  const shouldVirtualize = enableVirtualization ?? threadsWithCount.length > 50;

  // Store threads ref for stable key getter (prevents scroll position reset on data changes)
  const threadsRef = useRef(threadsWithCount);
  threadsRef.current = threadsWithCount;

  // Track previous count to detect appends (infinite scroll)
  const prevCountRef = useRef(threadsWithCount.length);

  // Memoized key getter for virtualizer - uses ref to avoid dependency on threadsWithCount
  // This prevents the virtualizer from resetting scroll position when new emails are appended
  const getItemKey = useCallback((index: number) => {
    const thread = threadsRef.current[index];
    return thread ? getThreadKey(thread) : `item-${index}`;
  }, []); // Empty deps - uses ref for stable reference

  // TanStack Virtual setup
  const virtualizer = useVirtualizer({
    count: threadsWithCount.length,
    getScrollElement: () => parentRef.current,
    // Estimate size based on typical ThreadListItem height
    // Dynamic sizing adjusts this after render
    estimateSize: () => 100,
    // Overscan: render extra items above/below viewport for smoother scrolling
    overscan: 5,
    // Use unique IDs as keys (best practice)
    getItemKey,
    // Enable only when needed
    enabled: shouldVirtualize,
  });

  // CRITICAL FIX: Preserve scroll position when new items are appended (infinite scroll)
  // Store scroll position before any update, restore after render if items were appended
  const savedScrollRef = useRef<number>(0);

  // Save scroll position before threadsWithCount changes
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (scrollElement) {
      savedScrollRef.current = scrollElement.scrollTop;
    }
  }); // Run on every render to capture scroll before state update

  useEffect(() => {
    const prevCount = prevCountRef.current;
    const newCount = threadsWithCount.length;

    // Only preserve scroll when appending (count increased from a non-zero value)
    // If count went from 0 to N, or from N to 0, let it reset naturally
    if (prevCount > 0 && newCount > prevCount && savedScrollRef.current > 0) {
      const scrollElement = parentRef.current;
      if (scrollElement) {
        // Use double RAF to ensure DOM has updated
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollElement.scrollTop === 0 && savedScrollRef.current > 0) {
              scrollElement.scrollTop = savedScrollRef.current;
            }
          });
        });
      }
    }

    prevCountRef.current = newCount;
  }, [threadsWithCount.length]);

  const handleThreadClick = useCallback(
    (thread: Email | Conversation) => {
      onThreadClick?.(thread);
    },
    [onThreadClick]
  );

  // Handle thread expansion toggle
  const handleToggleExpand = useCallback(async (threadId: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
        // Fetch child emails if not already loaded
        if (!threadChildEmails.has(threadId)) {
          emailApi.getThread(threadId).then(res => {
            // Sort by date ascending (oldest first) and exclude the first (shown in list)
            const sortedEmails = res.data
              .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime())
              .slice(0, -1); // Exclude the latest (already shown)
            setThreadChildEmails(prev => new Map(prev).set(threadId, sortedEmails));
          }).catch(() => {
            // Silently fail - just don't show expanded emails
          });
        }
      }
      return next;
    });
  }, [threadChildEmails]);

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    if (!onLoadMore || !hasMore || !shouldVirtualize) return;

    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      // Load more when 200px from bottom
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !isLoading) {
        onLoadMore();
      }
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [onLoadMore, hasMore, isLoading, shouldVirtualize]);

  // Fallback infinite scroll for non-virtualized lists
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onLoadMore || !hasMore || shouldVirtualize) return;

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
        rootMargin: '100px',
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoading, shouldVirtualize]);

  const isEmpty = threads.length === 0;

  // Loading state - show skeleton placeholders if loading AND no threads
  // Skeleton loaders provide better UX than spinners (2025 best practice)
  if (isLoading && isEmpty) {
    return <ThreadListSkeleton count={10} showCheckbox={!!onToggleSelect} />;
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

  // Render item helper
  const renderThread = (thread: Email | Conversation, measureRef?: (el: HTMLElement | null) => void) => {
    const threadId = thread.threadId || ('id' in thread ? thread.id : '') || '';
    const isMultiSelected = selectedIds.has(threadId);
    const emailCount = 'emailCount' in thread ? (thread as { emailCount?: number }).emailCount : undefined;
    const isExpanded = expandedThreads.has(threadId);
    const childEmails = threadChildEmails.get(threadId) || [];

    return (
      <>
        <DraggableThreadListItem
          thread={thread}
          isDragEnabled={isDragEnabled}
          isSelected={isMultiSelected}
        >
          <div ref={measureRef}>
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
              searchQuery={searchQuery}
              isExpanded={isExpanded}
              onToggleExpand={emailCount && emailCount > 1 ? handleToggleExpand : undefined}
            />
          </div>
        </DraggableThreadListItem>
        {/* Render child emails when expanded */}
        {isExpanded && childEmails.map((childEmail) => (
          <Box
            key={childEmail.id}
            sx={{ pl: 4, borderLeft: '2px solid', borderColor: 'divider', ml: 2 }}
          >
            <ThreadListItem
              thread={childEmail}
              selected={selectedId === childEmail.id}
              multiSelected={selectedIds.has(childEmail.id)}
              onToggleSelect={onToggleSelect}
              onToggleRead={onToggleRead}
              onToggleStar={onToggleStar}
              onToggleImportant={onToggleImportant}
              onArchive={onArchive}
              onDelete={onDelete}
              getProviderIcon={getProviderIcon}
              onClick={() => handleThreadClick(childEmail)}
              searchQuery={searchQuery}
            />
          </Box>
        ))}
      </>
    );
  };

  // Virtualized rendering for large lists
  if (shouldVirtualize) {
    const virtualItems = virtualizer.getVirtualItems();

    return (
      <Box
        ref={parentRef}
        sx={{
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          contain: 'strict',
        }}
      >
        <List
          sx={{
            width: '100%',
            p: 0,
            position: 'relative',
            height: virtualizer.getTotalSize(),
          }}
        >
          {virtualItems.map((virtualItem) => {
            const thread = threadsWithCount[virtualItem.index];
            if (!thread) return null;

            return (
              <Box
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {renderThread(thread)}
              </Box>
            );
          })}
        </List>

        {/* Loading indicator for infinite scroll */}
        {hasMore && isLoading && (
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
      </Box>
    );
  }

  // Standard rendering for smaller lists (< 50 items)
  return (
    <List
      sx={{
        width: '100%',
        height: '100%',
        p: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {threadsWithCount.map((thread) => {
        const uniqueKey = getThreadKey(thread);
        return (
          <React.Fragment key={uniqueKey}>
            {renderThread(thread)}
          </React.Fragment>
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
