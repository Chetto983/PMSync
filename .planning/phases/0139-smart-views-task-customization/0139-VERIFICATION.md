---
phase: 0139-smart-views-task-customization
verified: 2026-04-02T08:30:00Z
status: gaps_found
score: 6/8 must-haves verified
re_verification: false
gaps:
  - truth: "Clicking a pinned view in popover navigates to Tasks page with that view applied"
    status: failed
    reason: "PinnedViewsPopover navigates to /dashboard/tasks?view=<id>. TasksList initializes activeViewId from q.view (chip highlights correctly) but the filter state variables (filterSourceType, filterStatus, etc.) are initialized from separate URL params (q.type, q.status, etc.) — NOT from the smart view's filters. There is no useEffect that resolves the view ID to its filters on mount. The task list renders unfiltered results despite the chip being highlighted as active."
    artifacts:
      - path: "frontend/components/dashboard/tasks/TasksList.tsx"
        issue: "Line 91: viewMode reads q.view but writes to params.viewMode (line 131) — param name mismatch means kanban view is not restored from URL. Separately, lines 105-107 set activeViewId from q.view but no effect resolves that ID to filters."
      - path: "frontend/components/dashboard/tasks/PinnedViewsPopover.tsx"
        issue: "Line 67: pushes ?view=<id> but TasksList has no mechanism to hydrate filters from a view ID on mount. Filters are not written to the URL when the view is applied in-session, so there is nothing to restore."
    missing:
      - "Add a useEffect in TasksList that watches router.isReady + q.view. When q.view is a non-empty string and smartViews data is loaded, find the matching view and call applyView() to populate filter state. This closes the cross-session persistence gap."
      - "Fix the viewMode URL param read/write mismatch: line 91 should read q.viewMode, not q.view."

  - truth: "Manually changing a filter clears the active view"
    status: partial
    reason: "The individual filter onChange handlers do call setActiveViewId(null) (lines 282, 294, 308, etc.). However the viewMode toggle (line 243) does NOT clear activeViewId. Minor omission but the stated truth is not fully satisfied."
    artifacts:
      - path: "frontend/components/dashboard/tasks/TasksList.tsx"
        issue: "ToggleButtonGroup onChange (line 243) does not call setActiveViewId(null) when view mode changes."
    missing:
      - "Add setActiveViewId(null) to the ToggleButtonGroup onChange handler at line 243."
---

# Phase 0139: Smart Views & Task Customization Verification Report

**Phase Goal:** Users save and pin frequently used filter combinations for instant access to their most relevant task slices
**Verified:** 2026-04-02T08:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | GET /tasks/views returns an array of smart views for the authenticated user | VERIFIED | `SmartViewService.list()` queries `taskSmartView.findMany({ where: { tenantId, userId } })`. Endpoint wired in controller at line 49-53. |
| 2 | POST /tasks/views creates a new smart view with name, filters, and optional isPinned | VERIFIED | `createView` handler at line 55-63 passes to `SmartViewService.create()`. DTO validates all three fields. |
| 3 | PATCH/DELETE /tasks/views/:id and PATCH /tasks/views/:id/pin all work | VERIFIED | All four endpoints present in controller (lines 66-100), all delegate to SmartViewService which scopes by tenantId+userId. |
| 4 | Maximum 5 pinned views enforced server-side | VERIFIED | `enforcePinLimit()` counts pinned views and throws `BadRequestException` when `count >= 5`. Called in `create`, `update`, and `togglePin`. |
| 5 | User can save current filters as a named smart view via SavedViewDialog | VERIFIED | `SavedViewDialog` calls `useCreateSmartView().mutateAsync()` with `{ name, filters, isPinned }`. Pin limit error surfaces via toast. |
| 6 | Saved views appear as chips in SavedViewsBar, clicking applies filters and highlights chip | VERIFIED | `SavedViewsBar` maps `useSmartViews()` data to `Chip` components. Active chip uses `color="success" variant="filled"`. Clicking calls `onApplyView(view)` which sets all filter state in `TasksList.applyView()`. |
| 7 | Pinned views appear in PinnedViewsPopover when clicking Tasks sidebar icon | VERIFIED | `Sidebar.tsx` detects `pinnedViews.length > 0` for the Tasks pillar, intercepts the click, and opens `PinnedViewsPopover`. Popover filters `useSmartViews()` data for `isPinned === true`. |
| 8 | Clicking a pinned view in popover navigates to Tasks page with that view applied | FAILED | Navigation to `?view=<id>` works and highlights the chip, but TasksList has no on-mount hydration of filters from the view ID. Filters remain at defaults. Cross-session persistence (Success Criterion 3) is broken. |

**Score:** 6/8 truths verified (plus 1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` | TaskSmartView model | VERIFIED | Model at line 1912 with all required fields: id, tenantId, userId, name, filters (JSONB), isPinned, pinOrder, timestamps. Three indexes. Reverse relations on Tenant (line 87) and User (line 145). |
| `backend/prisma/migrations/20260402072400_add_task_smart_views/migration.sql` | Migration SQL | VERIFIED | Proper `CREATE TABLE`, three `CREATE INDEX`, two `ADD FOREIGN KEY`. No `db push` used. |
| `backend/src/modules/tasks/services/smart-view.service.ts` | CRUD service | VERIFIED | 104 lines. list, create, update, remove, togglePin. All methods scope to tenantId+userId. enforcePinLimit called in 3 places. |
| `backend/src/modules/tasks/dto/create-smart-view.dto.ts` | Create DTO | VERIFIED | 22 lines. name (required, MaxLength 100), filters (required object), isPinned (optional boolean). |
| `backend/src/modules/tasks/dto/update-smart-view.dto.ts` | Update DTO | VERIFIED | 31 lines. All fields optional. pinOrder validated 0-4. |
| `frontend/lib/api/tasks.ts` | TaskSmartView type + API methods | VERIFIED | TaskSmartView, CreateSmartViewDto, UpdateSmartViewDto interfaces defined. 5 API methods: listViews, createView, updateView, deleteView, togglePin. |
| `frontend/hooks/queries/use-tasks.ts` | Smart view hooks | VERIFIED | smartViewsOptions, useSmartViews, useCreateSmartView, useUpdateSmartView, useDeleteSmartView, useTogglePin — all present and wire to tasksApi. |
| `frontend/components/dashboard/tasks/SavedViewsBar.tsx` | Chip bar component | VERIFIED | 137 lines. Reads useSmartViews(), renders chips with active highlight, delete confirmation dialog, pin avatar indicator, loading skeletons. |
| `frontend/components/dashboard/tasks/SavedViewDialog.tsx` | Save dialog | VERIFIED | 122 lines. Name field, filter summary caption, pin toggle switch, Enter key submit, pin limit error toast. Calls useCreateSmartView(). |
| `frontend/components/dashboard/tasks/PinnedViewsPopover.tsx` | Sidebar popover | VERIFIED | 82 lines. Reads useSmartViews(), filters pinned, sorts by pinOrder. Click navigates to /dashboard/tasks?view=<id>. Anchors to Tasks icon. |
| `frontend/components/dashboard/tasks/TasksList.tsx` | TasksList integration | PARTIAL | SavedViewsBar and SavedViewDialog integrated. applyView() correctly populates filter state in-session. But no on-mount effect to hydrate filters from URL ?view param. Also: viewMode URL param name mismatch (reads q.view, writes params.viewMode). |
| `frontend/components/layout/Sidebar.tsx` | Sidebar integration | VERIFIED | Imports PinnedViewsPopover and useSmartViews. Detects Tasks pillar + pinnedViews.length > 0. Intercepts click, opens popover. Falls through to normal Link navigation otherwise. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| tasks.controller.ts | smart-view.service.ts | constructor injection | WIRED | `SmartViewService` injected at line 46, used in 5 endpoints. |
| tasks.module.ts | smart-view.service.ts | providers array | WIRED | `SmartViewService` in providers and exports at lines 11, 12. |
| SavedViewsBar.tsx | use-tasks.ts | useSmartViews, useDeleteSmartView | WIRED | Both hooks imported and called at lines 18, 39-40. |
| SavedViewDialog.tsx | use-tasks.ts | useCreateSmartView | WIRED | Hook imported and called at lines 15, 42. |
| PinnedViewsPopover.tsx | use-tasks.ts | useSmartViews | WIRED | Hook imported and called at lines 13, 27. |
| TasksList.tsx | SavedViewsBar.tsx | import SavedViewsBar | WIRED | Imported at line 35, rendered at line 268 with all props. |
| TasksList.tsx | SavedViewDialog.tsx | import SavedViewDialog | WIRED | Imported at line 36, rendered at line 487. |
| Sidebar.tsx | PinnedViewsPopover.tsx | import PinnedViewsPopover | WIRED | Imported at line 47, rendered at line 339 with anchor+open+onClose. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| SavedViewsBar.tsx | `views` | `useSmartViews()` -> `tasksApi.listViews()` -> `GET /tasks/views` -> `prisma.taskSmartView.findMany()` | Yes — DB query with tenantId+userId scope | FLOWING |
| PinnedViewsPopover.tsx | `views` (pinned filtered) | Same chain as above | Yes | FLOWING |
| TasksList.tsx on-session view apply | filter state vars | `applyView(view)` reads `view.filters` from server response | Yes — real view data used | FLOWING |
| TasksList.tsx on-mount from URL | filter state vars | `q.type`, `q.status`, etc. — NOT from `?view=<id>` | No — view ID in URL does not re-hydrate filters | DISCONNECTED |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points testable without a live server.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| TASK-04 | 0139-01-PLAN.md, 0139-02-PLAN.md | User can save filter combinations as named smart views | SATISFIED | Backend: CreateSmartViewDto + SmartViewService.create(). Frontend: SavedViewDialog -> useCreateSmartView -> POST /tasks/views. Full round-trip. |
| TASK-05 | 0139-01-PLAN.md, 0139-02-PLAN.md | User can pin smart views to Tasks sidebar for quick access | PARTIALLY SATISFIED | Pin toggling works (isPinned field, server-side limit, dialog switch). Pinned views appear in sidebar popover. BUT clicking a pinned view from the popover does not restore filters on mount — cross-session "quick access" is hollow. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| TasksList.tsx | 91 | `q.view === 'kanban'` for viewMode init, but writes `params.viewMode` (line 131) | Warning | Kanban view mode is not restored from URL on navigation. Pre-existing TASK-06 scope issue exposed by the rename, not a smart views bug. |
| TasksList.tsx | 105-107 | `activeViewId` initialized from `q.view` but no effect hydrates filters from that ID | Blocker | Smart view applied from sidebar popover shows highlighted chip but unfiltered data. Success Criterion 3 broken. |

### Human Verification Required

#### 1. In-session filter clear on viewMode toggle

**Test:** Apply a saved view (click chip). Then switch between list/kanban using the toggle buttons.
**Expected:** The active view chip should deactivate (activeViewId cleared) when the user changes view mode.
**Why human:** Can't test UI interaction without a running browser.

#### 2. Pin limit UX at boundary

**Test:** Create 5 pinned views, then attempt to create a 6th with isPinned=true.
**Expected:** Error toast "Maximum 5 pinned views. Unpin one to add another." Server returns 400.
**Why human:** Requires real session with 5 existing pinned rows.

### Gaps Summary

Two gaps block full goal achievement:

**Gap 1 (Blocker):** Cross-session filter persistence is missing. When the user clicks a pinned view in the sidebar popover, the navigation to `?view=<id>` correctly highlights the chip in SavedViewsBar but the task list does not apply the view's filters. `TasksList` has no mechanism to hydrate filter state from a view ID on mount — it only reads individual filter params (`q.type`, `q.status`, etc.) from the URL. The fix is a `useEffect` in `TasksList` that triggers when `router.isReady` is true and `q.view` is set: load the views list, find the matching view by ID, and call `applyView()`. Success Criterion 3 ("Pinned smart views persist across sessions") fails because of this.

**Gap 2 (Minor):** URL param name mismatch for `viewMode`. The component reads `q.view` to initialize the kanban/list toggle (line 91) but writes `params.viewMode` (line 131). After the first navigation the URL will have `?viewMode=kanban` but on re-load the check `q.view === 'kanban'` will be false and the page will render in list mode. This is a pre-existing Phase 138 concern exposed by the smart view rename, but it affects the overall Tasks page correctness.

The root cause of both gaps is the same: the URL strategy for `?view=` was defined for smart view IDs, and `viewMode` was renamed to avoid collision, but the read-side was not updated to match.

---

_Verified: 2026-04-02T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
