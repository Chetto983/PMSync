---
phase: 133
slug: billing-e2e-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 133 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js scripts (.mjs) with native fetch |
| **Config file** | none — scripts are standalone |
| **Quick run command** | `node backend/scripts/validate-billing-e2e.mjs` |
| **Full suite command** | `node backend/scripts/validate-billing-e2e.mjs --full` |
| **Estimated runtime** | ~30 seconds (network-bound against Railway) |

---

## Sampling Rate

- **After every task commit:** Run `node backend/scripts/validate-billing-e2e.mjs`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 133-01-01 | 01 | 1 | BILL-03 | e2e script | `node backend/scripts/validate-billing-e2e.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/scripts/validate-billing-e2e.mjs` — E2E validation script
- [ ] Railway deployment accessible with valid auth session

*Existing validation script pattern from validate-sprint05-06-real.mjs covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Payment failure simulation | BILL-03 SC3 | Requires Autumn dashboard or Stripe test card to trigger past_due | 1. Use Autumn dashboard "Send Test Event" for invoice.payment_failed 2. Verify webhook processes event 3. Check subscription state transitions correctly 4. Retry payment via dashboard 5. Verify state returns to active |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
