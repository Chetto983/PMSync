---
phase: 89
slug: auth-onboarding-verification
status: draft
nyquist_compliant: true
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 89-01-T1 | 01 | 1 | BAPI-01, FE-01 | E2E | `npx playwright test e2e/auth-login.spec.ts e2e/auth-register.spec.ts e2e/auth-forgot-password.spec.ts --project=chromium` | pending |
| 89-01-T2 | 01 | 1 | BAPI-01, FE-01 | E2E | `npx playwright test e2e/auth-reset-password.spec.ts e2e/auth-verify-email.spec.ts --project=chromium` | pending |
| 89-01-T3 | 01 | 1 | BAPI-01, FE-01 | E2E | `npx playwright test e2e/auth-2fa.spec.ts --project=chromium` | pending |
| 89-02-T1 | 02 | 1 | BAPI-24 | API | `npx playwright test e2e/auth-profile-api.spec.ts --project=chromium` | pending |
| 89-02-T2 | 02 | 1 | FE-02 | E2E | `npx playwright test e2e/onboarding.spec.ts --project=chromium` | pending |

*Status: pending / green / red / flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth consent screens (Google, Microsoft) | BAPI-01 | External provider consent cannot be automated | Verify OAuth buttons render; manual login via provider |

---

## Validation Sign-Off

- [x] All tasks have direct `<automated>` verify blocks in their plans
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
