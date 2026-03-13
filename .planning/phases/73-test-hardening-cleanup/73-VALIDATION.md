---
phase: 73
slug: test-hardening-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 73 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 (backend), Playwright (frontend E2E) |
| **Config file** | `backend/jest.config.js`, `frontend/playwright.config.ts` |
| **Quick run command** | `cd backend && npm run contract-test` |
| **Full suite command** | `cd backend && npx jest --forceExit` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npm run contract-test && npx jest --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 73-01-01 | 01 | 1 | BINT-03 | integration | `cd backend && npm run contract-test` | ✅ | ⬜ pending |
| 73-02-01 | 02 | 1 | FE2E-04 | e2e | `cd frontend && npx playwright test security.spec.ts` | ✅ | ⬜ pending |
| 73-03-01 | 03 | 1 | INFRA-03 | e2e | `cd frontend && npx playwright test onboarding.spec.ts` | ✅ | ⬜ pending |
| 73-04-01 | 04 | 1 | INFRA-03 | integration | `cd backend && npx jest --testPathPatterns=subscription --forceExit` | ✅ | ⬜ pending |
| 73-05-01 | 05 | 2 | INFRA-03 | e2e | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Verify `openapi-spec.json` can be generated locally with test DB running
- [ ] Verify passkey `test.skip` actually fires on non-Chromium projects

*Existing infrastructure covers most phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Passkey skip on non-Chromium | FE2E-04 | Requires multiple browser engines | Run `npx playwright test security.spec.ts --project=firefox` and verify skip message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
