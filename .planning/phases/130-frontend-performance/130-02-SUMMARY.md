---
phase: 130-frontend-performance
plan: 02
subsystem: api
tags: [nestjs, cache-control, http-headers, performance]

requires:
  - phase: 130-frontend-performance
    provides: research identifying zero Cache-Control headers on read-heavy endpoints
provides:
  - Cache-Control headers on 4 GET endpoints (labels, folders, pricing table x2)
affects: [frontend-performance, billing]

tech-stack:
  added: []
  patterns: ["NestJS @Header decorator for Cache-Control on read-heavy GET endpoints"]

key-files:
  created: []
  modified:
    - backend/src/modules/labels/controllers/labels.controller.ts
    - backend/src/modules/email/controllers/folders.controller.ts
    - backend/src/modules/subscription/controllers/autumn.controller.ts

key-decisions:
  - "Labels 60s private, folders 30s private (shorter due to unread count changes), pricing 300s public / 120s private"
  - "stale-while-revalidate on all endpoints for background revalidation"

patterns-established:
  - "@Header('Cache-Control') decorator pattern for NestJS GET endpoints"

requirements-completed: [PERF-02]

duration: 2min
completed: 2026-03-31
---

# Phase 130 Plan 02: API Cache-Control Headers Summary

**Cache-Control headers on 4 read-heavy GET endpoints: labels (60s), folders (30s), pricing public (300s), pricing authenticated (120s)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T14:29:06Z
- **Completed:** 2026-03-31T14:30:51Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added Cache-Control headers to labels GET (private, max-age=60, stale-while-revalidate=120)
- Added Cache-Control headers to folders GET (private, max-age=30, stale-while-revalidate=60)
- Added Cache-Control headers to unauthenticated pricing table (public, max-age=300, stale-while-revalidate=600)
- Added Cache-Control headers to authenticated pricing table (private, max-age=120, stale-while-revalidate=300)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Cache-Control headers to labels and folders GET endpoints** - `79ee9cc7` (feat)
2. **Task 2: Add Cache-Control headers to pricing table GET endpoints** - `5edcb47b` (feat)

## Files Created/Modified
- `backend/src/modules/labels/controllers/labels.controller.ts` - Added Header import + @Header decorator on listLabels
- `backend/src/modules/email/controllers/folders.controller.ts` - Added Header import + @Header decorator on getFolders
- `backend/src/modules/subscription/controllers/autumn.controller.ts` - Added Header import + @Header decorators on both pricing_table endpoints

## Decisions Made
None - followed plan as specified

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 Cache-Control headers in place, verified by grep and tsc --noEmit
- TanStack Query client-side invalidation already handles mutations, so stale cache is not a concern

---
*Phase: 130-frontend-performance*
*Completed: 2026-03-31*
