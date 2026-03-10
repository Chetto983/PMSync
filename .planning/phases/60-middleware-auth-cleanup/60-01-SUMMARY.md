---
phase: 60-middleware-auth-cleanup
plan: 01
subsystem: auth
tags: [better-auth, middleware, next.js, cookie-cache, edge-runtime]

requires:
  - phase: 55-social-login-mfa
    provides: better-auth instance with social login, 2FA, passkey plugins
  - phase: 53-frontend-auth-ui
    provides: proxy.ts middleware (to be renamed)
provides:
  - Working Next.js middleware with correct export name and expanded route protection
  - Single canonical better-auth server instance (backend only)
  - cookieCache enabled with compact strategy and 5-minute maxAge
affects: [frontend-routing, session-validation, onboarding-flow]

tech-stack:
  added: []
  patterns: [HTTP-fetch session validation instead of direct auth instance import]

key-files:
  created: [frontend/middleware.ts]
  modified: [frontend/pages/api/onboarding/create-workspace.ts, backend/src/common/auth/better-auth.instance.ts]

key-decisions:
  - "HTTP fetch to backend /api/auth/get-session for session validation in create-workspace.ts (eliminates frontend auth instance dependency)"
  - "Deleted orphaned hibp.test.ts alongside hibp.ts (Rule 3 - blocking type-check failure)"

patterns-established:
  - "Frontend API routes validate sessions via HTTP to backend, never by importing a local better-auth instance"

requirements-completed: [FEUI-04]

duration: 2min
completed: 2026-03-10
---

# Phase 60 Plan 01: Middleware & Auth Cleanup Summary

**Renamed proxy.ts to middleware.ts for Next.js discovery, deleted duplicate frontend auth instance, enabled cookieCache compact/300s on backend**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T08:20:49Z
- **Completed:** 2026-03-10T08:23:06Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Next.js middleware now discoverable (correct filename + export name)
- Route protection expanded to cover /onboarding with session check (no onboarding-cookie gate)
- Eliminated duplicate better-auth server instance from frontend
- Deleted 3 dead files (auth.ts, hibp.ts, mail.ts) plus orphaned test
- Backend cookieCache enabled: compact strategy, 5-minute maxAge

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename proxy.ts to middleware.ts with expanded matcher** - `2e905366` (feat)
2. **Task 2: Delete duplicate auth instance, rewire consumer, enable cookieCache** - `ca2e4a95` (feat)

## Files Created/Modified
- `frontend/middleware.ts` - New Next.js middleware with correct export and expanded matcher
- `frontend/pages/api/onboarding/create-workspace.ts` - Rewired to HTTP session validation
- `backend/src/common/auth/better-auth.instance.ts` - cookieCache enabled with compact/300s
- `frontend/proxy.ts` - Deleted (renamed to middleware.ts)
- `frontend/lib/auth.ts` - Deleted (duplicate better-auth instance)
- `frontend/lib/hibp.ts` - Deleted (only consumer was auth.ts)
- `frontend/lib/mail.ts` - Deleted (only consumer was auth.ts)
- `frontend/lib/__tests__/hibp.test.ts` - Deleted (orphaned test for deleted module)

## Decisions Made
- HTTP fetch to backend `/api/auth/get-session` for session validation in create-workspace.ts -- eliminates the need for a frontend better-auth server instance entirely
- Deleted orphaned `hibp.test.ts` alongside `hibp.ts` to fix type-check failure (Rule 3)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deleted orphaned hibp.test.ts**
- **Found during:** Task 2 (verification step)
- **Issue:** `frontend/lib/__tests__/hibp.test.ts` imported from deleted `../hibp`, causing tsc failure
- **Fix:** Deleted the orphaned test file (tests the HIBP function that now lives in backend only)
- **Files modified:** frontend/lib/__tests__/hibp.test.ts (deleted)
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** ca2e4a95 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for type-check to pass. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Middleware is active and protecting /dashboard/*, /auth/*, /onboarding
- Single auth instance in backend with cookieCache enabled
- Frontend compiles cleanly

---
*Phase: 60-middleware-auth-cleanup*
*Completed: 2026-03-10*
