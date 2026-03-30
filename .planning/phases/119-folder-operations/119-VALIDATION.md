---
phase: 119
slug: folder-operations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 119 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern folder --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern folder --no-coverage`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 119-01-01 | 01 | 1 | FOLD-01 | integration | `npx jest --testPathPattern folder-create` | ❌ W0 | ⬜ pending |
| 119-01-02 | 01 | 1 | FOLD-02 | integration | `npx jest --testPathPattern folder-rename` | ❌ W0 | ⬜ pending |
| 119-01-03 | 01 | 1 | FOLD-03 | integration | `npx jest --testPathPattern folder-delete` | ❌ W0 | ⬜ pending |
| 119-01-04 | 01 | 1 | FOLD-04 | integration | `npx jest --testPathPattern folder-sync` | ❌ W0 | ⬜ pending |
| 119-01-05 | 01 | 1 | FOLD-05 | integration | `npx jest --testPathPattern system-folder` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/email/folders/__tests__/folder-operations.spec.ts` — stubs for FOLD-01 through FOLD-05
- [ ] Shared fixtures for mock provider drivers (Gmail, Outlook, IMAP)

*Existing BullMQ and folder infrastructure covers base requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Folder changes reflected on provider | FOLD-01, FOLD-02, FOLD-03 | Requires live OAuth connection | Use Edge CDP validation script |
| External folder changes sync locally | FOLD-04 | Requires provider-side folder creation | Create folder in Gmail/Outlook UI, trigger sync |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
