---
phase: 61
slug: gdpr-org-compliance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.2.0 + ts-jest 29.4.6 |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="compliance" --forceExit` |
| **Full suite command** | `cd backend && npx jest --forceExit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm run type-check`
- **After every plan wave:** Run `cd backend && npx jest --testPathPattern="compliance" --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 0 | CLN-02 | unit | `cd backend && npx jest --testPathPattern="data-export" --forceExit` | ❌ W0 | ⬜ pending |
| 61-01-02 | 01 | 0 | CLN-03 | unit | `cd backend && npx jest --testPathPattern="account-deletion" --forceExit` | ❌ W0 | ⬜ pending |
| 61-01-03 | 01 | 1 | CLN-02 | unit | `cd backend && npx jest --testPathPattern="data-export" --forceExit` | ❌ W0 | ⬜ pending |
| 61-02-01 | 02 | 1 | CLN-03 | unit | `cd backend && npx jest --testPathPattern="account-deletion" --forceExit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/compliance/__tests__/data-export.service.spec.ts` — stubs for CLN-02
- [ ] `backend/src/modules/compliance/__tests__/account-deletion.service.spec.ts` — stubs for CLN-03
- [ ] No new framework install needed

*Existing infrastructure covers test framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Exported ZIP contains correct JSON files | CLN-02 | End-to-end ZIP verification | Trigger data export, download ZIP, verify org-memberships.json + sent-invitations.json + auth-accounts.json + active-sessions.json present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
