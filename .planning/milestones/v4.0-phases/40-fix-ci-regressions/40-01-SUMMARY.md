---
phase: 40-fix-ci-regressions
plan: 01
subsystem: infra
tags: [ci, github-actions, lighthouse, openapi]

requires:
  - phase: 33-api-hardening
    provides: OpenAPI generation step with continue-on-error
  - phase: 37-frontend-performance
    provides: Lighthouse CI without paths filter
provides:
  - Restored Lighthouse CI triggering on all PRs
  - Clean OpenAPI generation failure visibility in CI
  - Removed dead auth-token.ts stub
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .github/workflows/frontend-ci.yml
    - .github/workflows/ci.yml
    - frontend/lib/utils/auth-token.ts (deleted)

key-decisions:
  - "Surgical revert of 3 regressions from commit 4a911f38 -- no other changes"

patterns-established: []

requirements-completed: []

duration: 2min
completed: 2026-03-04
---

# Phase 40 Plan 01: CI Regression Fixes Summary

**Reverted 3 silent CI regressions from commit 4a911f38: paths filter on Lighthouse CI, echo fallback masking OpenAPI failures, dead auth-token.ts stub**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T14:54:24Z
- **Completed:** 2026-03-04T14:56:14Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed `paths: frontend/**` filter from frontend-ci.yml so Lighthouse CI triggers on ALL PRs
- Removed `|| echo` fallback from OpenAPI generation step so real failures are visible (continue-on-error preserved)
- Deleted dead `frontend/lib/utils/auth-token.ts` deprecation stub with zero callers

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove frontend-ci.yml paths filter** - `0ee143bb` (fix)
2. **Task 2: Remove OpenAPI echo fallback and delete auth-token.ts** - `f91a1e5e` (fix)

## Files Created/Modified
- `.github/workflows/frontend-ci.yml` - Removed paths stanzas from push/pull_request triggers
- `.github/workflows/ci.yml` - Replaced multi-line run with echo fallback to single-line run command
- `frontend/lib/utils/auth-token.ts` - Deleted (dead deprecation stub)

## Decisions Made
- Surgical revert of 3 regressions only -- no other workflow changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CI workflows restored to Phase 37/39 intended state
- No blockers for subsequent phases

---
*Phase: 40-fix-ci-regressions*
*Completed: 2026-03-04*
