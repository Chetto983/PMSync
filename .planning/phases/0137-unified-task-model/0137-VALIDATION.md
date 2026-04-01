---
phase: 137
slug: unified-task-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 137 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript type-check (tsc --noEmit) + Jest |
| **Config file** | `backend/tsconfig.json`, `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx tsc --noEmit` |
| **Full suite command** | `cd backend && npx tsc --noEmit && npm run lint:win` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npx tsc --noEmit && npm run lint:win`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 0137-01-01 | 01 | 1 | TASK-01 | type-check | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Unified task list returns data from all 5 sources | TASK-01 | Requires populated DB with follow-ups, reminders, deals, tickets | Hit `GET /tasks` endpoint with test data in each source table |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
