/**
 * AI Overlay Store (Zustand)
 *
 * Manages UI state for the AI Assistant slide-over panel:
 * - Open/close state (ephemeral, NOT persisted)
 * - Panel width (persisted to localStorage)
 *
 * Width constraints: min 420px, default 980px, max 1280px.
 * isOpen always starts as false on page load (per D-12).
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

export const DEFAULT_WIDTH = 980;
export const MIN_WIDTH = 420;
export const MAX_WIDTH = 1280;

interface AiOverlayState {
  isOpen: boolean;
  width: number;
  toggleOpen: () => void;
  open: () => void;
  close: () => void;
  setWidth: (w: number) => void;
}

export const useAiOverlay = create<AiOverlayState>()(
  devtools(
    persist(
      (set) => ({
        isOpen: false,
        width: DEFAULT_WIDTH,
        toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
        open: () => set({ isOpen: true }),
        close: () => set({ isOpen: false }),
        setWidth: (w: number) =>
          set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)) }),
      }),
      {
        name: 'pmsync:ai-overlay-width',
        version: 3,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ width: state.width }),
        migrate: (persistedState: unknown) => {
          const state = persistedState as { width?: number } | undefined;
          const nextWidth = state?.width ?? DEFAULT_WIDTH;

          // Migrate legacy narrow widths from the old 420px default to the V2 workspace default.
          if (nextWidth < 860) {
            return { width: DEFAULT_WIDTH };
          }

          return { width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, nextWidth)) };
        },
        // isOpen is NOT persisted -- always starts closed (per D-12)
      }
    ),
    { name: 'ai-overlay-store' }
  )
);
