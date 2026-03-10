---
phase: 65
slug: fix-nextjs-middleware
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx playwright test e2e/middleware-redirects.spec.ts` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npx playwright test e2e/middleware-redirects.spec.ts`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 65-01-01 | 01 | 1 | FEUI-04 | e2e | `cd frontend && npx playwright test e2e/middleware-redirects.spec.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Non-onboarded user redirected from /dashboard to /onboarding | FEUI-04b | No E2E test for onboarding state | 1. Create user without org 2. Navigate to /dashboard 3. Verify redirect to /onboarding |
| /dashboard/invitations/accept exempt from onboarding redirect | FEUI-04c | No E2E test for invitation exemption | 1. Create non-onboarded user 2. Navigate to /dashboard/invitations/accept 3. Verify no redirect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
