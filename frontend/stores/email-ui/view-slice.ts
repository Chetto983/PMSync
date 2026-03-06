/**
 * View Slice - View mode, density, and active email state
 */

import type { EmailDensity, EmailUIState, EmailViewMode } from './email-ui-types';

type SetFn = (fn: ((state: EmailUIState) => Partial<EmailUIState>) | Partial<EmailUIState>) => void;

export function createViewSlice(set: SetFn) {
  return {
    viewMode: 'list' as EmailViewMode,
    density: 'comfortable' as EmailDensity,
    previewPanelOpen: true,
    activeEmailId: null as string | null,
    activeThreadId: null as string | null,

    setViewMode: (mode: EmailViewMode) => set({ viewMode: mode }),

    setDensity: (density: EmailDensity) => set({ density }),

    togglePreviewPanel: () =>
      set((state) => ({ previewPanelOpen: !state.previewPanelOpen })),

    setActiveEmail: (id: string | null) =>
      set({
        activeEmailId: id,
        selectedIds: id ? new Set([id]) : new Set<string>(),
      }),

    setActiveThread: (threadId: string | null) =>
      set({
        activeThreadId: threadId,
        viewMode: threadId ? 'thread' : 'list',
      }),
  };
}
