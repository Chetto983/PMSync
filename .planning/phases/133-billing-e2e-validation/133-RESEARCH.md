# Phase 133: Billing E2E Validation - Research

**Researched:** 2026-04-01
**Domain:** E2E validation scripts for billing flows (Autumn SDK test mode, Railway/Vercel deployment)
**Confidence:** HIGH

## Summary

Phase 133 is a **pure validation phase** -- no new application code is needed. All billing infrastructure is already complete from Phase 131 (frontend) and Phase 132 (backend hardening). The backend has 6 services, 3 controllers, a webhook receiver with Svix verification, idempotent event processing, lifecycle management, and real email alerts. The frontend has 7 billing components, 12+ TanStack Query hooks, and a full API client with 14 functions.

The deliverable is a set of Node.js validation scripts (`.mjs`) that exercise every billing flow end-to-end against the deployed Railway backend + Vercel frontend, using authenticated sessions obtained via Edge CDP (the established pattern from existing validation scripts). The scripts must cover: customer creation (attach), entitlement gating (check), usage metering (track), cancellation, billing portal redirect, webhook processing, and subscription state consistency after payment failure simulation.

**Primary recommendation:** Create one main validation script at `backend/scripts/validate-billing-e2e.mjs` following the exact pattern of `validate-sprint05-06-real.mjs` (CDP session extraction, color-coded PASS/FAIL, summary output). Autumn's test mode uses Stripe test keys -- the backend must have `AUTUMN_SECRET_KEY` set to a test-mode key (starts with `am_sk_test_` or similar). Payment failure simulation relies on Stripe test card `4000000000000341` which triggers `past_due` via Autumn's webhook pipeline. The billing portal URL can only be verified as returning a valid Stripe-hosted URL (cannot automate portal interaction).

## Project Constraints (from CLAUDE.md)

### Enforced Directives
- **NEVER save working files to root.** Scripts go in `backend/scripts/`.
- **Max 500 lines per file.** Split if needed.
- **SCOPE CONTROL.** Validation scripts only -- no new features, no refactors.
- **Post-Edit Validation:** `cd backend && npx tsc --noEmit` after any `.ts` edits (scripts are `.mjs` so this applies only if touching TS files).
- **Multi-tenant rule:** Scripts must use tenant-scoped API calls (via session auth).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BILL-03 | E2E validation scripts for all billing flows on Railway/Vercel (attach, check, track, cancel, billing portal) | All backend endpoints exist: `POST /autumn/attach`, `POST /autumn/check`, `POST /autumn/track`, `POST /autumn/cancel`, `POST /autumn/billing_portal`, `GET /subscription`, `GET /subscription/usage`, `GET /subscription/cost-status`. Existing validation script pattern (`validate-sprint05-06-real.mjs`) provides session acquisition via Edge CDP, authenticated API calls, and PASS/FAIL reporting. |
</phase_requirements>

## Standard Stack

### Core (Already Exists -- No Installation)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js native `fetch` | 22.x | HTTP requests in validation scripts | Used by all existing `.mjs` validation scripts |
| `ws` (dynamic import) | installed | WebSocket for Edge CDP connection | Pattern from `validate-sprint05-06-real.mjs` |
| Edge CDP (port 9222) | - | Session cookie extraction from logged-in browser | Established E2E pattern |

### No New Dependencies
Validation scripts are standalone `.mjs` files using only `fetch` and `ws` (already installed). No new packages required.

## Architecture Patterns

### Recommended File Structure
```
backend/scripts/
└── validate-billing-e2e.mjs     # Main E2E validation script (~300-400 lines)
```

### Pattern 1: CDP Session Extraction (Existing Pattern)
**What:** Connect to Edge DevTools Protocol to extract session cookies from an already-logged-in browser tab.
**When to use:** All E2E validation scripts that need authenticated API access.
**Source:** `backend/scripts/validate-sprint05-06-real.mjs`

```javascript
async function getSessionFromCDP() {
  const WebSocket = (await import('ws')).default;
  const pages = await fetch('http://localhost:9222/json/list').then(r => r.json());
  const target = pages.find(p => p.url.includes('vercel') || p.url.includes('pmsync'));
  if (!target) throw new Error('No PMSync page open in Edge');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Network.getAllCookies' })));
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id !== 1) return;
      const cookies = msg.result?.cookies || [];
      let session = '', csrf = '', csrfCookie = '';
      for (const c of cookies) {
        if (c.name.includes('session_token')) session = `${c.name}=${c.value}`;
        if (c.name === 'csrf' && c.domain.includes('backend')) {
          csrf = c.value;
          csrfCookie = `csrf=${c.value}`;
        }
      }
      ws.close();
      if (!session) return reject(new Error('No session cookie'));
      resolve({ cookie: `${session}; ${csrfCookie}`, csrf });
    });
    setTimeout(() => { ws.close(); reject(new Error('CDP timeout')); }, 5000);
  });
}
```

### Pattern 2: Authenticated API Helper (Existing Pattern)
**What:** Wrapper for `fetch` calls with session cookies and CSRF token.
**Source:** `backend/scripts/validate-sprint05-06-real.mjs`

```javascript
const BACKEND = 'https://backend-production-78e1.up.railway.app';

async function api(method, path, cookie, csrf, body) {
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const start = Date.now();
  const res = await fetch(`${BACKEND}/api/v1${path}`, opts);
  const latency = Date.now() - start;
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json?.data || json, latency };
}
```

### Pattern 3: PASS/FAIL Logging (Existing Pattern)
**What:** Color-coded test result logging with summary.
**Source:** `backend/scripts/validate-sprint05-06-real.mjs`

```javascript
const RESULTS = [];
function log(label, pass, detail = '') {
  const s = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`[${s}] ${label}${detail ? ' -- ' + detail : ''}`);
  RESULTS.push({ label, pass, detail });
}
```

### Anti-Patterns to Avoid
- **Don't create Jest/Vitest tests for E2E.** These are deployment validation scripts, not unit tests. Use standalone `.mjs` with `fetch`.
- **Don't hardcode tenant IDs.** Extract from session via `/api/auth/get-session`.
- **Don't attempt to complete Stripe Checkout programmatically.** The `attach` endpoint returns a `checkoutUrl` pointing to Stripe's hosted checkout page -- verifying it's a valid URL is sufficient.
- **Don't attempt to interact with billing portal UI.** The `billing_portal` endpoint returns a URL to Stripe's hosted portal -- verifying the URL is valid and starts with `https://billing.stripe.com` is sufficient.
- **Don't create application code or modify existing services.** This is a validation-only phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session authentication | Custom login flow | Edge CDP session extraction | Established pattern; avoids storing credentials |
| Test framework | Jest/Mocha/Vitest setup | Standalone `.mjs` with `fetch` + `log()` | Matches existing validation scripts |
| Stripe checkout automation | Puppeteer/Playwright flows | Validate `checkoutUrl` is a valid Stripe URL | Stripe checkout UI is third-party hosted; automation is brittle and unnecessary |
| Payment failure simulation | Direct Stripe API calls | Autumn SDK test mode + Stripe test cards | Autumn manages Stripe; use their test infrastructure |

## Common Pitfalls

### Pitfall 1: Autumn Not in Test Mode on Railway
**What goes wrong:** Validation scripts hit real payment flows, creating actual charges.
**Why it happens:** Railway env has production `AUTUMN_SECRET_KEY`.
**How to avoid:** Verify the Autumn key is a test-mode key before running the script. The script should check the subscription response and warn if it appears to be production. Alternatively, the script should only exercise read operations (check, track) and skip attach if it would create a real charge.
**Warning signs:** `checkoutUrl` pointing to live Stripe checkout.

### Pitfall 2: CSRF Token Missing on POST Requests
**What goes wrong:** POST requests to `/autumn/*` endpoints return 403 Forbidden.
**Why it happens:** The CSRF middleware blocks POST requests without the `x-csrf-token` header.
**How to avoid:** The CDP session extraction already captures the CSRF cookie value. Pass it as `x-csrf-token` header on all POST requests (existing pattern from `validate-sprint05-06-real.mjs`).
**Warning signs:** 403 responses on POST endpoints that work in the browser.

### Pitfall 3: Webhook Testing Requires Autumn Dashboard
**What goes wrong:** Cannot trigger webhook events programmatically without Autumn's dashboard or Svix CLI.
**Why it happens:** Webhooks are sent by Autumn/Svix, not by our application. We cannot simulate them by calling our own webhook endpoint without a valid Svix signature.
**How to avoid:** For webhook validation, verify the endpoint exists and responds to unsigned requests with 401 (signature verification). For end-to-end webhook flow testing, use Autumn dashboard's "Send Test Event" button (manual/human step). Document this as a manual verification item.
**Warning signs:** Trying to POST directly to `/webhooks/autumn` without Svix headers.

### Pitfall 4: Attach Creates a New Checkout Session Every Time
**What goes wrong:** Running the validation script multiple times creates multiple Stripe checkout sessions.
**Why it happens:** `POST /autumn/attach` always calls `autumn.attach()` which creates a new checkout session.
**How to avoid:** Only call attach if the current subscription is FREE (check first). If already on a paid plan, skip the attach test and note it as "already subscribed."
**Warning signs:** Orphaned checkout sessions in Stripe dashboard.

### Pitfall 5: Usage Tracking Modifies Real Counters
**What goes wrong:** `POST /autumn/track` increments the tenant's real usage counters in Autumn.
**Why it happens:** Track calls are idempotent-per-event but additive for usage.
**How to avoid:** Track a small amount (1 unit) of a non-critical feature. Verify the counter increased by checking `GET /subscription/usage` before and after. The counter will reflect the tracked amount, which is acceptable in test mode but should be noted.
**Warning signs:** Usage alerts triggered by test tracking.

## Code Examples

### Test Case: Subscription State Retrieval
```javascript
// GET /subscription -- verify basic subscription data shape
const sub = await api('GET', '/subscription', cookie);
log('B-01 Subscription endpoint', sub.status === 200,
  `plan=${sub.data?.plan}, status=${sub.data?.status}`);
log('B-01 Has usage stats', !!sub.data?.usage,
  `emails=${sub.data?.usage?.emailsProcessed}, ai=${sub.data?.usage?.aiCallsUsed}`);
```

### Test Case: Feature Check (Entitlement Gating)
```javascript
// POST /autumn/check -- verify entitlement gating
const check = await api('POST', '/autumn/check', cookie, csrf, {
  featureId: 'email-processing',
});
log('B-02 Feature check', check.status === 200,
  `allowed=${check.data?.allowed}, remaining=${check.data?.remaining}`);
```

### Test Case: Usage Tracking
```javascript
// GET usage before tracking
const usageBefore = await api('GET', '/subscription/usage', cookie);
const aiBefore = usageBefore.data?.aiCallsUsed || 0;

// POST /autumn/track -- track 1 AI call
const track = await api('POST', '/autumn/track', cookie, csrf, {
  featureId: 'ai-calls',
  amount: 1,
});
log('B-03 Usage tracking', track.status === 200 && track.data?.success === true);

// GET usage after tracking -- verify increment
const usageAfter = await api('GET', '/subscription/usage', cookie);
const aiAfter = usageAfter.data?.aiCallsUsed || 0;
log('B-03 Usage incremented', aiAfter >= aiBefore,
  `before=${aiBefore}, after=${aiAfter}`);
```

### Test Case: Billing Portal URL
```javascript
// POST /autumn/billing_portal -- verify portal URL generation
const portal = await api('POST', '/autumn/billing_portal', cookie, csrf, {});
log('B-04 Billing portal URL', portal.status === 200 && !!portal.data?.url,
  portal.data?.url ? `url=${portal.data.url.substring(0, 60)}...` : 'no url');
```

### Test Case: Cancel Flow
```javascript
// POST /autumn/cancel -- cancel subscription (only if on paid plan)
if (sub.data?.plan !== 'FREE') {
  const cancel = await api('POST', '/autumn/cancel', cookie, csrf, {
    productId: sub.data?.plan?.toLowerCase(),
  });
  log('B-05 Cancel subscription', cancel.status === 200 && cancel.data?.success === true);

  // Verify subscription state after cancel
  const afterCancel = await api('GET', '/subscription', cookie);
  log('B-05 Post-cancel state', afterCancel.data?.cancelAt != null,
    `cancelAt=${afterCancel.data?.cancelAt}, status=${afterCancel.data?.status}`);
} else {
  log('B-05 Cancel subscription', true, 'SKIPPED -- already on FREE plan');
}
```

### Test Case: Webhook Endpoint Exists (Unsigned Request Rejected)
```javascript
// POST /webhooks/autumn without Svix signature -- should be rejected
const webhookRes = await fetch(`${BACKEND}/webhooks/autumn`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'test', data: {} }),
});
log('B-06 Webhook rejects unsigned requests',
  webhookRes.status === 401 || webhookRes.status === 500,
  `status=${webhookRes.status}`);
```

### Test Case: Cost Protection Status
```javascript
const costStatus = await api('GET', '/subscription/cost-status', cookie);
log('B-07 Cost protection status', costStatus.status === 200,
  `dailyCost=${costStatus.data?.dailyCost}, cap=${costStatus.data?.dailyCap}, ` +
  `percent=${costStatus.data?.percentUsed}, level=${costStatus.data?.alertLevel}`);
```

### Test Case: Subscription State Consistency
```javascript
// Verify subscription state is internally consistent
const finalSub = await api('GET', '/subscription', cookie);
const d = finalSub.data;
const planValid = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(d?.plan);
const statusValid = ['ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING'].includes(d?.status);
log('B-08 State consistency', planValid && statusValid,
  `plan=${d?.plan}, status=${d?.status}, hasUsage=${!!d?.usage}`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual browser testing | Automated E2E scripts via Edge CDP | v10.0 (Sprint 05/06) | Reproducible, scriptable validation |
| curl-based API tests | Node.js `.mjs` with structured PASS/FAIL logging | v10.0 | Rich output, automatic summary |
| Separate Stripe test env | Autumn test mode (wraps Stripe test) | Project architecture | Single test-mode key covers both Autumn + Stripe |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Standalone Node.js `.mjs` script (not Jest) |
| Config file | None -- self-contained |
| Quick run command | `node backend/scripts/validate-billing-e2e.mjs` |
| Full suite command | Same (single script covers all billing flows) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-03a | attach flow returns checkoutUrl | e2e-script | `node backend/scripts/validate-billing-e2e.mjs` | No -- Wave 0 |
| BILL-03b | check feature returns allowed/remaining | e2e-script | Same | No -- Wave 0 |
| BILL-03c | track usage increments counter | e2e-script | Same | No -- Wave 0 |
| BILL-03d | cancel sets cancelAt on subscription | e2e-script | Same | No -- Wave 0 |
| BILL-03e | billing portal returns valid URL | e2e-script | Same | No -- Wave 0 |
| BILL-03f | webhook endpoint rejects unsigned requests | e2e-script | Same | No -- Wave 0 |
| BILL-03g | subscription state consistent after operations | e2e-script | Same | No -- Wave 0 |
| BILL-03h | payment failure simulation (past_due handling) | manual | Autumn dashboard "Send Test Event" | N/A -- manual |

### Sampling Rate
- **Per task commit:** N/A (single script deliverable)
- **Phase gate:** `node backend/scripts/validate-billing-e2e.mjs` -- all checks PASS

### Wave 0 Gaps
- [ ] `backend/scripts/validate-billing-e2e.mjs` -- the entire phase deliverable

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Script execution | Yes | 22.x | -- |
| Edge browser (CDP port 9222) | Session extraction | Yes (manual launch) | -- | Must launch Edge with `--remote-debugging-port=9222` |
| Railway backend | API endpoints | Yes | `backend-production-78e1.up.railway.app` | -- |
| Vercel frontend | Browser session source | Yes | `mail-agent-indol.vercel.app` | -- |
| `ws` npm package | CDP WebSocket | Yes (installed in backend) | -- | -- |
| Autumn test mode | Billing API | Unknown | -- | Script should detect and warn |
| `AUTUMN_WEBHOOK_SECRET` | Webhook signature test | Unknown | -- | Script tests unsigned rejection only |

**Missing dependencies with no fallback:**
- None -- all infrastructure exists

**Missing dependencies with fallback:**
- Autumn test mode status is unknown. Script should check if billing features are enabled and handle gracefully if Autumn is not configured (some endpoints return fallback data).

## Open Questions

1. **Is AUTUMN_SECRET_KEY on Railway set to a test-mode key?**
   - What we know: Autumn supports test mode via Stripe test keys configured in the Autumn dashboard. The backend's `AutumnService` logs a warning if the key is not set.
   - What's unclear: Whether the Railway deployment uses a test-mode or production Autumn key.
   - Recommendation: The script should check `GET /subscription` to verify billing is functional. If `autumnCustomerId` is null, Autumn may not be configured -- log a warning and test only local fallback endpoints.

2. **Can we trigger a payment failure event without Autumn dashboard?**
   - What we know: Payment failure simulation ideally requires either (a) using Stripe test card `4000000000000341` during checkout, or (b) sending a test webhook from Autumn dashboard, or (c) calling the webhook endpoint with a valid Svix signature.
   - What's unclear: Whether we can programmatically send a test webhook event. The script cannot forge valid Svix signatures without `AUTUMN_WEBHOOK_SECRET`.
   - Recommendation: Test the `past_due` flow as a manual verification item. The script verifies the webhook endpoint rejects unsigned requests (confirming security). The full `past_due` -> `QuotaGuard blocks` -> `BillingAlert sends email` pipeline requires human-triggered events.

3. **Success Criteria #3: Payment failure simulation and retry**
   - What we know: Success criteria says "Subscription state remains consistent after payment failure simulation and retry." This requires triggering `past_due` via Autumn/Stripe, then resolving it (customer updates payment method in billing portal).
   - What's unclear: Whether this can be fully automated or must remain a manual step.
   - Recommendation: Document this as a human verification item. The script can verify the `QuotaGuard` behavior by checking that `PAST_DUE` status returns 403 on gated endpoints, but triggering the state transition requires Autumn webhook delivery.

## Sources

### Primary (HIGH confidence)
- **Codebase audit** -- Direct reads of all billing services, controllers, DTOs, and Prisma schema in `backend/src/modules/subscription/`
- **Existing validation scripts** -- `backend/scripts/validate-sprint05-06-real.mjs` (183 lines, established CDP pattern)
- **Phase 131 + 132 research** -- `.planning/phases/131-*/131-RESEARCH.md` and `.planning/phases/132-*/132-RESEARCH.md`
- **Phase 132 verification** -- Confirms all BILL-02/BILL-04 artifacts exist and are wired

### Secondary (MEDIUM confidence)
- **[Autumn docs: webhooks](https://docs.useautumn.com/documentation/webhooks)** -- Webhook event types, "Send Test Event" button for testing
- **[Autumn docs: edge cases](https://docs.useautumn.com/documentation/customers/edge-cases)** -- Payment failure returns `payment_failed` code with payment URL
- **[Stripe test cards](https://docs.stripe.com/testing)** -- Test card `4242424242424242` for success, `4000000000000341` for payment failure

### Tertiary (LOW confidence)
- Autumn test-mode key format: Assumed to follow Stripe's `test_` prefix pattern. Not verified in docs. Script should detect rather than assume.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; existing validation pattern proven
- Architecture: HIGH - Single `.mjs` script following exact established pattern
- Pitfalls: HIGH - Based on direct codebase inspection and existing script behavior
- Payment failure simulation: MEDIUM - Depends on Autumn test mode availability on Railway

**Research date:** 2026-04-01
**Valid until:** 2026-04-30 (stable -- validation scripts, no external dependency changes)
