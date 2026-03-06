---
phase: 52
slug: nestjs-session-validation
status: draft
nyquist_compliant: true
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
| **Quick run command** | `cd backend && npx jest --testPathPattern="better-auth.guard\|roles-guard.integration" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="better-auth.guard\|roles-guard.integration" --no-coverage`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | NEST-01 | unit | `npx jest better-auth.guard.spec` | W0 | pending |
| 52-01-02 | 01 | 1 | NEST-01, NEST-04 | compile+unit | `npx tsc --noEmit && npx jest better-auth.guard.spec` | W0 | pending |
| 52-02-01 | 02 | 2 | NEST-02 | compile | `npx tsc --noEmit` | existing | pending |
| 52-02-02 | 02 | 2 | NEST-02, NEST-03, NEST-06 | compile+unit | `npx tsc --noEmit && npx jest roles-guard.integration.spec better-auth.guard.spec` | existing | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/common/auth/__tests__/better-auth.guard.spec.ts` — stubs for NEST-01 (created by Plan 01, Task 1)

**Existing test files (need updates, not creation):**
- [x] `backend/src/modules/auth/__tests__/roles-guard.integration.spec.ts` — covers NEST-03 (update mock user shape in Plan 02, Task 2)

**Not needed (architecture-only or verified by tracing):**
- ~~body-parser.spec.ts~~ — NEST-04 is satisfied by architecture (NestJS is consumer-only, no auth POST bodies). No test file needed.
- ~~bullmq-context.spec.ts~~ — NEST-06 is verified by code tracing (request.user.tenantId shape is identical). The BetterAuthGuard spec already validates the shape. No separate test file needed.
- ~~tenant.guard.spec.ts~~ — TenantGuard requires no code changes (reads same request.user.tenantId shape). The existing `tenant-isolation.spec.ts` tests Prisma tenant-scoping, not the guard itself. TenantGuard compatibility is verified by compile + RolesGuard integration test (which uses same mock user shape).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cookie survives cookie-parser middleware | NEST-01 | Requires running server with real HTTP request | Start backend, send request with session cookie, verify guard resolves session |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify with behavioral tests (no 3 consecutive tsc-only)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
