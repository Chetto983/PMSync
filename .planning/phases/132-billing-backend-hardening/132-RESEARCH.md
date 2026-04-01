# Phase 132: Billing Backend Hardening - Research

**Researched:** 2026-04-01
**Domain:** Backend billing hardening (Autumn SDK webhooks, Svix signature verification, idempotent event processing, payment failure handling, proration, cancellation)
**Confidence:** HIGH

## Summary

The billing backend infrastructure is largely built. The `subscription` module contains 6 services (`AutumnService`, `SubscriptionService`, `UsageTrackingService`, `CostProtectionService`, `BillingAlertService`, `SubscriptionLifecycleService`), 2 controllers, a `QuotaGuard`, and Prisma schema. What is **missing** is the webhook endpoint -- there is zero webhook handling for Autumn/Stripe events anywhere in the subscription module. Additionally, the cancellation flow calls Autumn but does not properly handle the "access continues until period end" lifecycle, and `BillingAlertService.sendAlertEmails()` is stubbed with `// DEBT: Integrate with actual email service`.

The key architectural insight is that **Autumn manages Stripe webhooks internally**. Autumn's docs state "no webhooks required" for most flows. However, Autumn itself sends its own webhooks (via Svix) for three event types: `customer.products.updated`, `balances.limit_reached`, and `balances.usage_alert_triggered`. These are the events Phase 132 must handle, not raw Stripe events.

**Primary recommendation:** Build an Autumn webhook controller at `POST /webhooks/autumn` (excluded from global prefix and CSRF per existing patterns), verify Svix signatures using the `svix` npm package with raw body access, implement idempotent processing via Redis dedup keys, and wire the events to existing services (`SubscriptionService.updatePlan/updateStatus`, `BillingAlertService`, `CostProtectionService`).

## Project Constraints (from CLAUDE.md)

### Enforced Directives
- **Multi-tenant rule**: Every query MUST include `tenantId`. Never query without tenant filter.
- **Provider pattern**: Interface > Factory > Implementation.
- **Prisma retry**: Handle P2002 (unique constraint) and P2034 (deadlock) with exponential backoff.
- **Post-Edit Validation**: `cd backend && npx tsc --noEmit` after every edit.
- **Max 500 lines per file**. No exceptions.
- **Scope Control**: Do exactly what was asked. No unrequested improvements.
- **FOLLOW EXISTING PATTERNS**: Never invent new approaches when codebase patterns exist.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BILL-02 | Webhook endpoint for Autumn/Stripe events with signature verification and idempotent event processing | Autumn sends webhooks via Svix with `svix-id`, `svix-timestamp`, `svix-signature` headers. Use `svix` npm package for verification. Raw body required (bodyParser disabled globally; add raw body middleware for webhook route). Idempotency via Redis SET NX with `svix-id` as dedup key. |
| BILL-04 | Edge cases hardened (payment failure handling, mid-cycle plan changes, cancellation flow, usage counter race conditions) | (1) Payment failures: Autumn sets `past_due` status via `customer.products.updated` webhook with scenario="past_due" -- webhook handler must call `SubscriptionService.updateStatus(tenantId, PAST_DUE)` + `BillingAlertService`. (2) Proration: Autumn handles billing math; upgrades are immediate, downgrades scheduled for period end -- webhook confirms plan change. (3) Cancellation: `cancelSubscription()` already sets `cancelAt`; need lifecycle job to downgrade to FREE when `cancelAt` passes. (4) Usage race conditions: already solved by Redis atomic INCRBY/INCRBYFLOAT in `UsageTrackingService`. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `autumn-js` | 0.1.85 | Autumn SDK (attach/check/track/cancel) | Already integrated in `AutumnService` |
| `@nestjs/core` | 11.x | Framework | Project standard |
| `@prisma/client` | - | Database ORM | Project standard |
| `ioredis` | - | Redis client (via CacheService) | Used for atomic usage counters |

### New Dependency Required
| Library | Version | Purpose | Why Needed |
|---------|---------|---------|------------|
| `svix` | 1.89.0 | Webhook signature verification | Autumn uses Svix for webhook delivery. Verifying `svix-id`/`svix-timestamp`/`svix-signature` headers requires this library. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `svix` package | Manual HMAC-SHA256 verification | Svix docs provide manual instructions, but library handles timestamp tolerance, multiple signatures, and edge cases. Use the library. |

**Installation:**
```bash
cd backend && npm install svix
```

## Architecture Patterns

### Recommended Structure (New Files)
```
backend/src/modules/subscription/
├── controllers/
│   ├── autumn.controller.ts           # EXISTING -- Autumn proxy routes
│   ├── subscription.controller.ts     # EXISTING -- Subscription CRUD
│   └── autumn-webhook.controller.ts   # NEW -- Webhook receiver
├── services/
│   ├── autumn.service.ts              # EXISTING -- SDK wrapper
│   ├── autumn-webhook.service.ts      # NEW -- Event processing logic
│   ├── subscription.service.ts        # EXISTING -- Plan CRUD (needs minor additions)
│   ├── subscription-lifecycle.service.ts  # EXISTING -- needs cancellation expiry check
│   ├── usage-tracking.service.ts      # EXISTING -- no changes needed
│   ├── cost-protection.service.ts     # EXISTING -- no changes needed
│   └── billing-alert.service.ts       # EXISTING -- wire real email sending
├── dto/
│   └── subscription.dto.ts            # EXISTING -- add webhook DTOs
└── guards/
    └── quota.guard.ts                 # EXISTING -- already blocks PAST_DUE
```

### Pattern 1: Webhook Controller with Raw Body
**What:** NestJS controller that receives Autumn webhooks, verifies Svix signatures, and delegates to service.
**When to use:** All external webhook receivers that require signature verification.
**Key detail:** The app has `bodyParser: false` globally (main.ts:398), then adds `express.json()` at line 557. For webhook verification, we need the raw body string. The standard NestJS pattern is to use a raw body middleware for the webhook route specifically.

```typescript
// Source: NestJS docs + Svix docs pattern adapted for this codebase
import { Controller, Post, Headers, Req, HttpCode, HttpStatus, RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { Webhook } from 'svix';
import { Public } from '../../../common/auth/public.decorator';

@Controller('webhooks/autumn')
export class AutumnWebhookController {
  @Post()
  @Public() // No auth -- uses Svix signature verification instead
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    // Raw body for signature verification
    const rawBody = req.rawBody?.toString() ?? '';
    // ... verify and process
  }
}
```

**Raw body setup:** Since `bodyParser: false` is set globally, we need to add a raw body parser specifically. The cleanest approach for NestJS is to register `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })` for the webhook path, or use `express.raw({ type: 'application/json' })` mounted before the global `express.json()` for the `/webhooks/autumn` path.

### Pattern 2: Idempotent Event Processing
**What:** Use Redis SET NX with `svix-id` as dedup key to ensure each event is processed exactly once.
**When to use:** All webhook handlers to prevent duplicate processing.

```typescript
// Idempotency check using existing CacheService
const dedupeKey = `webhook:autumn:${svixId}`;
const isNew = await this.cache.setNx(dedupeKey, 1, { ttl: 86400 }); // 24h window
if (!isNew) {
  this.logger.debug(`Duplicate webhook ${svixId}, skipping`);
  return; // Return 200 to stop retries
}
```

**Note:** Autumn docs confirm: "Stripe webhook duplicates are deduplicated within 5-minute windows" and "API requests support Idempotency-Key headers; duplicate requests within 24 hours receive 409 rejection." Our dedup adds defense-in-depth.

### Pattern 3: Webhook Event Routing
**What:** Route `customer.products.updated` events by scenario to the correct service method.
**When to use:** Processing Autumn webhook payloads.

```typescript
// Event types from Autumn docs
type AutumnWebhookEvent = {
  type: 'customer.products.updated' | 'balances.limit_reached' | 'balances.usage_alert_triggered';
  data: {
    customer_id: string;
    scenario?: 'new' | 'upgrade' | 'downgrade' | 'renew' | 'cancel' | 'expired' | 'past_due' | 'scheduled';
    product_id?: string;
    product_name?: string;
    // ... other fields
  };
};
```

### Anti-Patterns to Avoid
- **Don't build a custom Stripe webhook handler.** Autumn manages Stripe webhooks internally. We only handle Autumn's outbound webhooks.
- **Don't poll Autumn for subscription state.** Use webhooks for real-time updates plus existing `autumn.check()` for on-demand verification.
- **Don't store raw webhook payloads in PostgreSQL.** Redis dedup key + structured event processing is sufficient. Log payloads for debugging.
- **Don't create a separate module for webhooks.** Add to existing `SubscriptionModule` following codebase patterns (other webhook controllers live in their parent module).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC-SHA256 logic | `svix` npm package | Handles timestamp tolerance, multiple signatures, key rotation |
| Proration math | Custom billing calculations | Autumn handles this server-side | "Autumn calculates the adjusted amount and either charges or credits" |
| Payment retry logic | Custom retry scheduler | Autumn + Stripe handle retries | "Stripe automatically retries the failed invoice" |
| Usage counter atomicity | Lua scripts or DB transactions | Existing Redis `INCRBY`/`INCRBYFLOAT` via `CacheService` | Already implemented and tested in `UsageTrackingService` |
| Dedup infrastructure | Custom dedup table in Postgres | Redis `SET NX` with TTL | Lightweight, fast, auto-expires |

## Common Pitfalls

### Pitfall 1: Parsed Body Breaks Signature Verification
**What goes wrong:** JSON body is parsed by `express.json()`, then re-stringified for signature verification. Re-stringification changes whitespace/ordering, verification fails.
**Why it happens:** The app uses `express.json()` globally (main.ts:557). Svix signature is computed over the raw bytes.
**How to avoid:** Mount `express.raw({ type: 'application/json' })` for `/webhooks/autumn` BEFORE the global `express.json()` middleware. Or use the `verify` callback pattern to stash raw body on `req.rawBody`.
**Warning signs:** All webhook signature verifications fail with "Invalid signature" despite correct secret.

### Pitfall 2: Forgetting to Return 200 on Duplicate Events
**What goes wrong:** Returning non-200 on duplicates causes Autumn/Svix to retry, creating an infinite retry loop.
**Why it happens:** Developer adds dedup check but returns 4xx for duplicates.
**How to avoid:** Always return 200 for successfully received events, even if they're duplicates. The dedup check prevents side effects; the 200 stops retries.
**Warning signs:** Exponentially increasing webhook deliveries in Autumn dashboard.

### Pitfall 3: Not Handling `customer_id` Mapping
**What goes wrong:** Autumn sends `customer_id` which maps to `tenantId` in our system. If you look up by wrong field, event is silently dropped.
**Why it happens:** In `AutumnService.createCustomer()`, tenantId IS the customer_id (line 83: `id: tenantId`). But if this mapping changes, webhook handler breaks.
**How to avoid:** Always use `data.customer_id` from the webhook payload as `tenantId`. The mapping is 1:1 in our system.

### Pitfall 4: CSRF Blocking Webhook Requests
**What goes wrong:** Webhook POST requests are rejected by CSRF middleware with 403.
**Why it happens:** The webhook path isn't in the CSRF exclusion list.
**How to avoid:** The `/webhooks` path is already excluded from CSRF (csrf.middleware.ts line 77). Since the controller is at `/webhooks/autumn`, this prefix match should cover it. Verify this during implementation.
**Warning signs:** 403 responses to Autumn webhook deliveries.

### Pitfall 5: Missing Cancellation Period-End Enforcement
**What goes wrong:** User cancels but immediately loses access instead of retaining it until period end.
**Why it happens:** `cancelSubscription()` sets `cancelAt` to `currentPeriodEnd` and keeps status ACTIVE, but nothing checks `cancelAt` and transitions to CANCELED + FREE when the date passes.
**How to avoid:** The `subscription-lifecycle.service.ts` daily expiry check must also check for subscriptions where `cancelAt <= now AND status = ACTIVE`. This should downgrade to FREE.
**Warning signs:** Users complaining they paid for the month but lost access early.

## Code Examples

### Existing: CacheService setNx (for idempotency)
```typescript
// CacheService already has set() -- need to verify setNx exists or use set with NX option
// If not: use cache.set() with a get-first check, or add setNx to CacheService
```

### Existing: How AutumnService Maps Customer ID = Tenant ID
```typescript
// Source: backend/src/modules/subscription/services/autumn.service.ts line 78-83
await this.autumn.customers.create({
  id: tenantId,           // <-- customer_id = tenantId
  name: customerData.name,
  email: customerData.email,
});
await this.subscriptionService.linkAutumnCustomer(tenantId, tenantId);
```

### Existing: QuotaGuard Already Blocks PAST_DUE
```typescript
// Source: backend/src/modules/subscription/guards/quota.guard.ts line 92-97
if (subscription.status === SubscriptionStatus.PAST_DUE) {
  throw new ForbiddenException({
    code: 'PAYMENT_PAST_DUE',
    message: t.subscription?.pastDue || 'Your payment is past due...',
  });
}
```

### Existing: SubscriptionLifecycleService Daily Check (Needs Extension)
```typescript
// Source: backend/src/modules/subscription/services/subscription-lifecycle.service.ts
// Currently checks: expired trials, past-due past grace period
// MISSING: cancelAt expiry check (subscriptions where cancelAt <= now AND status = ACTIVE)
```

### Existing: BillingAlertService Email Stub
```typescript
// Source: backend/src/modules/subscription/services/billing-alert.service.ts line 127-151
// sendAlertEmails() is stubbed:
// DEBT: Integrate with actual email service - tracked in BUG-037
// For now, log what would be sent
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct Stripe webhooks | Autumn manages Stripe webhooks; sends its own via Svix | Autumn SDK architecture | Developer only handles 3 Autumn event types, not 50+ Stripe events |
| HMAC-SHA256 manual verification | Svix library verification | Svix standard | Handles timestamp tolerance, multiple signatures, key rotation |
| Database-backed dedup | Redis SET NX with TTL | Industry standard | Lightweight, auto-expires, no table maintenance |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest |
| Config file | `backend/jest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern=subscription --no-coverage` |
| Full suite command | `cd backend && npx jest --no-coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-02a | Svix signature verification accepts valid signatures | unit | `cd backend && npx jest autumn-webhook --no-coverage` | No -- Wave 0 |
| BILL-02b | Svix signature verification rejects invalid signatures | unit | `cd backend && npx jest autumn-webhook --no-coverage` | No -- Wave 0 |
| BILL-02c | Duplicate svix-id events are idempotently skipped | unit | `cd backend && npx jest autumn-webhook --no-coverage` | No -- Wave 0 |
| BILL-02d | customer.products.updated routes to correct handler by scenario | unit | `cd backend && npx jest autumn-webhook --no-coverage` | No -- Wave 0 |
| BILL-04a | past_due scenario updates subscription status | unit | `cd backend && npx jest autumn-webhook --no-coverage` | No -- Wave 0 |
| BILL-04b | cancel scenario sets cancelAt + keeps access until period end | unit | `cd backend && npx jest subscription-lifecycle --no-coverage` | Partial (existing spec lacks cancelAt check) |
| BILL-04c | Usage counter race condition: concurrent INCRBY produces correct total | unit | `cd backend && npx jest usage-tracking --no-coverage` | Yes (existing) |
| BILL-04d | Cancellation lifecycle: daily check downgrades when cancelAt passes | unit | `cd backend && npx jest subscription-lifecycle --no-coverage` | Partial |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit`
- **Per wave merge:** `cd backend && npx jest --testPathPattern=subscription --no-coverage`
- **Phase gate:** Full type-check + subscription tests green

### Wave 0 Gaps
- [ ] `backend/src/modules/subscription/controllers/__tests__/autumn-webhook.controller.spec.ts` -- covers BILL-02a/b/c/d, BILL-04a
- [ ] `backend/src/modules/subscription/services/__tests__/autumn-webhook.service.spec.ts` -- covers event routing + scenario handling
- [ ] Extend `subscription-lifecycle.service.spec.ts` -- add cancelAt expiry test (BILL-04b/d)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `svix` npm package | Webhook signature verification | Not installed yet | 1.89.0 (npm registry) | Must install |
| Redis | Idempotency dedup + usage counters | Yes (via CacheService) | - | - |
| PostgreSQL | Subscription state storage | Yes (via Prisma) | - | - |
| Autumn SDK | Billing API | Yes | 0.1.85 | - |

**Missing dependencies with no fallback:**
- `svix` package must be installed before implementation

**Missing dependencies with fallback:**
- None

## Open Questions

1. **CacheService.setNx availability**
   - What we know: `CacheService` has `set()`, `get()`, `del()`, `incrBy()`, `incrByFloat()`. Need atomic set-if-not-exists for dedup.
   - What's unclear: Whether `setNx` (or equivalent) already exists in `CacheService`.
   - Recommendation: Check during implementation. If missing, add a `setNx()` method wrapping Redis `SET key value NX EX ttl`. Simple addition (~10 lines).

2. **Autumn webhook signing secret**
   - What we know: Svix verification requires a signing secret (starts with `whsec_`). This is configured in the Autumn dashboard.
   - What's unclear: Whether user has already configured the webhook URL and obtained the signing secret.
   - Recommendation: Add `AUTUMN_WEBHOOK_SECRET` to `.env.example`. Implementation should gracefully log-warn if not configured.

3. **BillingAlertService email integration scope**
   - What we know: Currently stubbed with `// DEBT` comment. The project uses SendGrid HTTP API for email delivery.
   - What's unclear: Whether wiring the email service is in scope for BILL-04 or deferred.
   - Recommendation: The requirement says "Payment failure triggers appropriate user notification." At minimum, wire the existing `BillingAlertService` to send a real email via the SendGrid email service for payment failure events. Keep the alert logic (cooldown, thresholds) as-is.

4. **Downgrade behavior on cancellation**
   - What we know: `cancelSubscription()` sets `cancelAt = currentPeriodEnd` and keeps status ACTIVE. The daily expiry check does NOT check for cancelAt-passed subscriptions.
   - What's unclear: Should cancellation downgrade to FREE (lose all features) or just set status to CANCELED (keep plan but block access)?
   - Recommendation: Set status to CANCELED + plan to FREE (matching the `checkPastDueSubscriptions` pattern). The QuotaGuard already blocks CANCELED status.

## Sources

### Primary (HIGH confidence)
- **Codebase audit** -- Direct reads of all 16 files in `backend/src/modules/subscription/`, `main.ts`, `csrf.middleware.ts`, `public.decorator.ts`
- **Autumn SDK types** -- `backend/node_modules/autumn-js/dist/sdk/index.d.ts` (v0.1.85)
- **[Autumn docs: webhooks](https://docs.useautumn.com/documentation/webhooks)** -- Event types, Svix headers, delivery guarantees
- **[Autumn docs: edge cases](https://docs.useautumn.com/documentation/customers/edge-cases)** -- Payment failure, 3DS, past_due, proration rollback
- **[Autumn docs: proration](https://docs.useautumn.com/documentation/modelling-pricing/proration)** -- Upgrades immediate, downgrades scheduled

### Secondary (MEDIUM confidence)
- **[Svix docs: verifying payloads](https://docs.svix.com/receiving/verifying-payloads/how)** -- Webhook class, verify() method, raw body requirement
- **[Svix npm package](https://www.npmjs.com/package/svix)** -- v1.89.0 current, TypeScript native

### Tertiary (LOW confidence)
- None -- all findings verified against official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All existing libraries verified in codebase, svix version confirmed via npm registry
- Architecture: HIGH - Patterns directly observed from existing webhook controllers (email-sync, calendar, contacts, telegram)
- Pitfalls: HIGH - Raw body issue confirmed by reading main.ts bodyParser config; CSRF exclusion verified; cancellation gap confirmed by reading lifecycle service code

**Research date:** 2026-04-01
**Valid until:** 2026-04-30 (stable -- Autumn SDK at 0.1.x, Svix at 1.x)
