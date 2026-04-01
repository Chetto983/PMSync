import { useState, useCallback } from 'react';
import { arrayMove } from '@dnd-kit/sortable';

const STORAGE_KEY = 'pmsync:sidebar-order-pillars';

/** Stale keys from the old multi-section sidebar — removed on first load. */
const STALE_KEYS = [
  'pmsync:sidebar-order-main',
  'pmsync:sidebar-order-crm',
  'pmsync:sidebar-order-ai',
  'pmsync:sidebar-order-sections',
  'pmsync:sidebar-collapsed',
];

/**
 * Persists sidebar pillar icon order to localStorage.
 * Returns the ordered href list and a reorder handler for DndContext.onDragEnd.
 */
export function useSidebarOrder(defaultOrder: string[]) {
  const [order, setOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return defaultOrder;

    // Clean up stale localStorage keys from old multi-section sidebar
    STALE_KEYS.forEach((key) => {
      localStorage.removeItem(key);
    });

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return defaultOrder;
      const parsed: string[] = JSON.parse(stored);
      // Validate: must contain exactly the same hrefs (handles added/removed items)
      const defaultSet = new Set(defaultOrder);
      const storedSet = new Set(parsed);
      if (
        parsed.length !== defaultOrder.length ||
        !parsed.every((h) => defaultSet.has(h)) ||
        !defaultOrder.every((h) => storedSet.has(h))
      ) {
        localStorage.removeItem(STORAGE_KEY);
        return defaultOrder;
      }
      return parsed;
    } catch {
      return defaultOrder;
    }
  });

  const handleReorder = useCallback(
    (activeId: string, overId: string) => {
      setOrder((prev) => {
        const oldIndex = prev.indexOf(activeId);
        const newIndex = prev.indexOf(overId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
        const next = arrayMove(prev, oldIndex, newIndex);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // quota exceeded — silently ignore
        }
        return next;
      });
    },
    [],
  );

  const resetOrder = useCallback(() => {
    setOrder(defaultOrder);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [defaultOrder]);

  return { order, handleReorder, resetOrder } as const;
}
