---
phase: 0139
slug: smart-views-task-customization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 0139 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), tsc --noEmit (frontend) |
| **Config file** | backend/jest.config.ts, frontend/tsconfig.json |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 0139-01-01 | 01 | 1 | TASK-04 | type-check | `cd backend && npx tsc --noEmit` | ⬜ W0 | ⬜ pending |
| 0139-01-02 | 01 | 1 | TASK-04 | type-check | `cd backend && npx tsc --noEmit` | ⬜ W0 | ⬜ pending |
| 0139-02-01 | 02 | 2 | TASK-04 | type-check | `cd frontend && npx tsc --noEmit` | ⬜ W0 | ⬜ pending |
| 0139-02-02 | 02 | 2 | TASK-05 | type-check | `cd frontend && npx tsc --noEmit` | ⬜ W0 | ⬜ pending |
| 0139-02-03 | 02 | 2 | TASK-04/05 | type-check | `cd frontend && npx tsc --noEmit` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Save filter combo as named view | TASK-04 | Requires browser interaction | Open Tasks, set filters, click Save View, verify persists on reload |
| Pin view to sidebar popover | TASK-05 | Requires sidebar interaction | Pin a view, verify it appears in Tasks popover, click to apply filters |
| Pinned views persist across sessions | TASK-05 | Requires page reload | Pin views, close browser, reopen, verify pins remain |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
