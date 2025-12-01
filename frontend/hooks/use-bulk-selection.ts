import { useCallback, useEffect, useRef } from 'react';
import { useEmailStore } from '@/stores/email-store';

/**
 * Maximum number of items that can be selected at once
 *
 * This limit respects provider API batch limits:
 * - Microsoft Graph API: 20 requests per batch (strict limit)
 * - Gmail API: 1000 per batchModify (but recommended 50-100)
 * - IMAP: 15 concurrent connections per account
 *
 * We use 20 as the lowest common denominator to ensure
 * bulk operations work across all providers.
 *
 * @see https://learn.microsoft.com/en-us/graph/throttling-limits
 * @see https://developers.google.com/workspace/gmail/api/reference/quota
 */
export const MAX_BULK_SELECTION = 20;

/**
 * Options for the useBulkSelection hook
 */
interface UseBulkSelectionOptions {
  /**
   * Array of items to select from (must have consistent ordering)
   */
  items: { id: string }[];

  /**
   * Function to get the selectable ID from an item
   * @default item => item.id
   */
  getItemId?: (item: { id: string }) => string;

  /**
   * Enable keyboard shortcuts (Ctrl+A, Escape)
   * @default true
   */
  enableKeyboardShortcuts?: boolean;

  /**
   * Maximum number of items that can be selected
   * @default MAX_BULK_SELECTION (100)
   */
  maxSelection?: number;

  /**
   * Callback when selection changes
   */
  onSelectionChange?: (selectedIds: Set<string>) => void;

  /**
   * Callback when max selection limit is reached
   */
  onMaxSelectionReached?: (max: number) => void;
}

/**
 * Custom hook for bulk selection with Shift+Click and keyboard support
 *
 * Features:
 * - Shift+Click for range selection
 * - Ctrl/Cmd+Click for toggle selection (macOS support)
 * - Ctrl+A / Cmd+A to select all
 * - Escape to clear selection
 * - Tracks last selected index for range selection
 *
 * @see https://tj.ie/multi-select-checkboxes-with-react/
 * @see https://stackoverflow.com/questions/38974744/how-to-detect-click-shift-ctrl-alt-in-reactjs-click-event
 *
 * @example
 * ```tsx
 * const { handleItemClick, handleSelectAll, handleClearSelection } = useBulkSelection({
 *   items: emails.map(e => ({ id: e.threadId || e.id })),
 *   onSelectionChange: (ids) => console.log('Selected:', ids.size),
 * });
 *
 * // In ThreadListItem onClick handler:
 * onClick={(e) => handleItemClick(item.id, e)}
 * ```
 */
export function useBulkSelection({
  items,
  getItemId = (item) => item.id,
  enableKeyboardShortcuts = true,
  maxSelection = MAX_BULK_SELECTION,
  onSelectionChange,
  onMaxSelectionReached,
}: UseBulkSelectionOptions) {
  // Store actions
  const selectedIds = useEmailStore((state) => state.selectedIds);
  const setSelectedIds = useEmailStore((state) => state.setSelectedIds);
  const toggleSelection = useEmailStore((state) => state.toggleSelection);
  const selectAllStore = useEmailStore((state) => state.selectAll);
  const clearSelectionStore = useEmailStore((state) => state.clearSelection);

  // Track last selected index for Shift+Click range selection
  const lastSelectedIndexRef = useRef<number | null>(null);

  // Find item index by ID
  const findItemIndex = useCallback(
    (id: string): number => {
      return items.findIndex((item) => getItemId(item) === id);
    },
    [items, getItemId]
  );

  /**
   * Handle item click with modifier key detection
   *
   * - Normal click: Select only this item (clear others)
   * - Ctrl/Cmd click: Toggle this item's selection
   * - Shift click: Select range from last selected to this item
   */
  const handleItemClick = useCallback(
    (id: string, event: React.MouseEvent | KeyboardEvent) => {
      const currentIndex = findItemIndex(id);
      if (currentIndex === -1) return;

      // Detect modifier keys
      const isCtrlOrCmd = event.ctrlKey || event.metaKey; // metaKey for macOS Cmd
      const isShift = event.shiftKey;

      if (isShift && lastSelectedIndexRef.current !== null) {
        // Shift+Click: Range selection
        const startIndex = Math.min(lastSelectedIndexRef.current, currentIndex);
        const endIndex = Math.max(lastSelectedIndexRef.current, currentIndex);

        // Get all IDs in range
        const rangeIds = items
          .slice(startIndex, endIndex + 1)
          .map(getItemId);

        // Add range to existing selection (union)
        const newSelectedIds = new Set(selectedIds);
        rangeIds.forEach((itemId) => newSelectedIds.add(itemId));

        // Enforce max selection limit
        if (newSelectedIds.size > maxSelection) {
          onMaxSelectionReached?.(maxSelection);
          // Truncate to max selection by converting to array, slicing, and back to set
          const truncated = new Set(Array.from(newSelectedIds).slice(0, maxSelection));
          setSelectedIds(truncated);
          onSelectionChange?.(truncated);
        } else {
          setSelectedIds(newSelectedIds);
          onSelectionChange?.(newSelectedIds);
        }
      } else if (isCtrlOrCmd) {
        // Ctrl/Cmd+Click: Toggle single item
        toggleSelection(id);
        lastSelectedIndexRef.current = currentIndex;

        // Call onSelectionChange after toggle
        const newSelectedIds = new Set(selectedIds);
        if (newSelectedIds.has(id)) {
          newSelectedIds.delete(id);
        } else {
          newSelectedIds.add(id);
        }
        onSelectionChange?.(newSelectedIds);
      } else {
        // Normal click: Select only this item
        const newSelectedIds = new Set<string>([id]);
        setSelectedIds(newSelectedIds);
        lastSelectedIndexRef.current = currentIndex;
        onSelectionChange?.(newSelectedIds);
      }
    },
    [items, getItemId, selectedIds, setSelectedIds, toggleSelection, findItemIndex, maxSelection, onSelectionChange, onMaxSelectionReached]
  );

  /**
   * Handle checkbox click (always toggle, never range)
   * Respects maxSelection limit when adding items
   */
  const handleCheckboxClick = useCallback(
    (id: string) => {
      const currentIndex = findItemIndex(id);
      const isCurrentlySelected = selectedIds.has(id);

      // If trying to add and already at max, prevent and notify
      if (!isCurrentlySelected && selectedIds.size >= maxSelection) {
        onMaxSelectionReached?.(maxSelection);
        return;
      }

      toggleSelection(id);
      lastSelectedIndexRef.current = currentIndex;

      // Call onSelectionChange after toggle
      const newSelectedIds = new Set(selectedIds);
      if (isCurrentlySelected) {
        newSelectedIds.delete(id);
      } else {
        newSelectedIds.add(id);
      }
      onSelectionChange?.(newSelectedIds);
    },
    [findItemIndex, selectedIds, toggleSelection, maxSelection, onSelectionChange, onMaxSelectionReached]
  );

  /**
   * Select all items (respects max selection limit)
   */
  const handleSelectAll = useCallback(() => {
    const allIds = items.map(getItemId);

    // Enforce max selection limit
    if (allIds.length > maxSelection) {
      onMaxSelectionReached?.(maxSelection);
      const limitedIds = new Set(allIds.slice(0, maxSelection));
      setSelectedIds(limitedIds);
      lastSelectedIndexRef.current = maxSelection - 1;
      onSelectionChange?.(limitedIds);
    } else {
      selectAllStore();
      lastSelectedIndexRef.current = items.length - 1;
      onSelectionChange?.(new Set(allIds));
    }
  }, [selectAllStore, setSelectedIds, items, getItemId, maxSelection, onSelectionChange, onMaxSelectionReached]);

  /**
   * Clear all selections
   */
  const handleClearSelection = useCallback(() => {
    clearSelectionStore();
    lastSelectedIndexRef.current = null;
    onSelectionChange?.(new Set());
  }, [clearSelectionStore, onSelectionChange]);

  /**
   * Select range from anchor to current
   */
  const handleSelectRange = useCallback(
    (startId: string, endId: string) => {
      const startIndex = findItemIndex(startId);
      const endIndex = findItemIndex(endId);

      if (startIndex === -1 || endIndex === -1) return;

      const minIndex = Math.min(startIndex, endIndex);
      const maxIndex = Math.max(startIndex, endIndex);

      const rangeIds = items
        .slice(minIndex, maxIndex + 1)
        .map(getItemId);

      setSelectedIds(new Set(rangeIds));
      onSelectionChange?.(new Set(rangeIds));
    },
    [items, getItemId, setSelectedIds, findItemIndex, onSelectionChange]
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl/Cmd + A: Select all
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        event.preventDefault();
        handleSelectAll();
      }

      // Escape: Clear selection
      if (event.key === 'Escape' && selectedIds.size > 0) {
        event.preventDefault();
        handleClearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcuts, selectedIds.size, handleSelectAll, handleClearSelection]);

  return {
    // State
    selectedIds,
    selectedCount: selectedIds.size,
    hasSelection: selectedIds.size > 0,

    // Handlers
    handleItemClick,
    handleCheckboxClick,
    handleSelectAll,
    handleClearSelection,
    handleSelectRange,

    // Utilities
    isSelected: (id: string) => selectedIds.has(id),
  };
}

export default useBulkSelection;
