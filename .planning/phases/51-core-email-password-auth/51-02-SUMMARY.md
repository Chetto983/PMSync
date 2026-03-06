---
phase: 51-core-email-password-auth
plan: 02
subsystem: auth
tags: [better-auth, react, auth-pages, email-verification, password-reset]

requires:
  - phase: 51-core-email-password-auth/01
    provides: auth-client.ts, mail.ts, auth.ts email callbacks
provides:
  - 5 rewired auth pages using better-auth client (login, register, forgot-password, reset-password, verify-email)
  - Zero dependency on apiClient or Zustand auth store for auth operations
  - Email verification flow (signup -> check-email -> verify-token -> dashboard)
  - Password reset flow (forgot -> email -> reset-token -> login)
affects: [53-i18n, 55-mfa-passkeys, frontend-auth]

tech-stack:
  added: []
  patterns: [better-auth client method pattern, fire-and-forget email enumeration prevention]

key-files:
  created:
    - frontend/pages/auth/verify-email.tsx
  modified:
    - frontend/pages/auth/login.tsx
    - frontend/pages/auth/register.tsx
    - frontend/pages/auth/forgot-password.tsx
    - frontend/pages/auth/reset-password.tsx

key-decisions:
  - "Use authClient.requestPasswordReset (not forgetPassword) -- better-auth v1.5 client types"
  - "Spread firstName/lastName via Record<string,string> cast to satisfy strict client types while passing additionalFields"
  - "Hardcode verify-email strings in English (Phase 53 adds i18n)"
  - "Always show success on forgot-password regardless of result to prevent email enumeration"

patterns-established:
  - "Auth page pattern: import authClient, destructure { error }, handle error.message"
  - "Email enumeration prevention: forgot-password always shows success"

requirements-completed: [CORE-01, CORE-02, CORE-04, CORE-05]

duration: 9min
completed: 2026-03-06
---

# Phase 51 Plan 02: Auth Pages Rewiring Summary

**Rewired 4 auth pages from apiClient to better-auth client and created verify-email page with sent-confirmation + token-verification modes**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-06T20:46:59Z
- **Completed:** 2026-03-06T20:55:49Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- All 5 auth pages now use authClient from better-auth (zero apiClient imports remain)
- Login page stripped from 549 to 229 lines by removing all MFA, passkey, and Zustand auth store code
- New verify-email page handles both "check your inbox" and "verify token" flows
- Forgot-password prevents email enumeration by always showing success

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire register + login pages** - `84c72b39` (feat)
2. **Task 2: Rewire forgot/reset password + create verify-email** - `1e0eacb3` (feat)

## Files Created/Modified
- `frontend/pages/auth/login.tsx` - Rewired to authClient.signIn.email, stripped MFA/passkey/Zustand
- `frontend/pages/auth/register.tsx` - Rewired to authClient.signUp.email, redirects to verify-email
- `frontend/pages/auth/forgot-password.tsx` - Rewired to authClient.requestPasswordReset
- `frontend/pages/auth/reset-password.tsx` - Rewired to authClient.resetPassword
- `frontend/pages/auth/verify-email.tsx` - New page with two modes (sent + token)

## Decisions Made
- Used `authClient.requestPasswordReset` instead of `authClient.forgetPassword` -- the plan referenced `forgetPassword` but better-auth v1.5 types expose `requestPasswordReset`
- Spread `firstName`/`lastName` via `Record<string, string>` cast in register to pass additionalFields while satisfying strict client types
- Hardcoded verify-email page strings in English -- Phase 53 will add proper i18n
- Always show success on forgot-password to prevent email enumeration attacks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected better-auth client method name**
- **Found during:** Task 2 (forgot-password rewiring)
- **Issue:** Plan specified `authClient.forgetPassword` but better-auth v1.5 types only expose `requestPasswordReset`
- **Fix:** Used `authClient.requestPasswordReset` with same parameters
- **Files modified:** frontend/pages/auth/forgot-password.tsx
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 1e0eacb3

**2. [Rule 3 - Blocking] Fixed additionalFields type incompatibility**
- **Found during:** Task 1 (register page rewiring)
- **Issue:** `firstName`/`lastName` are additionalFields on server but not typed on the client's signUp.email
- **Fix:** Spread them via `Record<string, string>` cast to bypass strict typing while still sending the values
- **Files modified:** frontend/pages/auth/register.tsx
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 84c72b39

**3. [Rule 3 - Blocking] Removed nonexistent translation property**
- **Found during:** Task 1 (login page rewiring)
- **Issue:** Plan referenced `loginCopy.emailNotVerified` but this property doesn't exist on AuthScreenCopy type
- **Fix:** Used hardcoded English fallback string for email-not-verified error
- **Files modified:** frontend/pages/auth/login.tsx
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 84c72b39

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All fixes necessary to resolve type errors. No scope creep.

## Issues Encountered
- Plan 51-01 was not committed but files existed from a prior partial execution -- verified staged changes were correct and proceeded

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 auth pages wired to better-auth client
- Ready for Phase 53 (i18n cleanup for verify-email strings)
- Ready for Phase 55 (MFA/passkey re-addition via better-auth plugins)
- Login page is clean slate for MFA integration

---
*Phase: 51-core-email-password-auth*
*Completed: 2026-03-06*
