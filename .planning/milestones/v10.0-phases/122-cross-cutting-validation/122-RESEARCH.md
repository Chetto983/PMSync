# Phase 122: Cross-cutting Validation - Research

**Researched:** 2026-03-30
**Domain:** Security (tenant isolation), rate limiting, API response contracts
**Confidence:** HIGH

## Summary

This phase is a validation sweep, not a feature build. The three requirements (XCUT-01, XCUT-02, XCUT-03) verify that existing infrastructure -- tenant isolation, rate limiting, and response envelopes -- is correctly applied across all email-related endpoints. The codebase already has all three mechanisms implemented at the framework level. The work is auditing for gaps and writing validation scripts.

The codebase has: (1) a `TenantGuard` that validates `tenantId` on every guarded controller, plus a Prisma tenant-scoping extension that auto-injects `tenantId` into all queries (enforce mode, not audit mode); (2) a 4-tier `UserThrottlerGuard` applied globally via `APP_GUARD` with `@RateTierDecorator` for per-endpoint tier assignment; (3) a `ResponseEnvelopeInterceptor` that wraps all responses in `{ data, meta: { requestId, timestamp } }` and an `ApiExceptionFilter` that wraps errors in `{ error: { code, message, details }, meta: { requestId } }`.

**Primary recommendation:** Write three validation scripts (one per XCUT requirement) that test production endpoints. Fix any gaps found during validation in-place, consistent with the v10.0 milestone approach.

## Project Constraints (from CLAUDE.md)

- Multi-tenant rule: Every query MUST include `tenantId`. Never query without tenant filter.
- Post-edit validation mandatory: `cd backend && npx tsc --noEmit` after every edit.
- Max 500 lines per file.
- Follow existing patterns -- use validation script infrastructure in `scripts/lib/validation-helpers.mjs`.
- Scope control: do exactly what is asked, nothing more.
- Backend stack: NestJS 11, Prisma + PostgreSQL, BullMQ + Redis.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| XCUT-01 | All email operations enforce tenantId isolation | TenantGuard applied on all 10 email/email-sync controllers. Prisma tenant-scoping extension in enforce mode auto-injects tenantId. Validation script should attempt cross-tenant access and verify 403. |
| XCUT-02 | Rate limiting applies correctly per tier on email endpoints | 4-tier throttler (read/safe-write/destructive-write/send) global via APP_GUARD. Several controllers missing explicit `@RateTierDecorator` on write endpoints (signatures, templates, scheduled-emails, email-sync). Auto-assignment covers them (POST -> safe-write) but explicit is better. Audit needed. |
| XCUT-03 | Error responses follow standard envelope format with correlation IDs | `ResponseEnvelopeInterceptor` + `ApiExceptionFilter` globally applied. `RequestIdMiddleware` generates `req.id`. Only 2 endpoints use `@SkipEnvelope` (AI chat SSE stream, webhook receiver). Validation: hit endpoints that return success/4xx/5xx and verify shape. |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase uses existing infrastructure only.

### Core (already in codebase)
| Component | Location | Purpose |
|-----------|----------|---------|
| TenantGuard | `backend/src/common/auth/tenant.guard.ts` | Guard-level tenant validation |
| Tenant-scoping extension | `backend/src/prisma/tenant-scoping/tenant-scoping.extension.ts` | Prisma query-level auto tenantId injection (enforce mode) |
| UserThrottlerGuard | `backend/src/common/guards/user-throttler.guard.ts` | Tier-aware rate limiting |
| RateTierDecorator | `backend/src/common/decorators/rate-tier.decorator.ts` | Per-endpoint tier assignment |
| ResponseEnvelopeInterceptor | `backend/src/common/interceptors/response-envelope.interceptor.ts` | Success response wrapping |
| ApiExceptionFilter | `backend/src/common/filters/api-exception.filter.ts` | Error response standardization |
| RequestIdMiddleware | `backend/src/common/middleware/request-id.middleware.ts` | Correlation ID generation |
| validation-helpers.mjs | `scripts/lib/validation-helpers.mjs` | CDP + cookie-based auth for validation scripts |

## Architecture Patterns

### Existing Validation Script Pattern
All v10.0 validation follows the same pattern established in Phase 112+:
```
scripts/validate-{feature}.mjs       # Orchestrator with --check= flags
scripts/lib/validate-{module}.mjs    # Modular check functions
scripts/lib/validation-helpers.mjs   # Shared: connectCDP, getAuthCookies, getCsrfToken, report
```

Scripts connect via Playwright CDP to Edge on port 9222, extract cookies from the logged-in session, and make authenticated API calls against production.

### Tenant Isolation Architecture (2 layers)
1. **Guard layer**: `TenantGuard` reads `tenantId` from user session, validates tenant exists and is active, blocks cross-tenant access for non-super-admins. Applied at controller level via `@UseGuards(TenantGuard, RolesGuard)`.
2. **Prisma layer**: `createTenantScopingExtension()` auto-injects `tenantId` into every read/write/update/delete query for tenant-scoped models. `AUDIT_MODE = false` (enforce mode) -- throws `TenantContextRequiredError` if no tenant context.

### Rate Limiting Architecture (4 tiers)
```
| Tier              | Limit    | Auto-assigned to        |
|-------------------|----------|-------------------------|
| read              | 300/min  | GET, HEAD, OPTIONS      |
| safe-write        | 100/min  | POST, PATCH, PUT, DELETE|
| destructive-write | 30/min   | Explicit @RateTierDecorator only |
| send              | 10/min   | Explicit @RateTierDecorator only |
```
Global `APP_GUARD` applies `UserThrottlerGuard`. Without explicit `@RateTierDecorator`, the guard auto-assigns based on HTTP method. This means all write endpoints get at least `safe-write` tier even without explicit decoration.

### Response Envelope Contract
**Success:** `{ data: <payload>, meta: { requestId: string, timestamp: string } }`
**Error:** `{ error: { code: string, message: string, details: object|null }, meta: { requestId: string } }`

The `requestId` comes from `RequestIdMiddleware` (nanoid or client-provided `X-Request-ID` header). Set as response header `X-Request-ID` and embedded in `meta.requestId`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Cross-tenant test | Custom auth mocking | Playwright CDP with real session + tampered tenant ID header |
| Rate limit test | Manual request flooding | Small burst of requests + check for 429 response |
| Response format audit | Manual JSON inspection | Script that hits each endpoint category and validates shape |

## Common Pitfalls

### Pitfall 1: Missing @RateTierDecorator on write endpoints
**What goes wrong:** Write endpoints without explicit `@RateTierDecorator` fall back to `safe-write` auto-assignment. This is correct for most CRUD, but destructive operations (delete, purge) and send operations should have stricter tiers.
**Current gaps found:**
- `signatures.controller.ts`: 4 POST/PATCH/DELETE endpoints -- no `@RateTierDecorator` (auto-assigns `safe-write`)
- `templates.controller.ts`: 5 POST/PATCH/DELETE endpoints -- no `@RateTierDecorator` (auto-assigns `safe-write`)
- `scheduled-emails.controller.ts`: 1 DELETE, 1 PATCH -- no `@RateTierDecorator` (auto-assigns `safe-write`)
- `email-sync.controller.ts`: 7 POST endpoints -- no `@RateTierDecorator` (auto-assigns `safe-write`; `sync-all` and `queues/clear` should be `destructive-write`)
**How to avoid:** Audit all email endpoints and add explicit decorators where auto-assignment gives wrong tier.

### Pitfall 2: SkipEnvelope on webhook/SSE endpoints
**What goes wrong:** `@SkipEnvelope()` is used on AI chat SSE stream and webhook receiver. These are legitimate exceptions. Don't flag them as violations.
**How to avoid:** Document the exceptions in the validation script so they don't show as false positives.

### Pitfall 3: Cross-tenant test with same-tenant user
**What goes wrong:** Testing tenant isolation with a single user only verifies the happy path. Must attempt to access resources with a tampered `X-Tenant-ID` header or a user from a different tenant.
**How to avoid:** The `TenantGuard` checks `user.tenantId !== resolvedTenantId` and blocks non-super-admins. Test by sending `X-Tenant-ID` header with a different tenant's ID.

### Pitfall 4: Correlation ID in error responses
**What goes wrong:** The `ApiExceptionFilter` uses `req.id` for the `requestId` in error responses. The `ResponseEnvelopeInterceptor` also uses `req.id` for success responses. Both come from `RequestIdMiddleware`. If middleware isn't applied to a route, `req.id` will be `undefined` and `meta.requestId` will be `'unknown'`.
**How to avoid:** Verify that `RequestIdMiddleware` is applied globally (it is -- in `app.module.ts`).

### Pitfall 5: Attachments controller has no write endpoints
**What goes wrong:** You might waste time looking for missing rate tier decorators on the attachments controller. It only has GET endpoints (download/stream), so auto-assignment to `read` tier is correct.
**How to avoid:** Skip attachments controller in the rate tier audit.

## Code Examples

### XCUT-01: Cross-tenant validation script pattern
```javascript
// Attempt to access another tenant's emails by injecting X-Tenant-ID header
const res = await api.get(BACKEND_URL + '/api/v1/emails', {
  headers: {
    Cookie: cookieHeader,
    'X-Tenant-ID': 'some-other-tenant-id',
  },
});
// Should get 403 Forbidden, NOT 200 with empty data
assert(res.status() === 403, 'Cross-tenant access should be blocked');
```

### XCUT-02: Rate tier audit pattern
```javascript
// Programmatic audit: read all controller files, check POST/PATCH/DELETE
// methods have @RateTierDecorator or are explicitly documented as safe-write-ok
// Existing test: backend/src/__tests__/rate-tier-audit.spec.ts
```

### XCUT-03: Response envelope validation pattern
```javascript
// Success response
const res = await api.get(BACKEND_URL + '/api/v1/emails?limit=1', { headers });
const body = await res.json();
assert(body.data !== undefined, 'Success response must have data field');
assert(body.meta?.requestId, 'Success response must have meta.requestId');

// Error response (invalid request)
const errRes = await api.get(BACKEND_URL + '/api/v1/emails?page=-1', { headers });
const errBody = await errRes.json();
assert(errBody.error?.code, 'Error response must have error.code');
assert(errBody.meta?.requestId, 'Error response must have meta.requestId');
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (existing) + Playwright CDP validation scripts |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern=rate-tier-audit --no-coverage` |
| Full suite command | `node scripts/validate-cross-cutting.mjs --check=all` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| XCUT-01 | Tenant isolation on all email endpoints | integration (CDP) | `node scripts/validate-cross-cutting.mjs --check=tenant` | No -- Wave 0 |
| XCUT-02 | Rate tier correctness per endpoint | unit + integration | `cd backend && npx jest rate-tier-audit --no-coverage` + `node scripts/validate-cross-cutting.mjs --check=rate-tier` | Partial (unit exists at `backend/src/__tests__/rate-tier-audit.spec.ts`) |
| XCUT-03 | Response envelope format | integration (CDP) | `node scripts/validate-cross-cutting.mjs --check=envelope` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit`
- **Per wave merge:** `node scripts/validate-cross-cutting.mjs --check=all`
- **Phase gate:** All checks PASS before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/validate-cross-cutting.mjs` -- orchestrator for XCUT-01, XCUT-02, XCUT-03
- [ ] `scripts/lib/validate-tenant-isolation.mjs` -- cross-tenant request checks
- [ ] `scripts/lib/validate-rate-tiers.mjs` -- per-endpoint tier verification
- [ ] `scripts/lib/validate-response-envelope.mjs` -- response shape verification

## Key Findings Summary

### XCUT-01 (Tenant Isolation) -- LOW RISK
All 10 email-related controllers have `@UseGuards(TenantGuard)` at the class level:
- `email-query.controller.ts` -- TenantGuard + RolesGuard
- `emails.controller.ts` -- TenantGuard + RolesGuard
- `email-actions.controller.ts` -- TenantGuard + RolesGuard
- `attachments.controller.ts` -- TenantGuard + RolesGuard
- `signatures.controller.ts` -- TenantGuard + RolesGuard
- `templates.controller.ts` -- TenantGuard + RolesGuard
- `scheduled-emails.controller.ts` -- TenantGuard + RolesGuard
- `email-calendar-invite.controller.ts` -- TenantGuard + RolesGuard
- `folders.controller.ts` -- TenantGuard + RolesGuard
- `email-sync.controller.ts` -- TenantGuard (no RolesGuard at class level, but on specific endpoints)

Additionally, Prisma tenant-scoping extension is in enforce mode (`AUDIT_MODE = false`), providing a second layer of defense.

### XCUT-02 (Rate Limiting) -- MEDIUM RISK
The global `UserThrottlerGuard` provides baseline coverage. All endpoints get at least `read` (GET) or `safe-write` (POST/PATCH/DELETE) auto-assignment. However, several email controllers lack explicit `@RateTierDecorator`:

**Controllers with explicit decorators (good):**
- `email-actions.controller.ts` -- 17 decorators covering send/safe-write/destructive-write
- `folders.controller.ts` -- 7 decorators covering safe-write/destructive-write
- `email-calendar-invite.controller.ts` -- 3 decorators for send tier
- `labels.controller.ts` -- 6 decorators covering safe-write/destructive-write

**Controllers WITHOUT explicit decorators (needs audit):**
- `signatures.controller.ts` -- 4 write endpoints auto-assigned safe-write (acceptable for CRUD)
- `templates.controller.ts` -- 5 write endpoints auto-assigned safe-write (acceptable for CRUD)
- `scheduled-emails.controller.ts` -- 2 write endpoints auto-assigned safe-write (acceptable)
- `email-sync.controller.ts` -- 7 POST endpoints, `sync-all` and `queues/clear` should arguably be `destructive-write`

### XCUT-03 (Response Envelope) -- LOW RISK
- `ResponseEnvelopeInterceptor` applied globally via `APP_INTERCEPTOR`
- `ApiExceptionFilter` catches all exceptions globally
- `RequestIdMiddleware` generates correlation IDs globally
- Only 2 legitimate `@SkipEnvelope` usages: AI chat SSE stream, webhook receiver (both non-email)
- All error responses include `meta.requestId` via the filter
- Response header `X-Request-ID` set by middleware

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all 10 email controllers
- `backend/src/common/auth/tenant.guard.ts` -- tenant validation logic
- `backend/src/common/guards/user-throttler.guard.ts` -- tier-aware throttling
- `backend/src/common/interceptors/response-envelope.interceptor.ts` -- envelope wrapping
- `backend/src/common/filters/api-exception.filter.ts` -- error envelope
- `backend/src/prisma/tenant-scoping/tenant-scoping.extension.ts` -- enforce mode confirmed
- `backend/src/app.module.ts` -- global guard/interceptor/middleware registration
- `backend/src/__tests__/rate-tier-audit.spec.ts` -- existing rate tier test

## Metadata

**Confidence breakdown:**
- Tenant isolation: HIGH -- all controllers inspected, two-layer defense confirmed
- Rate limiting: HIGH -- global guard confirmed, gaps identified by file inspection
- Response envelope: HIGH -- global interceptor + filter confirmed, SkipEnvelope usages enumerated

**Research date:** 2026-03-30
**Valid until:** Indefinite (validation of existing infrastructure, no external dependency drift risk)
