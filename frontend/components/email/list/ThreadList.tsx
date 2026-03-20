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

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Box, CircularProgress, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
// DragOverlay is centralized in EmailLayout
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailUIStore } from '@/stores/email-ui-store';
import { getDraggedEmailIds } from '@/components/email/utils/email-behavior';
// DnD state is managed by EmailLayout - no need to access here
import { ThreadListHeader } from './ThreadListHeader';
import { ThreadListItem, ThreadListItemData } from './ThreadListItem';
import { DraggableThreadListItem } from './DraggableThreadListItem';
import { EmailContextMenu } from './EmailContextMenu';
import { EmptyState, EmptyStateVariant } from './EmptyState';
import { ThreadListSkeleton } from './ThreadListSkeleton';
import { FolderPickerDialog } from '../folders/FolderPickerDialog';

// Module-level scroll cache — survives remounts (mobile nav back)
const scrollCache = new Map<string, number>();

interface ThreadListProps {
  /** Email threads to display */
  threads: ThreadListItemData[];
  /** Total email count from API pagination (not just loaded count) */
  totalCount?: number;
  /** Key for scroll position cache (e.g. folder+search hash) */
  scrollKey?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Loading more (pagination) */
  isLoadingMore?: boolean;
  /** Has more items to load */
  hasMore?: boolean;
  /** Empty state variant */
  emptyVariant?: EmptyStateVariant;
  /** Keyboard navigation: currently focused item ID */
  focusedId?: string | null;
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
  isBulkActionPending?: boolean;
  /** CTA callback for empty state (e.g. clear search, compose) */
  onEmptyAction?: () => void;
}

/**
 * Virtual scrolling email list container
 *
 * Uses @tanstack/react-virtual for optimal performance
 * with large email lists (10,000+ items)
 */
export function ThreadList({
  threads,
  totalCount,
  scrollKey,
  isLoading = false,
  isLoadingMore = false,
  hasMore = false,
  emptyVariant = 'inbox',
  focusedId,
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
  isBulkActionPending = false,
  onEmptyAction,
}: ThreadListProps) {
  const t = useTranslations();
  const theme = useTheme();
  // Only enable drag on desktop (md breakpoint and up)
  // Mobile uses touch scroll, and DndContext isn't available in mobile layouts anyway
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  // Selection state from Zustand store (replaces local useState)
  const {
    selectedIds,
    lastSelectedId,
    selectEmail,
    toggleSelection,
    selectRange,
    selectAll,
    clearSelection,
  } = useEmailUIStore();

  // Local UI state (hover, refreshing, folder picker)
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Folder picker state (mobile move-to-folder action)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [moveEmailId, setMoveEmailId] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    position: { top: number; left: number } | null;
    emailId: string | null;
  }>({ position: null, emailId: null });

  const handleContextMenu = useCallback((e: React.MouseEvent, thread: ThreadListItemData) => {
    e.preventDefault();
    setContextMenu({ position: { top: e.clientY, left: e.clientX }, emailId: thread.id });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ position: null, emailId: null });
  }, []);

  // DnD state is managed by EmailLayout's DndContext

  // Virtual scrolling setup
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // Compact 2-line layout (~52-72px actual)
    overscan: 10, // Production standard: 10 items above/below viewport
  });

  // Scroll position restore on mount (anti-pattern #4 fix)
  useEffect(() => {
    if (!scrollKey || !parentRef.current) return;
    const saved = scrollCache.get(scrollKey);
    if (saved) parentRef.current.scrollTop = saved;
  }, [scrollKey]);

  // Scroll position save on unmount
  useEffect(() => {
    const el = parentRef.current;
    const key = scrollKey;
    return () => {
      if (key && el) scrollCache.set(key, el.scrollTop);
    };
  }, [scrollKey]);

  // Selection helpers
  const allSelected = threads.length > 0 && selectedIds.size === threads.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const selectedIdsByProvider = useMemo(() => {
    const idsByProvider = new Map<string, string[]>();

    threads.forEach((thread) => {
      if (!thread.providerId || !selectedIds.has(thread.id)) return;

      const current = idsByProvider.get(thread.providerId) ?? [];
      current.push(thread.id);
      idsByProvider.set(thread.providerId, current);
    });

    return idsByProvider;
  }, [selectedIds, threads]);

  const handleSelectAll = useCallback(() => {
    selectAll(threads.map((t) => t.id));
  }, [threads, selectAll]);

  const handleDeselectAll = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Handle select with modifier key detection for Shift+click range selection
  const handleSelect = useCallback(
    (id: string, checked: boolean, event?: React.MouseEvent) => {
      const threadIds = threads.map((t) => t.id);

      if (event?.shiftKey && lastSelectedId) {
        // Shift+click: range selection from last selected to clicked
        selectRange(lastSelectedId, id, threadIds);
      } else if (event?.ctrlKey || event?.metaKey) {
        // Ctrl/Cmd+click: toggle single selection
        toggleSelection(id);
      } else {
        // Normal click: single select (replaces selection)
        if (checked) {
          selectEmail(id);
        } else {
          toggleSelection(id);
        }
      }
    },
    [threads, lastSelectedId, selectRange, toggleSelection, selectEmail]
  );

  // CRITICAL FIX: Memoized mouse event handlers to prevent re-renders
  const handleMouseEnter = useCallback((id: string) => {
    setHoveredId(id);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  // Refresh handler - FIXED: Memoized
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  // Bulk action handlers - use store selection, parent handles clearing via callback
  const handleBulkMarkAsRead = useCallback(() => {
    onBulkMarkAsRead?.(Array.from(selectedIds));
  }, [onBulkMarkAsRead, selectedIds]);

  const handleBulkMarkAsUnread = useCallback(() => {
    onBulkMarkAsUnread?.(Array.from(selectedIds));
  }, [onBulkMarkAsUnread, selectedIds]);

  const handleBulkArchive = useCallback(() => {
    onBulkArchive?.(Array.from(selectedIds));
  }, [onBulkArchive, selectedIds]);

  const handleBulkDelete = useCallback(() => {
    onBulkDelete?.(Array.from(selectedIds));
  }, [onBulkDelete, selectedIds]);

  const handleBulkMove = useCallback(() => {
    onBulkMove?.(Array.from(selectedIds));
    // Keep selection for folder picker
  }, [onBulkMove, selectedIds]);

  const handleBulkLabel = useCallback(() => {
    onBulkLabel?.(Array.from(selectedIds));
    // Keep selection for label picker
  }, [onBulkLabel, selectedIds]);

  // Individual action handlers - FIXED: Memoized
  const handleFlag = useCallback((id: string) => onFlag?.(id), [onFlag]);
  const handleArchive = useCallback((id: string) => onArchive?.(id), [onArchive]);
  const handleDelete = useCallback((id: string) => onDelete?.(id), [onDelete]);

  // Move to folder handler - opens folder picker (mobile alternative to drag)
  const handleMove = useCallback((id: string) => {
    setMoveEmailId(id);
    setFolderPickerOpen(true);
  }, []);

  const handleCloseFolderPicker = useCallback(() => {
    setFolderPickerOpen(false);
    setMoveEmailId(null);
  }, []);

  // Get providerId of the email being moved (for folder filtering)
  const moveEmailProviderId = useMemo(() => {
    if (!moveEmailId) return undefined;
    const thread = threads.find((t) => t.id === moveEmailId);
    return thread?.providerId;
  }, [moveEmailId, threads]);

  const moveEmailCurrentFolderValue = useMemo(() => {
    if (!moveEmailId) return undefined;
    const thread = threads.find((t) => t.id === moveEmailId);
    return thread?.folder;
  }, [moveEmailId, threads]);

  // Note: Drag handlers and DragOverlay are now in EmailLayout's shared DndContext

  // CRITICAL FIX: Infinite scroll in useEffect (not during render!)
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
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
  }, [virtualItems, threads.length, hasMore, isLoadingMore, onLoadMore]);

  // Loading state - skeleton instead of spinner
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <ThreadListHeader
          totalCount={0}
          selectedCount={0}
          allSelected={false}
          someSelected={false}
          isRefreshing={true}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onRefresh={handleRefresh}
          onMarkAsRead={handleBulkMarkAsRead}
          onMarkAsUnread={handleBulkMarkAsUnread}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onMoveToFolder={handleBulkMove}
          onAddLabel={handleBulkLabel}
          isBulkActionPending={isBulkActionPending}
        />
        <ThreadListSkeleton count={8} animation="wave" />
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
          isBulkActionPending={isBulkActionPending}
        />
        <EmptyState variant={emptyVariant} onAction={onEmptyAction} />
      </Box>
    );
  }

  // DndContext is now in EmailLayout - wraps ThreadList and FolderSidebar
  return (
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
        totalCount={totalCount ?? threads.length}
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
        isBulkActionPending={isBulkActionPending}
      />

      {/* Virtual scrolling container */}
      <Box
        ref={parentRef}
        sx={{
          flex: 1,
          minHeight: 0, // CRITICAL: Allow flex shrinking for virtualizer
          overflow: 'auto',
          contain: 'layout',
          WebkitOverflowScrolling: 'touch',
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
            const isFocused = focusedId === thread.id;
            const draggedEmailIds = isSelected
              ? getDraggedEmailIds(
                  thread.id,
                  selectedIdsByProvider.get(thread.providerId ?? '') ?? [thread.id],
                )
              : null;

            return (
              <Box
                key={thread.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* Only use draggable on desktop - mobile needs touch scroll */}
                <div onContextMenu={(e) => handleContextMenu(e, thread)}>
                {thread.providerId && isDesktop ? (
                  <DraggableThreadListItem
                    thread={thread as ThreadListItemData & { providerId: string }}
                    draggedEmailIds={draggedEmailIds}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    isFocused={isFocused}
                    onSelect={handleSelect}
                    onClick={onThreadClick}
                    onFlag={handleFlag}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onMove={handleMove}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                  />
                ) : (
                  <ThreadListItem
                    thread={thread}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    isFocused={isFocused}
                    onSelect={handleSelect}
                    onClick={onThreadClick}
                    onFlag={handleFlag}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onMove={handleMove}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                  />
                )}
                </div>
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

      {/* DragOverlay is now centralized in EmailLayout */}

      {/* Right-click context menu */}
      <EmailContextMenu
        anchorPosition={contextMenu.position}
        emailId={contextMenu.emailId}
        isRead={contextMenu.emailId ? !threads.find(t => t.id === contextMenu.emailId)?.isUnread : true}
        isFlagged={contextMenu.emailId ? threads.find(t => t.id === contextMenu.emailId)?.isFlagged : false}
        onClose={handleCloseContextMenu}
        onOpen={onThreadClick}
        onFlag={handleFlag}
        onArchive={handleArchive}
        onMove={handleMove}
        onDelete={handleDelete}
      />

      {/* Folder picker dialog - mobile alternative to drag-and-drop */}
      <FolderPickerDialog
        open={folderPickerOpen}
        onClose={handleCloseFolderPicker}
        emailIds={moveEmailId ? [moveEmailId] : []}
        onSuccess={handleCloseFolderPicker}
        providerId={moveEmailProviderId}
        currentFolderValue={moveEmailCurrentFolderValue}
      />
    </Box>
  );
}

export default React.memo(ThreadList);
