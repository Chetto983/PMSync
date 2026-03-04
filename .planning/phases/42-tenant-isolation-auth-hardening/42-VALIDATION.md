---
phase: 42
slug: tenant-isolation-auth-hardening
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-04
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (spec files) + Vitest (test files) |
| **Config file** | `backend/jest.config.js` + `backend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="tenant-scoping\|roles-guard\|refresh-token\|tenant-isolation\|password-change" --no-coverage` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~45 seconds (quick) / ~180 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="tenant-scoping|roles-guard|refresh-token|tenant-isolation|password-change" --no-coverage`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 42-02-01 | 02 | 1 | TSEC-03, TSEC-04, TSEC-06 | code change | `npx tsc --noEmit` | pending |
| 42-02-02 | 02 | 1 | TSEC-05 | code change | `npx tsc --noEmit` | pending |
| 42-02-03 | 02 | 1 | TSEC-07, TEST-02 | integration | `npx jest --testPathPattern="roles-guard.integration"` | pending |
| 42-03-01 | 03 | 1 | AUTH-01, AUTH-02, AUTH-03, AUTH-05 | unit+integration | `npx prisma db push && npx tsc --noEmit` | pending |
| 42-03-02 | 03 | 1 | AUTH-04, TEST-03 | unit+integration | `npx jest --testPathPattern="refresh-token" && cd ../frontend && npx jest --testPathPattern="api-client-interceptor"` | pending |
| 42-04-01 | 04 | 2 | TSEC-01, TSEC-02, TEST-01 | integration | `npx jest --testPathPattern="tenant-isolation"` | pending |
| 42-04-02 | 04 | 2 | AUTH-05 | unit | `npx jest --testPathPattern="password-change-invalidation"` | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/auth/__tests__/roles-guard.integration.spec.ts` — stubs for TSEC-07, TEST-02 (created by 42-02 Task 3)
- [ ] `backend/src/modules/auth/__tests__/refresh-token.spec.ts` — stubs for TEST-03, AUTH-02 (created by 42-03 Task 2)
- [ ] `frontend/__tests__/api-client-interceptor.spec.ts` — stubs for AUTH-04 frontend verification (created by 42-03 Task 2)
- [ ] `backend/src/modules/auth/__tests__/tenant-isolation.spec.ts` — stubs for TEST-01, TSEC-01, TSEC-02 enforce-mode (created by 42-04 Task 1)
- [ ] `backend/src/modules/auth/__tests__/password-change-invalidation.spec.ts` — stubs for AUTH-05 (created by 42-04 Task 2)

*Note: TSEC-02 enforce-mode testing is folded into `tenant-isolation.spec.ts` (plan 42-04 Task 1) which explicitly covers findMany/create/update/delete without tenant context throwing TenantContextRequiredError. A separate `tenant-scoping-enforce.spec.ts` is NOT needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend seamless token refresh | AUTH-01 | Requires browser cookie handling | 1. Login, 2. Wait 15+ min or manually expire token, 3. Perform action, 4. Verify no redirect to login |
| Cookie secure/httpOnly flags | AUTH-03 | Browser DevTools inspection | 1. Login, 2. Open DevTools > Application > Cookies, 3. Verify Secure, HttpOnly, SameSite flags |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all test file creation
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Frontend interceptor has automated Jest test (axios-mock-adapter)
- [x] TSEC-02 enforce-mode covered by tenant-isolation.spec.ts (6 tests including 4 enforce-mode scenarios)

**Approval:** pending
