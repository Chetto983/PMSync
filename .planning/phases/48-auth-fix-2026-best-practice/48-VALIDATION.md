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
| 48-01-01 | 01 | 0 | P48-01 | unit | `npx jest --testPathPattern password-hashing.spec -x` | ❌ W0 | ⬜ pending |
| 48-01-02 | 01 | 0 | P48-02 | unit | `npx jest --testPathPattern password-hashing.spec -x` | ❌ W0 | ⬜ pending |
| 48-01-03 | 01 | 0 | P48-06 | unit | `npx jest --testPathPattern password-policy.spec -x` | ❌ W0 | ⬜ pending |
| 48-01-04 | 01 | 0 | P48-07 | unit | `npx jest --testPathPattern password-policy.spec -x` | ❌ W0 | ⬜ pending |
| 48-01-05 | 01 | 0 | P48-08 | unit | `npx jest --testPathPattern password-policy.spec -x` | ❌ W0 | ⬜ pending |
| 48-02-01 | 02 | 1 | P48-04 | unit | `npx jest --testPathPattern jwt-es256.spec -x` | ❌ W0 | ⬜ pending |
| 48-02-02 | 02 | 1 | P48-05 | unit | `npx jest --testPathPattern jwt-strategy.spec -x` | ❌ W0 | ⬜ pending |
| 48-03-01 | 03 | 1 | P48-03 | unit | `npx jest --testPathPattern auth-login-hardening.spec -x` | ❌ W0 | ⬜ pending |
| 48-03-02 | 03 | 1 | P48-09 | unit | `npx jest --testPathPattern auth-login-hardening.spec -x` | ❌ W0 | ⬜ pending |
| 48-03-03 | 03 | 1 | P48-10 | unit | `npx jest --testPathPattern auth-registration-hardening.spec -x` | ❌ W0 | ⬜ pending |
| 48-03-04 | 03 | 1 | P48-11 | unit | `npx jest --testPathPattern dto-validation.spec -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/auth/__tests__/password-hashing.spec.ts` — stubs for P48-01, P48-02
- [ ] `backend/src/modules/auth/__tests__/password-policy.spec.ts` — stubs for P48-06, P48-07, P48-08
- [ ] `backend/src/modules/auth/__tests__/jwt-es256.spec.ts` — stubs for P48-04, P48-05
- [ ] `backend/src/modules/auth/__tests__/auth-login-hardening.spec.ts` — stubs for P48-03, P48-09
- [ ] `backend/src/modules/auth/__tests__/auth-registration-hardening.spec.ts` — stubs for P48-10, P48-11
- [ ] `cd backend && npm install @node-rs/argon2` — new dependency for Argon2id

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timing side-channel prevention | P48-03 | Timing consistency hard to assert deterministically | Measure login response time for existing vs non-existing users; delta should be <50ms |
| PEM env var parsing in Docker | P48-04 | Requires actual Docker environment | Set `JWT_PRIVATE_KEY` with `\n` literals in docker-compose, verify startup succeeds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
