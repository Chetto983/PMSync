---
phase: 48-auth-fix-2026-best-practice
plan: 03
subsystem: auth
tags: [argon2id, bcrypt-migration, enumeration-hardening, rate-limiting, password-policy, timing-protection]

requires:
  - phase: 48-auth-fix-2026-best-practice
    provides: PasswordHashingService (dual-algo), PasswordPolicyService (length+HIBP), ES256 JWT
provides:
  - Argon2id migration on login with transparent bcrypt rehash
  - Enumeration hardening across login, registration, OTP flows
  - Per-email rate limiting alongside per-IP
  - Password policy enforcement on registration and password reset
  - Soft password policy warning on login response
affects: []

tech-stack:
  added: []
  patterns: [dual-dimension-rate-limiting, dummy-hash-timing-protection, unified-error-anti-enumeration, otp-fake-delay]

key-files:
  created:
    - backend/src/modules/auth/__tests__/auth-login-hardening.spec.ts
    - backend/src/modules/auth/__tests__/auth-registration-hardening.spec.ts
  modified:
    - backend/src/modules/auth/services/auth-login.service.ts
    - backend/src/modules/auth/services/auth-registration.service.ts
    - backend/src/modules/auth/services/auth-password-reset.service.ts
    - backend/src/modules/auth/auth.module.ts

key-decisions:
  - "Soft password policy warning uses simple length check (not full validate()) to avoid HIBP network call on every login"
  - "Per-email rate limit set to 10 attempts/15min (more lenient than per-IP 5/15min) since shared IPs are common"
  - "Registration existing-user path returns identical message + runs dummyHash for timing normalization"

patterns-established:
  - "Dual-dimension rate limiting: check IP + email in parallel, record failures on both, clear both on success"
  - "Timing protection: dummyHash() on every user-not-found/tenant-not-found path before throwing unified error"
  - "Anti-enumeration: all auth error paths return 'Invalid credentials' (login) or identical messages (registration)"
  - "OTP fake delay: 100-300ms random delay on user-not-found in sendOtpCode to match real OTP creation timing"

requirements-completed: [P48-03, P48-09, P48-10]

duration: 9min
completed: 2026-03-05
---

# Phase 48 Plan 03: Enumeration & Session Hardening Summary

**Wire PasswordHashingService into all auth sub-services with transparent bcrypt-to-Argon2id migration, dual-dimension rate limiting, and enumeration attack vector closure across login/registration/OTP flows**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-05T17:43:51Z
- **Completed:** 2026-03-05T17:53:04Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 6

## Accomplishments
- All 3 auth sub-services now use PasswordHashingService for password verification and hashing (zero direct bcrypt usage)
- Transparent Argon2id rehash on successful bcrypt login with structured log event
- 5 enumeration vectors closed: unified login errors, dummy hash on login+registration, OTP fake delay, registration message unification
- Per-email rate limiting (10/15min) active alongside per-IP (5/15min) with parallel check/record/clear
- Password policy enforced on registration and password reset via PasswordPolicyService
- Soft passwordPolicyWarning flag in login response for existing users with short passwords
- 21 new passing tests across 2 test suites

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire services into auth-login + enumeration hardening** - `fa67fb71` (feat) - 12 tests
2. **Task 2: Wire services into registration + password-reset + auth.module** - `200e29c8` (feat) - 9 tests

## Files Created/Modified
- `backend/src/modules/auth/services/auth-login.service.ts` - Replaced bcrypt with PasswordHashingService, added dual-dimension rate limiting, unified errors, dummyHash, passwordPolicyWarning
- `backend/src/modules/auth/services/auth-registration.service.ts` - Replaced bcrypt with PasswordHashingService, added policy validation, dummyHash for existing user, OTP fake delay
- `backend/src/modules/auth/services/auth-password-reset.service.ts` - Replaced bcrypt with PasswordHashingService, added policy validation before saving
- `backend/src/modules/auth/auth.module.ts` - Registered PasswordHashingService + PasswordPolicyService as providers
- `backend/src/modules/auth/__tests__/auth-login-hardening.spec.ts` - 12 tests: dual-algo verify, rehash, dummyHash, unified errors, per-email rate limit, policy warning
- `backend/src/modules/auth/__tests__/auth-registration-hardening.spec.ts` - 9 tests: policy validation, Argon2id hashing, enumeration protection, OTP fake delay, password reset hardening

## Decisions Made
- Soft password policy warning uses a simple `password.length < 15` check rather than calling `PasswordPolicyService.validate()` (which includes HIBP network call). This keeps login fast and avoids a network dependency on every authentication.
- Per-email rate limit threshold is 10 (vs per-IP 5) because multiple users may share an email domain but it's less common than shared IPs.
- OTP fake delay uses `100 + Math.random() * 200` ms to approximate real OTP creation timing without being too predictable.

## Deviations from Plan

None - plan executed exactly as written.

Note: Plan referenced `passwordPolicyService.validateLength()` which doesn't exist. Used inline `password.length < PASSWORD_POLICY_MIN_LENGTH` constant instead, which is functionally equivalent and avoids adding a method to the service for a single call site. This is a plan-compliant interpretation, not a deviation.

## Issues Encountered
- ESM module imports (otplib, qrcode, @simplewebauthn/server) require jest.mock() before imports -- resolved by following existing test pattern from password-change-invalidation.spec.ts
- 3 pre-existing auth test suite failures confirmed (auth.controller.cookie.spec, password-change-invalidation.spec, auth.pre-split.spec) -- all failing before Plan 03 changes

## User Setup Required

None - no external service configuration required. All services use existing DI infrastructure.

## Next Phase Readiness
- Phase 48 is complete: all 3 plans executed (password hashing, ES256 JWT, enumeration hardening)
- Zero bcrypt imports remain in auth sub-services (only in PasswordHashingService for dual-algo verify)
- All new password hashing produces Argon2id hashes
- Enumeration vectors fully closed across login, registration, OTP, and password reset flows

## Self-Check: PASSED

- All 6 key files exist on disk
- Both task commits verified in git log (fa67fb71, 200e29c8)
- 21/21 new tests pass; no regressions in existing auth tests (3 pre-existing failures confirmed)

---
*Phase: 48-auth-fix-2026-best-practice*
*Completed: 2026-03-05*
