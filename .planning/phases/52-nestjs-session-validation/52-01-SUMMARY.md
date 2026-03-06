---
phase: 52-nestjs-session-validation
plan: 01
subsystem: auth
tags: [better-auth, nestjs, guard, session, decorator]

requires:
  - phase: 50-schema-infrastructure
    provides: BetterAuthModule with BETTER_AUTH DI token and consumer instance

provides:
  - BetterAuthGuard global APP_GUARD for session validation
  - "@Public() decorator to skip auth on specific routes"
  - All webhook/health/OAuth/auth-login routes annotated as public

affects: [52-nestjs-session-validation, auth, guards, middleware]

tech-stack:
  added: []
  patterns: ["Global APP_GUARD with @Public() opt-out instead of per-controller @UseGuards opt-in"]

key-files:
  created:
    - backend/src/common/auth/better-auth.guard.ts
    - backend/src/common/auth/public.decorator.ts
    - backend/src/common/auth/__tests__/better-auth.guard.spec.ts
    - backend/test/mocks/better-auth-node.mock.ts
  modified:
    - backend/src/common/auth/better-auth.module.ts
    - backend/src/app.module.ts
    - backend/src/modules/health/controllers/health.controller.ts
    - backend/src/modules/email-sync/controllers/webhook.controller.ts
    - backend/src/modules/contacts/controllers/contacts-webhook.controller.ts
    - backend/src/modules/calendar/controllers/calendar-webhook.controller.ts
    - backend/src/modules/subscription/controllers/autumn-webhook.controller.ts
    - backend/src/modules/providers/controllers/oauth-callback.controller.ts
    - backend/src/modules/ai/controllers/ai-health.controller.ts
    - backend/src/modules/auth/controllers/auth.controller.ts
    - backend/jest.config.js

key-decisions:
  - "Global @Public() opt-out pattern instead of per-controller @UseGuards opt-in"
  - "BetterAuthGuard placed after ThrottlerGuard, before LegalAcceptanceGuard in APP_GUARD chain"
  - "BetterAuthModule made @Global() so guard can inject BETTER_AUTH without explicit imports"
  - "AuthController uses per-route @Public() (not class-level) to keep me/logout protected"
  - "Jest mock for better-auth/node ESM to avoid transform issues"

patterns-established:
  - "Global guard pattern: all routes authenticated by default, opt-out with @Public()"
  - "request.user shape: {id, userId, tenantId, email, firstName, lastName, role, sessionId}"

requirements-completed: [NEST-01, NEST-04]

duration: 8min
completed: 2026-03-06
---

# Phase 52 Plan 01: BetterAuthGuard + @Public() Summary

**Global BetterAuthGuard validating better-auth DB sessions via auth.api.getSession(), with @Public() decorator on all webhook/health/OAuth/login routes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-06T21:48:47Z
- **Completed:** 2026-03-06T21:56:18Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- BetterAuthGuard validates sessions via auth.api.getSession() and rejects invalid with 401
- request.user shape matches backward-compatible AuthenticatedRequest (id, userId, tenantId, email, role, sessionId)
- All previously unguarded routes annotated with @Public() and remain accessible
- Global guard order enforced: Throttler -> BetterAuth -> Legal -> Consent
- 7 unit tests covering valid session, null session, @Public(), isActive check, backward compat, role default

## Task Commits

Each task was committed atomically:

1. **Task 1: Create BetterAuthGuard, @Public() decorator, and tests** - `9c85afba` (feat - TDD)
2. **Task 2: Register global guard and apply @Public() to unguarded routes** - `386c3fcb` (feat)

## Files Created/Modified
- `backend/src/common/auth/better-auth.guard.ts` - Global guard implementing CanActivate with session validation
- `backend/src/common/auth/public.decorator.ts` - @Public() decorator with IS_PUBLIC_KEY metadata
- `backend/src/common/auth/__tests__/better-auth.guard.spec.ts` - 7 unit tests for guard behavior
- `backend/test/mocks/better-auth-node.mock.ts` - Jest mock for ESM better-auth/node
- `backend/jest.config.js` - Added better-auth/node module mapper
- `backend/src/common/auth/better-auth.module.ts` - Added @Global() decorator
- `backend/src/app.module.ts` - Registered BetterAuthGuard as APP_GUARD
- `backend/src/modules/auth/controllers/auth.controller.ts` - Per-route @Public(), removed @UseGuards(JwtAuthGuard) from me/logout
- 6 webhook/health/OAuth controllers - Class-level @Public()

## Decisions Made
- Global @Public() opt-out pattern instead of per-controller @UseGuards opt-in
- BetterAuthGuard placed after ThrottlerGuard, before LegalAcceptanceGuard so unauthenticated requests are rejected before legal/consent checks
- BetterAuthModule made @Global() so guard can inject BETTER_AUTH token without explicit imports in every module
- AuthController uses per-route @Public() (not class-level) to keep me/logout protected by the global guard
- Created Jest mock for better-auth/node to avoid ESM transform issues in test environment
- No bodyParser changes needed (NEST-04) -- NestJS is session consumer only

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added better-auth/node Jest mock for ESM compatibility**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** better-auth/node is ESM-only, Jest (CJS) cannot import it directly
- **Fix:** Created `test/mocks/better-auth-node.mock.ts` and added moduleNameMapper in jest.config.js
- **Files modified:** backend/jest.config.js, backend/test/mocks/better-auth-node.mock.ts
- **Verification:** All 7 guard tests pass
- **Committed in:** 9c85afba (Task 1 commit)

**2. [Rule 3 - Blocking] Mocked better-auth.module to avoid ESM chain in tests**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** Importing BETTER_AUTH from better-auth.module.ts transitively imports better-auth ESM
- **Fix:** Added jest.mock('../better-auth.module') in test file to stub the module constant
- **Files modified:** backend/src/common/auth/__tests__/better-auth.guard.spec.ts
- **Verification:** All 7 guard tests pass
- **Committed in:** 9c85afba (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary to run tests in Jest CJS environment. No scope creep.

## Issues Encountered
None beyond the ESM compatibility issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BetterAuthGuard is live as global APP_GUARD -- all routes are now session-validated by default
- @Public() pattern established for future route annotations
- Ready for 52-02 (if exists) to handle remaining guard migration tasks

---
*Phase: 52-nestjs-session-validation*
*Completed: 2026-03-06*
