---
phase: 56
slug: organizations
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-10
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), vitest (frontend) |
| **Config file** | `backend/jest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="auth/__tests__/(active-org\|org-member\|org-management)" --no-coverage --forceExit` |
| **Full suite command** | `cd backend && npx jest --testPathPattern="auth/__tests__/(active-org\|org-member\|org-management)" --no-coverage --forceExit && cd ../frontend && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | ORG-01, ORG-03 | unit | `npx jest --testPathPattern="auth/__tests__/org-member-provisioning" --no-coverage --forceExit` | W0 | pending |
| 56-01-02 | 01 | 1 | ORG-04, ORG-05 | unit | `npx jest --testPathPattern="auth/__tests__/active-org" --no-coverage --forceExit` | W0 | pending |
| 56-01-03 | 01 | 1 | ORG-05 | unit | `npx jest --testPathPattern="auth/__tests__/org-management-guard" --no-coverage --forceExit` | W0 | pending |
| 56-02-01 | 02 | 2 | ORG-02, ORG-03 | tsc | `cd frontend && npx tsc --noEmit` | n/a | pending |
| 56-02-02 | 02 | 2 | ORG-04 | tsc+regression | `cd frontend && npx tsc --noEmit && cd ../backend && npx jest --testPathPattern="auth/__tests__/(active-org\|org-member\|org-management)" --no-coverage --forceExit` | n/a | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/common/auth/__tests__/active-org-guard.spec.ts` — tests for activeOrganizationId mapping (ORG-04, ORG-05)
- [ ] `backend/src/common/auth/__tests__/org-member-provisioning.spec.ts` — tests for Member creation (ORG-01, ORG-03)
- [ ] `backend/src/common/auth/__tests__/org-management-guard.spec.ts` — tests for super-admin enforcement on org management routes (ORG-05)

*All test stubs created in Plan 01 Task 2.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Org switcher UI updates context | ORG-04 | Visual UI state change | Switch orgs in dropdown, verify header/sidebar context updates |
| Invitation email received | ORG-02 | External email delivery | Create invitation, check Mailtrap/dev inbox |
| Non-super-admin blocked from org mgmt API | ORG-05 | End-to-end auth flow | As regular user, POST /api/auth/organization/create, expect 403 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
