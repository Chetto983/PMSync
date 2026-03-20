---
phase: 94
slug: infrastructure-remaining-pages
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-20
---

# Phase 94 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + standalone tsx scripts (WebSocket) |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `cd frontend && npx playwright test e2e/health-endpoints.spec.ts e2e/webhooks.spec.ts e2e/tasks.spec.ts e2e/dashboard.spec.ts e2e/analytics.spec.ts e2e/landing.spec.ts e2e/legal.spec.ts --project chromium` |
| **Full suite command** | Above + `npx tsx scripts/test-websocket.ts` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's specific verify command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-T1 | 94-01 | 1 | BAPI-21, BAPI-22 | playwright | `cd frontend && npx playwright test e2e/health-endpoints.spec.ts e2e/webhooks.spec.ts --project chromium` | W0 | pending |
| 01-T2 | 94-01 | 1 | BAPI-20 | standalone-tsx | `cd frontend && npx tsx scripts/test-websocket.ts` | W0 | pending |
| 02-T1 | 94-02 | 1 | FE-15 | tsc | `cd frontend && npx tsc --noEmit` | W0 | pending |
| 02-T2 | 94-02 | 1 | FE-15 | playwright | `cd frontend && npx playwright test e2e/tasks.spec.ts --project chromium` | W0 | pending |
| 03-T1 | 94-03 | 1 | FE-09, FE-16 | playwright | `cd frontend && npx playwright test e2e/dashboard.spec.ts e2e/analytics.spec.ts --project chromium` | W0 | pending |
| 03-T2 | 94-03 | 1 | FE-17, FE-18 | playwright | `cd frontend && npx playwright test e2e/landing.spec.ts e2e/legal.spec.ts --project chromium` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

All test files are created by their respective tasks (no separate Wave 0 needed):

- Plan 01 Task 1 creates: `frontend/e2e/health-endpoints.spec.ts`, `frontend/e2e/webhooks.spec.ts`
- Plan 01 Task 2 creates: `frontend/scripts/test-websocket.ts`
- Plan 02 Task 2 creates: `frontend/e2e/tasks.spec.ts`
- Plan 03 Task 1 creates: `frontend/e2e/dashboard.spec.ts`, `frontend/e2e/analytics.spec.ts`
- Plan 03 Task 2 creates: `frontend/e2e/landing.spec.ts`, `frontend/e2e/legal.spec.ts`

*Existing Playwright infrastructure covers all test execution needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard drag-and-drop layout rearrange | FE-09 | react-grid-layout drag simulation unreliable in CI | Open dashboard, drag widget, verify new position persists after refresh |

*All other behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 — test files created by their own tasks
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
