/**
 * Dashboard Store - Zustand store for CLIENT UI STATE ONLY
 *
 * Following 2025 best practices:
 * - Server state (layout, preferences) → TanStack Query + Postgres backend
 * - Client state (editMode, drawer states) → Zustand (this file, NO localStorage)
 *
 * Widget visibility is managed by backend API, NOT localStorage
 */

import { create } from 'zustand';

// ============================================================================
// Store Types
// ============================================================================

export type WidgetId =
    | 'briefing'
    | 'events'
    | 'emails'
    | 'deadlines'
    | 'followups'
    | 'trends'
    | 'contacts'
    | 'triage'
    | 'crmSuggestions';

export const ALL_WIDGETS: WidgetId[] = ['briefing', 'events', 'emails', 'deadlines', 'followups', 'trends', 'contacts', 'triage', 'crmSuggestions'];

interface DashboardUIState {
    // Edit mode (client-only, transient)
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
}

// ============================================================================
// Store Implementation - NO PERSISTENCE (backend handles preferences)
// ============================================================================

export const useDashboardStore = create<DashboardUIState>()((set) => ({
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
}));
