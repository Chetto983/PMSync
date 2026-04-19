/**
 * AI Overlay Store (Zustand)
 *
 * Manages UI state for the AI Assistant slide-over panel:
 * - Open/close state (ephemeral, NOT persisted)
 * - Panel width (persisted to localStorage)
 *
 * Width constraints: min 360px, default 560px, max 760px.
 * isOpen always starts as false on page load (per D-12).
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

export const DEFAULT_WIDTH = 560;
export const MIN_WIDTH = 360;
export const MAX_WIDTH = 760;

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
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ width: state.width }),
        // isOpen is NOT persisted -- always starts closed (per D-12)
      }
    ),
    { name: 'ai-overlay-store' }
  )
);
