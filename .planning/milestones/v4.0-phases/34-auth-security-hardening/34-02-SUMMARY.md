---
phase: 34-auth-security-hardening
plan: 02
subsystem: auth
tags: [httpOnly-cookie, jwt, zustand, axios, socket.io, playwright, e2e, csrf]

# Dependency graph
requires:
  - phase: 34-01
    provides: Backend cookie.helper.ts setting httpOnly access_token cookie on all auth endpoints
provides:
  - Frontend fully migrated to httpOnly cookie auth (no localStorage JWT)
  - WebSocket handshake uses withCredentials instead of auth.token
  - ChatRuntime and AI stream use credentials: include
  - E2E test fixtures use cookie injection via injectAuthCookie helper
  - Attachment proxy reads from access_token httpOnly cookie
affects: [34-03, frontend-auth, e2e-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [withCredentials cookie auth, cookie injection in Playwright E2E]

key-files:
  created: []
  modified:
    - frontend/stores/auth-store.ts
    - frontend/stores/auth-store.test.ts
    - frontend/lib/api-client.ts
    - frontend/lib/utils/auth-token.ts
    - frontend/lib/api/ai.ts
    - frontend/lib/context/auth-context.tsx
    - frontend/lib/websocket-client.ts
    - frontend/hooks/use-websocket.ts
    - frontend/src/components/chat/ChatRuntimeProvider.tsx
    - frontend/pages/api/email/attachments/[id]/download.ts
    - frontend/e2e/fixtures.ts
    - frontend/e2e/auth.setup.ts
    - frontend/e2e/compose.spec.ts
    - frontend/e2e/email-list.spec.ts

key-decisions:
  - "AuthContext calls /auth/me on every hydration (cookie-based session validation replaces localStorage token check)"
  - "auth-store.ts setToken is a no-op -- token field kept as null for type compatibility"
  - "auth-token.ts kept as deprecation stub (returns empty string) instead of deleted, for safety"
  - "E2E injectAuthCookie helper exported from fixtures.ts for reuse across all spec files"

patterns-established:
  - "Cookie auth pattern: withCredentials: true on axios, credentials: include on fetch, withCredentials: true on Socket.IO"
  - "E2E auth pattern: injectAuthCookie(context, token) replaces localStorage.setItem('auth-storage', ...)"

requirements-completed: [SEC-01]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 34 Plan 02: Frontend Cookie Auth Migration Summary

**Frontend fully migrated from localStorage JWT to httpOnly cookie auth: removed Bearer header injection, persist middleware, and localStorage token sync across 14 files**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-04T07:44:21Z
- **Completed:** 2026-03-04T07:50:20Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Removed all localStorage-based JWT storage and persistence middleware from auth-store.ts
- Removed Bearer header injection from apiClient interceptor, ai.ts stream, and ChatRuntimeProvider
- Migrated WebSocket to cookie-based auth (withCredentials instead of auth.token in handshake)
- Migrated attachment proxy to read from httpOnly access_token cookie
- Migrated all E2E test fixtures (4 files) from localStorage manipulation to Playwright cookie injection
- Updated auth-context.tsx to always call /auth/me on hydration (cookie-based session check)
- Frontend type-checks clean with zero remaining localStorage auth patterns

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth store, API client, and auth-token utility migration** - `1d412d13` (feat)
2. **Task 2: WebSocket, Chat, attachment proxy, and E2E fixture migration** - `6c5f986e` (feat)

## Files Created/Modified
- `frontend/stores/auth-store.ts` - Removed persist middleware, setToken is no-op
- `frontend/stores/auth-store.test.ts` - Updated tests for no-persist store
- `frontend/lib/api-client.ts` - Removed Bearer header injection from interceptor
- `frontend/lib/utils/auth-token.ts` - Deprecation stub returning empty string
- `frontend/lib/api/ai.ts` - Replaced Bearer header with credentials: include on stream fetch
- `frontend/lib/context/auth-context.tsx` - Removed persist.rehydrate(), always calls /auth/me
- `frontend/lib/websocket-client.ts` - withCredentials: true, removed auth.token and token field
- `frontend/hooks/use-websocket.ts` - Connect based on isAuthenticated, not token
- `frontend/src/components/chat/ChatRuntimeProvider.tsx` - Removed Bearer header, kept credentials: include
- `frontend/pages/api/email/attachments/[id]/download.ts` - Reads access_token httpOnly cookie
- `frontend/e2e/fixtures.ts` - injectAuthCookie helper, cookie injection
- `frontend/e2e/auth.setup.ts` - Cookie injection replaces localStorage
- `frontend/e2e/compose.spec.ts` - Cookie injection replaces localStorage
- `frontend/e2e/email-list.spec.ts` - Cookie injection replaces localStorage

## Decisions Made
- **AuthContext always calls /auth/me**: Since there's no localStorage token to check, the auth context validates the session via the httpOnly cookie on every page load. If the cookie is missing/expired, the backend returns 401 and the frontend logs out.
- **setToken kept as no-op**: The token field and setToken method are kept in the store interface for type compatibility with any callers (e.g. login flows that set token after OAuth). The field stays null; the httpOnly cookie is the real credential.
- **auth-token.ts kept as stub**: Instead of deleting the file and breaking any transitive imports, it's kept as a deprecation stub that logs a warning in dev and returns empty string.
- **injectAuthCookie helper shared across E2E**: Single function in fixtures.ts used by auth.setup.ts, compose.spec.ts, and email-list.spec.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed auth-context.tsx persist.rehydrate() call**
- **Found during:** Task 1 (auth store migration)
- **Issue:** auth-context.tsx called `useAuthStore.persist.rehydrate()` which no longer exists after removing persist middleware
- **Fix:** Removed the rehydrate call. Changed auth flow to always call /auth/me on hydration (cookie validates session server-side)
- **Files modified:** frontend/lib/context/auth-context.tsx
- **Verification:** Frontend type-checks clean
- **Committed in:** 1d412d13 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Updated auth-store.test.ts for new store behavior**
- **Found during:** Task 1 (auth store migration)
- **Issue:** Tests asserted persist middleware behavior (localStorage writes, token storage) that no longer exists
- **Fix:** Updated tests to verify setToken is a no-op and no localStorage interaction occurs
- **Files modified:** frontend/stores/auth-store.test.ts
- **Verification:** Test assertions match new store behavior
- **Committed in:** 1d412d13 (Task 1 commit)

**3. [Rule 2 - Missing Critical] Updated E2E inline auth in email-list.spec.ts and compose.spec.ts**
- **Found during:** Task 2 (E2E fixture migration)
- **Issue:** These spec files had their own inline auth setup using localStorage, not using the shared fixture
- **Fix:** Migrated both to use injectAuthCookie helper
- **Files modified:** frontend/e2e/email-list.spec.ts, frontend/e2e/compose.spec.ts
- **Verification:** grep for auth-storage/auth-token returns zero hits in E2E files
- **Committed in:** 6c5f986e (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEC-01 frontend completion done -- zero localStorage JWT usage remains
- Backend dual-mode (cookie + Bearer) from Plan 01 means backward compatibility is maintained during transition
- Plan 34-03 (GCM encryption migration) already completed independently

## Self-Check: PASSED

All 15 files verified present. Both task commits (1d412d13, 6c5f986e) found in git log.

---
*Phase: 34-auth-security-hardening*
*Completed: 2026-03-04*
