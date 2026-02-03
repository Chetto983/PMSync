---
phase: 06-advanced-features
plan: 02
subsystem: ui
tags: [kanban, dnd-kit, zustand, react, drag-drop, email-workflow]

# Dependency graph
requires:
  - phase: 05-folders-navigation
    provides: Email list components, Zustand email-ui-store, DnD infrastructure
provides:
  - EmailKanbanBoard component with drag-drop columns
  - EmailKanbanColumn droppable container
  - EmailKanbanCard sortable card component
  - ViewModeToggle component for list/kanban switching
  - Kanban column assignments persisted to localStorage
affects: [email-ui, dashboard-widgets, mobile-email]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kanban board with @dnd-kit for drag-drop"
    - "Zustand persist middleware for view mode persistence"
    - "Local-first column assignments (no backend API)"

key-files:
  created:
    - frontend/components/email/kanban/EmailKanbanBoard.tsx
    - frontend/components/email/kanban/EmailKanbanColumn.tsx
    - frontend/components/email/kanban/EmailKanbanCard.tsx
    - frontend/components/email/kanban/index.ts
    - frontend/components/email/layout/ViewModeToggle.tsx
  modified:
    - frontend/stores/email-ui-store.ts
    - frontend/components/email/list/ThreadListHeader.tsx
    - frontend/pages/dashboard/email.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

key-decisions:
  - "Kanban column assignments LOCAL ONLY - backend API out of scope for this phase"
  - "Reuse ThreadListItemData type for consistency with existing email list"
  - "Separate DndContext for Kanban (avoid conflicts with folder drag-drop)"
  - "ViewModeToggle in ThreadListHeader toolbar (visible in both views)"
  - "Hide reading pane in Kanban view (Kanban has its own full layout)"

patterns-established:
  - "Zustand persist middleware for user preferences"
  - "Kanban column state as emailId -> columnId map"
  - "Conditional view rendering based on viewMode state"

# Metrics
duration: 35min
completed: 2026-02-03
---

# Phase 06 Plan 02: Kanban Toggle View Summary

**Email Kanban workflow view with four columns (Inbox, To Reply, Following Up, Done), drag-drop card movement, and persisted view mode toggle**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-02-03T10:30:00Z
- **Completed:** 2026-02-03T11:50:00Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Kanban board with four workflow columns for email organization
- Drag-and-drop email cards between columns using @dnd-kit
- View mode toggle (list/kanban) persisted to localStorage
- i18n support for Kanban labels in English and Italian
- Seamless integration with existing email page

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend email-ui-store for Kanban view mode** - `8d707166` (feat)
2. **Task 2: Create EmailKanbanBoard and column components** - `1bc2dc96` (feat)
3. **Task 3: Create ViewModeToggle and integrate Kanban** - `094294c0` (feat)

## Files Created/Modified

**Created:**
- `frontend/components/email/kanban/EmailKanbanBoard.tsx` - Main DndContext container with 4 columns
- `frontend/components/email/kanban/EmailKanbanColumn.tsx` - Droppable column with count badge
- `frontend/components/email/kanban/EmailKanbanCard.tsx` - Sortable card with email preview
- `frontend/components/email/kanban/index.ts` - Module exports
- `frontend/components/email/layout/ViewModeToggle.tsx` - Toggle button group

**Modified:**
- `frontend/stores/email-ui-store.ts` - Added kanban type, state, persist middleware
- `frontend/components/email/list/ThreadListHeader.tsx` - Added ViewModeToggle
- `frontend/pages/dashboard/email.tsx` - Conditional rendering for Kanban view
- `frontend/locales/en.ts` - Kanban translations
- `frontend/locales/it.ts` - Kanban translations (Italian)
- `frontend/locales/index.ts` - TypeScript types for new translations

## Decisions Made

1. **Local-only column assignments:** Backend persistence for kanban status is explicitly out of scope. This allows fast iteration without backend changes. Column assignments are stored in Zustand with localStorage persistence.

2. **Reuse ThreadListItemData:** The Kanban cards use the same data structure as the email list for consistency and easier data sharing.

3. **Separate DndContext:** The Kanban board has its own DndContext to avoid conflicts with the existing folder drag-drop system in EmailLayout.

4. **ViewModeToggle placement:** Added to ThreadListHeader toolbar so it's visible and accessible in both list and kanban views.

5. **Hidden reading pane in Kanban:** The Kanban view is a full-width layout with its own structure, so the traditional reading pane is hidden.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

1. **useEmailsInfinite not exported:** The plan referenced a hook that didn't exist. Fixed by using the existing `useEmails` hook with increased limit for Kanban view.

2. **SpecialFolder type mismatch:** The store uses a broader SpecialFolder type while the API only accepts a subset. Fixed by adding the same `getApiSpecialUse` helper function used in the email page.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Kanban view feature complete for local usage
- Future enhancement: Backend API for persisting kanban column status
- Future enhancement: Drag-drop between Kanban and list views
- Ready for Phase 06-03 (Email Templates Enhanced)

---
*Phase: 06-advanced-features*
*Completed: 2026-02-03*
