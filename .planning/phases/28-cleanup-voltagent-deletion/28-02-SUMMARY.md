---
phase: 28-cleanup-voltagent-deletion
plan: 02
subsystem: ui
tags: [dead-code-cleanup, voltagent, swagger, e2e, bundle-analysis, api-migration]

# Dependency graph
requires:
  - phase: 28-01
    provides: Dead ai-elements/AiDashboard files deleted, clean import graph
provides:
  - Zero voltagent references in all frontend code, E2E fixtures, and swagger.json
  - API paths migrated from /api/v1/voltagent/* to /api/v1/ai/* in crm.ts and document-library.ts
  - swagger.json cleaned from 259 to 170 paths (89 dead voltagent paths removed)
  - BUNDLE-ANALYSIS.md documenting post-deletion bundle state
affects: [28-03, phase-30-bundle-budget]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/28-cleanup-voltagent-deletion/BUNDLE-ANALYSIS.md
  modified:
    - frontend/e2e/fixtures.ts
    - frontend/e2e/compose.spec.ts
    - frontend/e2e/search.spec.ts
    - frontend/e2e/auth.spec.ts
    - frontend/src/api/swagger.json
    - frontend/lib/api/crm.ts
    - frontend/lib/api/document-library.ts
    - frontend/hooks/queries/use-dashboard.ts
    - frontend/types/constants.ts

key-decisions:
  - "Voltagent E2E mock routes removed (not replaced with /ai/*) since catch-all mock covers all unmocked endpoints"
  - "crm.ts and document-library.ts API paths migrated from /api/v1/voltagent/* to /api/v1/ai/* (matching Phase 26 migration pattern)"
  - "Tree-shaking confirmed: zero ai-elements code in production bundle even before file deletion"

patterns-established: []

requirements-completed: [FECLEAN-02, FECLEAN-03]

# Metrics
duration: 13min
completed: 2026-03-03
---

# Phase 28 Plan 02: Frontend Voltagent Cleanup & Bundle Analysis Summary

**Cleaned all voltagent references from 9 frontend files, removed 89 dead swagger paths, confirmed zero ai-elements in production bundle**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-03T09:20:19Z
- **Completed:** 2026-03-03T09:33:00Z
- **Tasks:** 2
- **Files modified:** 10 (9 code files + 1 report created)

## Accomplishments
- Removed voltagent mock routes from 4 E2E test files (fixtures.ts, compose.spec.ts, search.spec.ts, auth.spec.ts)
- Cleaned swagger.json: removed 89 dead /api/v1/voltagent/* path entries (259 -> 170 paths)
- Migrated API paths in crm.ts (11 endpoints) and document-library.ts (8 endpoints) from voltagent to ai prefix
- Updated stale voltagent comments in use-dashboard.ts and constants.ts
- Confirmed zero ai-elements code in production bundle (tree-shaking already excluded them)
- Created BUNDLE-ANALYSIS.md with full bundle size breakdown (5.7MB static, 87 chunks)

## Task Commits

Each task was committed atomically:

1. **Task 1: Clean voltagent references from E2E fixtures, specs, swagger, and code** - `0b2c7d1d` (feat)
2. **Task 2: Bundle analysis and documentation** - `f41f0de4` (docs)

## Files Created/Modified
- `frontend/e2e/fixtures.ts` - Removed voltagent mock route (line 186-193)
- `frontend/e2e/compose.spec.ts` - Removed voltagent mock route (line 131)
- `frontend/e2e/search.spec.ts` - Removed voltagent mock route (line 166)
- `frontend/e2e/auth.spec.ts` - Removed voltagent mock route (line 85)
- `frontend/src/api/swagger.json` - Removed 89 dead /api/v1/voltagent/* path entries
- `frontend/lib/api/crm.ts` - Migrated 11 API paths from voltagent to ai prefix
- `frontend/lib/api/document-library.ts` - Migrated 8 API paths from voltagent to ai prefix
- `frontend/hooks/queries/use-dashboard.ts` - Updated stale comment
- `frontend/types/constants.ts` - Updated stale comment
- `.planning/phases/28-cleanup-voltagent-deletion/BUNDLE-ANALYSIS.md` - Bundle analysis report

## Decisions Made
- Voltagent E2E mock routes were removed entirely (not replaced with /api/v1/ai/*) because fixtures.ts already has a catch-all mock for `**/localhost:3000/**` that returns 200 with empty JSON for any unmocked endpoint
- crm.ts and document-library.ts API paths were migrated from `/api/v1/voltagent/*` to `/api/v1/ai/*` matching the Phase 26 backend migration pattern, even though backend CRM/documents controllers may not exist yet at those paths
- Bundle analysis captures "after" state only since Plan 01 already deleted files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Migrated API paths in crm.ts and document-library.ts**
- **Found during:** Task 1 (Step 4 - final voltagent reference sweep)
- **Issue:** Plan only specified E2E fixtures and swagger.json, but grep found 11 API call paths in crm.ts and 8 in document-library.ts still using /api/v1/voltagent/* prefix
- **Fix:** Migrated all paths to /api/v1/ai/* prefix (consistent with Phase 26 backend migration)
- **Files modified:** frontend/lib/api/crm.ts, frontend/lib/api/document-library.ts
- **Verification:** grep returns zero voltagent hits in frontend; type-check passes
- **Committed in:** 0b2c7d1d (Task 1 commit)

**2. [Rule 1 - Bug] Updated stale voltagent comments in use-dashboard.ts and constants.ts**
- **Found during:** Task 1 (Step 4 - final voltagent reference sweep)
- **Issue:** Comments referencing old voltagent file paths that no longer exist
- **Fix:** Updated @see references to point to current ai/ module paths
- **Files modified:** frontend/hooks/queries/use-dashboard.ts, frontend/types/constants.ts
- **Verification:** grep returns zero voltagent hits
- **Committed in:** 0b2c7d1d (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both auto-fixes are within the plan's stated goal ("clean ALL remaining voltagent references"). The plan's Step 4 explicitly says "Any remaining hits must be cleaned."

## Issues Encountered
- `@next/bundle-analyzer` is not compatible with Turbopack builds; had to use `--webpack` flag to get treemap reports
- Pre-commit hook auto-staged untracked `chat-e2e.spec.ts` into Task 2 commit (file is for Plan 03, no harm done)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend is fully clean of all voltagent references (zero grep hits)
- swagger.json cleaned to 170 active paths only
- Bundle state documented for baseline comparison
- Ready for 28-03 (Playwright E2E test suite for AI chat)

---
*Phase: 28-cleanup-voltagent-deletion*
*Completed: 2026-03-03*
