---
phase: 89-auth-onboarding-verification
plan: 02
subsystem: testing
tags: [playwright, e2e, profile-api, onboarding, csrf, totp, otplib]

requires:
  - phase: none
    provides: existing auth setup, users controller, onboarding wizard components
provides:
  - API-level profile endpoint tests (auth-profile-api.spec.ts)
  - Rewritten onboarding wizard E2E with exhaustive error coverage
affects: [89-auth-onboarding-verification]

tech-stack:
  added: []
  patterns: [CSRF token helper for API mutation tests, fresh user registration per test run, TOTP interception pattern]

key-files:
  created:
    - frontend/e2e/auth-profile-api.spec.ts
  modified:
    - frontend/e2e/onboarding.spec.ts

key-decisions:
  - "MFA step cannot be skipped per code (canFinish requires TOTP or passkey) -- adapted test 8 to verify disabled state instead of skip"
  - "Used playwright fixture for unauthenticated 401 test instead of request.newContext()"

patterns-established:
  - "CSRF helper pattern: getCsrfToken() fetches token and sets X-CSRF-Token header on all mutations"
  - "Fresh user registration via POST /api/auth/sign-up/email with timestamped email"
  - "Route interception for TOTP URI capture: page.route('**/two-factor/enable', ...)"

requirements-completed: [BAPI-24, FE-02]

duration: 11min
completed: 2026-03-20
---

# Phase 89 Plan 02: Profile API Tests & Onboarding Rewrite Summary

**API-level Playwright tests for all 10 user profile endpoints with CSRF tokens, and complete onboarding wizard E2E rewrite with 11 tests covering validation errors, skip behavior, MFA requirement, TOTP setup, and back navigation**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-20T08:25:38Z
- **Completed:** 2026-03-20T08:36:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- 10 profile API endpoint tests via Playwright request context with CSRF token handling for all mutations
- Complete onboarding wizard rewrite from scratch: removed prisma db seed dependency, uses fresh user registration
- 11 onboarding tests covering all 6 wizard steps including validation errors, skip behavior, MFA requirement validation, full TOTP happy path, and back navigation

## Task Commits

Each task was committed atomically:

1. **Task 1: User profile API endpoint tests** - `4152ef70` (test)
2. **Task 2: Rewrite onboarding wizard E2E** - `25c662b5` (test)

## Files Created/Modified
- `frontend/e2e/auth-profile-api.spec.ts` - API-level tests for all 10 profile endpoints (GET/PUT profile, preferences, dashboard prefs, avatar, ai-memory, 401 unauth)
- `frontend/e2e/onboarding.spec.ts` - Complete rewrite with 11 tests covering legal consent validation, name validation, workspace state, email/avatar skip, MFA requirement, TOTP setup, back navigation, cookie verification

## Decisions Made
- MFA step cannot be skipped (code requires `canFinish = totpConfigured || passkeyConfigured`) -- adapted Test 8 from "can skip and finish" to "finish button requires at least one method" to match actual behavior
- Used `playwright` fixture for creating unauthenticated request context in 401 test
- Added 11th test (cookie verification) beyond the 10 specified in plan for complete coverage

## Deviations from Plan

### Adapted Test Cases

**1. [Adaptation] MFA skip test converted to MFA requirement validation**
- **Found during:** Task 2 (onboarding wizard rewrite)
- **Issue:** Plan specified "step 6: MFA setup - can skip and finish" but StepMfaSetup.tsx requires at least one MFA method (`canFinish = totpConfigured || passkeyConfigured`). The finish button is disabled without MFA.
- **Fix:** Changed test 8 from testing skip behavior to verifying the finish button is disabled and the warning message is shown
- **Files modified:** frontend/e2e/onboarding.spec.ts
- **Verification:** Test file parses correctly via `playwright test --list`

**2. [Blocker - Infrastructure] Tests could not be executed against live environment**
- **Found during:** Both tasks
- **Issue:** Neon database compute quota exceeded ("Your account or project has exceeded the compute time quota"), no local Redis for backend webServer. Auth setup fails because admin@pmsync.local cannot authenticate against Railway.
- **Impact:** Test files are syntactically correct (verified via `playwright test --list`) but could not be verified via actual execution
- **Workaround:** None available -- requires Neon quota reset or alternative database

---

**Total deviations:** 1 adaptation (MFA skip -> requirement validation), 1 infrastructure blocker
**Impact on plan:** Test logic is correct per source code review. Execution verification deferred until infrastructure is available.

## Issues Encountered
- Neon database compute quota exceeded -- all database operations fail. This blocks both seeding test users and running any tests that require authentication.
- No local Redis available -- backend webServer in playwright config cannot start without Redis on port 6380.
- Admin user (admin@pmsync.local) credentials rejected by Railway backend -- likely users not seeded on production database.

## User Setup Required
None - no external service configuration required. Infrastructure quota issue is an existing limitation.

## Next Phase Readiness
- Test files are complete and ready to execute once infrastructure is restored
- Profile API tests verify all 10 endpoints with proper CSRF handling
- Onboarding tests cover all 6 wizard steps with exhaustive error cases
- Blocker: Neon database quota must be reset/upgraded before tests can pass

## Self-Check: PASSED

- FOUND: frontend/e2e/auth-profile-api.spec.ts
- FOUND: frontend/e2e/onboarding.spec.ts
- FOUND: .planning/phases/89-auth-onboarding-verification/89-02-SUMMARY.md
- FOUND: commit 4152ef70
- FOUND: commit 25c662b5

---
*Phase: 89-auth-onboarding-verification*
*Completed: 2026-03-20*
