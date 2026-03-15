---
phase: 75-organization-e2e-fix
plan: 01
subsystem: testing
tags: [better-auth, prisma, e2e, playwright, organization]

# Dependency graph
requires:
  - phase: 71-frontend-e2e-tests
    provides: "Organization E2E spec (skipped) and member auth setup"
provides:
  - "Tenant model metadata column for better-auth organization plugin"
  - "Passing organization E2E tests (create, invite, accept, switch)"
  - "Scoped setup-member dependency to chromium only"
affects: [future-e2e-phases, organization-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "better-auth organization plugin requires metadata column on mapped Tenant model"

key-files:
  created:
    - "backend/prisma/migrations/20260315200253_add_tenant_metadata/migration.sql"
  modified:
    - "backend/prisma/schema.prisma"
    - "backend/src/common/auth/better-auth.instance.ts"
    - "frontend/e2e/organizations.spec.ts"
    - "frontend/playwright.config.ts"

key-decisions:
  - "Tenant.metadata is nullable String? -- better-auth passes null on org creation"
  - "setup-member dependency scoped to chromium only -- other browsers don't run org E2E tests"

patterns-established:
  - "better-auth plugin schema mapping: every column the plugin expects must exist in Prisma model AND be mapped in the schema config"

requirements-completed: [FE2E-01]

# Metrics
duration: 15min
completed: 2026-03-15
---

# Phase 75 Plan 01: Organization E2E Fix Summary

**Fixed better-auth org creation 500 error by adding missing Tenant.metadata column and un-skipped all 4 organization E2E tests**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-15T20:00:00Z
- **Completed:** 2026-03-15T20:15:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Added missing `metadata String?` column to Tenant Prisma model with migration
- Mapped metadata field in better-auth organization plugin schema config
- Un-skipped organization E2E spec -- all 4 tests pass (create org, invite member, accept invitation, switch org)
- Scoped setup-member Playwright dependency to chromium project only, reducing unnecessary setup for other browsers

## Task Commits

Each task was committed atomically:

1. **Task 1: Add metadata column to Tenant model and fix better-auth schema mapping** - `77132d68` (feat)
2. **Task 2: Un-skip organization E2E spec and scope setup-member dependency** - `d543f9a6` (feat)
3. **Task 3: Verify organization E2E results** - checkpoint:human-verify (approved)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added `metadata String?` to Tenant model
- `backend/prisma/migrations/20260315200253_add_tenant_metadata/migration.sql` - Migration for metadata column
- `backend/src/common/auth/better-auth.instance.ts` - Added `metadata: 'metadata'` to organization plugin schema mapping
- `frontend/e2e/organizations.spec.ts` - Removed `test.describe.skip`, restored to active test suite
- `frontend/playwright.config.ts` - Scoped setup-member dependency to chromium project only

## Decisions Made
- Tenant.metadata is nullable `String?` because better-auth passes null on organization creation (no metadata by default)
- setup-member dependency scoped to chromium only since organization E2E tests only run on one browser project

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Organization E2E tests fully passing against real backend
- FE2E-01 requirement satisfied at runtime level
- No blockers for subsequent phases

## Self-Check: PASSED

All 5 files verified on disk. Both task commits (77132d68, d543f9a6) found in git history.

---
*Phase: 75-organization-e2e-fix*
*Completed: 2026-03-15*
