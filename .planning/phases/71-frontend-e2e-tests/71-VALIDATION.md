---
phase: 71
slug: frontend-e2e-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 (already installed) |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `cd frontend && npx playwright test e2e/smoke.spec.ts --project=chromium` |
| **Full suite command** | `cd frontend && npx playwright test --project=chromium` |
| **Estimated runtime** | ~120-180 seconds (real backend required) |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx playwright test e2e/smoke.spec.ts --project=chromium` (smoke test — backend health + frontend load)
- **After every plan wave:** Run the specific spec file for that plan (`npx playwright test e2e/organizations.spec.ts --project=chromium`, etc.)
- **Before `/gsd:verify-work`:** Full suite must be green (`npx playwright test --project=chromium`)
- **Max feedback latency:** ~30 seconds (smoke), ~180 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 71-01-01 | 01 | 0 | FE2E-01,02,03,04 | e2e | `npx playwright test e2e/smoke.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 71-02-01 | 02 | 1 | FE2E-01 | e2e | `npx playwright test e2e/organizations.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 71-03-01 | 03 | 2 | FE2E-02 | e2e | `npx playwright test e2e/admin.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 71-04-01 | 04 | 3 | FE2E-03 | e2e | `npx playwright test e2e/onboarding.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 71-05-01 | 05 | 4 | FE2E-04 | e2e | `npx playwright test e2e/security.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/prisma/seed.ts` — add `member@pmsync.local` (role: 'user', onboardingComplete: true), fix `admin@pmsync.local` to role: 'super-admin'
- [ ] `frontend/e2e/auth.setup.member.ts` — second auth setup file for member user
- [ ] `frontend/playwright.config.ts` — add `setup-member` project, add `setup-member` to dependencies of all browser projects
- [ ] `npm install --save-dev otplib` — TOTP code generation library (frontend/)
- [ ] `playwright/.auth/` directory exists (already exists from Phase 66)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Passkey registration in Firefox/WebKit | FE2E-04 | CDP virtual authenticator is Chromium-only | Manual test: open security settings in Firefox, click "Add passkey", verify passkey dialog appears. Cannot automate without hardware authenticator. |
| Email provider OAuth flow (full connect) | FE2E-03 | Real OAuth requires external provider credentials | Manual test: configure a real Google/Microsoft provider in `.env.test`, run onboarding wizard, click connect, complete OAuth flow. Skip in CI. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
