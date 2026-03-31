---
phase: 131
slug: billing-frontend
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| **Full suite command** | `cd frontend && npx tsc --noEmit && npx jest --testPathPattern=billing --no-coverage && cd ../backend && npx tsc --noEmit` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit && npx jest --testPathPattern=billing --no-coverage`
- **After every plan wave:** Run full suite command (frontend tsc + jest billing + backend tsc)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 131-01-01 | 01 | 1 | BILL-01 | type-check + unit | `cd frontend && npx tsc --noEmit && npx jest --testPathPattern=billing --no-coverage` | Yes | pending |
| 131-01-02 | 01 | 1 | BILL-01 | grep wiring + type-check | `grep -c "usePricingTable" frontend/components/billing/PricingTable.tsx && cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` | Yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. `use-billing.test.ts` exists with query key construction and state tests. No new test scaffolding needed.*

---

## Nyquist Justification

Task 1 runs both `tsc --noEmit` AND `jest --testPathPattern=billing` in its verify block. Task 1 only modifies sx prop values and locale strings (no logic changes), so the existing billing jest suite (which tests query-key construction, hook states, and mutation flows) provides behavioral coverage alongside the type-check. Task 2 adds grep-based wiring verification for BILL-01 sub-criteria plus full type-check on both frontend and backend.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stripe checkout redirect | BILL-01 | Requires real Stripe session | Navigate to pricing, click upgrade, verify redirect to Stripe checkout |
| Billing portal redirect | BILL-01 | Requires active Stripe customer | Click "Manage Billing", verify redirect to Stripe portal |
| Autumn webhook handling | BILL-01 | Requires real Autumn integration | Trigger plan change via Stripe test mode, verify webhook updates subscription state |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** signed off
