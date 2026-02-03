/**
 * useKeyboardNavigation Hook
 *
 * Provides Vim-style keyboard navigation for email lists:
 * - j: Move to next item
 * - k: Move to previous item
 * - Enter: Open focused item
 * - Escape: Close/deselect
 * - x: Toggle selection
 * - c: Compose new
 * - e: Archive
 * - #: Delete (Shift+3)
 * - r: Reply
 * - a: Reply all
 * - f: Forward
 * - /: Focus search
 * - ?: Show help (Shift+/)
 *
 * Phase 9: Advanced UX Feature
 */

import { useState, useCallback, useEffect, useRef } from 'react';

interface KeyboardNavigationOptions<T> {
  /** Items to navigate */
  items: T[];
  /** Get unique ID from item */
  getItemId: (item: T) => string;
  /** Callback when item is opened (Enter key) */
  onOpen?: (id: string) => void;
  /** Callback when escape is pressed */
  onEscape?: () => void;
  /** Callback when compose is triggered (c key) */
  onCompose?: () => void;
  /** Callback when selection is toggled (x key) */
  onToggleSelect?: (id: string) => void;
  /** Callback when archive is triggered (e key) */
  onArchive?: (id: string) => void;
  /** Callback when delete is triggered (# key, Shift+3) */
  onDelete?: (id: string) => void;
  /** Callback when reply is triggered (r key) */
  onReply?: (id: string) => void;
  /** Callback when reply all is triggered (a key) */
  onReplyAll?: (id: string) => void;
  /** Callback when forward is triggered (f key) */
  onForward?: (id: string) => void;
  /** Callback when search focus is triggered (/ key) */
  onFocusSearch?: () => void;
  /** Callback when help is triggered (? key, Shift+/) */
  onShowHelp?: () => void;
  /** Whether keyboard navigation is enabled */
  enabled?: boolean;
  /** Whether reading pane is open (affects Escape behavior) */
  isReadingPaneOpen?: boolean;
}

interface KeyboardNavigationReturn {
  /** Currently focused item index (-1 if none) */
  focusedIndex: number;
  /** Currently focused item ID (null if none) */
  focusedId: string | null;
  /** Set focused index manually */
  setFocusedIndex: (index: number) => void;
  /** Clear focus */
  clearFocus: () => void;
  /** Move focus to next item */
  moveNext: () => void;
  /** Move focus to previous item */
  movePrevious: () => void;
  /** Open currently focused item */
  openFocused: () => void;
}

/**
 * Keyboard navigation hook for email lists
 *
 * @example
 * const { focusedIndex, focusedId } = useKeyboardNavigation({
 *   items: threads,
 *   getItemId: (t) => t.id,
 *   onOpen: handleThreadClick,
 *   onCompose: handleCompose,
 *   onEscape: handleCloseReadingPane,
 * });
 */
export function useKeyboardNavigation<T>({
  items,
  getItemId,
  onOpen,
  onEscape,
  onCompose,
  onToggleSelect,
  onArchive,
  onDelete,
  onReply,
  onReplyAll,
  onForward,
  onFocusSearch,
  onShowHelp,
  enabled = true,
  isReadingPaneOpen = false,
}: KeyboardNavigationOptions<T>): KeyboardNavigationReturn {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Track items length to reset focus when items change significantly
  const prevItemsLengthRef = useRef(items.length);

  // Reset focus if items array changes significantly (new folder, search, etc.)
  // Using functional update to avoid the "setState in effect" lint error
  // This is intentional state synchronization with external props
  useEffect(() => {
    setFocusedIndex((prev) => {
      if (items.length === 0) {
        return -1;
      }
      if (prevItemsLengthRef.current === 0 && items.length > 0) {
        // Items loaded for first time - don't auto-focus
        return -1;
      }
      // Keep current focus if valid, otherwise reset
      return prev >= items.length ? -1 : prev;
    });
    prevItemsLengthRef.current = items.length;
  }, [items.length]);

  // Get focused item ID
  const focusedId = focusedIndex >= 0 && focusedIndex < items.length
    ? getItemId(items[focusedIndex])
    : null;

  const clearFocus = useCallback(() => {
    setFocusedIndex(-1);
  }, []);

  const moveNext = useCallback(() => {
    if (items.length === 0) return;
    setFocusedIndex((prev) => {
      if (prev < 0) return 0; // Start at first item
      return Math.min(prev + 1, items.length - 1);
    });
  }, [items.length]);

  const movePrevious = useCallback(() => {
    if (items.length === 0) return;
    setFocusedIndex((prev) => {
      if (prev < 0) return items.length - 1; // Start at last item
      return Math.max(prev - 1, 0);
    });
  }, [items.length]);

  const openFocused = useCallback(() => {
    if (focusedId && onOpen) {
      onOpen(focusedId);
    }
  }, [focusedId, onOpen]);

  // Keyboard event handler
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Handle different keys
      switch (e.key) {
        case 'j':
          // Next item (Vim down)
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            moveNext();
          }
          break;

        case 'k':
          // Previous item (Vim up)
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            movePrevious();
          }
          break;

        case 'Enter':
          // Open focused item
          if (focusedId && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            openFocused();
          }
          break;

        case 'Escape':
          // Close reading pane or clear focus
          if (isReadingPaneOpen && onEscape) {
            e.preventDefault();
            onEscape();
          } else if (focusedIndex >= 0) {
            e.preventDefault();
            clearFocus();
          }
          break;

        case 'x':
          // Toggle selection
          if (focusedId && onToggleSelect && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onToggleSelect(focusedId);
          }
          break;

        case 'c':
          // Compose new email
          if (onCompose && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onCompose();
          }
          break;

        case 'e':
          // Archive focused item
          if (focusedId && onArchive && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onArchive(focusedId);
          }
          break;

        case '#':
          // Delete focused item (Shift+3)
          if (focusedId && onDelete && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onDelete(focusedId);
          }
          break;

        case 'r':
          // Reply to focused item
          if (focusedId && onReply && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onReply(focusedId);
          }
          break;

        case 'a':
          // Reply all (only if not Ctrl+A for select all)
          if (focusedId && onReplyAll && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onReplyAll(focusedId);
          }
          break;

        case 'f':
          // Forward focused item
          if (focusedId && onForward && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onForward(focusedId);
          }
          break;

        case '/':
          // Focus search (only if not Shift+/ for help)
          if (onFocusSearch && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onFocusSearch();
          }
          break;

        case '?':
          // Show help (Shift+/)
          if (onShowHelp && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onShowHelp();
          }
          break;

        case 'ArrowDown':
          // Alternative down navigation
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            moveNext();
          }
          break;

        case 'ArrowUp':
          // Alternative up navigation
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            movePrevious();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    moveNext,
    movePrevious,
    openFocused,
    clearFocus,
    focusedId,
    focusedIndex,
    isReadingPaneOpen,
    onEscape,
    onCompose,
    onToggleSelect,
    onArchive,
    onDelete,
    onReply,
    onReplyAll,
    onForward,
    onFocusSearch,
    onShowHelp,
  ]);

  return {
    focusedIndex,
    focusedId,
    setFocusedIndex,
    clearFocus,
    moveNext,
    movePrevious,
    openFocused,
  };
}

export default useKeyboardNavigation;
