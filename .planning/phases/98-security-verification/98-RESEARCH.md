# Phase 98: Security Verification - Research

**Researched:** 2026-03-22
**Domain:** Backend security controls verification (auth, tenant isolation, CSRF, rate limiting, RBAC)
**Confidence:** HIGH

## Summary

Phase 98 is a verification-only phase: no new security features are built. The goal is to prove that existing security controls -- authentication guards, tenant isolation, CSRF protection, rate limiting, and RBAC enforcement -- actually work as designed. The codebase already has all five security layers in place; the work is testing each one systematically.

The backend uses a layered guard architecture. `BetterAuthGuard` is a global `APP_GUARD` that validates session cookies on every request (routes marked `@Public()` bypass it). `TenantGuard` is applied per-controller and validates tenant membership. `RolesGuard` enforces `@Roles()` decorators. CSRF uses the `csrf-csrf` double-submit cookie pattern applied as Express middleware in `main.ts`. Rate limiting uses `@nestjs/throttler` with Redis-backed storage, registered globally via `UserThrottlerGuard`.

An existing audit script (`backend/scripts/audit-deep-api.ts`) already covers many of these checks against a live server. The phase work can leverage and extend this script pattern rather than writing unit tests for guards (which already exist).

**Primary recommendation:** Use a combination of the existing `audit-deep-api.ts` script pattern (for live HTTP-level verification against a running server) and targeted unit/integration tests for gaps. The five requirements map cleanly to five verification waves.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-01 | All protected routes reject unauthenticated requests (401) | BetterAuthGuard is global APP_GUARD; @Public() decorator exempts specific routes. Existing audit script already tests ~100 GET routes for 401. Need to extend to cover ALL endpoints systematically, including POST/PATCH/DELETE. |
| SEC-02 | Tenant isolation verified (user A cannot access user B's data) | TenantGuard is per-controller (not global). Cross-tenant check exists in guard. Need to verify: (a) all non-public controllers use TenantGuard, (b) Prisma queries include tenantId, (c) live cross-tenant request is rejected. |
| SEC-03 | CSRF protection verified on all mutation endpoints | csrf-csrf middleware in main.ts, double-submit cookie pattern. Excluded paths are explicit. Need to verify POST/PATCH/DELETE to protected endpoints without CSRF token returns 403. |
| SEC-04 | Rate limiting verified on sensitive endpoints (login, send email, AI chat) | Global UserThrottlerGuard with Redis storage. Default 300 req/min for reads, 30 req/min for writes. Custom @Throttle() on send (10/min), AI health (30/min), telegram (10/min). Need to verify 429 response after limit exceeded. |
| SEC-05 | Role-based access verified (member cannot access admin endpoints) | RolesGuard + @Roles() decorator. Controllers use @Roles('admin'), @Roles('super-admin'), etc. super-admin has hierarchical bypass. Need to verify member-role user gets 403 on admin-only endpoints. |
</phase_requirements>

## Standard Stack

### Core (Already in Codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | existing | Session-based auth, global guard | Already the auth system |
| csrf-csrf | existing | Double-submit cookie CSRF | Already configured in middleware |
| @nestjs/throttler | existing | Rate limiting with Redis storage | Already global APP_GUARD |
| axios | existing | HTTP client for audit scripts | Already used in audit-deep-api.ts |

### Supporting (For Verification Scripts)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ts-node | existing | Run TypeScript audit scripts | Execute verification scripts |
| dotenv | existing | Load env for test scripts | Configure base URL |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Audit scripts | Playwright API tests | Overkill; audit scripts are faster and already proven in prior phases |
| Live HTTP tests | Pure unit tests | Unit tests for guards already exist; this phase needs to verify the full stack |

## Architecture Patterns

### Existing Security Architecture
```
Request Flow:
  HTTP Request
    -> Express Middleware (cookieParser, helmet, CORS)
    -> csrfMiddleware (rejects mutations without valid CSRF token)
    -> NestJS Global Guards (in order):
       1. UserThrottlerGuard (rate limiting, 429 on excess)
       2. BetterAuthGuard (session validation, 401 on missing/invalid)
       3. LegalAcceptanceGuard (TOS check)
       4. ConsentGuard (AI consent check)
    -> Controller-level Guards:
       - TenantGuard (tenant membership + cross-tenant block)
       - RolesGuard (RBAC enforcement, 403 on wrong role)
    -> Controller Handler
```

### Route Protection Categories
```
1. @Public() routes - bypass BetterAuthGuard:
   - HealthController (all endpoints)
   - CsrfTokenController (GET /auth/csrf-token)
   - Webhook controllers (calendar, contacts, email-sync, telegram)
   - AiHealthController (GET /ai/health only)

2. Auth-protected, no TenantGuard:
   - RealtimeController (GET /realtime/auth-token)
   - OnboardingController (POST /onboarding/*)

3. Auth-protected + TenantGuard:
   - All domain controllers (emails, contacts, calendar, etc.)

4. Auth-protected + TenantGuard + RolesGuard + @Roles():
   - TenantsController (@Roles('super-admin'))
   - UsersController (admin endpoints)
   - AiObservabilityController (@Roles('admin'))
   - EmailActionsController (most mutations: @Roles('admin','manager','super-admin'))
   - FoldersController (mutations: @Roles('admin','manager','super-admin'))
```

### Verification Script Pattern (from audit-deep-api.ts)
```typescript
// Pattern: HTTP request + status assertion
async function req(method: string, path: string, body?: any, headers?: any) {
  const r = await axios({
    method: method.toLowerCase(),
    url: `${BASE}${path}`,
    data: body,
    headers,
    validateStatus: () => true,
    timeout: TIMEOUT,
  });
  return { status: r.status, ms: Date.now() - start };
}

// Assert expected status
const pass = r.status === expectedStatus;
```

### Anti-Patterns to Avoid
- **Testing guards in isolation only:** Guard unit tests exist but don't prove the full middleware chain works. Must test via HTTP.
- **Skipping mutation endpoints:** GET-only verification misses CSRF and role enforcement on POST/PATCH/DELETE.
- **Assuming TenantGuard is global:** It is NOT. It is per-controller. Must verify each controller.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth verification | Custom guard mocking framework | Live HTTP requests without session cookies | The global guard stack is already wired; test the actual behavior |
| CSRF verification | Mock CSRF middleware | Send real requests without X-CSRF-Token header | The middleware is already in the pipeline |
| Rate limit verification | Mock throttler storage | Redis-backed throttler with rapid-fire requests | Must prove Redis storage works in the real pipeline |
| Route enumeration | Manual list of every endpoint | Swagger/OpenAPI JSON at /api/docs-json | Swagger already documents all registered routes |

## Common Pitfalls

### Pitfall 1: CSRF Excluded Paths
**What goes wrong:** Forgetting that certain mutation paths are intentionally CSRF-exempt (login, register, webhooks, OAuth callbacks).
**Why it happens:** The CSRF_EXCLUDED_PATHS list in csrf.middleware.ts has 14 entries.
**How to avoid:** Only assert CSRF 403 on endpoints that are NOT in the exclusion list. GET/HEAD/OPTIONS are always exempt.
**Warning signs:** Test expects 403 on login/register but gets 200/401.

### Pitfall 2: Rate Limit Testing Requires Redis
**What goes wrong:** Testing rate limiting without Redis results in fail-open behavior (the RedisThrottlerStorage returns totalHits: 0 on Redis errors).
**Why it happens:** Line 88 of redis-throttler-storage.service.ts: `catch { return { totalHits: 0 ... isBlocked: false } }`.
**How to avoid:** Ensure Redis is running and connected before rate limit tests. Verify Redis connection first.
**Warning signs:** Rate limit tests always pass regardless of request count.

### Pitfall 3: TenantGuard Not Global
**What goes wrong:** Assuming all controllers have tenant isolation because BetterAuthGuard is global.
**Why it happens:** TenantGuard is applied via `@UseGuards(TenantGuard)` at controller level, not as APP_GUARD.
**How to avoid:** Verify each controller class has `@UseGuards(TenantGuard, ...)` or is intentionally public/tenant-free.
**Warning signs:** Controller without TenantGuard returns data without tenant context.

### Pitfall 4: Role Hierarchy
**What goes wrong:** Testing RBAC by asserting super-admin gets 403 on admin-only endpoints.
**Why it happens:** RolesGuard has explicit super-admin bypass: `user.role === 'super-admin'` always passes.
**How to avoid:** Test with `member` role, which should be rejected by any @Roles() endpoint. Never test role rejection with super-admin.

### Pitfall 5: better-auth /api/auth Routes
**What goes wrong:** Including `/api/auth/*` routes in CSRF or auth guard tests.
**Why it happens:** These routes are mounted directly on the raw Express instance BEFORE NestJS middleware. They bypass the entire NestJS guard chain.
**How to avoid:** Exclude `/api/auth/*` from NestJS guard verification. better-auth manages its own CSRF via trustedOrigins.

## Code Examples

### SEC-01: Verify Unauthenticated Rejection
```typescript
// Send request with NO session cookie
const r = await axios.get(`${BASE}/api/v1/emails`, {
  validateStatus: () => true,
});
assert(r.status === 401, `Expected 401, got ${r.status}`);
```

### SEC-02: Verify Tenant Isolation
```typescript
// Authenticate as User A (tenant-1), try to access User B's data (tenant-2)
const r = await axios.get(`${BASE}/api/v1/emails`, {
  headers: {
    cookie: userASessionCookie,
    'x-tenant-id': 'tenant-2-id', // Cross-tenant attempt
  },
  validateStatus: () => true,
});
assert(r.status === 403, `Expected 403 cross-tenant, got ${r.status}`);
```

### SEC-03: Verify CSRF on Mutations
```typescript
// POST without CSRF token -> should get 403
const r = await axios.post(`${BASE}/api/v1/emails/send`, { to: 'x@x.com' }, {
  headers: { cookie: validSessionCookie }, // Auth OK, but no X-CSRF-Token
  validateStatus: () => true,
});
assert(r.status === 403, `Expected CSRF 403, got ${r.status}`);
```

### SEC-04: Verify Rate Limiting
```typescript
// Send rapid-fire requests exceeding the limit
const endpoint = '/api/v1/emails/send'; // 10/min limit
const results = [];
for (let i = 0; i < 15; i++) {
  const r = await axios.post(`${BASE}${endpoint}`, {}, {
    headers: { cookie: sessionCookie, 'x-csrf-token': csrfToken },
    validateStatus: () => true,
  });
  results.push(r.status);
}
const has429 = results.some(s => s === 429);
assert(has429, 'Expected at least one 429 response');
```

### SEC-05: Verify RBAC
```typescript
// Authenticate as member-role user, try admin endpoint
const r = await axios.get(`${BASE}/api/v1/ai/runs`, {
  headers: { cookie: memberSessionCookie },
  validateStatus: () => true,
});
assert(r.status === 403, `Expected 403 for member on admin endpoint, got ${r.status}`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JWT auth + custom guards | better-auth sessions + BetterAuthGuard (global APP_GUARD) | Phase 52 | All auth validation is via DB session lookup |
| In-memory throttler | Redis-backed ThrottlerStorage | Phase 33+ | Rate limits work across replicas |
| No CSRF | csrf-csrf double-submit cookie | Phase SEC-04 | All mutations require X-CSRF-Token header |
| @Roles() per-endpoint only | @Roles() at controller + method level with super-admin hierarchy | Phase 52 | Consistent RBAC enforcement |

## Open Questions

1. **Live server availability for testing**
   - What we know: Prior phases noted Railway backend sometimes unavailable. audit-deep-api.ts needs a running server.
   - What's unclear: Will the backend be available during this phase execution?
   - Recommendation: Design tests to work against localhost:3000 (`npm run start:dev`). Fall back to code review + unit tests if server unavailable.

2. **Two authenticated users for tenant isolation testing**
   - What we know: SEC-02 requires two users in different tenants to prove cross-tenant rejection.
   - What's unclear: Whether the test DB has pre-seeded users in separate tenants.
   - Recommendation: Use the existing seed data (admin@pmsync.local, test@pmsync.local). If both are in the same tenant, create a second test tenant or verify at the guard unit test level.

3. **Rate limit test timing sensitivity**
   - What we know: Redis TTL is 60 seconds. Tests must send > limit requests within that window.
   - What's unclear: Whether test environment has latency that makes this unreliable.
   - Recommendation: Use the lowest-limit endpoints (@Throttle 10/min) for testing. Send requests sequentially without delay.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (*.spec.ts) + Vitest (*.test.ts) |
| Config file | `backend/jest.config.js` (Jest), `backend/vitest.config.ts` (Vitest) |
| Quick run command | `cd backend && npx jest --testPathPattern="auth\|roles\|csrf\|throttl" --no-coverage` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | Protected routes return 401 without session | integration (HTTP) | `npx ts-node --transpile-only backend/scripts/audit-deep-api.ts` | Partial (existing script covers GETs) |
| SEC-02 | Cross-tenant access returns 403 | unit + integration | `cd backend && npx jest --testPathPattern="tenant" --no-coverage` | Partial (tenant-scoping.extension.spec.ts exists) |
| SEC-03 | Mutations without CSRF return 403 | integration (HTTP) | Script-based: POST without X-CSRF-Token header | Partial (audit script tests some) |
| SEC-04 | Exceeding rate limit returns 429 | integration (HTTP) | Script-based: rapid-fire requests | No dedicated test |
| SEC-05 | Member role on admin endpoint returns 403 | unit + integration | `cd backend && npx jest --testPathPattern="roles\|admin-plugin" --no-coverage` | Partial (roles.guard not tested, admin-plugin.spec.ts exists) |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern="better-auth.guard\|roles\|tenant" --no-coverage`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** All 5 SEC requirements verified with documented evidence

### Wave 0 Gaps
- [ ] No dedicated SEC-04 rate limit test exists
- [ ] No dedicated RBAC integration test (member -> admin endpoint -> 403) exists
- [ ] SEC-01 audit script covers GETs but not all POST/PATCH/DELETE mutations
- [ ] SEC-02 cross-tenant test requires either live HTTP test or guard-level unit test extension
- [ ] SEC-03 CSRF test in audit script checks only auth routes, not domain mutations

## Sources

### Primary (HIGH confidence)
- `backend/src/common/auth/better-auth.guard.ts` - Global auth guard, @Public() bypass logic
- `backend/src/common/auth/roles.guard.ts` - RBAC enforcement, super-admin hierarchy
- `backend/src/common/auth/tenant.guard.ts` - Tenant isolation, cross-tenant check
- `backend/src/common/middleware/csrf.middleware.ts` - CSRF double-submit cookie, exclusion list
- `backend/src/common/guards/user-throttler.guard.ts` - Rate limiting, userId/IP tracker
- `backend/src/common/guards/redis-throttler-storage.service.ts` - Redis-backed throttle storage
- `backend/src/app.module.ts` - Global guard registration order
- `backend/src/main.ts` - Express middleware chain, CSRF application

### Secondary (MEDIUM confidence)
- `backend/scripts/audit-deep-api.ts` - Existing audit pattern for HTTP-level testing
- `backend/src/common/auth/__tests__/better-auth.guard.spec.ts` - Existing guard unit tests
- `backend/src/common/auth/__tests__/better-auth-flows.spec.ts` - Auth flow integration tests
- `docs/AUDIT.md` - Architecture and security audit document

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all security infrastructure is already in codebase, verified by reading source
- Architecture: HIGH - guard chain, middleware order, and decorator patterns verified from source code
- Pitfalls: HIGH - identified from actual source code behavior (Redis fail-open, TenantGuard not global, CSRF exclusions)

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable infrastructure, no planned changes)
