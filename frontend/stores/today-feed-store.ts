/**
 * Today Feed Store — Zustand store for client-only session state (Phase 145.1 v2).
 *
 * Two slices, both session-only (cleared on page reload — no localStorage,
 * no sessionStorage, no `persist` middleware):
 *
 *   1. dismissedIds      : Set of dismissed item IDs for optimistic removal.
 *   2. toggledStreams    : Set of stream names whose collapse state has been
 *                          TOGGLED from their default. See JSDoc on the field
 *                          for the flip-from-default semantics.
 *
 * Threats T-145-07 and T-145.1-08 (info disclosure via localStorage
 * persistence): do NOT apply `persist` middleware — session state must
 * never cross browser sessions.
 */

import { create } from 'zustand';
import type { TodayStream } from '@/lib/api/dashboard';

interface TodayFeedState {
  dismissedIds: Set<string>;
  /**
   * Set of stream names whose collapse state has been TOGGLED from the default.
   * A stream in this set is in the OPPOSITE state of its defaultExpanded prop.
   * NOT a set of "currently collapsed streams" — do not treat it as such for
   * analytics or URL state. See TodayStream for the effective-expanded computation.
   */
  toggledStreams: Set<TodayStream>;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  isDismissed: (id: string) => boolean;
  toggleStream: (name: TodayStream) => void;
  isToggled: (name: TodayStream) => boolean;
  reset: () => void;
}

export const useTodayFeedStore = create<TodayFeedState>()((set, get) => ({
  dismissedIds: new Set<string>(),
  toggledStreams: new Set<TodayStream>(),

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

  toggleStream: (name: TodayStream) =>
    set((s) => {
      const next = new Set(s.toggledStreams);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return { toggledStreams: next };
    }),

  isToggled: (name: TodayStream) => get().toggledStreams.has(name),

  reset: () =>
    set({
      dismissedIds: new Set<string>(),
      toggledStreams: new Set<TodayStream>(),
    }),
}));
