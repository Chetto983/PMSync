---
phase: 55-social-login-mfa
plan: 05
subsystem: auth
tags: [nestjs, react, mfa, totp, webauthn, passkey, cleanup, better-auth]

requires:
  - phase: 55-social-login-mfa/01
    provides: better-auth twoFactor and passkey plugins wired as MFA replacement
  - phase: 55-social-login-mfa/02
    provides: SecuritySettings page replacing old MfaSettings component

provides:
  - Clean codebase with zero old custom MFA code (backend + frontend)
  - All MFA/passkey flows now exclusively via better-auth plugins

affects: []

tech-stack:
  added: []
  patterns:
    - "MFA handled exclusively by better-auth plugins (twoFactor, passkey) -- no custom NestJS MFA services"

key-files:
  created: []
  modified:
    - backend/src/modules/auth/auth.module.ts
    - backend/src/modules/auth/controllers/auth.controller.ts
    - backend/src/modules/auth/services/auth-login.service.ts
    - backend/src/modules/auth/services/auth.service.ts
    - backend/src/modules/auth/__tests__/auth-login-hardening.spec.ts
    - backend/src/modules/auth/__tests__/password-change-invalidation.spec.ts
    - backend/src/modules/auth/services/__tests__/auth.pre-split.spec.ts

key-decisions:
  - "Removed MFA challenge, passkey login, and WebAuthn endpoints from auth.controller -- better-auth handles these now"
  - "Stripped TotpService and WebAuthnService DI from auth-login.service constructor and all MFA logic from _login method"
  - "Updated 3 test files to remove references to deleted services (test DI and constructor args)"

patterns-established:
  - "All MFA/passkey auth flows go through better-auth plugins, not NestJS custom services"

requirements-completed: [SEC-04]

duration: 8min
completed: 2026-03-09
---

# Phase 55 Plan 05: Delete Old Custom MFA Code Summary

**Deleted 11 old MFA files (4 backend services + 6 frontend components + 1 API module) and removed all dangling references from auth module, controller, services, and tests**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T15:02:39Z
- **Completed:** 2026-03-09T15:10:31Z
- **Tasks:** 1
- **Files modified:** 18 (11 deleted + 7 modified)

## Accomplishments
- Deleted 4 backend files: totp.service.ts, webauthn.service.ts, mfa.controller.ts, mfa.dto.ts
- Deleted 6 frontend components: MfaSettings, TotpSetupWizard, BackupCodesCard, PasskeyCard, TrustedDevicesList, index.ts
- Deleted frontend API module: mfa.ts
- Removed frontend/components/mfa/ directory entirely
- Cleaned all DI registrations, imports, controller endpoints, and facade methods referencing deleted code
- Updated 3 test files to remove deleted service mocks and constructor args
- Both frontend and backend build with zero TypeScript errors

## Task Commits

1. **Task 1: Delete old MFA backend and frontend code + fix dangling imports** - `8be65a03` (chore)

## Files Created/Modified
- `backend/src/modules/auth/auth.module.ts` - Removed TotpService, WebAuthnService, MfaController from providers/controllers/exports
- `backend/src/modules/auth/controllers/auth.controller.ts` - Removed MFA verify, WebAuthn login options/verify endpoints and mfa.dto import
- `backend/src/modules/auth/services/auth-login.service.ts` - Removed TotpService/WebAuthnService DI, stripped MFA challenge/passkey/WebAuthn methods, simplified login flow
- `backend/src/modules/auth/services/auth.service.ts` - Removed loginWithPasskey, getWebAuthnLoginOptions, verifyMfaChallenge facade methods
- `backend/src/modules/auth/__tests__/auth-login-hardening.spec.ts` - Removed TotpService/WebAuthnService mock and DI provider
- `backend/src/modules/auth/__tests__/password-change-invalidation.spec.ts` - Removed TotpService/WebAuthnService imports and DI providers
- `backend/src/modules/auth/services/__tests__/auth.pre-split.spec.ts` - Removed mockTotpService/mockWebauthnService, updated constructor call, removed passkey/MFA tests, updated API surface list

## Decisions Made
- Removed MFA challenge (TOTP/backup/email), passkey login, and WebAuthn endpoints from the NestJS auth controller since better-auth plugins now handle all MFA/passkey flows
- Stripped the entire MFA logic from `_login()` -- the `isMfaEnabled` flag is deprecated and better-auth manages 2FA state directly
- Updated test files to reflect new constructor signatures and removed tests for deleted methods (necessary since the referenced files no longer exist)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] auth-login.service.ts deep coupling to deleted services**
- **Found during:** Task 1 (dangling import fix)
- **Issue:** Plan listed only "remove the import line" for non-module files, but auth-login.service.ts had TotpService/WebAuthnService in its constructor DI and used them in loginWithPasskey, getWebAuthnLoginOptions, verifyMfaChallenge, and the MFA branch of _login. Simply removing imports would not compile.
- **Fix:** Removed both services from constructor DI, deleted loginWithPasskey/getWebAuthnLoginOptions/verifyMfaChallenge methods entirely, stripped MFA TOTP branching from _login, and cascaded changes to auth.service.ts facade and auth.controller.ts endpoints.
- **Files modified:** auth-login.service.ts, auth.service.ts, auth.controller.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors on both backend and frontend
- **Committed in:** 8be65a03

**2. [Rule 3 - Blocking] Test files reference deleted service files**
- **Found during:** Task 1 (dangling import fix)
- **Issue:** 3 test files imported from deleted totp.service.ts and webauthn.service.ts, and constructed AuthLoginService with args matching old constructor signature
- **Fix:** Removed imports, mock declarations, DI providers, and constructor args for deleted services in all 3 test files. Removed test cases for deleted methods in auth.pre-split.spec.ts.
- **Files modified:** auth-login-hardening.spec.ts, password-change-invalidation.spec.ts, auth.pre-split.spec.ts
- **Verification:** Backend type-check passes
- **Committed in:** 8be65a03

---

**Total deviations:** 2 auto-fixed (both Rule 3 - Blocking)
**Impact on plan:** Both fixes necessary for compilation. Plan underestimated depth of coupling -- "remove import line" was insufficient for files with active usage of deleted services. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 55 (Social Login & MFA) is complete -- all 5 plans executed (4 prior + this cleanup)
- All MFA/passkey functionality exclusively via better-auth plugins
- Old custom MFA code fully removed from codebase
- Ready for Phase 56 onwards

---
*Phase: 55-social-login-mfa*
*Completed: 2026-03-09*
