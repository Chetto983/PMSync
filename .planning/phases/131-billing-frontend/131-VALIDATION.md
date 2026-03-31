---
phase: 131
slug: billing-frontend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 131 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend) / vitest (frontend) |
| **Config file** | `backend/jest.config.ts` / `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npm run type-check && cd ../backend && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 131-01-01 | 01 | 1 | BILL-01 | type-check | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stripe checkout redirect | BILL-01 | Requires real Stripe session | Navigate to pricing, click upgrade, verify redirect to Stripe checkout |
| Billing portal redirect | BILL-01 | Requires active Stripe customer | Click "Manage Billing", verify redirect to Stripe portal |
| Autumn webhook handling | BILL-01 | Requires real Autumn integration | Trigger plan change via Stripe test mode, verify webhook updates subscription state |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
