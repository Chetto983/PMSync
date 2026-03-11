---
phase: 70-frontend-unit-tests
plan: "01"
subsystem: frontend-stores
tags: [testing, zustand, unit-tests, state-management]
dependency_graph:
  requires: []
  provides: [FTEST-01]
  affects: [frontend/stores]
tech_stack:
  added: []
  patterns: [zustand-getState-testing, jest-mock-no-replace-true]
key_files:
  created:
    - frontend/jest.setup.ts (modified: added next/image mock)
    - frontend/stores/sync-store.test.ts
    - frontend/stores/dashboard-store.test.ts
    - frontend/stores/calendar-store.test.ts
    - frontend/stores/contact-store.test.ts
    - frontend/stores/folders-store.test.ts
    - frontend/stores/label-store.test.ts
    - frontend/stores/label-tree-store.test.ts
    - frontend/stores/email-ui-store.test.ts
    - frontend/stores/email-ui/compose-slice.test.ts
    - frontend/stores/email-ui/filter-slice.test.ts
    - frontend/stores/email-ui/kanban-slice.test.ts
    - frontend/stores/email-ui/selection-slice.test.ts
    - frontend/stores/email-ui/sidebar-slice.test.ts
    - frontend/stores/email-ui/view-slice.test.ts
  modified: []
decisions:
  - "Use setState(data) without the replace=true flag for stores without reset() action — passing true replaces the entire store object including action functions, breaking tests"
  - "CalendarEvent makeFactory must include all required fields (tenantId, externalId, isAllDay, timeZone, recurrence, status, visibility, lastSyncedAt, syncVersion) for TypeScript compliance"
  - "Label makeFactory must include all required fields (slug, type, icon, level, orderIndex, isArchived) — color is LabelColor object not a string"
metrics:
  duration: "~15min"
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 15
---

# Phase 70 Plan 01: Zustand Store Unit Tests Summary

All 14 Zustand store files now have co-located test files covering state transitions, side effects, and async behavior with optimistic update rollback.

## What Was Built

14 test files covering the full Zustand state management layer: 8 standalone stores and 6 email-ui slices accessed via the root store.

## Task Results

### Task 1: jest.setup.ts + 8 standalone store tests

| Store | Tests | Key Behaviors |
|-------|-------|--------------|
| sync-store | 3 | setStatus, clear |
| dashboard-store | 7 | toggleEditMode, setEditMode, drawer states, selectedWidget |
| calendar-store | 12 | setEvents side effect (auto-enables calendarIds), appendEvents dedup, addEvent, deleteEvent clears selectedEvent, toggleCalendarEnabled, getEventsByDate, reset |
| contact-store | 13 | setContacts dedup, addContact, deleteContact clears selectedIds, toggleSelection, selectAll, bulkDelete, searchContacts (name/email/company), loadMore |
| folders-store | 9 | setFoldersData builds providersById map, updateFolderCounts, upsertFolder insert+update, renameFolder, deleteFolder, setSyncing Set, setLastSync |
| label-store | 9 | fetchLabels, createLabel, deleteLabel, reorderLabels optimistic+rollback, handleLabelCreated dedup, handleLabelDeleted |
| label-tree-store | 7 | toggleExpanded, expandAll, collapseAll, pruneStaleIds, expandTo ancestor walk |
| email-ui-store | 5 | reset clears all slices, addPendingAction, removePendingAction |

Total: 77 tests, 8 suites — all pass

### Task 2: 6 email-ui slice tests

| Slice | Tests | Key Behaviors |
|-------|-------|--------------|
| compose-slice | 8 | openCompose (default mode), openReply/replyAll, openForward, openDraft, closeCompose, updateCompose merge |
| filter-slice | 7 | setFolder clears selectedIds+activeEmailId, setSearch (empty=undefined), setFilters merge, clearFilters resets all |
| selection-slice | 8 | selectEmail (singleton+activeEmailId), selectMultiple, toggleSelection, selectRange, clearSelection |
| view-slice | 9 | setViewMode, setDensity, togglePreviewPanel, setActiveEmail side effect (sets selectedIds), setActiveThread switches viewMode |
| sidebar-slice | 5 | setSidebarWidth with clamping, toggleProviderCollapse, setProviderCollapsed |
| kanban-slice | 7 | setEmailKanbanColumn, getEmailColumn (default=inbox), pruneKanbanAssignments, moveEmailToColumn, clearKanbanAssignments |

Total: 50 tests, 6 suites — all pass

**Grand total: 127 tests, 14 suites, all passing**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] setState(data, true) destroys store action functions**
- **Found during:** Task 1 — dashboard-store, sync-store, label-store, label-tree-store tests
- **Issue:** Zustand's `setState(data, true)` (replace=true) replaces the entire store object, wiping out action functions alongside state data. All `getState().method()` calls then fail with "not a function".
- **Fix:** Removed the `true` argument for all stores without `reset()` action. Stores with `reset()` continue using `getState().reset()`.
- **Files modified:** dashboard-store.test.ts, sync-store.test.ts, label-store.test.ts, label-tree-store.test.ts
- **Impact:** None — state is still fully reset between tests; only the replacement strategy changed.

**2. [Rule 1 - Bug] CalendarEvent makeFactory missing required TypeScript fields**
- **Found during:** TypeScript check after Task 1
- **Issue:** `CalendarEvent` type requires `tenantId: string`, `externalId: string`, `isAllDay: boolean`, `timeZone: string`, `recurrence: string[]`, `status: string`, `visibility: string`, `lastSyncedAt: string`, `syncVersion: number`. Minimal factory omitted them.
- **Fix:** Added all required fields to `makeEvent()` factory in calendar-store.test.ts.

**3. [Rule 1 - Bug] Label makeFactory used string color and missing required fields**
- **Found during:** TypeScript check after Task 1
- **Issue:** `Label.color` is `LabelColor | null` (not string). Also `slug`, `type`, `icon`, `level`, `orderIndex`, `isArchived` are required but were missing.
- **Fix:** Updated `makeLabel()` in label-store.test.ts and label-tree-store.test.ts to use `color: null` and include all required fields.

## Self-Check: PASSED

All 15 files confirmed present. Both task commits (c04bb9c2, 44d63853) confirmed in git history. 127 tests pass across 14 suites. TypeScript check produces zero errors in new files (2 pre-existing errors in use-settings.test.ts are out of scope).
