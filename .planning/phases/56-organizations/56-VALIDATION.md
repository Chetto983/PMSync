---
phase: 56
slug: organizations
status: draft
nyquist_compliant: false
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
| **Quick run command** | `cd backend && npx jest --testPathPattern=organization --no-coverage` |
| **Full suite command** | `cd backend && npx jest --testPathPattern=organization && cd ../frontend && npx vitest run --reporter=verbose src/**/*organization*` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern=organization --no-coverage`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | ORG-01 | unit | `npx jest --testPathPattern=organization.service` | ❌ W0 | ⬜ pending |
| 56-01-02 | 01 | 1 | ORG-02 | unit+integration | `npx jest --testPathPattern=invitation` | ❌ W0 | ⬜ pending |
| 56-01-03 | 01 | 1 | ORG-03 | unit | `npx jest --testPathPattern=role` | ❌ W0 | ⬜ pending |
| 56-02-01 | 02 | 2 | ORG-04 | integration | `npx vitest run src/**/*org-switch*` | ❌ W0 | ⬜ pending |
| 56-02-02 | 02 | 2 | ORG-05 | integration | `npx jest --testPathPattern=organization.guard` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/organization/__tests__/organization.service.spec.ts` — stubs for ORG-01
- [ ] `backend/src/modules/organization/__tests__/invitation.service.spec.ts` — stubs for ORG-02
- [ ] `backend/src/modules/organization/__tests__/organization.guard.spec.ts` — stubs for ORG-05
- [ ] Shared fixtures for organization test data

*Existing jest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Org switcher UI updates context | ORG-04 | Visual UI state change | Switch orgs in dropdown, verify header/sidebar context updates |
| Invitation email received | ORG-02 | External email delivery | Create invitation, check Mailtrap/dev inbox |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
