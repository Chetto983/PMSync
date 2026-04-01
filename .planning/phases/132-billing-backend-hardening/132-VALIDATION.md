---
phase: 132
slug: billing-backend-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 132 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (NestJS default) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern=subscription --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern=subscription --no-coverage`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 132-01-01 | 01 | 1 | BILL-02 | unit | `npx jest --testPathPattern=autumn-webhook` | ❌ W0 | ⬜ pending |
| 132-01-02 | 01 | 1 | BILL-02 | unit | `npx jest --testPathPattern=autumn-webhook` | ❌ W0 | ⬜ pending |
| 132-01-03 | 01 | 1 | BILL-02 | unit | `npx jest --testPathPattern=autumn-webhook` | ❌ W0 | ⬜ pending |
| 132-02-01 | 02 | 2 | BILL-04 | unit | `npx jest --testPathPattern=subscription-lifecycle` | ❌ W0 | ⬜ pending |
| 132-02-02 | 02 | 2 | BILL-04 | unit | `npx jest --testPathPattern=subscription-lifecycle` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/subscription/services/__tests__/autumn-webhook.service.spec.ts` — stubs for BILL-02
- [ ] `backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts` — stubs for BILL-04

*Existing infrastructure covers framework and fixtures.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Svix signature verification with real webhook | BILL-02 | Requires Autumn test mode webhook delivery | Send test event from Autumn dashboard, verify 200 response |
| Stripe billing portal redirect | BILL-04 | Requires active Stripe customer session | Click "Manage Billing" in UI, verify redirect to Stripe portal |
| Payment failure notification email | BILL-02 | Requires SendGrid delivery + real failure event | Simulate payment failure in Autumn, check email delivery |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
