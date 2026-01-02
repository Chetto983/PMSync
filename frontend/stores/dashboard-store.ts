/**
 * Dashboard Store - Zustand store for CLIENT STATE ONLY
 *
 * Following 2025 best practices:
 * - Server state (layout from API) → TanStack Query (use-dashboard.ts)
 * - Client state (editMode, UI state) → Zustand (this file)
 *
 * @see https://www.bugragulculer.com/blog/good-bye-redux-how-react-query-and-zustand-re-wired-state-management-in-25
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Store Types
// ============================================================================

type WidgetId = 'briefing' | 'events' | 'emails' | 'deadlines' | 'followups';

const DEFAULT_VISIBLE_WIDGETS: WidgetId[] = ['briefing', 'events', 'emails', 'deadlines', 'followups'];

interface DashboardUIState {
    // Edit mode (client-only)
    editMode: boolean;
    setEditMode: (editMode: boolean) => void;
    toggleEditMode: () => void;

    // Widget library drawer (client-only)
    libraryOpen: boolean;
    setLibraryOpen: (open: boolean) => void;

    // Layout presets drawer (client-only)
    presetsOpen: boolean;
    setPresetsOpen: (open: boolean) => void;

    // Selected widget for settings (client-only)
    selectedWidget: string | null;
    setSelectedWidget: (widgetId: string | null) => void;

    // Visible widgets (persisted)
    visibleWidgets: WidgetId[];
    toggleWidget: (widgetId: WidgetId) => void;
    resetWidgets: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useDashboardStore = create<DashboardUIState>()(
    persist(
        (set) => ({
            // Edit mode
            editMode: false,
            setEditMode: (editMode: boolean) => set({ editMode }),
            toggleEditMode: () => set((state) => ({ editMode: !state.editMode })),

            // Widget library drawer
            libraryOpen: false,
            setLibraryOpen: (libraryOpen: boolean) => set({ libraryOpen }),

            // Layout presets drawer
            presetsOpen: false,
            setPresetsOpen: (presetsOpen: boolean) => set({ presetsOpen }),

            // Selected widget
            selectedWidget: null,
            setSelectedWidget: (selectedWidget: string | null) => set({ selectedWidget }),

            // Visible widgets
            visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
            toggleWidget: (widgetId: WidgetId) =>
                set((state) => ({
                    visibleWidgets: state.visibleWidgets.includes(widgetId)
                        ? state.visibleWidgets.filter((id) => id !== widgetId)
                        : [...state.visibleWidgets, widgetId],
                })),
            resetWidgets: () => set({ visibleWidgets: DEFAULT_VISIBLE_WIDGETS }),
        }),
        {
            name: 'dashboard-ui-state',
            // Persist only widget visibility preference
            partialize: (state) => ({ visibleWidgets: state.visibleWidgets }),
        }
    )
);
