---
phase: 56-organizations
plan: 03
subsystem: testing
tags: [jest, prisma, better-auth, workspace-provisioning, member-records]

requires:
  - phase: 56-01
    provides: Member model and provisionWorkspaceForUser function
  - phase: 56-02
    provides: Organization management UI and API integration
provides:
  - Real unit tests for workspace provisioning member creation
  - Health check test for seed-members migration invariant
affects: []

tech-stack:
  added: []
  patterns:
    - "Mock better-auth ESM modules in Jest CJS environment for unit testing"

key-files:
  created:
    - backend/src/common/auth/__tests__/seed-members-health.spec.ts
  modified:
    - backend/src/common/auth/better-auth.instance.ts
    - backend/src/common/auth/__tests__/org-member-provisioning.spec.ts

key-decisions:
  - "Export provisionWorkspaceForUser with minimal change (add export keyword only)"
  - "Mock all better-auth ESM imports to enable Jest testing of the instance module"

patterns-established:
  - "Better-auth instance testing: mock better-auth, better-auth/api, better-auth/adapters/prisma, better-auth/plugins, @better-auth/passkey"

requirements-completed: [ORG-01, ORG-03]

duration: 3min
completed: 2026-03-10
---

# Phase 56 Plan 03: Gap Closure - Stub Tests and Seed Members Health Check

**Real unit tests for workspace provisioning member creation and DB health check for seed-members migration invariant**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T10:19:04Z
- **Completed:** 2026-03-10T10:22:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced 3 stub tests (expect(true).toBe(true)) with real assertions verifying tx.member.create behavior
- Added health check integration test that verifies all users with tenantId have Member records
- Exported provisionWorkspaceForUser and ProvisioningUser for testability (no logic changes)

## Task Commits

Each task was committed atomically:

1. **Task 1: Export provisionWorkspaceForUser and write real provisioning tests** - `898d1815` (test)
2. **Task 2: Add seed-members health check test** - `bbdbf7ac` (test)

## Files Created/Modified
- `backend/src/common/auth/better-auth.instance.ts` - Added export to provisionWorkspaceForUser and ProvisioningUser
- `backend/src/common/auth/__tests__/org-member-provisioning.spec.ts` - 3 real unit tests replacing stubs
- `backend/src/common/auth/__tests__/seed-members-health.spec.ts` - Health check integration test

## Decisions Made
- Exported provisionWorkspaceForUser with minimal change (only added `export` keyword) to avoid touching function logic
- Mocked all better-auth ESM modules (better-auth, better-auth/api, better-auth/adapters/prisma, better-auth/plugins, @better-auth/passkey) to enable Jest CJS test execution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 56 verification gaps closed
- Organization provisioning has real automated test coverage
- Health check test can be run in CI to detect missing Member records

---
*Phase: 56-organizations*
*Completed: 2026-03-10*
