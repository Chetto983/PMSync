---
phase: 93
slug: admin-subscriptions-integrations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 93 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), Playwright (E2E) |
| **Config file** | `backend/jest.config.ts`, `frontend/playwright.config.ts` |
| **Quick run command** | `cd backend && npx jest --passWithNoTests --testPathPattern="{pattern}" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage && cd ../frontend && npx playwright test` |
| **Estimated runtime** | ~60 seconds (backend unit), ~120 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 93-01-01 | 01 | 1 | BAPI-08 | E2E | `npx playwright test admin` | ✅ | ⬜ pending |
| 93-01-02 | 01 | 1 | BAPI-09 | unit+curl | `npx jest --testPathPattern=label` | ✅ | ⬜ pending |
| 93-02-01 | 02 | 1 | BAPI-10 | E2E | `npx playwright test provider` | ✅ | ⬜ pending |
| 93-02-02 | 02 | 1 | BAPI-11 | unit+curl | `npx jest --testPathPattern=subscription` | ❌ W0 | ⬜ pending |
| 93-03-01 | 03 | 1 | BAPI-17 | unit+curl | `npx jest --testPathPattern=compliance` | ❌ W0 | ⬜ pending |
| 93-03-02 | 03 | 1 | BAPI-18 | unit+curl | `npx jest --testPathPattern=tenant` | ❌ W0 | ⬜ pending |
| 93-03-03 | 03 | 1 | BAPI-19 | unit | `npx jest --testPathPattern=telegram` | ❌ W0 | ⬜ pending |
| 93-04-01 | 04 | 2 | FE-10 | E2E | `npx playwright test admin` | ✅ | ⬜ pending |
| 93-04-02 | 04 | 2 | FE-11 | E2E | `npx playwright test settings` | ❌ W0 | ⬜ pending |
| 93-04-03 | 04 | 2 | FE-19 | E2E | `npx playwright test provider` | ✅ | ⬜ pending |
| 93-04-04 | 04 | 2 | FE-20 | E2E | `npx playwright test organization` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/subscription/__tests__/subscription.controller.spec.ts` — stubs for BAPI-11
- [ ] `backend/src/modules/compliance/__tests__/compliance.controller.spec.ts` — stubs for BAPI-17
- [ ] `backend/src/modules/tenants/__tests__/tenants.controller.spec.ts` — stubs for BAPI-18
- [ ] `backend/src/modules/telegram/__tests__/telegram.controller.spec.ts` — stubs for BAPI-19
- [ ] `frontend/e2e/settings.spec.ts` — stubs for FE-11

*Existing infrastructure covers admin (E2E), provider (E2E), and organization (E2E) requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google/Microsoft OAuth flow | BAPI-10, FE-19 | Requires real OAuth consent screen | Connect provider in browser, verify callback completes |
| Impersonation as admin | BAPI-08, FE-10 | Session cookie swap requires manual browser | Login as admin, click impersonate, verify user context switches |
| Telegram webhook delivery | BAPI-19 | Requires external Telegram bot API | Send test webhook, verify backend processes it |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
