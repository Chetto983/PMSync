/**
 * Today Feed Store — Zustand store for client-only dismiss state.
 *
 * Per UI-SPEC § State Management: "Set of dismissed item IDs for optimistic
 * removal. Cleared on page reload." No localStorage/sessionStorage.
 *
 * Threat T-145-07: do NOT apply `persist` middleware — dismissed IDs must
 * never cross browser sessions.
 */

import { create } from 'zustand';

interface TodayFeedState {
  dismissedIds: Set<string>;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  isDismissed: (id: string) => boolean;
  reset: () => void;
}

export const useTodayFeedStore = create<TodayFeedState>()((set, get) => ({
  dismissedIds: new Set<string>(),

  dismiss: (id: string) =>
    set((s) => {
      const next = new Set(s.dismissedIds);
      next.add(id);
      return { dismissedIds: next };
    }),

  restore: (id: string) =>
    set((s) => {
      const next = new Set(s.dismissedIds);
      next.delete(id);
      return { dismissedIds: next };
    }),

  isDismissed: (id: string) => get().dismissedIds.has(id),

  reset: () => set({ dismissedIds: new Set<string>() }),
}));
