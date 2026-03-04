---
phase: 42
slug: tenant-isolation-auth-hardening
status: draft
nyquist_compliant: false
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
| **Quick run command** | `cd backend && npx jest --testPathPattern="tenant-scoping\|roles-guard\|refresh-token" --no-coverage` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~45 seconds (quick) / ~180 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="tenant-scoping|roles-guard|refresh-token" --no-coverage`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 0 | TEST-01 | integration | `npx jest --testPathPattern="tenant-isolation"` | ❌ W0 | ⬜ pending |
| 42-01-02 | 01 | 0 | TEST-02 | integration | `npx jest --testPathPattern="roles-guard.integration"` | ❌ W0 | ⬜ pending |
| 42-01-03 | 01 | 0 | TEST-03 | unit+integration | `npx jest --testPathPattern="refresh-token"` | ❌ W0 | ⬜ pending |
| 42-01-04 | 01 | 0 | TSEC-02 | unit | `npx jest --testPathPattern="tenant-scoping-enforce"` | ❌ W0 | ⬜ pending |
| 42-01-05 | 01 | 0 | AUTH-05 | integration | `npx jest --testPathPattern="password-change-invalidation"` | ❌ W0 | ⬜ pending |
| 42-02-01 | 02 | 1 | TSEC-01, TSEC-02 | unit | `npx jest --testPathPattern="tenant-scoping-enforce"` | ❌ W0 | ⬜ pending |
| 42-02-02 | 02 | 1 | TSEC-03, TSEC-04 | unit | `npx jest --testPathPattern="tenant-scoping"` | ✅ | ⬜ pending |
| 42-03-01 | 03 | 1 | TSEC-05, TSEC-06, TSEC-07 | integration | `npx jest --testPathPattern="roles-guard.integration"` | ❌ W0 | ⬜ pending |
| 42-04-01 | 04 | 2 | AUTH-01, AUTH-02, AUTH-03 | unit+integration | `npx jest --testPathPattern="refresh-token"` | ❌ W0 | ⬜ pending |
| 42-04-02 | 04 | 2 | AUTH-04, AUTH-05 | integration | `npx jest --testPathPattern="password-change-invalidation"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/prisma/tenant-scoping/__tests__/tenant-scoping-enforce.spec.ts` — stubs for TSEC-02
- [ ] `backend/src/modules/auth/__tests__/roles-guard.integration.spec.ts` — stubs for TSEC-07, TEST-02
- [ ] `backend/src/modules/auth/__tests__/refresh-token.spec.ts` — stubs for TEST-03, AUTH-02
- [ ] `backend/src/modules/auth/__tests__/tenant-isolation.spec.ts` — stubs for TEST-01
- [ ] `backend/src/modules/auth/__tests__/password-change-invalidation.spec.ts` — stubs for AUTH-05

*Existing infrastructure covers tenant-scoping audit mode tests. Wave 0 adds enforce-mode and auth tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend seamless token refresh | AUTH-01 | Requires browser cookie handling | 1. Login, 2. Wait 15+ min or manually expire token, 3. Perform action, 4. Verify no redirect to login |
| Cookie secure/httpOnly flags | AUTH-03 | Browser DevTools inspection | 1. Login, 2. Open DevTools > Application > Cookies, 3. Verify Secure, HttpOnly, SameSite flags |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
