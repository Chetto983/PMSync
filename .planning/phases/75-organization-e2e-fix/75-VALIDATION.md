---
phase: 75
slug: organization-e2e-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.x |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `cd frontend && npx playwright test e2e/organizations.spec.ts --project=chromium` |
| **Full suite command** | `cd frontend && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx playwright test e2e/organizations.spec.ts --project=chromium`
- **After every plan wave:** Run `cd frontend && npx playwright test --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 75-01-01 | 01 | 1 | FE2E-01 | migration | `cd backend && npx prisma migrate dev` | ❌ W0 | ⬜ pending |
| 75-01-02 | 01 | 1 | FE2E-01 | config | N/A (code change) | ✅ | ⬜ pending |
| 75-02-01 | 02 | 2 | FE2E-01 | E2E | `cd frontend && npx playwright test e2e/organizations.spec.ts --project=chromium` | ✅ (skipped) | ⬜ pending |
| 75-03-01 | 03 | 2 | FE2E-01 | config | `cd frontend && npx playwright test --project=chromium` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Prisma migration for `metadata` column — must run before any test can pass
- [ ] `describe.skip` must be changed to `describe` before test execution

*Existing infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Railway migration deploy | FE2E-01 | Deployment env | Run `prisma migrate deploy` on Railway after merging |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
