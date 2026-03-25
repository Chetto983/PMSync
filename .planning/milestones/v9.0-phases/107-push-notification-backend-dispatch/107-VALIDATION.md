---
phase: 107
slug: push-notification-backend-dispatch
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-24
updated: 2026-03-24
---

# Phase 107 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern=push --no-coverage --forceExit` |
| **Full suite command** | `cd backend && npx jest --no-coverage --forceExit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern=push --no-coverage --forceExit`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Plan Structure

| Plan | Wave | Tasks | Description |
|------|------|-------|-------------|
| 107-00 | 0 | 2 | Test stub creation (Nyquist compliance) |
| 107-01 | 1 | 3 | Backend dispatch pipeline (schema, handler, worker, SW fix) |
| 107-02 | 1 | 2 | Frontend category preference toggles + backend DTO |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement(s) | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-----------------|-----------|-------------------|-------------|--------|
| 107-00-01 | 00 | 0 | PUSH-01,02,03,04,07 | stub | `npx jest src/modules/push/push-dispatch.handler.spec.ts src/modules/push/push-dispatch.worker.spec.ts --no-coverage --forceExit` | Created by task | pending |
| 107-00-02 | 00 | 0 | PUSH-03,04,05 | stub | `npx jest src/modules/push/push.service.spec.ts src/modules/push/push.controller.spec.ts --no-coverage --forceExit` | Created by task | pending |
| 107-01-01 | 01 | 1 | PUSH-01 | unit | `cd backend && npx prisma db push && npx tsc --noEmit` | N/A (schema+config) | pending |
| 107-01-02 | 01 | 1 | PUSH-01,07 | unit | `cd backend && npx tsc --noEmit` | push-dispatch.handler.spec.ts (W0) | pending |
| 107-01-03 | 01 | 1 | PUSH-02,03,04,06 | unit | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` | push-dispatch.worker.spec.ts (W0) | pending |
| 107-02-01 | 02 | 1 | PUSH-05 | unit | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` | push.controller.spec.ts (W0) | pending |
| 107-02-02 | 02 | 1 | PUSH-05 | manual | `cd frontend && npx tsc --noEmit` | N/A (UI component) | pending |

*Status: pending -- green -- red -- flaky*

---

## Wave 0 Requirements

Plan 107-00 creates these stub files:

- [ ] `backend/src/modules/push/push-dispatch.handler.spec.ts` -- stubs for PUSH-01, PUSH-07
- [ ] `backend/src/modules/push/push-dispatch.worker.spec.ts` -- stubs for PUSH-02, PUSH-03, PUSH-04
- [ ] `backend/src/modules/push/push.service.spec.ts` -- stubs for PUSH-03, PUSH-04, PUSH-05
- [ ] `backend/src/modules/push/push.controller.spec.ts` -- stubs for PUSH-05

*Existing infrastructure covers test framework. Only test files needed.*

---

## Requirement Coverage Map

| Req ID | Description | Covering Task(s) | Test File |
|--------|-------------|-------------------|-----------|
| PUSH-01 | Push on new email event | 107-01-01, 107-01-02 | push-dispatch.handler.spec.ts |
| PUSH-02 | Dispatch through BullMQ | 107-01-03 | push-dispatch.worker.spec.ts |
| PUSH-03 | Stale sub cleanup (410/404) | 107-01-03 | push-dispatch.worker.spec.ts, push.service.spec.ts |
| PUSH-04 | Multi-device fan-out | 107-01-03 | push-dispatch.worker.spec.ts, push.service.spec.ts |
| PUSH-05 | Per-category preferences | 107-02-01, 107-02-02 | push.controller.spec.ts |
| PUSH-06 | Notification click navigation | 107-01-03 (SW fix) | Manual only (browser API) |
| PUSH-07 | Thread grouping with count | 107-01-02 | push-dispatch.handler.spec.ts |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Push notification arrives on device | PUSH-01 | Requires real browser + service worker | Subscribe in browser, trigger email sync, verify notification appears |
| Notification click opens email thread | PUSH-06 | Requires real browser navigation | Click notification, verify correct thread URL opens |
| Grouped notification shows count | PUSH-07 | Requires real browser + timed email arrival | Send 3 emails to same thread within 60s, verify single notification with count |
| Category toggles render correctly | PUSH-05 | Visual verification | Open Settings > Notifications, verify 3 category switches below master toggle |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] Per-task map matches actual plan/task numbering (3 plans: 00, 01, 02)
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] `wave_0_complete: true` set after Plan 00 execution

**Approval:** pending
