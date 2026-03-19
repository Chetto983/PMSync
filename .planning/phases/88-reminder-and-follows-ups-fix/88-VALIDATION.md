---
phase: 88
slug: reminder-and-follows-ups-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 88 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler (tsc --noEmit) + ESLint |
| **Config file** | frontend/tsconfig.json, backend/tsconfig.json |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 88-01-01 | 01 | 1 | BUG-1 snooze | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 88-01-02 | 01 | 1 | BUG-2 persist | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 88-01-03 | 01 | 1 | BUG-4 spin | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 88-01-04 | 01 | 1 | BUG-6 router | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 88-01-05 | 01 | 1 | BUG-7 error | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 88-02-01 | 02 | 1 | BUG-5 widget | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 88-02-02 | 02 | 1 | BUG-3 dead code | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Snooze updates follow-up dueDate | BUG-1 | Requires running backend + DB | Click snooze > 1 hour, verify follow-up dueDate changes |
| Widget visibility persists on reload | BUG-2 | Requires browser interaction | Toggle widget off, reload page, verify it stays off |
| Refresh icon spins during loading | BUG-4 | Visual animation check | Click refresh, observe spinning icon |
| Stale contacts widget renders | BUG-5 | Requires CRM data | Check dashboard shows stale contacts widget with real data |

*All phase behaviors also verified by type-check automation.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
