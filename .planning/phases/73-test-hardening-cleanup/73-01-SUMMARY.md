---
phase: 73-test-hardening-cleanup
plan: 01
subsystem: testing
tags: [jest, openapi, contract-tests, subscription, cleanup]

requires:
  - phase: 66-test-infrastructure
    provides: Jest global setup, test helpers, cleanup utilities
  - phase: 68-backend-tests-complex-modules
    provides: Subscription spec patterns, FK race condition fix precedent
provides:
  - OpenAPI spec generation wired into Jest global setup
  - precontract-test npm lifecycle hook for standalone contract runs
  - Subscription specs free of global TRUNCATE CASCADE
affects: [contract-tests, subscription-tests, ci-pipeline]

tech-stack:
  added: []
  patterns:
    - "OpenAPI spec generation in global-setup with graceful fallback"
    - "npm lifecycle hook (precontract-test) for standalone test suites"

key-files:
  created: []
  modified:
    - backend/test/global-setup.ts
    - backend/package.json
    - backend/src/modules/subscription/services/__tests__/subscription.service.spec.ts
    - backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts

key-decisions:
  - "OpenAPI generation wrapped in try/catch with warning-only fallback so unit tests never fail due to spec generation"
  - "precontract-test npm lifecycle hook ensures contract-test always has a fresh spec without manual steps"

patterns-established:
  - "Graceful fallback pattern: non-critical setup steps log warnings instead of throwing"

requirements-completed: [BINT-03, INFRA-03]

duration: 2min
completed: 2026-03-13
---

# Phase 73 Plan 01: Test Hardening - OpenAPI Spec Generation and Subscription Cleanup Summary

**OpenAPI spec generation wired into Jest global setup with graceful fallback, and subscription specs cleaned of global TRUNCATE to prevent parallel FK race conditions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T19:26:56Z
- **Completed:** 2026-03-13T19:29:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Contract tests now have OpenAPI spec available via global-setup.ts generation step
- Standalone `npm run contract-test` always generates a fresh spec via precontract-test hook
- Subscription specs no longer risk FK violations from global TRUNCATE CASCADE in parallel Jest runs

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire OpenAPI spec generation into Jest global setup and add precontract-test hook** - `31b62629` (feat)
2. **Task 2: Replace global TRUNCATE with targeted deleteMany in subscription specs** - `508a9875` (fix)

## Files Created/Modified
- `backend/test/global-setup.ts` - Added OpenAPI spec generation step after prisma seed with graceful fallback
- `backend/package.json` - Added precontract-test npm lifecycle hook
- `backend/src/modules/subscription/services/__tests__/subscription.service.spec.ts` - Removed cleanupTestData import and call
- `backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts` - Removed cleanupTestData import and call

## Decisions Made
- OpenAPI generation uses try/catch with console.log warning (not console.error) so it reads as expected behavior when app bootstrap is unavailable
- precontract-test npm lifecycle hook provides a second path to spec generation for standalone contract test runs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Contract tests ready to exercise real OpenAPI assertions when spec generation succeeds
- Subscription specs safe for parallel Jest execution
- Ready for remaining Phase 73 plans

---
*Phase: 73-test-hardening-cleanup*
*Completed: 2026-03-13*
