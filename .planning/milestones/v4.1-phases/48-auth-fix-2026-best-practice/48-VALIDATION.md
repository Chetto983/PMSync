---
phase: 48
slug: auth-fix-2026-best-practice
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-05
updated: 2026-03-05
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x + ts-jest |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPatterns "password-hashing\|password-policy\|jwt-es256\|auth-login-hardening\|auth-registration-hardening\|session-hardening\|cookie-hardening" --no-coverage --forceExit` |
| **Full suite command** | `cd backend && npx jest --no-coverage --forceExit` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPatterns auth --no-coverage --forceExit`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | P48-01 | unit | `npx jest --testPathPatterns password-hashing.spec -x` | yes | green |
| 48-01-02 | 01 | 1 | P48-02 | unit | `npx jest --testPathPatterns password-hashing.spec -x` | yes | green |
| 48-01-03 | 01 | 1 | P48-06 | unit | `npx jest --testPathPatterns password-policy.spec -x` | yes | green |
| 48-01-04 | 01 | 1 | P48-07 | unit | `npx jest --testPathPatterns password-policy.spec -x` | yes | green |
| 48-01-05 | 01 | 1 | P48-08 | unit | `npx jest --testPathPatterns password-policy.spec -x` | yes | green |
| 48-01-06 | 01 | 1 | P48-11 | unit | `npx jest --testPathPatterns password-policy.spec -x` | yes | green |
| 48-02-01 | 02 | 1 | P48-04 | unit | `npx jest --testPathPatterns jwt-es256.spec -x` | yes | green |
| 48-02-02 | 02 | 1 | P48-05 | unit | `npx jest --testPathPatterns jwt-es256.spec -x` | yes | green |
| 48-03-01 | 03 | 2 | P48-03 | unit | `npx jest --testPathPatterns auth-login-hardening.spec -x` | yes | green |
| 48-03-02 | 03 | 2 | P48-09 | unit | `npx jest --testPathPatterns auth-login-hardening.spec -x` | yes | green |
| 48-03-03 | 03 | 2 | P48-10 | unit | `npx jest --testPathPatterns auth-registration-hardening.spec -x` | yes | green |
| 48-04-01 | 04 | 3 | P48-12 | unit | `npx jest --testPathPatterns session-hardening.spec -x` | yes | green |
| 48-04-02 | 04 | 3 | P48-13 | unit | `npx jest --testPathPatterns session-hardening.spec -x` | yes | green |
| 48-04-03 | 04 | 3 | P48-14 | unit | `npx jest --testPathPatterns cookie-hardening.spec -x` | yes | green |

*Status: pending / green / red / flaky*

---

## Requirement Descriptions

| Req ID | Behavior | Test Coverage |
|--------|----------|---------------|
| P48-01 | Argon2id hashing produces valid `$argon2id$` prefix | `password-hashing.spec.ts`: "should produce Argon2id hash with $argon2id$ prefix" |
| P48-02 | bcrypt hash verified and rehashed to Argon2id on login | `password-hashing.spec.ts`: "should return valid=true, needsRehash=true for correct bcrypt password" + `auth-login-hardening.spec.ts`: "should rehash bcrypt password to Argon2id on successful login" |
| P48-03 | Dummy hash executed when user not found (timing protection) | `auth-login-hardening.spec.ts`: "should call dummyHash() when user not found before throwing" |
| P48-04 | ES256 JWT signed with private key, verified with public key | `jwt-es256.spec.ts`: "should produce ES256 tokens with kid header", "should accept ES256 token with public key during grace period" |
| P48-05 | Dual-algo grace period accepts both HS256 and ES256 | `jwt-es256.spec.ts`: "should accept HS256 token with legacy HMAC secret during grace period", "should reject HS256 token when legacy HMAC secret is not set" |
| P48-06 | Password policy rejects <15 chars, >128 chars | `password-policy.spec.ts`: "should reject password shorter than 15 characters", "should reject password longer than 128 characters" |
| P48-07 | HIBP check blocks breached passwords (>3 occurrences) | `password-policy.spec.ts`: "should reject password found in >3 breaches", "should accept password found in <=3 breaches" |
| P48-08 | HIBP check allows password when API unreachable | `password-policy.spec.ts`: "should accept password when HIBP API is unreachable (best-effort)" |
| P48-09 | Per-email rate limiting enforced on login | `auth-login-hardening.spec.ts`: "should check both IP and email lockout in parallel", "should block when email is locked out" |
| P48-10 | OTP send has fake delay when user not found | `auth-registration-hardening.spec.ts`: "should take at least 100ms when user not found in sendOtpCode" |
| P48-11 | RegisterDto, ResetPasswordDto, and LoginDto enforce 15-char minimum and 128-char maximum | `password-policy.spec.ts`: 8 DTO boundary tests covering all 3 DTOs |
| P48-12 | Session concurrency enforced: oldest evicted when at maxSessionsPerUser | `session-hardening.spec.ts`: "should evict oldest session", "should evict multiple oldest sessions" |
| P48-13 | Idle session timeout: sessions inactive >30min rejected, lastActivityAt tracked | `session-hardening.spec.ts`: "should reject session idle for more than 30 minutes", debounce tests (3 tests) |
| P48-14 | Access cookie uses __Host- prefix in production | `cookie-hardening.spec.ts`: "should use __Host-access_token in production", cookie options tests (7 tests) |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timing side-channel prevention | P48-03 | Timing consistency hard to assert deterministically | Measure login response time for existing vs non-existing users; delta should be <50ms |
| PEM env var parsing in Docker | P48-04 | Requires actual Docker environment | Set `JWT_PRIVATE_KEY` with `\n` literals in docker-compose, verify startup succeeds |
| __Host- cookie in browser | P48-14 | Requires HTTPS browser session | Verify cookie appears with __Host- prefix in Chrome DevTools Application > Cookies |
| Session eviction UX | P48-12 | Requires multi-device login | Log in from 6 devices, verify oldest session is logged out |
| Idle timeout behavior | P48-13 | Requires real wait time | Leave session idle 31 minutes, verify next request returns 401 |

---

## Validation Audit 2026-03-05

| Metric | Count |
|--------|-------|
| Requirements | 14 |
| Covered | 14 |
| Partial | 0 |
| Missing | 0 |
| Test suites | 7 |
| Total tests | 89 |
| All green | yes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (actual: ~8s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed
