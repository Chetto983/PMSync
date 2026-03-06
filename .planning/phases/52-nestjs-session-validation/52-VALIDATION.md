---
phase: 52
slug: nestjs-session-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (NestJS default) |
| **Config file** | backend/jest.config.ts |
| **Quick run command** | `cd backend && npx jest --testPathPattern="auth-guard\|tenant-guard\|roles-guard" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="auth-guard\|tenant-guard\|roles-guard" --no-coverage`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | NEST-01 | unit | `npx jest better-auth.guard.spec` | W0 | pending |
| 52-01-02 | 01 | 1 | NEST-01 | unit | `npx jest better-auth.guard.spec` | W0 | pending |
| 52-02-01 | 02 | 1 | NEST-02 | unit | `npx jest tenant.guard.spec` | W0 | pending |
| 52-02-02 | 02 | 1 | NEST-03 | unit | `npx jest roles.guard.spec` | W0 | pending |
| 52-03-01 | 03 | 2 | NEST-04 | integration | `npx jest body-parser.spec` | W0 | pending |
| 52-03-02 | 03 | 2 | NEST-06 | unit | `npx jest bullmq-context.spec` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/auth/guards/__tests__/better-auth.guard.spec.ts` — stubs for NEST-01
- [ ] `backend/src/auth/guards/__tests__/tenant.guard.spec.ts` — stubs for NEST-02
- [ ] `backend/src/auth/guards/__tests__/roles.guard.spec.ts` — stubs for NEST-03
- [ ] `backend/src/auth/guards/__tests__/body-parser.spec.ts` — stubs for NEST-04
- [ ] `backend/src/auth/guards/__tests__/bullmq-context.spec.ts` — stubs for NEST-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cookie survives cookie-parser middleware | NEST-01 | Requires running server with real HTTP request | Start backend, send request with session cookie, verify guard resolves session |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
