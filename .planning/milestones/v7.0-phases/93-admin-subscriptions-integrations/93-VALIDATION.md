---
phase: 93
slug: admin-subscriptions-integrations
status: draft
nyquist_compliant: true
wave_0_complete: true
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

| Task ID | Plan | Wave | Requirements | Test Type | Automated Command | File Exists | Status |
|---------|------|------|--------------|-----------|-------------------|-------------|--------|
| 93-01-T1 | 01 | 1 | BAPI-08, BAPI-09 | unit+contract | `npx jest --testPathPattern="labels\|provider-config\|google-oauth\|imap\|providers.contract" --no-coverage --passWithNoTests` | ✅ | ⬜ pending |
| 93-01-T2 | 01 | 1 | BAPI-10, BAPI-11 | unit+contract | `npx jest --testPathPattern="subscription\|usage-tracking\|quota.guard\|consent\|legal-acceptance\|account-deletion\|data-export\|gdpr-guards" --no-coverage --passWithNoTests` | ✅ | ⬜ pending |
| 93-02-T1 | 02 | 1 | BAPI-17, BAPI-18 | unit+contract | `npx jest --testPathPattern="admin.contract\|orgs.contract\|tenant.service" --no-coverage --passWithNoTests` | ✅ | ⬜ pending |
| 93-02-T2 | 02 | 1 | BAPI-19 | unit | `npx jest --testPathPattern="telegram" --no-coverage --passWithNoTests` | ✅ | ⬜ pending |
| 93-03-T1 | 03 | 2 | FE-10, FE-20 | type-check+code-review | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 93-03-T2 | 03 | 2 | FE-10 | checkpoint:human-verify | Browser verification of Settings page | N/A | ⬜ pending |
| 93-04-T1 | 04 | 2 | FE-11, FE-19 | type-check+E2E attempt | `cd frontend && npx tsc --noEmit` + `npx playwright test e2e/admin.spec.ts e2e/organizations.spec.ts` | ✅ | ⬜ pending |
| 93-04-T2 | 04 | 2 | FE-11, FE-19 | checkpoint:human-verify | Browser verification of Admin + Org pages | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None. All test files referenced in plans already exist in the codebase:

- `backend/src/modules/subscription/services/__tests__/subscription.service.spec.ts` — exists
- `backend/src/modules/compliance/__tests__/consent.service.spec.ts` (+ legal-acceptance, consent.guard, account-deletion, data-export, gdpr-guards-integration) — all exist
- `backend/src/modules/tenants/services/__tests__/tenant.service.spec.ts` — exists
- `backend/src/modules/telegram/controllers/__tests__/telegram-settings.controller.spec.ts` (+ telegram-webhook.controller, telegram-bot.service, telegram-webhook.service, reminder-email-monitor.service, telegram-scheduler.service) — all exist
- `frontend/e2e/admin.spec.ts` — exists
- `frontend/e2e/organizations.spec.ts` — exists

FE-10 (Settings page) and FE-20 (Provider OAuth) have no dedicated E2E tests. These are verified via type-check + code review + human browser checkpoint (see Manual-Only Verifications below).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings page renders all 10 sections | FE-10 | No dedicated E2E test; visual verification needed | Navigate `/dashboard/settings`, click each sidebar section |
| Google/Microsoft OAuth flow | BAPI-09, FE-20 | Requires real OAuth consent screen | Connect provider in browser, verify callback completes |
| Provider connection cards render | FE-20 | Visual verification of connect/disconnect CTAs | Check Email Accounts section in Settings |
| Impersonation as admin | BAPI-17, FE-11 | Session cookie swap requires manual browser | Login as admin, click impersonate, verify user context switches |
| Telegram webhook delivery | BAPI-19 | Requires external Telegram bot API | Send test webhook, verify backend processes it |
| Billing/subscription UI | FE-10 | No dedicated E2E; visual + functional | Navigate to Settings > Billing, verify usage display and CTAs |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or human-verify checkpoint
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none needed -- all test files exist)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
