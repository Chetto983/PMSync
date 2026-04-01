import { useState, useCallback } from 'react';
import { arrayMove } from '@dnd-kit/sortable';

const STORAGE_KEY_PREFIX = 'pmsync:sidebar-order-';

type SectionKey = 'main' | 'crm' | 'ai';

/**
 * Persists sidebar nav item order per section to localStorage.
 * Returns the ordered href list and a reorder handler for DndContext.onDragEnd.
 */
export function useSidebarOrder(section: SectionKey, defaultOrder: string[]) {
  const storageKey = STORAGE_KEY_PREFIX + section;

  const [order, setOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return defaultOrder;
    try {
      const stored = localStorage.getItem(storageKey);
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
        localStorage.removeItem(storageKey);
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
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // quota exceeded — silently ignore
        }
        return next;
      });
    },
    [storageKey],
  );

  const resetOrder = useCallback(() => {
    setOrder(defaultOrder);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey, defaultOrder]);

  return { order, handleReorder, resetOrder } as const;
}
