---
phase: 34-auth-security-hardening
plan: 01
subsystem: auth
tags: [jwt, cookie, httponly, websocket, nestjs, security]

# Dependency graph
requires:
  - phase: 33-api-contract-standardization
    provides: Global API prefix, response envelope, correlation IDs
provides:
  - httpOnly cookie auth on all auth success paths (login, verify-otp, mfa/verify, webauthn/login/verify)
  - Cookie clearing on logout
  - WebSocket handshake cookie extraction with fallback chain
  - JWT expiry aligned to 7d matching session TTL
  - cookie.helper.ts with setAuthCookie/clearAuthCookie exports
affects: [34-02 frontend cookie migration, 34-03 AES-GCM]

# Tech tracking
tech-stack:
  added: []
  patterns: [httpOnly cookie dual-mode auth, cookie-first WS token extraction, sameSite=lax for OAuth compat]

key-files:
  created:
    - backend/src/modules/auth/helpers/cookie.helper.ts
    - backend/src/modules/auth/controllers/__tests__/auth.controller.cookie.spec.ts
    - backend/src/modules/realtime/services/__tests__/realtime-handshake.cookie.spec.ts
  modified:
    - backend/src/modules/auth/controllers/auth.controller.ts
    - backend/src/modules/auth/auth.module.ts
    - backend/src/modules/realtime/services/realtime-handshake.service.ts

key-decisions:
  - "sameSite=lax (not strict) to avoid breaking OAuth callback flows"
  - "JWT default expiry changed from 15m to 7d to align with session TTL; session validation handles revocation"
  - "mfa.controller.ts not modified: passkey login endpoint is in auth.controller (webauthn/login/verify), not mfa.controller"
  - "Simple split-based cookie parser in WS handshake (no library needed for JWT values)"

patterns-established:
  - "Cookie dual-mode: all auth success paths set httpOnly cookie while still returning accessToken in body"
  - "WS cookie extraction: check httpOnly cookie first, then fallback to auth.token/header/query"

requirements-completed: [SEC-01]

# Metrics
duration: 8min
completed: 2026-03-04
---

# Phase 34 Plan 01: Backend Dual-Mode Cookie Auth Summary

**httpOnly cookie auth on all auth success paths with WS cookie extraction and JWT 7d expiry alignment**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-04T07:32:46Z
- **Completed:** 2026-03-04T07:40:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created cookie.helper.ts with centralized httpOnly/secure/sameSite=lax config, setAuthCookie and clearAuthCookie exports
- All 4 auth success endpoints (login, verify-otp, mfa/verify, webauthn/login/verify) now set httpOnly cookie when accessToken is in result; MFA-required login (no accessToken) correctly skips cookie
- Logout clears the httpOnly cookie before session invalidation
- WebSocket handshake extractToken now checks httpOnly cookie FIRST, then falls back to Bearer/auth.token/query.token (dual-mode transition)
- JWT default expiry changed from 15m to 7d to align with session TTL
- 21 unit tests pass (10 cookie helper + 11 WS cookie extraction)
- Backend type-checks clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Cookie helper + auth controller cookie setting + JWT expiry alignment** - `57666760` (feat)
2. **Task 2: WebSocket handshake cookie extraction + unit tests** - `d32c6e23` (feat)

_Note: Task 1 was committed in a prior batch as part of 57666760. Task 2 committed separately as d32c6e23._

## Files Created/Modified
- `backend/src/modules/auth/helpers/cookie.helper.ts` - Centralized cookie config: AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS, setAuthCookie, clearAuthCookie
- `backend/src/modules/auth/controllers/auth.controller.ts` - Added @Res({passthrough:true}) and setAuthCookie/clearAuthCookie calls to login, verify-otp, mfa/verify, webauthn/login/verify, logout
- `backend/src/modules/auth/auth.module.ts` - JWT default expiry changed from 15m to 7d
- `backend/src/modules/realtime/services/realtime-handshake.service.ts` - extractToken checks cookies first, added parseCookieValue helper
- `backend/src/modules/auth/controllers/__tests__/auth.controller.cookie.spec.ts` - 10 unit tests for cookie helper and controller integration
- `backend/src/modules/realtime/services/__tests__/realtime-handshake.cookie.spec.ts` - 11 unit tests for WS cookie extraction

## Decisions Made
- **sameSite=lax (not strict):** Strict would break OAuth callback flows per SEC research Pitfall 5. Lax allows cookies on same-site navigation while blocking cross-site POST (sufficient protection).
- **JWT 15m to 7d:** Session validation already handles revocation. The env var override (ACCESS_TOKEN_EXPIRES_IN) still works for users who want shorter expiry.
- **mfa.controller.ts unchanged:** The plan mentioned passkey login verify in mfa.controller, but the actual passkey login endpoint (webauthn/login/verify) is in auth.controller. The mfa.controller only has webauthn/authenticate/verify for re-auth of already-logged-in users (no accessToken returned).
- **No cookie parsing library:** JWT tokens contain no special characters needing URL decoding, so a simple split-based parser suffices.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript union type narrowing in login endpoint**
- **Found during:** Task 1 (auth controller cookie setting)
- **Issue:** `result.accessToken` caused TS2339 because the login return type is a union that includes mfaRequired (no accessToken). Direct property access doesn't narrow the union.
- **Fix:** Used `'accessToken' in result && result.accessToken` for proper type narrowing.
- **Files modified:** backend/src/modules/auth/controllers/auth.controller.ts
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 57666760 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** TypeScript type safety fix, no scope creep.

## Issues Encountered
- Task 1 commit hash 57666760 was created by a prior agent execution and bundled with 34-03 (AES-GCM) changes. The Task 1 code changes are correct and verified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend now sets httpOnly cookies on all auth success paths -- ready for frontend migration (Plan 34-02)
- WebSocket accepts cookie auth -- ready for frontend to switch from Bearer to withCredentials
- Bearer header still accepted (dual-mode) -- no breaking change for existing frontend until Plan 34-02 completes

---
*Phase: 34-auth-security-hardening*
*Completed: 2026-03-04*
