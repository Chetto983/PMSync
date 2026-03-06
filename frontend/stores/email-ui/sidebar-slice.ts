/**
 * Sidebar Slice - Sidebar state and actions
 */

import type { EmailUIState } from './email-ui-types';
import { initialSidebar } from './email-ui-types';

type SetFn = (fn: ((state: EmailUIState) => Partial<EmailUIState>) | Partial<EmailUIState>) => void;

export function createSidebarSlice(set: SetFn) {
  return {
    sidebar: initialSidebar,

    setSidebarWidth: (width: number) =>
      set((state) => ({
        sidebar: {
          ...state.sidebar,
          width: Math.max(state.sidebar.minWidth, Math.min(state.sidebar.maxWidth, width)),
        },
      })),

    toggleProviderCollapse: (providerId: string) =>
      set((state) => {
        const newCollapsed = new Set(state.sidebar.collapsedProviders);
        if (newCollapsed.has(providerId)) {
          newCollapsed.delete(providerId);
        } else {
          newCollapsed.add(providerId);
        }
        return {
          sidebar: { ...state.sidebar, collapsedProviders: newCollapsed },
        };
      }),

    setProviderCollapsed: (providerId: string, collapsed: boolean) =>
      set((state) => {
        const newCollapsed = new Set(state.sidebar.collapsedProviders);
        if (collapsed) {
          newCollapsed.add(providerId);
        } else {
          newCollapsed.delete(providerId);
        }
        return {
          sidebar: { ...state.sidebar, collapsedProviders: newCollapsed },
        };
      }),
  };
}
