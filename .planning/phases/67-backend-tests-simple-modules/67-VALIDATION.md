---
phase: 67
slug: backend-tests-simple-modules
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.2.0 (ts-jest transform) |
| **Config file** | `backend/jest.config.js` (globalSetup + globalTeardown already configured) |
| **Quick run command** | `cd backend && npm test -- --testPathPattern=modules/(health\|users\|tenants\|labels) --forceExit` |
| **Full suite command** | `cd backend && npm test --forceExit` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm test -- --testPathPattern=<module> --forceExit`
- **After every plan wave:** Run `cd backend && npm test --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 67-01-01 | 01 | 0 | BTEST-08 | unit | `cd backend && npm test -- --testPathPattern=health/services --forceExit` | ❌ W0 | ⬜ pending |
| 67-02-01 | 02 | 0 | BTEST-07 | integration | `cd backend && npm test -- --testPathPattern=users/services --forceExit` | ❌ W0 | ⬜ pending |
| 67-03-01 | 03 | 0 | BTEST-06 | integration | `cd backend && npm test -- --testPathPattern=tenants/services --forceExit` | ❌ W0 | ⬜ pending |
| 67-04-01 | 04 | 0 | BTEST-05 | integration | `cd backend && npm test -- --testPathPattern=labels/services --forceExit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/health/services/__tests__/health.service.spec.ts` — stubs for BTEST-08
- [ ] `backend/src/modules/users/services/__tests__/users.service.spec.ts` — stubs for BTEST-07
- [ ] `backend/src/modules/tenants/services/__tests__/tenant.service.spec.ts` — stubs for BTEST-06
- [ ] `backend/src/modules/labels/services/__tests__/labels.service.spec.ts` — stubs for BTEST-05
- [ ] Add `createTestLabel()` to `backend/test/helpers/factories.ts`
- [ ] Add `"user_labels"` to TRUNCATE list in `backend/test/helpers/cleanup.ts`

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
