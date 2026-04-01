---
phase: 0135-sidebar-reduction
plan: 01
subsystem: ui
tags: [sidebar, navigation, dnd-kit, mui, lucide-react, icon-rail]

requires: []
provides:
  - "64px icon-rail sidebar with 5 pillar icons + Settings"
  - "Single-section useSidebarOrder hook with stale key cleanup"
affects: [0135-02, layout, mobile-tab-bar]

tech-stack:
  added: []
  patterns:
    - "Icon-rail navigation pattern: fixed-width Drawer with sortable icon items"
    - "Stale localStorage cleanup on hook init"

key-files:
  created: []
  modified:
    - frontend/hooks/use-sidebar-order.ts
    - frontend/components/layout/Sidebar.tsx

key-decisions:
  - "Removed all collapsed/expanded logic — sidebar is always 64px"
  - "Mobile returns null — MobileTabBar deferred to Plan 02"
  - "Settings pinned at bottom via flex spacer, not in DnD context"
  - "Used Theme type import instead of ReturnType<typeof useTheme> for proper type inference"

patterns-established:
  - "Icon-rail sidebar: permanent 64px Drawer with DnD-sortable pillar items"
  - "Stale key cleanup array pattern in localStorage hooks"

requirements-completed: [NAV-01, NAV-06]

duration: 3min
completed: 2026-04-01
---

# Phase 0135 Plan 01: Sidebar Icon Rail Summary

**Desktop sidebar reduced from 17-item multi-section collapsible drawer to 64px icon rail with 5 pillar icons (Home, Mail, Calendar, Contacts, Tasks) + Settings, with DnD reorder and stale localStorage cleanup**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T14:59:40Z
- **Completed:** 2026-04-01T15:03:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Sidebar reduced from 664 lines to 329 lines, rendering only 5 pillar icons + Settings in a fixed 64px rail
- useSidebarOrder hook simplified from multi-section (4 storage keys) to single-section with automatic stale key cleanup
- Active state preserved with brand gradient background, 3px left border pill, and glow shadow
- DnD reorder preserved on pillar icons via @dnd-kit
- All CRM/AI page files untouched — routes still work by URL (NAV-06)

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor useSidebarOrder hook to single-section with stale key cleanup** - `460c7c1b` (feat)
2. **Task 2: Rewrite Sidebar.tsx as 64px icon-rail-only with 5 pillars + Settings** - `5af1ba74` (feat)

## Files Created/Modified
- `frontend/hooks/use-sidebar-order.ts` - Single-section hook with stale key cleanup (pmsync:sidebar-order-pillars)
- `frontend/components/layout/Sidebar.tsx` - 64px icon-rail sidebar with 5 pillars + Settings, DnD, tooltips, active states

## Decisions Made
- Removed all collapsed/expanded logic entirely — sidebar is always 64px, no toggle
- Mobile returns null — MobileTabBar is deferred to Plan 02
- Settings pinned at bottom via flex spacer (`mt: 'auto'`), excluded from DnD context
- Used MUI `Theme` type import for sub-component props instead of `ReturnType<typeof useTheme>` which resolves to `unknown`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Theme type inference in sub-components**
- **Found during:** Task 2 (Sidebar rewrite)
- **Issue:** `ReturnType<typeof useTheme>` resolves to `unknown` when MUI theme augmentation isn't picked up, causing TS18046 errors in IconLink component
- **Fix:** Imported `Theme` type from `@mui/material` and used it directly in all sub-component prop interfaces
- **Files modified:** frontend/components/layout/Sidebar.tsx
- **Verification:** `npx tsc --noEmit` passes (only Layout.tsx caller errors remain, expected for Plan 02)
- **Committed in:** 5af1ba74 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential type fix for compilation. No scope creep.

## Issues Encountered
- Layout.tsx still passes old props (`collapsed`, `onToggleCollapse`, `mobileOpen`, `onClose`) to Sidebar — expected TS error, will be resolved in Plan 02 (Layout adjustments)
- Pre-existing TS errors in TicketsList.tsx (unused imports) — out of scope, not introduced by this plan

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality specified in the plan is fully wired.

## Next Phase Readiness
- Sidebar icon rail complete, ready for Plan 02 (Layout.tsx adjustments, MobileTabBar, Header cleanup)
- Layout.tsx must be updated to remove old Sidebar props and collapsed state
- Header.tsx hamburger menu needs to be replaced with mobile tab bar

---
*Phase: 0135-sidebar-reduction*
*Completed: 2026-04-01*
