---
phase: 48-auth-fix-2026-best-practice
plan: 02
subsystem: auth
tags: [jwt, es256, ecdsa, asymmetric-signing, key-rotation, grace-period]

requires:
  - phase: 42-auth-hardening
    provides: JWT secret validation, session-based auth, cookie auth
provides:
  - ES256 asymmetric JWT signing with EC P-256 keys
  - Dual-algorithm grace period (HS256 + ES256) for zero-downtime migration
  - kid header in all signed JWTs for future key rotation
  - HS256 pinning on password reset and non-access-token flows
  - Key generation script for ES256 keypair
affects: [48-auth-fix-2026-best-practice]

tech-stack:
  added: []
  patterns: [secretOrKeyProvider dual-algo verification, kid header for key rotation, algorithm pinning for non-access tokens]

key-files:
  created:
    - backend/scripts/generate-es256-keys.ts
  modified:
    - backend/src/modules/auth/services/auth-config.service.ts
    - backend/src/modules/auth/auth.module.ts
    - backend/src/modules/auth/strategies/jwt.strategy.ts
    - backend/src/modules/auth/services/auth-password-reset.service.ts
    - backend/src/modules/auth/__tests__/jwt-es256.spec.ts

key-decisions:
  - "MFA tokens not pinned to HS256 -- they use module-level config (sign+verify both switch to ES256 together); 5m TTL makes grace period irrelevant"
  - "jwtLegacyHmacSecret auto-populated from JWT_SECRET when ES256 enabled -- simplifies migration (no extra env var needed initially)"
  - "secretOrKeyProvider decodes header without verification to determine algorithm -- standard pattern for dual-algo JWT strategies"

patterns-established:
  - "Algorithm pinning: non-access-token sign/verify calls must explicitly set algorithm: 'HS256' to avoid inheriting module default"
  - "secretOrKeyProvider pattern: decode JWT header base64url to determine algorithm, then select appropriate key"

requirements-completed: [P48-04, P48-05]

duration: 6min
completed: 2026-03-05
---

# Phase 48 Plan 02: JWT ES256 Migration Summary

**ES256 asymmetric JWT signing with secretOrKeyProvider dual-algo grace period for zero-downtime HS256-to-ES256 migration**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-05T17:33:22Z
- **Completed:** 2026-03-05T17:39:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- AuthConfigService supports ES256 key config with HS256 fallback for dev/test
- JwtModule configured for ES256 with privateKey/publicKey when keys present
- JwtStrategy uses secretOrKeyProvider for dual-algorithm grace period
- Password reset token sign/verify explicitly pinned to HS256
- kid header included in all ES256-signed JWTs
- Key generation script for ES256 P-256 keypair
- 14 passing tests covering all ES256 config, signing, dual-algo, and HS256 pinning

## Task Commits

Each task was committed atomically:

1. **Task 1: ES256 config + JwtModule + key gen script** - `1934bd07` (feat)
2. **Task 2: JwtStrategy dual-algo grace period** - `e5d2f208` (feat)

## Files Created/Modified
- `backend/src/modules/auth/services/auth-config.service.ts` - ES256 key fields, kid, legacy HMAC, updated getAccessTokenOptions/getPasswordResetTokenOptions
- `backend/src/modules/auth/auth.module.ts` - JwtModule ES256 config with HS256 fallback
- `backend/src/modules/auth/strategies/jwt.strategy.ts` - secretOrKeyProvider dual-algo verification
- `backend/src/modules/auth/services/auth-password-reset.service.ts` - HS256 algorithm pinning on sign/verify
- `backend/src/modules/auth/__tests__/jwt-es256.spec.ts` - 14 tests for ES256 migration
- `backend/scripts/generate-es256-keys.ts` - Key generation utility

## Decisions Made
- MFA tokens not pinned to HS256: they use module-level config so sign and verify switch together; 5m TTL makes the grace period window negligible
- jwtLegacyHmacSecret auto-populated from JWT_SECRET when ES256 is enabled, simplifying initial migration (operator only needs to add ES256 keys)
- secretOrKeyProvider decodes JWT header without verification to determine algorithm -- this is the standard passport-jwt pattern for multi-algorithm support

## Deviations from Plan

None - plan executed exactly as written.

Note: Plan mentioned pinning HS256 on MFA token verify, but the conditional was "if MFA tokens use symmetric secret" -- they don't (they use module default), so no pinning was needed. This is a plan-compliant decision, not a deviation.

## Issues Encountered
- 3 pre-existing auth test failures (cookie spec, password-policy spec, password-change-invalidation spec) confirmed pre-existing by running tests on pre-change code

## User Setup Required

To enable ES256 in production:
1. Run `npx ts-node backend/scripts/generate-es256-keys.ts` to generate keypair
2. Add `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` to environment
3. Set `JWT_LEGACY_HMAC_SECRET` to old `JWT_SECRET` value for grace period
4. After all old HS256 tokens expire (15min + session TTL), remove `JWT_LEGACY_HMAC_SECRET`

## Next Phase Readiness
- ES256 signing infrastructure complete, ready for Plan 03 (password policy, session hardening)
- Grace period mechanism tested and ready for production deployment

---
*Phase: 48-auth-fix-2026-best-practice*
*Completed: 2026-03-05*
