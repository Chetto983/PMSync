---
phase: 126
slug: cron-to-bullmq-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 126 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (NestJS default) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --passWithNoTests --testPathPattern=scheduled-jobs` |
| **Full suite command** | `cd backend && npx tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 126-01-01 | 01 | 1 | LEGC-04 | grep | `grep -r "@Cron" backend/src/ --include="*.ts"` returns empty | ✅ | ⬜ pending |
| 126-01-02 | 01 | 1 | LEGC-04 | type-check | `cd backend && npx tsc --noEmit` exits 0 | ✅ | ⬜ pending |
| 126-01-03 | 01 | 1 | LEGC-04 | grep | `grep -r "ScheduleModule" backend/src/ --include="*.ts"` returns empty | ✅ | ⬜ pending |
| 126-01-04 | 01 | 1 | LEGC-04 | grep | `grep "registerHandler" backend/src/modules/scheduled-jobs/scheduled-jobs.queue.ts` shows all 8 jobs | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. BullMQ queue service and handler pattern already in place.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No duplicate job execution across 2 instances | LEGC-04 SC#3 | Requires running 2 backend instances simultaneously | Start 2 instances, observe BullMQ job logs for 1 cron cycle, verify each job fires exactly once |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
