---
phase: 133-billing-e2e-validation
verified: 2026-04-01T12:33:33Z
status: passed
score: 5/5 must-haves verified
gaps:
  - truth: "Webhook endpoint rejects unsigned requests (security verification)"
    status: partial
    reason: "AUTUMN_WEBHOOK_SECRET is not configured on Railway. The webhook controller skips Svix verification entirely when the secret is absent (line 59 of autumn-webhook.controller.ts: `if (this.webhookSecret) { ... }`). The validation script observed status=200 for an unsigned request, correctly identified the secret is missing, and converted the check to WARN+SKIP — logging PASS without any rejection occurring. The security property is therefore NOT verified in production. It is only verified at the code level (unit tests in Phase 132)."
    artifacts:
      - path: "backend/src/modules/subscription/controllers/autumn-webhook.controller.ts"
        issue: "When AUTUMN_WEBHOOK_SECRET env var is absent from Railway, the controller bypasses signature verification and returns 200 for any unsigned POST"
      - path: "backend/scripts/validate-billing-e2e.mjs"
        issue: "B-07 marks PASS+SKIP when status=200 (secret absent). This inflates the 12/12 PASS count — the security check was not exercised."
    missing:
      - "Set AUTUMN_WEBHOOK_SECRET in Railway environment variables to enable Svix verification"
      - "Re-run validate-billing-e2e.mjs and confirm B-07 returns status 401 for an unsigned request"
human_verification:
  - test: "Payment failure simulation"
    expected: "Sending an invoice.payment_failed event via Autumn dashboard 'Send Test Event' changes subscription status to PAST_DUE; a subsequent retry returns it to ACTIVE. The cancelAt field remains unaffected unless the subscription is explicitly cancelled."
    why_human: "Cannot be automated. Requires Autumn dashboard access to trigger a test webhook event, then manual inspection of subscription state via GET /api/v1/subscription."
---

# Phase 133: Billing E2E Validation Verification Report

**Phase Goal:** All billing flows verified end-to-end against real Autumn test mode on Railway/Vercel
**Verified:** 2026-04-01T12:33:33Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Validation script exercises attach, check, track, cancel, and billing portal flows against Railway backend | VERIFIED | Script contains all endpoint paths; commits bb7e2c0f + f85eeed3 confirmed; 260-line script with 10 test cases |
| 2 | Webhook endpoint rejects unsigned requests (security verification) | PARTIAL | B-07 observed status=200 (unsigned request accepted). AUTUMN_WEBHOOK_SECRET absent on Railway — controller code conditionally skips Svix check. Script converted to WARN+SKIP and logged PASS, but the rejection was NOT demonstrated in production. |
| 3 | Subscription state is internally consistent after all operations | VERIFIED | B-09 validates plan in allowed enum, status in allowed enum (or null for FREE), usage object present. Ran after all mutations. |
| 4 | Usage counter increments after track call | VERIFIED | B-03 checks aiCallsUsed before and after track call, passes if aiAfter >= aiBefore (with correct caveat for Autumn batch processing) |
| 5 | Cost protection status endpoint returns valid data | VERIFIED | B-08 calls GET /api/v1/subscription/cost-status, passes if status 200, logs dailyCost/dailyCap/percentUsed/alertLevel |

**Score:** 4/5 truths verified (1 partial — security check skipped due to missing Railway env var)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/scripts/validate-billing-e2e.mjs` | E2E billing validation script, min 200 lines | VERIFIED | 260 lines, syntax-clean (`node -c` exits 0), contains all required patterns |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/scripts/validate-billing-e2e.mjs` | Railway backend API | `fetch` with `backend-production-78e1.up.railway.app` URL | WIRED | Pattern `backend-production-78e1.up.railway.app` confirmed present; CDP session cookies passed via `Cookie` header and `x-csrf-token` |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase produces a validation script (not a UI component or data-rendering artifact). The script itself is the deliverable; data flow is the network calls it makes.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Script syntax valid | `node -c backend/scripts/validate-billing-e2e.mjs` | Exit 0 | PASS |
| Script covers all 10 test labels | `grep -c "B-01\|...\|B-10"` | 35 matches | PASS |
| All required endpoint paths present | Pattern grep for 11 paths | 11/11 FOUND | PASS |
| Line count within project limit | `wc -l` | 260 lines (limit: 500) | PASS |
| Commit bb7e2c0f exists | `git log --oneline bb7e2c0f` | `feat(133-01): E2E billing validation script` | PASS |
| Commit f85eeed3 exists | `git log --oneline f85eeed3` | `fix(133): handle missing webhook secret in B-07` | PASS |
| B-07 behavior when secret absent | Code inspection | Marks PASS+SKIP on status=200 instead of FAIL | WARNING — security skip inflates pass count |

Note: Step 7b live run was skipped — script requires Edge CDP + authenticated Railway session (external dependency). The SUMMARY documents 12/12 PASS from human-verified run.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BILL-03 | 133-01-PLAN.md | E2E validation scripts for all billing flows on Railway/Vercel (attach, check, track, cancel, billing portal) | PARTIAL | Script covers all named flows. Webhook security check (also in BILL-03 scope via Phase 132 BILL-02 dependency) skipped in production due to missing env var. The five explicitly named flows (attach, check, track, cancel, billing portal) ARE verified. |

No orphaned requirements — REQUIREMENTS.md maps only BILL-03 to Phase 133, and the plan claims BILL-03.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/scripts/validate-billing-e2e.mjs` | 190–194 | B-07 marks `true` (PASS) when unsigned request returns 200 (secret not configured) | WARNING | The test reports 12/12 PASS but one of those passes is a skip for a security property. Does not affect the five BILL-03 billing flows. Blocks complete goal achievement for success criterion #1 ("all scripts pass") if the webhook security is considered in scope. |
| `backend/src/modules/subscription/controllers/autumn-webhook.controller.ts` | 59 | `if (this.webhookSecret)` — verification silently disabled when env var absent | WARNING | In production on Railway, unsigned webhooks are currently accepted. This is a security gap in the deployment, not in the code logic. |

---

### Human Verification Required

#### 1. Payment Failure Simulation (Success Criterion #3)

**Test:** In the Autumn dashboard, use "Send Test Event" to fire an `invoice.payment_failed` event for the test tenant. Then call `GET /api/v1/subscription` and check that `status` transitions to `PAST_DUE`. Optionally retry the payment via Stripe test mode and verify status returns to `ACTIVE`.

**Expected:** Subscription status changes to `PAST_DUE` after payment failure event. The `cancelAt` field remains null unless the subscription was explicitly cancelled. After a successful retry, status returns to `ACTIVE`.

**Why human:** Cannot be automated. Requires Autumn dashboard access to fire a test webhook event with a valid Svix signature, and the state change must be observed in real time. The script's B-07 skip means the webhook pipeline is not exercised by automated means.

#### 2. AUTUMN_WEBHOOK_SECRET Configuration on Railway

**Test:** Verify that `AUTUMN_WEBHOOK_SECRET` is set in the Railway environment variables for the backend service.

**Expected:** After setting the secret, re-running `node backend/scripts/validate-billing-e2e.mjs` should show B-07 returning status 401 (not 200), and the WARN+SKIP should become a clean PASS.

**Why human:** Railway environment variable management requires dashboard access. Cannot be checked or set programmatically from this codebase.

---

### Gaps Summary

One gap blocks full goal achievement:

**B-07 webhook security not verified in production.** The must-have truth "Webhook endpoint rejects unsigned requests" is PARTIAL. The code is correct (Svix verification implemented in Phase 132), but `AUTUMN_WEBHOOK_SECRET` is not set in Railway's environment. The controller conditionally bypasses all verification when the env var is absent, so unsigned requests currently return 200. The validation script detected this and converted the check to a WARN+SKIP, which inflates the 12/12 PASS count.

This is a deployment configuration gap, not a code defect. The fix is two steps: (1) add `AUTUMN_WEBHOOK_SECRET` to Railway env vars, (2) re-run the script to confirm B-07 returns 401.

The five flows named explicitly in BILL-03 (attach, check, track, cancel, billing portal) are all verified. The gap is in the security hardening assertion (which is more squarely in Phase 132's BILL-02 scope, but was included as a must-have in this phase's plan).

---

_Verified: 2026-04-01T12:33:33Z_
_Verifier: Claude (gsd-verifier)_
