/**
 * Filter Slice - Email filter state and actions
 */

import type { EmailFilters, EmailUIState, SpecialFolder } from './email-ui-types';
import { initialFilters } from './email-ui-types';

type SetFn = (fn: ((state: EmailUIState) => Partial<EmailUIState>) | Partial<EmailUIState>) => void;
type GetFn = () => EmailUIState;

export function createFilterSlice(set: SetFn, get: GetFn) {
  return {
    filters: initialFilters,

    setFilters: (filters: Partial<EmailFilters>) =>
      set((state) => ({
        filters: { ...state.filters, ...filters },
        // Clear selection when filters change
        selectedIds: new Set<string>(),
        activeEmailId: null,
      })),

    setFolder: (folder: SpecialFolder) =>
      set({
        filters: {
          ...get().filters,
          specialUse: folder,
          providerId: undefined,
          folderId: undefined,
          folderPath: undefined,
          labelId: undefined,
        },
        selectedIds: new Set<string>(),
        activeEmailId: null,
      }),

    setSearch: (search: string) =>
      set((state) => ({
        filters: { ...state.filters, search: search || undefined },
      })),

    clearFilters: () =>
      set({
        filters: initialFilters,
        selectedIds: new Set<string>(),
        activeEmailId: null,
      }),
  };
}
