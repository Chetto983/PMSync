---
phase: 48-auth-fix-2026-best-practice
plan: 01
subsystem: auth
tags: [argon2id, bcrypt, password-hashing, password-policy, hibp, nist-sp800-63b, dto-validation]

requires:
  - phase: 42-auth-hardening
    provides: AuthConfigService centralized config, bcrypt usage in 3 auth sub-services
provides:
  - PasswordHashingService: Argon2id hash + bcrypt dual-algo verify with rehash detection
  - PasswordPolicyService: length 15-128 validation + HIBP k-anonymity breach check
  - Updated DTOs: RegisterDto, ResetPasswordDto, LoginDto with MinLength(15) + MaxLength(128)
affects: [48-02-jwt-es256, 48-03-enumeration-session-hardening]

tech-stack:
  added: ["@node-rs/argon2"]
  patterns: [dual-algo-verify-with-rehash-flag, hibp-k-anonymity-best-effort, dto-cpu-dos-prevention]

key-files:
  created:
    - backend/src/modules/auth/services/password-hashing.service.ts
    - backend/src/modules/auth/services/password-policy.service.ts
    - backend/src/modules/auth/__tests__/password-hashing.spec.ts
    - backend/src/modules/auth/__tests__/password-policy.spec.ts
  modified:
    - backend/src/modules/auth/services/auth-config.service.ts
    - backend/src/modules/auth/dtos/register.dto.ts
    - backend/src/modules/auth/dtos/reset-password.dto.ts
    - backend/src/modules/auth/dtos/login.dto.ts
    - backend/package.json

key-decisions:
  - "Argon2id params configurable via env (ARGON2_MEMORY_COST/TIME_COST/PARALLELISM) with OWASP 2025 defaults (64MiB/3/1)"
  - "HIBP breach threshold set to >3 (not >0) to reduce false positives from padding noise"
  - "LoginDto @MaxLength(128) is the primary CPU DoS prevention gate for Argon2id"

patterns-established:
  - "Dual-algo verify: detect by hash prefix ($argon2id$ vs $2b$/$2a$), flag needsRehash on bcrypt success"
  - "HIBP k-anonymity: SHA-1 prefix query with 3s timeout, best-effort fallback to allow"
  - "dummyHash() for timing-safe enumeration protection on user-not-found paths"

requirements-completed: [P48-01, P48-02, P48-06, P48-07, P48-08, P48-11]

duration: 7min
completed: 2026-03-05
---

# Phase 48 Plan 01: Password Hashing & Policy Summary

**Argon2id dual-algo hashing service with bcrypt migration detection, HIBP breach-check policy service, and 15-128 char DTO enforcement on all 3 password endpoints**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-05T17:33:24Z
- **Completed:** 2026-03-05T17:40:29Z
- **Tasks:** 3 (1 setup + 2 TDD features)
- **Files modified:** 9

## Accomplishments
- PasswordHashingService: Argon2id hashing with configurable params, bcrypt verify with rehash flag, dummyHash timing protection
- PasswordPolicyService: length validation (15-128), HIBP k-anonymity breach check with best-effort fallback
- All 3 DTOs (register, reset-password, login) enforce @MinLength(15) @MaxLength(128) -- login MaxLength is the CPU DoS gate
- 28 unit tests covering all verification paths, policy rules, and DTO boundary values

## Task Commits

Each task was committed atomically:

1. **Task 0: Install @node-rs/argon2** - `032d6b9d` (chore)
2. **Feature 1: PasswordHashingService** - `0ec77058` (feat) - includes AuthConfigService Argon2id config fields
3. **Feature 2: PasswordPolicyService + DTOs** - `9537e6f5` (feat) - service + 3 DTO updates + 19 tests

_TDD RED phase test file for Feature 1 was committed in `6903077e` by a concurrent process._

## Files Created/Modified
- `backend/src/modules/auth/services/password-hashing.service.ts` - Argon2id hash/verify with bcrypt dual-algo support
- `backend/src/modules/auth/services/password-policy.service.ts` - Length validation + HIBP k-anonymity breach check
- `backend/src/modules/auth/__tests__/password-hashing.spec.ts` - 9 tests: hash prefix, dual-algo verify, garbage hash, dummyHash
- `backend/src/modules/auth/__tests__/password-policy.spec.ts` - 19 tests: policy validation + all 3 DTO boundary tests
- `backend/src/modules/auth/services/auth-config.service.ts` - Added argon2MemoryCost/TimeCost/Parallelism config fields
- `backend/src/modules/auth/dtos/register.dto.ts` - MinLength(15) + MaxLength(128)
- `backend/src/modules/auth/dtos/reset-password.dto.ts` - MinLength(15) + MaxLength(128)
- `backend/src/modules/auth/dtos/login.dto.ts` - MinLength(15) + MaxLength(128) (CPU DoS prevention)
- `backend/package.json` - Added @node-rs/argon2 dependency

## Decisions Made
- Argon2id params configurable via env vars (ARGON2_MEMORY_COST, ARGON2_TIME_COST, ARGON2_PARALLELISM) with OWASP 2025 defaults
- HIBP breach threshold >3 (not >0) to reduce false positives from API padding responses
- LoginDto @MaxLength(128) is essential -- without it, an attacker submits a 1MB password and Argon2id hashes it, causing CPU DoS

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- A concurrent process committed auth changes (`6903077e`) including ES256 JWT config and the password-hashing test file during execution. This was plan 02 work bleeding into plan 01's execution window. Worked around by staging only plan-01-relevant files in each commit.
- Pre-commit hook runs `tsc --noEmit` which initially rejected commits before the implementation file existed. Resolved by implementing before committing.

## User Setup Required

None - no external service configuration required. HIBP API is public (no API key needed). Argon2id params have sensible defaults.

## Next Phase Readiness
- PasswordHashingService ready for integration into auth-login.service.ts (Plan 02: bcrypt.compare -> verifyPassword + rehash)
- PasswordPolicyService ready for integration into auth-registration.service.ts and auth-password-reset.service.ts (Plan 02/03)
- DTOs already enforcing new limits at validation layer

## Self-Check: PASSED

- All 4 created files exist on disk
- All 3 task commits verified in git log (032d6b9d, 0ec77058, 9537e6f5)
- 28/28 new tests pass; no regressions in existing auth tests

---
*Phase: 48-auth-fix-2026-best-practice*
*Completed: 2026-03-05*
