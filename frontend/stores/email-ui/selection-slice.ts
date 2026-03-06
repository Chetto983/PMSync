/**
 * Selection Slice - Email selection state and actions
 */

import type { EmailUIState } from './email-ui-types';

type SetFn = (fn: ((state: EmailUIState) => Partial<EmailUIState>) | Partial<EmailUIState>) => void;

export function createSelectionSlice(set: SetFn) {
  return {
    selectedIds: new Set<string>(),
    lastSelectedId: null as string | null,

    selectEmail: (id: string) =>
      set({
        selectedIds: new Set([id]),
        lastSelectedId: id,
        activeEmailId: id,
      }),

    selectMultiple: (ids: string[]) =>
      set({
        selectedIds: new Set(ids),
        lastSelectedId: ids[ids.length - 1] ?? null,
      }),

    toggleSelection: (id: string) =>
      set((state) => {
        const newSelected = new Set(state.selectedIds);
        if (newSelected.has(id)) {
          newSelected.delete(id);
        } else {
          newSelected.add(id);
        }
        return {
          selectedIds: newSelected,
          lastSelectedId: id,
        };
      }),

    selectRange: (fromId: string, toId: string, allIds: string[]) =>
      set((state) => {
        const fromIndex = allIds.indexOf(fromId);
        const toIndex = allIds.indexOf(toId);
        if (fromIndex === -1 || toIndex === -1) return state;

        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        const rangeIds = allIds.slice(start, end + 1);

        return {
          selectedIds: new Set([...state.selectedIds, ...rangeIds]),
          lastSelectedId: toId,
        };
      }),

    selectAll: (ids: string[]) =>
      set({
        selectedIds: new Set(ids),
        lastSelectedId: ids[ids.length - 1] ?? null,
      }),

    clearSelection: () =>
      set({
        selectedIds: new Set<string>(),
        lastSelectedId: null,
      }),
  };
}
