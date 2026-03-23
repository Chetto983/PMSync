import { create } from 'zustand';

interface OfflineQueueState {
  pendingCount: number;
  incrementPending: () => void;
  decrementPending: () => void;
  setPendingCount: (count: number) => void;
  reset: () => void;
}

export const useOfflineQueueStore = create<OfflineQueueState>((set) => ({
  pendingCount: 0,
  incrementPending: () => set((s) => ({ pendingCount: s.pendingCount + 1 })),
  decrementPending: () => set((s) => ({ pendingCount: Math.max(0, s.pendingCount - 1) })),
  setPendingCount: (count: number) => set({ pendingCount: count }),
  reset: () => set({ pendingCount: 0 }),
}));
