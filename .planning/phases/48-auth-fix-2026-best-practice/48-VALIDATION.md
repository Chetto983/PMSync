---
phase: 48
slug: auth-fix-2026-best-practice
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x + ts-jest |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern auth --no-coverage --forceExit` |
| **Full suite command** | `cd backend && npx jest --no-coverage --forceExit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern auth --no-coverage --forceExit`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 0 | P48-01 | unit | `npx jest --testPathPattern password-hashing.spec -x` | W0 | pending |
| 48-01-02 | 01 | 0 | P48-02 | unit | `npx jest --testPathPattern password-hashing.spec -x` | W0 | pending |
| 48-01-03 | 01 | 0 | P48-06 | unit | `npx jest --testPathPattern password-policy.spec -x` | W0 | pending |
| 48-01-04 | 01 | 0 | P48-07 | unit | `npx jest --testPathPattern password-policy.spec -x` | W0 | pending |
| 48-01-05 | 01 | 0 | P48-08 | unit | `npx jest --testPathPattern password-policy.spec -x` | W0 | pending |
| 48-01-06 | 01 | 0 | P48-11 | unit | `npx jest --testPathPattern password-policy.spec -x` | W0 | pending |
| 48-02-01 | 02 | 1 | P48-04 | unit | `npx jest --testPathPattern jwt-es256.spec -x` | W0 | pending |
| 48-02-02 | 02 | 1 | P48-05 | unit | `npx jest --testPathPattern jwt-strategy.spec -x` | W0 | pending |
| 48-03-01 | 03 | 2 | P48-03 | unit | `npx jest --testPathPattern auth-login-hardening.spec -x` | W0 | pending |
| 48-03-02 | 03 | 2 | P48-09 | unit | `npx jest --testPathPattern auth-login-hardening.spec -x` | W0 | pending |
| 48-03-03 | 03 | 2 | P48-10 | unit | `npx jest --testPathPattern auth-registration-hardening.spec -x` | W0 | pending |
| 48-04-01 | 04 | 3 | P48-12 | unit | `npx jest --testPathPattern session-hardening.spec -x` | W0 | pending |
| 48-04-02 | 04 | 3 | P48-13 | unit | `npx jest --testPathPattern session-hardening.spec -x` | W0 | pending |
| 48-04-03 | 04 | 3 | P48-14 | unit | `npx jest --testPathPattern cookie-hardening.spec -x` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Requirement Descriptions

| Req ID | Behavior |
|--------|----------|
| P48-01 | Argon2id hashing produces valid `$argon2id$` prefix |
| P48-02 | bcrypt hash verified and rehashed to Argon2id on login |
| P48-03 | Dummy hash executed when user not found (timing protection) |
| P48-04 | ES256 JWT signed with private key, verified with public key |
| P48-05 | Dual-algo grace period accepts both HS256 and ES256 |
| P48-06 | Password policy rejects <15 chars, >128 chars |
| P48-07 | HIBP check blocks breached passwords (>3 occurrences) |
| P48-08 | HIBP check allows password when API unreachable |
| P48-09 | Per-email rate limiting enforced on login |
| P48-10 | OTP send has fake delay when user not found |
| P48-11 | RegisterDto, ResetPasswordDto, and LoginDto enforce 15-char minimum and 128-char maximum |
| P48-12 | Session concurrency enforced: oldest evicted when at maxSessionsPerUser |
| P48-13 | Idle session timeout: sessions inactive >30min rejected, lastActivityAt tracked |
| P48-14 | Access cookie uses __Host- prefix in production (Secure, Path=/, no Domain) |

---

## Wave 0 Requirements

- [ ] `backend/src/modules/auth/__tests__/password-hashing.spec.ts` — stubs for P48-01, P48-02
- [ ] `backend/src/modules/auth/__tests__/password-policy.spec.ts` — stubs for P48-06, P48-07, P48-08, P48-11
- [ ] `backend/src/modules/auth/__tests__/jwt-es256.spec.ts` — stubs for P48-04, P48-05
- [ ] `backend/src/modules/auth/__tests__/auth-login-hardening.spec.ts` — stubs for P48-03, P48-09
- [ ] `backend/src/modules/auth/__tests__/auth-registration-hardening.spec.ts` — stubs for P48-10
- [ ] `backend/src/modules/auth/__tests__/session-hardening.spec.ts` — stubs for P48-12, P48-13
- [ ] `backend/src/modules/auth/__tests__/cookie-hardening.spec.ts` — stubs for P48-14
- [ ] `cd backend && npm install @node-rs/argon2` — new dependency for Argon2id

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timing side-channel prevention | P48-03 | Timing consistency hard to assert deterministically | Measure login response time for existing vs non-existing users; delta should be <50ms |
| PEM env var parsing in Docker | P48-04 | Requires actual Docker environment | Set `JWT_PRIVATE_KEY` with `\n` literals in docker-compose, verify startup succeeds |
| __Host- cookie in browser | P48-14 | Requires HTTPS browser session | Verify cookie appears with __Host- prefix in Chrome DevTools Application > Cookies |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
