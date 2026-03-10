---
phase: 60
slug: middleware-auth-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 (E2E) + manual verification |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `npx playwright test tests/e2e/middleware-auth.spec.ts` |
| **Full suite command** | `npx playwright test tests/e2e/middleware-auth.spec.ts` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test tests/e2e/middleware-auth.spec.ts`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 60-01-01 | 01 | 1 | FEUI-04 | file check | `test -f frontend/middleware.ts && echo PASS` | ✅ | ⬜ pending |
| 60-01-02 | 01 | 1 | FEUI-04 | grep | `grep "export function middleware" frontend/middleware.ts` | ✅ | ⬜ pending |
| 60-01-03 | 01 | 1 | FEUI-04 | E2E | `npx playwright test tests/e2e/middleware-auth.spec.ts` | ❌ W0 | ⬜ pending |
| 60-02-01 | 02 | 1 | FEUI-04 | grep | `grep "cookieCache" backend/src/common/auth/better-auth.instance.ts` | ✅ | ⬜ pending |
| 60-02-02 | 02 | 1 | FEUI-04 | file check | `test ! -f frontend/lib/auth.ts && echo PASS` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/middleware-auth.spec.ts` — E2E test stubs for redirect scenarios
- [ ] Playwright config already exists — no framework install needed

*Existing Playwright infrastructure covers framework needs. Only new spec file required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No content flash on redirect | FEUI-04 | Timing-sensitive visual check | Navigate to `/dashboard` unauthenticated, verify no brief dashboard render before redirect |
| Staging deployment redirect | FEUI-04 | Requires deployed environment | Run E2E suite against `E2E_STAGING_URL` after deploy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
