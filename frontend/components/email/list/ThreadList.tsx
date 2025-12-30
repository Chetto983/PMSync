/**
 * Thread List Container Component
 *
 * Virtual scrolling email list with @tanstack/react-virtual
 * Handles 10,000+ emails with 60 FPS performance
 *
 * Features:
 * - Virtual scrolling (render only visible items)
 * - Infinite scroll (automatic pagination)
 * - Bulk selection
 * - Optimistic UI updates
 * - Empty states
 *
 * Performance targets:
 * - 60 FPS scrolling
 * - <500ms initial render
 * - <50KB bundle size
 */

import { useState, useCallback, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThreadListHeader } from './ThreadListHeader';
import { ThreadListItem, ThreadListItemData } from './ThreadListItem';
import { DraggableThreadListItem } from './DraggableThreadListItem';
import { EmptyState, EmptyStateVariant } from './EmptyState';

// Drag and drop data types
interface EmailDragData {
  type: 'email';
  emailId: string;
  providerId: string;
  thread: ThreadListItemData;
}

interface FolderDragData {
  type: 'folder';
  folderId: string;
  providerId: string;
  folderName?: string;
}

interface ThreadListProps {
  /** Email threads to display */
  threads: ThreadListItemData[];
  /** Loading state */
  isLoading?: boolean;
  /** Loading more (pagination) */
  isLoadingMore?: boolean;
  /** Has more items to load */
  hasMore?: boolean;
  /** Empty state variant */
  emptyVariant?: EmptyStateVariant;
  /** Callbacks */
  onThreadClick: (id: string) => void;
  onRefresh: () => void;
  onLoadMore?: () => void;
  onBulkMarkAsRead?: (ids: string[]) => void;
  onBulkMarkAsUnread?: (ids: string[]) => void;
  onBulkArchive?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkMove?: (ids: string[]) => void;
  onBulkLabel?: (ids: string[]) => void;
  onFlag?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Drag and drop handler */
  onEmailDrop?: (emailIds: string[], folderId: string, folderName: string) => void;
}

/**
 * Virtual scrolling email list container
 *
 * Uses @tanstack/react-virtual for optimal performance
 * with large email lists (10,000+ items)
 */
export function ThreadList({
  threads,
  isLoading = false,
  isLoadingMore = false,
  hasMore = false,
  emptyVariant = 'inbox',
  onThreadClick,
  onRefresh,
  onLoadMore,
  onBulkMarkAsRead,
  onBulkMarkAsUnread,
  onBulkArchive,
  onBulkDelete,
  onBulkMove,
  onBulkLabel,
  onFlag,
  onArchive,
  onDelete,
  onEmailDrop,
}: ThreadListProps) {
  const t = useTranslations();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Drag and drop state
  const [activeId, setActiveId] = useState<string | null>(null);

  // Configure DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Virtual scrolling setup
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96, // 3-line layout height
    overscan: 5, // Render 5 extra items above/below viewport
  });

  // Selection helpers
  const allSelected = threads.length > 0 && selectedIds.size === threads.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(threads.map((t) => t.id)));
  }, [threads]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Bulk action handlers
  const getSelectedIds = () => Array.from(selectedIds);

  const handleBulkMarkAsRead = () => {
    onBulkMarkAsRead?.(getSelectedIds());
    setSelectedIds(new Set());
  };

  const handleBulkMarkAsUnread = () => {
    onBulkMarkAsUnread?.(getSelectedIds());
    setSelectedIds(new Set());
  };

  const handleBulkArchive = () => {
    onBulkArchive?.(getSelectedIds());
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    onBulkDelete?.(getSelectedIds());
    setSelectedIds(new Set());
  };

  const handleBulkMove = () => {
    onBulkMove?.(getSelectedIds());
    // Keep selection for folder picker
  };

  const handleBulkLabel = () => {
    onBulkLabel?.(getSelectedIds());
    // Keep selection for label picker
  };

  // Individual action handlers
  const handleFlag = (id: string) => onFlag?.(id);
  const handleArchive = (id: string) => onArchive?.(id);
  const handleDelete = (id: string) => onDelete?.(id);

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);

    if (!over || !onEmailDrop) return;

    const emailId = active.id as string;
    const folderId = over.id as string;
    const folderData = over.data.current as FolderDragData | undefined;
    const folderName = folderData?.folderName || 'folder';

    // Get provider IDs for validation
    const emailData = active.data.current as EmailDragData | undefined;
    const emailProviderId = emailData?.providerId;
    const folderProviderId = folderData?.providerId;

    // Provider guardrail: only allow drops within same provider
    if (emailProviderId && folderProviderId && emailProviderId !== folderProviderId) {
      // Toast error handled in email.tsx
      return;
    }

    onEmailDrop([emailId], folderId, folderName);
  };

  // Get active thread for DragOverlay
  const getActiveThread = (): (ThreadListItemData & { providerId: string }) | null => {
    if (!activeId) return null;
    const thread = threads.find((t) => t.id === activeId);
    return thread && thread.providerId ? (thread as ThreadListItemData & { providerId: string }) : null;
  };

  const activeThread = getActiveThread();

  // Infinite scroll - load more when near bottom
  const virtualItems = virtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  // Trigger load more when scrolled near bottom
  if (
    lastItem &&
    lastItem.index >= threads.length - 5 &&
    hasMore &&
    !isLoadingMore &&
    onLoadMore
  ) {
    onLoadMore();
  }

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 2,
        }}
      >
        <CircularProgress size={40} />
        <Typography variant="body2" color="text.secondary">
          {t.emailList.loading}
        </Typography>
      </Box>
    );
  }

  // Empty state
  if (threads.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <ThreadListHeader
          totalCount={0}
          selectedCount={0}
          allSelected={false}
          someSelected={false}
          isRefreshing={isRefreshing}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onRefresh={handleRefresh}
          onMarkAsRead={handleBulkMarkAsRead}
          onMarkAsUnread={handleBulkMarkAsUnread}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onMoveToFolder={handleBulkMove}
          onAddLabel={handleBulkLabel}
        />
        <EmptyState variant={emptyVariant} />
      </Box>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Header with bulk actions */}
        <ThreadListHeader
        totalCount={threads.length}
        selectedCount={selectedIds.size}
        allSelected={allSelected}
        someSelected={someSelected}
        isRefreshing={isRefreshing}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onRefresh={handleRefresh}
        onMarkAsRead={handleBulkMarkAsRead}
        onMarkAsUnread={handleBulkMarkAsUnread}
        onArchive={handleBulkArchive}
        onDelete={handleBulkDelete}
        onMoveToFolder={handleBulkMove}
        onAddLabel={handleBulkLabel}
      />

      {/* Virtual scrolling container */}
      <Box
        ref={parentRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {/* Virtual list with proper sizing */}
        <Box
          sx={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {/* Render only visible items */}
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const thread = threads[virtualRow.index];
            if (!thread) return null;

            const isSelected = selectedIds.has(thread.id);
            const isHovered = hoveredId === thread.id;

            return (
              <Box
                key={thread.id}
                data-index={virtualRow.index}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {thread.providerId ? (
                  <DraggableThreadListItem
                    thread={thread as ThreadListItemData & { providerId: string }}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    onSelect={handleSelect}
                    onClick={onThreadClick}
                    onFlag={handleFlag}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onMouseEnter={() => setHoveredId(thread.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                ) : (
                  <ThreadListItem
                    thread={thread}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    onSelect={handleSelect}
                    onClick={onThreadClick}
                    onFlag={handleFlag}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onMouseEnter={() => setHoveredId(thread.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                )}
              </Box>
            );
          })}
        </Box>

        {/* Loading more indicator */}
        {isLoadingMore && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              py: 2,
            }}
          >
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              {t.emailList.loadingMore}
            </Typography>
          </Box>
        )}
      </Box>

      {/* DragOverlay for smooth drag animation (250ms ease) */}
      <DragOverlay dropAnimation={{ duration: 250, easing: 'ease' }}>
        {activeThread ? (
          <Box
            sx={{
              opacity: 0.8,
              transform: 'scale(1.02)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
              borderRadius: 1,
              bgcolor: 'background.paper',
            }}
          >
            <ThreadListItem
              thread={activeThread}
              isSelected={false}
              isHovered={false}
              onSelect={() => {}}
              onClick={() => {}}
              onFlag={() => {}}
              onArchive={() => {}}
              onDelete={() => {}}
              onMouseEnter={() => {}}
              onMouseLeave={() => {}}
            />
          </Box>
        ) : null}
      </DragOverlay>
    </Box>
    </DndContext>
  );
}

export default ThreadList;
