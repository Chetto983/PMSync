---
phase: 96-ui-ux-polish
plan: 02
subsystem: ui
tags: [react, mui, skeleton, empty-state, error-handling]

requires:
  - phase: 96-01
    provides: shared EmptyState, QueryErrorAlert components and i18n keys
provides:
  - All 6 primary pages follow isLoading -> error -> empty -> data pattern
  - Layout-matching MUI Skeleton wave animations on all primary pages
  - QueryErrorAlert with retry on dashboard, tasks, reminders
  - Domain-colored EmptyState on calendar, contacts, tasks, reminders
affects: [96-03, 96-04]

tech-stack:
  added: []
  patterns:
    - "isLoading -> error -> empty -> data flow on all primary pages"
    - "MUI Skeleton with wave animation as primary loading indicator"
    - "Shared EmptyState with domain icon and semantic color"
    - "QueryErrorAlert for standardized error display with retry"

key-files:
  created: []
  modified:
    - frontend/components/dashboard/DashboardContainer.tsx
    - frontend/pages/dashboard/email.tsx
    - frontend/components/dashboard/Calendar.tsx
    - frontend/components/contacts/ContactList.tsx
    - frontend/components/dashboard/Tasks.tsx
    - frontend/components/reminders/RemindersBoard.tsx
    - frontend/pages/dashboard/contacts.tsx
    - frontend/pages/dashboard/reminders.tsx

key-decisions:
  - "Dashboard keeps its own DashboardEmptyState (more tailored than shared EmptyState) but adds QueryErrorAlert and Skeleton for preferences loading"
  - "Email keeps its own rich EmptyState with multiple variants (inbox/search/vip/folder) in ThreadList -- shared EmptyState not forced"
  - "Contacts errors handled via snackbar toasts (existing pattern) rather than QueryErrorAlert wrapper -- component uses manual data fetching, not TanStack Query error propagation"
  - "Calendar empty state triggers only when no provider groups exist (zero calendars connected), not when calendar has no events"
  - "Reminders return null replaced with skeleton during auth check"

patterns-established:
  - "Primary loading: Skeleton wave animation. Secondary loading (e.g. reading pane): CircularProgress acceptable"
  - "Error display: QueryErrorAlert where TanStack Query error is available; snackbar/toast where imperative fetch pattern is used"

requirements-completed: [UIPOL-01, UIPOL-02, UIPOL-03]

duration: 10min
completed: 2026-03-21
---

# Phase 96 Plan 02: Primary Pages Loading/Error/Empty States Summary

**Layout-matching Skeleton, QueryErrorAlert, and domain-colored EmptyState applied to all 6 primary pages (dashboard, email, calendar, contacts, tasks, reminders)**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-21T22:06:07Z
- **Completed:** 2026-03-21T22:16:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- All 6 primary pages now show layout-matching Skeleton wave animation during initial load instead of CircularProgress or blank screens
- Dashboard, tasks, and reminders show QueryErrorAlert with Retry button on data fetch failure
- Calendar, contacts, tasks, and reminders show domain-colored EmptyState with icon and CTA when data is empty
- Reminders page no longer returns null during auth/loading check -- shows skeleton instead

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard, email, calendar** - `71d31b68` (feat)
2. **Task 2: Contacts, tasks, reminders** - `0e3f10fe` (feat, combined with 96-03 pre-existing commit)

## Files Created/Modified
- `frontend/components/dashboard/DashboardContainer.tsx` - Added Skeleton grid + QueryErrorAlert for preferences loading
- `frontend/pages/dashboard/email.tsx` - Replaced CircularProgress with 8-row avatar+text skeleton list
- `frontend/components/dashboard/Calendar.tsx` - Replaced CircularProgress overlay with grid skeleton, added EmptyState for no calendars
- `frontend/components/contacts/ContactList.tsx` - Replaced CircularProgress with avatar+text skeleton rows, used shared EmptyState
- `frontend/components/dashboard/Tasks.tsx` - Replaced custom error/empty with QueryErrorAlert and EmptyState
- `frontend/components/reminders/RemindersBoard.tsx` - Used QueryErrorAlert and EmptyState with Bell icon
- `frontend/pages/dashboard/contacts.tsx` - Enhanced dynamic import skeleton to match contact list layout
- `frontend/pages/dashboard/reminders.tsx` - Replaced return null with skeleton during auth check

## Decisions Made
- Dashboard keeps its own `DashboardEmptyState` (customized with Customize button) rather than shared `EmptyState`
- Email retains its own rich multi-variant `EmptyState` in ThreadList (inbox/search/vip/folder variants)
- Contacts errors use toast pattern (existing architecture) -- no QueryErrorAlert wrapper forced
- Calendar empty state only shows when no calendars are connected, not when events list is empty
- CircularProgress kept only as secondary loading indicator (email reading pane single-email load)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing Button import in RemindersBoard**
- **Found during:** Task 2 (Reminders)
- **Issue:** Removed Button from MUI imports but it was still used in headerActions
- **Fix:** Re-added Button to MUI import
- **Files modified:** frontend/components/reminders/RemindersBoard.tsx
- **Verification:** tsc --noEmit passes
- **Committed in:** 0e3f10fe

**2. [Rule 1 - Bug] Fixed invalid t.reminders reference in RemindersBoard**
- **Found during:** Task 2 (Reminders)
- **Issue:** `t.reminders?.emptyCta` referenced non-existent key (reminders lives under `t.ai.reminders`)
- **Fix:** Used `tr.newReminder` (existing translation) instead
- **Files modified:** frontend/components/reminders/RemindersBoard.tsx
- **Verification:** tsc --noEmit passes
- **Committed in:** 0e3f10fe

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for compilation. No scope creep.

## Issues Encountered
- Task 2 commit was absorbed into a pre-existing 96-03 commit (0e3f10fe) that had already modified the same files in a previous execution session. Changes were verified correct via grep.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 primary pages follow the standardized loading/error/empty pattern
- Ready for Plan 03 (secondary pages) and Plan 04 (polish/animations)

---
*Phase: 96-ui-ux-polish*
*Completed: 2026-03-21*
