---
phase: 47-infrastructure-cleanup
plan: 02
subsystem: infra
tags: [csrf, error-handling, security, axios, nestjs-filter]

requires:
  - phase: 47-infrastructure-cleanup
    provides: CSRF middleware and ApiExceptionFilter foundation

provides:
  - CSRF_TOKEN_INVALID structured error code in middleware and filter
  - Frontend CSRF-specific retry (no more blanket 403 retry)
  - CSRF error unit test suite (8 tests)

affects: [frontend-api-client, error-handling]

tech-stack:
  added: []
  patterns: [csrf-error-code-pattern, targeted-403-retry]

key-files:
  created:
    - backend/test/csrf-error.spec.ts
  modified:
    - backend/src/common/middleware/csrf.middleware.ts
    - backend/src/common/filters/api-exception.filter.ts
    - frontend/lib/api-client.ts

key-decisions:
  - "CSRF_TOKEN_INVALID error code distinguishes CSRF 403 from auth 403"
  - "Frontend only retries on CSRF_TOKEN_INVALID, preventing infinite retry loops on authorization failures"

patterns-established:
  - "Error code pattern: middleware sets .code on Error, filter checks .code before generic handler"

requirements-completed: [CLN-01, CLN-02, CLN-03, TEST-11]

duration: 7min
completed: 2026-03-06
---

# Phase 47 Plan 02: CSRF Structured Error Summary

**CSRF errors surfaced as CSRF_TOKEN_INVALID with targeted frontend retry, preventing infinite 403 retry loops**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-06T11:01:03Z
- **Completed:** 2026-03-06T11:08:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- CSRF middleware wraps doubleCsrfProtection callback to emit structured CSRF_TOKEN_INVALID error
- ApiExceptionFilter detects CSRF errors before generic Error handler, returns structured JSON
- Frontend CSRF retry now checks error code -- non-CSRF 403s (authorization) pass through without retry
- Dead filter files confirmed absent (CLN-03 pre-satisfied)
- 8 unit tests validating CSRF error surfacing (TEST-11)

## Task Commits

Each task was committed atomically:

1. **Task 1: CSRF structured error in middleware + filter + frontend retry** - `3c92384c` (feat, pre-existing from 47-03 wave)
2. **Task 2: CSRF error unit test (TEST-11)** - `63dcfa99` (test)

**Note:** Task 1 changes were already committed as part of 47-03 execution (wave ordering). Verified in-place, no duplicate commit needed.

## Files Created/Modified
- `backend/src/common/middleware/csrf.middleware.ts` - Wraps doubleCsrfProtection with CSRF_TOKEN_INVALID error transformation
- `backend/src/common/filters/api-exception.filter.ts` - CSRF-specific handler before generic Error handler
- `frontend/lib/api-client.ts` - CSRF-specific retry on CSRF_TOKEN_INVALID only
- `backend/test/csrf-error.spec.ts` - 8 unit tests for CSRF error surfacing

## Decisions Made
- Task 1 changes were already in codebase from 47-03 execution -- verified correctness, no re-commit needed
- Test file force-added past .gitignore rule (backend/test/* is ignored except contract/ and integration/)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] IRealtimeGateway.hasTenantConnections return type**
- **Found during:** Task 1 (pre-commit hook)
- **Issue:** Interface declared `boolean | Promise<boolean>` but `implements` check fails with async method
- **Fix:** Changed to `Promise<boolean>` (all callers already await)
- **Files modified:** backend/src/modules/realtime/types/realtime-gateway.interface.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** f828e5e8 (part of 47-01 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing type error blocked all commits. Fix was minimal and correct.

## Issues Encountered
- Task 1 work was already committed by 47-03 plan execution (wave dependency ordering meant 47-03 ran first and included CSRF changes). Verified all changes in place.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CSRF error handling is complete and tested
- All CLN requirements satisfied

---
*Phase: 47-infrastructure-cleanup*
*Completed: 2026-03-06*
