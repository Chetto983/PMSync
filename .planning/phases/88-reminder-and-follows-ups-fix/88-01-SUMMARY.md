---
phase: 88-reminder-and-follows-ups-fix
plan: 01
subsystem: ui
tags: [mui, tanstack-query, dashboard, follow-ups, reminders]

requires:
  - phase: 87-ai-chat-module-fix
    provides: Follow-up and dashboard API hooks

provides:
  - Wired snooze mutation on FollowUpWidget
  - Persisted dashboard widget visibility via backend preferences API
  - MUI keyframes spin animation on BaseWidget refresh icon
  - Client-side navigation on PredictiveInsightsWidget insight cards
  - Error feedback Alert on ReminderCreateDialog

affects: [dashboard, reminders, follow-ups]

tech-stack:
  added: []
  patterns:
    - "Derive widget visibility from server state (useMemo over preferences) instead of local useState"
    - "MUI sx @keyframes for inline animations instead of Tailwind utilities"

key-files:
  created: []
  modified:
    - frontend/components/dashboard/widgets/FollowUpWidget.tsx
    - frontend/components/dashboard/DashboardContainer.tsx
    - frontend/components/dashboard/widgets/BaseWidget.tsx
    - frontend/components/dashboard/widgets/PredictiveInsightsWidget.tsx
    - frontend/components/reminders/ReminderCreateDialog.tsx

key-decisions:
  - "WidgetLayout i field uses widgetId-1 pattern to match existing default layout convention"
  - "buildLayout helper extracted as useCallback for reuse in toggle and reset handlers"

patterns-established:
  - "Server-derived visibility: useMemo over preferences.widgets instead of useState for persistent widget state"

requirements-completed: [BUG-1, BUG-2, BUG-4, BUG-6, BUG-7]

duration: 5min
completed: 2026-03-19
---

# Phase 88 Plan 01: Dashboard and Reminder Bug Fixes Summary

**Wired 5 dashboard/reminder bugs: snooze mutation, widget persistence via backend API, MUI spin animation, client-side insight navigation, and error feedback Alert**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T16:13:02Z
- **Completed:** 2026-03-19T16:18:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- FollowUpWidget snooze now calls real useSnoozeFollowUp hook instead of no-op stub
- DashboardContainer widget visibility persists across page reloads via useDashboardPreferences + useSaveDashboardLayout
- BaseWidget refresh icon spins using MUI sx @keyframes (no Tailwind animate-spin)
- PredictiveInsightsWidget insight cards use useRouter().push() for client-side navigation
- ReminderCreateDialog shows MUI Alert on mutation error

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire snooze mutation and fix dashboard persistence** - `6a749799` (fix)
2. **Task 2: Fix spin animation, insight navigation, and error feedback** - `9b81b4a7` (fix)

## Files Created/Modified
- `frontend/components/dashboard/widgets/FollowUpWidget.tsx` - Replaced snooze stub with useSnoozeFollowUp hook
- `frontend/components/dashboard/DashboardContainer.tsx` - Replaced useState with server-derived visibility via useDashboardPreferences
- `frontend/components/dashboard/widgets/BaseWidget.tsx` - Replaced Tailwind animate-spin with MUI sx @keyframes
- `frontend/components/dashboard/widgets/PredictiveInsightsWidget.tsx` - Replaced anchor tag with useRouter().push()
- `frontend/components/reminders/ReminderCreateDialog.tsx` - Added Alert error display on mutation failure

## Decisions Made
- WidgetLayout `i` field uses `${widgetId}-1` pattern to match existing default layout convention in use-dashboard.ts
- Extracted `buildLayout` as useCallback for reuse in both toggle and reset handlers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing `i` field to WidgetLayout construction**
- **Found during:** Task 1 (DashboardContainer persistence)
- **Issue:** Plan's layout construction omitted required `i` field from WidgetLayout type
- **Fix:** Added `i: \`${widgetId}-1\`` to match existing default layout convention
- **Files modified:** frontend/components/dashboard/DashboardContainer.tsx
- **Verification:** tsc --noEmit passes
- **Committed in:** 6a749799 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type-safety fix required for WidgetLayout interface compliance. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 dashboard/reminder bugs fixed
- Ready for any remaining Phase 88 plans

---
*Phase: 88-reminder-and-follows-ups-fix*
*Completed: 2026-03-19*
