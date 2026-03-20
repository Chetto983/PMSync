---
phase: 89
slug: auth-onboarding-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 89 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `cd frontend && npx playwright test e2e/auth-login.spec.ts --project=chromium` |
| **Full suite command** | `cd frontend && E2E_BASE_URL=<railway-url> E2E_NO_WEB_SERVER=1 npx playwright test e2e/auth-*.spec.ts e2e/onboarding.spec.ts --project=chromium` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx playwright test e2e/<changed-spec>.spec.ts --project=chromium`
- **After every plan wave:** Run `cd frontend && npx playwright test e2e/auth-*.spec.ts e2e/onboarding.spec.ts --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 89-01-01 | 01 | 1 | BAPI-01 | E2E | `npx playwright test e2e/auth-login.spec.ts` | ❌ W0 | ⬜ pending |
| 89-01-02 | 01 | 1 | BAPI-01 | E2E | `npx playwright test e2e/auth-register.spec.ts` | ❌ W0 | ⬜ pending |
| 89-01-03 | 01 | 1 | BAPI-01 | E2E | `npx playwright test e2e/auth-forgot-password.spec.ts` | ❌ W0 | ⬜ pending |
| 89-01-04 | 01 | 1 | BAPI-01 | E2E | `npx playwright test e2e/auth-reset-password.spec.ts` | ❌ W0 | ⬜ pending |
| 89-01-05 | 01 | 1 | BAPI-01 | E2E | `npx playwright test e2e/auth-verify-email.spec.ts` | ❌ W0 | ⬜ pending |
| 89-02-01 | 02 | 2 | BAPI-01 | E2E | `npx playwright test e2e/auth-2fa.spec.ts` | ❌ W0 | ⬜ pending |
| 89-03-01 | 03 | 2 | BAPI-24 | API | `npx playwright test e2e/auth-profile-api.spec.ts` | ❌ W0 | ⬜ pending |
| 89-04-01 | 04 | 3 | FE-02 | E2E | `npx playwright test e2e/onboarding.spec.ts` | ✅ rewrite | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/e2e/auth-login.spec.ts` — stubs for BAPI-01 login + FE-01
- [ ] `frontend/e2e/auth-register.spec.ts` — stubs for BAPI-01 register + FE-01
- [ ] `frontend/e2e/auth-forgot-password.spec.ts` — stubs for BAPI-01 forgot-pw + FE-01
- [ ] `frontend/e2e/auth-reset-password.spec.ts` — stubs for BAPI-01 reset-pw + FE-01
- [ ] `frontend/e2e/auth-verify-email.spec.ts` — stubs for BAPI-01 verify-email + FE-01
- [ ] `frontend/e2e/auth-2fa.spec.ts` — stubs for BAPI-01 2FA + FE-01
- [ ] `frontend/e2e/auth-profile-api.spec.ts` — stubs for BAPI-24
- [ ] `frontend/e2e/onboarding.spec.ts` — rewrite for FE-02

*Existing infrastructure (Playwright, auth setup projects, fixtures) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth consent screens (Google, Microsoft) | BAPI-01 | External provider consent cannot be automated | Verify OAuth buttons render; manual login via provider |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
