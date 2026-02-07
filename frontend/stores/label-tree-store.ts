/**
 * Label Tree Expansion Store (Zustand)
 *
 * Manages which label tree nodes are expanded/collapsed.
 * Persists to localStorage so expansion state survives page reloads.
 *
 * NOTE: expandedIds contains the IDs of EXPANDED labels.
 * Labels NOT in the set are collapsed (collapsed by default).
 *
 * @see frontend/stores/email-ui-store.ts for persist pattern reference
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Label } from '@/lib/api/labels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabelTreeStore {
  /** IDs of labels that are currently expanded */
  expandedIds: Set<string>;
  /** Toggle a single label expanded/collapsed */
  toggleExpanded: (id: string) => void;
  /** Expand all ancestors of a target label (for auto-reveal) */
  expandTo: (targetId: string, allLabels: Label[]) => void;
  /** Collapse all labels */
  collapseAll: () => void;
  /** Expand all labels */
  expandAll: (allIds: string[]) => void;
  /** Remove IDs that no longer exist in the labels list */
  pruneStaleIds: (validIds: Set<string>) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useLabelTreeStore = create<LabelTreeStore>()(
  persist(
    (set) => ({
      expandedIds: new Set<string>(),

      toggleExpanded: (id) =>
        set((state) => {
          const next = new Set(state.expandedIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { expandedIds: next };
        }),

      expandTo: (targetId, allLabels) =>
        set((state) => {
          const next = new Set(state.expandedIds);
          const map = new Map(allLabels.map((l) => [l.id, l]));
          let current = map.get(targetId);
          while (current?.parentId) {
            next.add(current.parentId);
            current = map.get(current.parentId);
          }
          return { expandedIds: next };
        }),

      collapseAll: () => set({ expandedIds: new Set<string>() }),

      expandAll: (allIds) => set({ expandedIds: new Set(allIds) }),

      pruneStaleIds: (validIds) =>
        set((state) => ({
          expandedIds: new Set(
            [...state.expandedIds].filter((id) => validIds.has(id)),
          ),
        })),
    }),
    {
      name: 'label-tree-expansion',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Serialize Set to Array for JSON storage
        expandedIds: [...state.expandedIds],
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
        // Deserialize Array back to Set
        expandedIds: new Set(
          (persisted as { expandedIds?: string[] })?.expandedIds || [],
        ),
      }),
    },
  ),
);
