/**
 * Email UI Store (Zustand)
 *
 * Manages UI-only state for the email module:
 * - Selection state (multi-select)
 * - View state (list/thread, preview panel)
 * - Filter state (current folder, search)
 * - Compose state (modal visibility)
 *
 * NOTE: Email data is managed by TanStack Query, not this store.
 * This store only handles ephemeral UI state.
 *
 * Implementation split into domain slices under ./email-ui/
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { EmailUIState } from './email-ui/email-ui-types';
import { initialComposeState, initialFilters, initialSidebar } from './email-ui/email-ui-types';
import { createSelectionSlice } from './email-ui/selection-slice';
import { createFilterSlice } from './email-ui/filter-slice';
import { createViewSlice } from './email-ui/view-slice';
import { createComposeSlice } from './email-ui/compose-slice';
import { createSidebarSlice } from './email-ui/sidebar-slice';
import { createKanbanSlice } from './email-ui/kanban-slice';

// Re-export all types for consumer compatibility
export type {
  KanbanColumnId,
  KanbanColumnAssignments,
  EmailViewMode,
  EmailDensity,
  SpecialFolder,
  EmailFilters,
  SidebarConfig,
  ComposeState,
  EmailUIState,
} from './email-ui/email-ui-types';

// =============================================================================
// Store
// =============================================================================

export const useEmailUIStore = create<EmailUIState>()(
  devtools(
    persist(
      (set, get) => ({
        ...createSelectionSlice(set),
        ...createFilterSlice(set, get),
        ...createViewSlice(set),
        ...createComposeSlice(set),
        ...createSidebarSlice(set),
        ...createKanbanSlice(set, get),

        // Pending actions
        pendingActions: new Set<string>(),
        addPendingAction: (emailId: string) =>
          set((state) => {
            const newPending = new Set(state.pendingActions);
            newPending.add(emailId);
            return { pendingActions: newPending };
          }),
        removePendingAction: (emailId: string) =>
          set((state) => {
            const newPending = new Set(state.pendingActions);
            newPending.delete(emailId);
            return { pendingActions: newPending };
          }),
        clearPendingActions: () => set({ pendingActions: new Set<string>() }),

        // AI prompt bridge
        pendingAiPrompt: null,
        setPendingAiPrompt: (prompt: string) => set({ pendingAiPrompt: prompt }),
        clearPendingAiPrompt: () => set({ pendingAiPrompt: null }),

        // Reset (touches all slices)
        reset: () =>
          set({
            selectedIds: new Set<string>(),
            lastSelectedId: null,
            viewMode: 'list',
            density: 'comfortable',
            previewPanelOpen: true,
            activeEmailId: null,
            activeThreadId: null,
            sidebar: initialSidebar,
            filters: initialFilters,
            compose: initialComposeState,
            pendingActions: new Set<string>(),
            kanbanAssignments: {},
            pendingAiPrompt: null,
          }),
      }),
      {
        name: 'email-ui-storage',
        storage: createJSONStorage(() => localStorage),
        // Only persist viewMode and kanbanAssignments
        partialize: (state) => ({
          viewMode: state.viewMode,
          kanbanAssignments: state.kanbanAssignments,
        }),
      }
    ),
    { name: 'email-ui-store' }
  )
);

// =============================================================================
// Selector Hooks (for performance)
// =============================================================================

export const useEmailSelection = () =>
  useEmailUIStore(
    useShallow((state) => ({
      selectedIds: state.selectedIds,
      selectedCount: state.selectedIds.size,
      hasSelection: state.selectedIds.size > 0,
    }))
  );

export const useEmailFilters = () =>
  useEmailUIStore((state) => state.filters);

export const useEmailCompose = () =>
  useEmailUIStore((state) => state.compose);

export const useEmailView = () =>
  useEmailUIStore(
    useShallow((state) => ({
      viewMode: state.viewMode,
      density: state.density,
      previewPanelOpen: state.previewPanelOpen,
      activeEmailId: state.activeEmailId,
      activeThreadId: state.activeThreadId,
    }))
  );

export const useEmailSidebar = () =>
  useEmailUIStore(
    useShallow((state) => ({
      width: state.sidebar.width,
      minWidth: state.sidebar.minWidth,
      maxWidth: state.sidebar.maxWidth,
      collapsedProviders: state.sidebar.collapsedProviders,
    }))
  );

export const useEmailKanban = () =>
  useEmailUIStore(
    useShallow((state) => ({
      kanbanAssignments: state.kanbanAssignments,
      setEmailKanbanColumn: state.setEmailKanbanColumn,
      moveEmailToColumn: state.moveEmailToColumn,
      getEmailColumn: state.getEmailColumn,
      clearKanbanAssignments: state.clearKanbanAssignments,
      pruneKanbanAssignments: state.pruneKanbanAssignments,
    }))
  );
