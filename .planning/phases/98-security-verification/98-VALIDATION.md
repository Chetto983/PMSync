---
phase: 98
slug: security-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 98 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (NestJS e2e) |
| **Config file** | `backend/test/jest-e2e.json` |
| **Quick run command** | `cd backend && npx jest --config test/jest-e2e.json --testPathPattern security` |
| **Full suite command** | `cd backend && npx jest --config test/jest-e2e.json` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --config test/jest-e2e.json --testPathPattern security`
- **After every plan wave:** Run `cd backend && npx jest --config test/jest-e2e.json`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 98-01-01 | 01 | 1 | SEC-01 | e2e | `npx jest --testPathPattern auth-guard` | ❌ W0 | ⬜ pending |
| 98-01-02 | 01 | 1 | SEC-02 | e2e | `npx jest --testPathPattern tenant-isolation` | ❌ W0 | ⬜ pending |
| 98-02-01 | 02 | 1 | SEC-03 | e2e | `npx jest --testPathPattern csrf` | ❌ W0 | ⬜ pending |
| 98-02-02 | 02 | 1 | SEC-04 | e2e | `npx jest --testPathPattern rate-limit` | ❌ W0 | ⬜ pending |
| 98-03-01 | 03 | 1 | SEC-05 | e2e | `npx jest --testPathPattern rbac` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/test/security/` — test directory for security e2e tests
- [ ] `backend/test/security/auth-guard.e2e-spec.ts` — stubs for SEC-01
- [ ] `backend/test/security/tenant-isolation.e2e-spec.ts` — stubs for SEC-02
- [ ] `backend/test/security/csrf.e2e-spec.ts` — stubs for SEC-03
- [ ] `backend/test/security/rate-limit.e2e-spec.ts` — stubs for SEC-04
- [ ] `backend/test/security/rbac.e2e-spec.ts` — stubs for SEC-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Redis failover rate-limit behavior | SEC-04 | Requires Redis restart during test | Stop Redis, verify rate limiter fails open, restart, verify recovery |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
