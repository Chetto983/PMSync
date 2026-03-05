---
phase: 48-auth-fix-2026-best-practice
verified: 2026-03-05T18:30:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 48: Auth Fix 2026 Best Practice Verification Report

**Phase Goal:** Upgrade auth to 2026 standards: Argon2id password hashing with transparent bcrypt migration, ES256 asymmetric JWT signing with dual-algo grace period, NIST-compliant password policy with HIBP breach check, enumeration hardening across all auth endpoints, session concurrency enforcement, idle session timeout, and __Host- cookie prefix
**Verified:** 2026-03-05T18:30:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | New user passwords are hashed with Argon2id ($argon2id$ prefix) | VERIFIED | `password-hashing.service.ts` line 37: `hash(password, ...)` using `@node-rs/argon2`; auth-registration uses `passwordHashingService.hashPassword()`; auth-password-reset uses same |
| 2 | Login with bcrypt hash succeeds and transparently rehashes to Argon2id | VERIFIED | `password-hashing.service.ts` lines 66-77: detects `$2b$/$2a$` prefix, returns `needsRehash: true`; `auth-login.service.ts` line 343: rehash block after successful bcrypt verify |
| 3 | JWTs are signed with ES256 (ECDSA P-256) using asymmetric keys | VERIFIED | `auth.module.ts` lines 71-84: JwtModule ES256 config with privateKey/publicKey; `auth-config.service.ts` lines 80-101: ES256 key setup with kid computation |
| 4 | During grace period, both HS256 and ES256 tokens are accepted | VERIFIED | `jwt.strategy.ts` lines 76-101: `secretOrKeyProvider` dispatches by `header.alg`; algorithms array includes both when `jwtLegacyHmacSecret` is set |
| 5 | Password policy enforces 15-char minimum + HIBP breach check | VERIFIED | `password-policy.service.ts` lines 41-62: MIN_LENGTH=15, HIBP check; all 3 DTOs have `@MinLength(15)` and `@MaxLength(128)` |
| 6 | Login returns "Invalid credentials" for ALL failure reasons (no enumeration) | VERIFIED | `auth-login.service.ts` lines 297, 306, 314, 332: all throw `UnauthorizedException('Invalid credentials')` for tenant-not-found, user-not-found, password-wrong |
| 7 | Non-existent user login takes same time as existing user (timing protection) | VERIFIED | `auth-login.service.ts` lines 296, 306: `passwordHashingService.dummyHash()` called before throwing; `auth-registration.service.ts` line 99: dummyHash for existing user |
| 8 | Per-email rate limiting active alongside per-IP | VERIFIED | `auth-login.service.ts` line 256: `login:email:${normalizedEmail}` key used for rate limiting |
| 9 | Session N+1 evicts oldest session when user is at maxSessionsPerUser limit | VERIFIED | `auth-login.service.ts` lines 90-102: counts existing sessions, slices oldest, deleteMany for eviction |
| 10 | Sessions idle for >30 minutes are rejected (sliding inactivity timeout) | VERIFIED | `jwt.strategy.ts` lines 291-299 (DB path) and 213-222 (cache path): idle check against `authConfig.idleTimeoutMs`; debounced lastActivityAt updates lines 301-312, 224-239 |
| 11 | Access cookie uses __Host- prefix in production | VERIFIED | `cookie.helper.ts` line 28: `isProduction ? '__Host-access_token' : 'access_token'`; `jwt.strategy.ts` lines 15-16: cookieExtractor checks both names |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/auth/services/password-hashing.service.ts` | Argon2id hash/verify with bcrypt dual-algo | VERIFIED | 114 lines, substantive, injected into 3 auth services |
| `backend/src/modules/auth/services/password-policy.service.ts` | Length + HIBP breach check | VERIFIED | 143 lines, substantive, injected into registration + password-reset |
| `backend/src/modules/auth/services/auth-config.service.ts` | ES256 config + Argon2id params + idle timeout | VERIFIED | 343 lines, all fields present: jwtPrivateKey, jwtPublicKey, isEs256Enabled, argon2*, idleTimeoutMs, lastActivityDebounceMs |
| `backend/src/modules/auth/auth.module.ts` | JwtModule ES256 + PasswordHashing/Policy providers | VERIFIED | ES256 JwtModule config lines 59-104; both services in providers array lines 120-121 |
| `backend/src/modules/auth/strategies/jwt.strategy.ts` | Dual-algo + idle timeout + cookie extractor | VERIFIED | 421 lines, secretOrKeyProvider, idle check on both cache and DB paths, __Host- cookie extractor |
| `backend/src/modules/auth/helpers/cookie.helper.ts` | __Host- prefix in production | VERIFIED | Line 28: environment-aware naming |
| `backend/src/modules/auth/dtos/register.dto.ts` | MinLength(15) + MaxLength(128) | VERIFIED | Lines 8-9 |
| `backend/src/modules/auth/dtos/reset-password.dto.ts` | MinLength(15) + MaxLength(128) | VERIFIED | Lines 8-9 |
| `backend/src/modules/auth/dtos/login.dto.ts` | MinLength(15) + MaxLength(128) CPU DoS gate | VERIFIED | Lines 8-9 |
| `backend/scripts/generate-es256-keys.ts` | Key generation script | VERIFIED | 40 lines, uses crypto.generateKeyPairSync with prime256v1 |
| `backend/prisma/schema.prisma` | lastActivityAt on Session | VERIFIED | Line 247: `lastActivityAt DateTime @default(now())` |
| `backend/src/modules/auth/__tests__/password-hashing.spec.ts` | Unit tests | VERIFIED | File exists |
| `backend/src/modules/auth/__tests__/password-policy.spec.ts` | Unit tests | VERIFIED | File exists |
| `backend/src/modules/auth/__tests__/jwt-es256.spec.ts` | ES256 tests | VERIFIED | File exists |
| `backend/src/modules/auth/__tests__/auth-login-hardening.spec.ts` | Hardening tests | VERIFIED | File exists |
| `backend/src/modules/auth/__tests__/auth-registration-hardening.spec.ts` | Registration hardening tests | VERIFIED | File exists |
| `backend/src/modules/auth/__tests__/cookie-hardening.spec.ts` | Cookie tests | VERIFIED | File exists |
| `backend/src/modules/auth/__tests__/session-hardening.spec.ts` | Session tests | VERIFIED | File exists |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| password-hashing.service.ts | @node-rs/argon2 | import hash/verify | WIRED | Line 2: `import { hash, verify } from '@node-rs/argon2'` |
| password-policy.service.ts | HIBP API | fetch with k-anonymity | WIRED | Line 96: `fetch(https://api.pwnedpasswords.com/range/${prefix})` |
| auth-login.service.ts | PasswordHashingService | DI injection | WIRED | Line 51: constructor injection; lines 296, 306, 319, 343: usage |
| auth-registration.service.ts | PasswordPolicyService | DI injection | WIRED | Line 31: constructor injection; line 116: validate(); line 122: hashPassword() |
| auth-registration.service.ts | PasswordHashingService | DI injection | WIRED | Line 30: constructor injection; line 99: dummyHash(); line 122: hashPassword() |
| auth-password-reset.service.ts | PasswordHashingService | DI injection | WIRED | Line 35: constructor injection; lines 198, 214: verifyPassword/hashPassword |
| auth-password-reset.service.ts | PasswordPolicyService | DI injection | WIRED | Line 36: constructor injection; line 209: validate() |
| auth.module.ts | PasswordHashingService/PasswordPolicyService | providers array | WIRED | Lines 120-121: registered as providers |
| auth.module.ts JwtModule | ES256 config | privateKey/publicKey | WIRED | Lines 71-84: ES256 mode with algorithm, keyid |
| jwt.strategy.ts | auth-config.service.ts | secretOrKeyProvider | WIRED | Lines 76-101: dispatches by algorithm using authConfig properties |
| auth-login.service.ts | auth-config.service.ts maxSessionsPerUser | session eviction | WIRED | Line 90: `this.authConfig.maxSessionsPerUser` |
| jwt.strategy.ts | Session.lastActivityAt | idle check + update | WIRED | Lines 291-312 (DB), 213-239 (cache): idle check + debounced update |
| auth-password-reset.service.ts | HS256 pinning | algorithm in sign/verify | WIRED | Line 112: `algorithm: 'HS256'`; line 163: `algorithms: ['HS256']` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| P48-01 | 48-01 | Argon2id hashing produces valid $argon2id$ prefix | SATISFIED | password-hashing.service.ts hashPassword() |
| P48-02 | 48-01 | bcrypt verified + flagged for rehash | SATISFIED | password-hashing.service.ts verifyPassword() needsRehash logic |
| P48-03 | 48-03 | Dummy hash on user-not-found (timing protection) | SATISFIED | auth-login.service.ts dummyHash() calls + auth-registration.service.ts |
| P48-04 | 48-02 | ES256 JWT signing with EC private key | SATISFIED | auth.module.ts ES256 JwtModule config + auth-config.service.ts |
| P48-05 | 48-02 | Dual-algo grace period (HS256+ES256) | SATISFIED | jwt.strategy.ts secretOrKeyProvider + algorithms array |
| P48-06 | 48-01 | Password policy rejects <15 chars | SATISFIED | password-policy.service.ts MIN_LENGTH=15 + 3 DTOs @MinLength(15) |
| P48-07 | 48-01 | HIBP blocks breached passwords (>3 occurrences) | SATISFIED | password-policy.service.ts HIBP_BREACH_THRESHOLD=3 |
| P48-08 | 48-01 | HIBP allows when API unreachable | SATISFIED | password-policy.service.ts catch block returns {breached: false} |
| P48-09 | 48-03 | Per-email rate limiting on login | SATISFIED | auth-login.service.ts `login:email:` key |
| P48-10 | 48-03 | OTP fake delay for non-existent user | SATISFIED | auth-registration.service.ts `setTimeout(resolve, 100 + Math.random() * 200)` |
| P48-11 | 48-01 | All 3 DTOs enforce MinLength(15) + MaxLength(128) | SATISFIED | register.dto.ts, reset-password.dto.ts, login.dto.ts all verified |
| P48-12 | 48-04 | __Host- cookie prefix in production | SATISFIED | cookie.helper.ts line 28 |
| P48-13 | 48-04 | Session concurrency enforcement (maxSessionsPerUser) | SATISFIED | auth-login.service.ts session eviction logic |
| P48-14 | 48-04 | Idle session timeout (30min default) | SATISFIED | jwt.strategy.ts idle check on both cache/DB paths |

**Orphaned Requirements:** None -- all 14 requirements (P48-01 through P48-14) are claimed by plans and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| password-hashing.service.ts | -- | No TODOs/FIXMEs/placeholders | -- | Clean |
| password-policy.service.ts | -- | No TODOs/FIXMEs/placeholders | -- | Clean |
| auth-login.service.ts | 31-32 | Comments mention "bcrypt" | Info | Comments only, no bcrypt import/usage -- acceptable (describes migration behavior) |
| auth-registration.service.ts | 15 | Comment mentions "bcrypt" | Info | Comment only, describes what was replaced -- acceptable |

No blocker or warning anti-patterns found. Zero direct bcrypt imports in auth-login, auth-registration, or auth-password-reset services. bcrypt import exists only in password-hashing.service.ts (by design for dual-algo support).

### Human Verification Required

### 1. ES256 JWT Signing End-to-End

**Test:** Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY env vars, restart backend, login, decode the returned JWT
**Expected:** JWT header shows `"alg": "ES256"` and `"kid": "<8-char-hex>"`, payload has correct claims
**Why human:** Requires running server with ES256 keys, network interaction

### 2. Grace Period Migration

**Test:** Start server with both ES256 keys and JWT_LEGACY_HMAC_SECRET set; login to get ES256 token; use a previously-issued HS256 token to make an authenticated request
**Expected:** Both tokens are accepted. After removing JWT_LEGACY_HMAC_SECRET and restarting, only ES256 tokens are accepted
**Why human:** Requires multi-step deployment scenario

### 3. __Host- Cookie in Browser

**Test:** Deploy to HTTPS production-like environment, login, inspect cookies in browser DevTools
**Expected:** Cookie named `__Host-access_token` present with Secure flag, Path=/, no Domain attribute
**Why human:** Browser cookie behavior cannot be verified programmatically from backend

### 4. Session Eviction UX

**Test:** Login from 6 different sessions (default max is 5), check oldest session
**Expected:** 6th login succeeds, oldest session is terminated (authenticated requests from session 1 fail)
**Why human:** Requires multi-session scenario with real HTTP clients

### 5. Idle Timeout Behavior

**Test:** Login, wait 31 minutes without activity, make an authenticated request
**Expected:** Request returns 401 Unauthorized with session_idle_timeout reason
**Why human:** Real-time wait + HTTP interaction

### Gaps Summary

No gaps found. All 11 observable truths are verified with supporting evidence from the codebase. All 14 requirements are satisfied. All artifacts exist, are substantive (not stubs), and are properly wired via dependency injection and module registration.

The phase goal -- hardening authentication to 2026 best practices -- is achieved across all planned dimensions: Argon2id hashing, ES256 JWT, password policy, enumeration hardening, session management, and cookie security.

---

_Verified: 2026-03-05T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
