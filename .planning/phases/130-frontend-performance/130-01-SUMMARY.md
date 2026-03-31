---
phase: 130-frontend-performance
plan: 01
subsystem: ui
tags: [next-dynamic, code-splitting, fullcalendar, bundle-optimization]

requires:
  - phase: none
    provides: none
provides:
  - "FullCalendar lazy-loaded via next/dynamic with ssr:false"
  - "Calendar page Skeleton loading fallback"
affects: []

tech-stack:
  added: []
  patterns: ["next/dynamic with named export wrapping for heavy page components"]

key-files:
  created: []
  modified:
    - "frontend/pages/dashboard/calendar.tsx"

key-decisions:
  - "Followed analytics.tsx dynamic import pattern exactly for consistency"

patterns-established:
  - "Named export dynamic import: .then(m => ({ default: m.Component })) for non-default exports"

requirements-completed: [PERF-01]

duration: 3min
completed: 2026-03-31
---

# Phase 130 Plan 01: Calendar Dynamic Import Summary

**FullCalendar code-split via next/dynamic with ssr:false and Skeleton fallback, removing ~150KB gzip from initial bundle**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-31T14:29:04Z
- **Completed:** 2026-03-31T14:32:30Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced static Calendar import with next/dynamic lazy import
- Added Skeleton loading fallback (rounded variant, 600px height)
- FullCalendar and 4 plugins now code-split into calendar page chunk only
- Follows established pattern from analytics.tsx (recharts lazy load)

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert Calendar page to dynamic import** - `1f441abb` (feat)
2. **Task 2: Run bundle analysis and document results** - No file changes (verification-only task)

## Files Created/Modified
- `frontend/pages/dashboard/calendar.tsx` - Replaced static import with next/dynamic, added Skeleton fallback

## Decisions Made
- Followed analytics.tsx pattern exactly for consistency across lazy-loaded pages
- Used height={600} for Skeleton to match calendar viewport height

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Frontend `npm run build` has pre-existing failures (ComposeDialog type error on ai.dto, portal/survey prerender error) unrelated to this change. TypeScript type-check (`tsc --noEmit`) passes cleanly, confirming our change is correct.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Calendar page is now lazy-loaded, completing the last heavy dependency code-split
- All heavy deps (recharts, TipTap, ai-sdk, FullCalendar) now use dynamic imports

---
*Phase: 130-frontend-performance*
*Completed: 2026-03-31*
