---
phase: 66-test-infrastructure
plan: 03
subsystem: testing
tags: [playwright, jest, e2e, coverage, prisma]

requires:
  - phase: 66-test-infrastructure-01
    provides: ".env.test with test ports, global-setup/teardown for Jest"
provides:
  - "Playwright config with real backend webServer on port 3100"
  - "Auth setup via direct DB session insert (no HTTP mocks)"
  - "E2E smoke test verifying real backend connectivity"
  - "Jest coverage thresholds: 50% backend, 30% frontend"
affects: [67-backend-unit-tests, 68-backend-integration-tests, 69-backend-e2e-tests, 70-frontend-tests, 71-e2e-rewrite]

tech-stack:
  added: []
  patterns: ["real-backend E2E via Playwright webServer array", "direct DB session insert for test auth"]

key-files:
  created:
    - frontend/e2e/smoke.spec.ts
  modified:
    - frontend/playwright.config.ts
    - frontend/e2e/auth.setup.ts
    - frontend/e2e/fixtures.ts
    - backend/jest.config.js
    - frontend/jest.config.js

key-decisions:
  - "Cross-package Prisma import for auth.setup (monorepo colocation)"
  - "Mock data exports retained as inert constants for Phase 71 transition"

patterns-established:
  - "E2E auth: direct DB session insert via createPrismaClient, not HTTP sign-in"
  - "Coverage thresholds as ratchets: enforced on --coverage flag only"

requirements-completed: [INFRA-04, INFRA-05]

duration: 3min
completed: 2026-03-10
---

# Phase 66 Plan 03: Playwright Real Backend + Coverage Thresholds Summary

**Playwright E2E configured against real backend on port 3100 with direct DB auth setup, Jest coverage thresholds at 50% backend / 30% frontend**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T16:53:32Z
- **Completed:** 2026-03-10T16:56:51Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Playwright webServer array starts both backend (port 3100) and frontend (port 3001)
- Auth setup creates real DB session via Prisma instead of fake cookie injection
- API route mocking stripped from fixtures.ts (E2E tests hit real backend)
- Smoke test verifies backend health endpoint responds
- Coverage thresholds configured as enforced ratchets

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure Playwright for real backend + smoke test** - `6208a242` (feat)
2. **Task 2: Strip API mocking from fixtures.ts** - `3a7a2650` (refactor)
3. **Task 3: Configure Jest coverage thresholds** - `90f45d34` (chore)

## Files Created/Modified
- `frontend/playwright.config.ts` - webServer array with backend on port 3100
- `frontend/e2e/auth.setup.ts` - Real DB session insert via createPrismaClient
- `frontend/e2e/smoke.spec.ts` - Smoke test for backend health + frontend load
- `frontend/e2e/fixtures.ts` - Stripped all API route mocks, kept inert data constants
- `backend/jest.config.js` - Coverage threshold at 50% global
- `frontend/jest.config.js` - Coverage threshold at 30% global

## Decisions Made
- Cross-package import of `createPrismaClient` from backend into frontend e2e setup (works in monorepo, avoids duplicating Prisma factory)
- Mock data exports (mockEmails, mockFolders, mockUser) retained as inert constants rather than deleted, since existing E2E specs may reference them during Phase 71 transition

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 66 complete: test DB infra (01), test helpers (02), Playwright + coverage (03) all ready
- Phases 67-69 can begin writing backend tests against real DB
- Phase 70 can begin writing frontend tests
- Phase 71 can rewrite E2E specs against real backend (existing specs will fail until then)

---
*Phase: 66-test-infrastructure*
*Completed: 2026-03-10*
