# Phase 52: NestJS Session Validation - Research

**Researched:** 2026-03-06
**Domain:** NestJS guard architecture, better-auth session validation, tenant isolation, BullMQ context propagation
**Confidence:** HIGH

## Summary

Phase 52 replaces the JWT-based auth pipeline (Passport + JwtStrategy) with better-auth DB-backed session validation across all NestJS guards. The existing infrastructure is well-structured: `JwtAuthGuard` (5 lines, delegates to Passport), `TenantGuard` (reads tenantId from `request.user` and validates against DB), `RolesGuard` (reads role from `request.user` and checks against `@Roles()` metadata). The replacement is surgical -- swap JwtAuthGuard with a new BetterAuthGuard that calls `auth.api.getSession()`, then adapt TenantGuard and RolesGuard to read from the new session structure.

The `BetterAuthModule` (Phase 50-02) already provides the better-auth consumer instance via DI token `BETTER_AUTH`. The consumer instance is configured identically to the Next.js provider (session config, additionalFields) and can validate sessions using `auth.api.getSession({ headers: fromNodeHeaders(request.headers) })`. The session response includes `user.tenantId`, `user.role`, `user.firstName`, `user.lastName`, `user.isActive` via additionalFields.

The bodyParser concern (NEST-04) is a non-issue for the consumer-only pattern. The Phase 50-02 decision explicitly rejected `@thallesp/nestjs-better-auth` (which requires `bodyParser: false` globally) in favor of a custom minimal module. Since NestJS only validates sessions (never processes auth mutations), no body parsing changes are needed for auth routes. However, the success criteria explicitly mentions disabling bodyParser for `/api/auth/*` proxy routes -- this likely refers to a future proxy scenario or is inherited from the architecture doc. The planner should scope NEST-04 to "verify no bodyParser changes are needed and document why."

BullMQ jobs already carry `tenantId` directly in their job data interfaces (`SyncJobData.tenantId`, `EmailSendJobData.tenantId`, etc.). Controllers read `req.user.tenantId` and pass it to services that enqueue jobs. As long as the new BetterAuthGuard populates `request.user.tenantId` in the same shape as the old JwtStrategy, BullMQ context propagation works without any changes to queue services.

**Primary recommendation:** Replace JwtAuthGuard with a custom BetterAuthGuard that calls `auth.api.getSession()` via the existing BETTER_AUTH DI token. Adapt TenantGuard to read tenantId from the session user's additionalFields instead of the JWT payload. RolesGuard needs zero changes -- it already reads from `request.user.role`. Keep the `AuthenticatedRequest` interface contract identical so no downstream code changes are needed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NEST-01 | NestJS validates better-auth sessions via shared DB (AuthGuard) | `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` returns `{ session, user }` or null. User includes additionalFields (tenantId, role, isActive). Cookie `better-auth.session_token` sent by browser, parsed via Express cookie-parser already in main.ts. BetterAuthGuard replaces JwtAuthGuard. |
| NEST-02 | TenantGuard reads tenantId from better-auth session user | better-auth user has `tenantId` as additionalField. BetterAuthGuard puts it on `request.user.tenantId`. Existing TenantGuard reads from `request.user.tenantId` -- logic stays the same. Cross-tenant check and tenant active validation remain. |
| NEST-03 | RolesGuard enforces role-based access from better-auth session | better-auth user has `role` as additionalField (default: "member"). BetterAuthGuard puts it on `request.user.role`. RolesGuard already reads `request.user.role` and checks against `@Roles()` metadata -- zero code changes needed in RolesGuard itself. |
| NEST-04 | bodyParser selectively disabled for auth routes only | NestJS consumer does NOT handle auth mutations (no `/api/auth/*` routes on NestJS port 3000). All auth mutations go to Next.js (port 3001). No bodyParser changes needed in NestJS main.ts. The requirement is satisfied by the architecture: NestJS never receives auth POST bodies. Document this explicitly. |
| NEST-06 | BullMQ jobs retain correct tenantId from new auth context | All job data interfaces (SyncJobData, EmailSendJobData, BulkOperationJobData, FolderJobData) already have `tenantId: string` populated from `req.user.tenantId` in controllers. As long as BetterAuthGuard populates `request.user.tenantId` identically to JwtStrategy, no queue service changes needed. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | 1.5.4 | Session validation via `auth.api.getSession()` | Already installed, consumer instance already wired in BetterAuthModule (Phase 50-02) |
| `better-auth/node` | (bundled) | `fromNodeHeaders()` to convert Express IncomingHttpHeaders to Web Headers | Required by `auth.api.getSession()` which expects Web API Headers object |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/common` | existing | Guards (CanActivate), decorators (SetMetadata), exceptions | Guard implementation |
| `cookie-parser` | existing | Parses cookies from request headers | Already applied in main.ts via `app.use(cookieParser())` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom BetterAuthGuard | `@thallesp/nestjs-better-auth` | Community package requires `bodyParser: false` globally, unclear impact on existing middleware (CSRF, webhooks). Custom guard is ~40 lines, full control. Phase 50-02 already decided against the community package. |
| `auth.api.getSession()` | Direct Prisma session query | Bypasses better-auth's cookie caching, session refresh, and plugin hooks. Always use the official API. |
| Redis cache (old JwtStrategy pattern) | better-auth cookieCache | better-auth's `cookieCache` (compact strategy, 5 min) already handles caching. The old Redis USER_SESSION cache in JwtStrategy is redundant and should be removed. |

**Installation:**

No new packages needed. `better-auth` 1.5.4 already installed in backend.

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
  common/
    auth/
      better-auth.instance.ts   # EXISTS: consumer factory
      better-auth.module.ts     # EXISTS: DI module
      better-auth.guard.ts      # NEW: replaces JwtAuthGuard
      public.decorator.ts       # NEW: @Public() decorator for open routes
  modules/
    auth/
      guards/
        jwt-auth.guard.ts       # DEPRECATED: keep as dead code until Phase 58 cleanup
        tenant.guard.ts         # MODIFY: simplify (tenantId now from session user)
        roles.guard.ts          # NO CHANGE: already reads request.user.role
      strategies/
        jwt.strategy.ts         # DEPRECATED: keep until Phase 58 cleanup
      decorators/
        roles.decorator.ts      # NO CHANGE: @Roles() works as-is
```

### Pattern 1: BetterAuthGuard (replaces JwtAuthGuard)

**What:** Global guard that validates better-auth session cookies on every request. Replaces the Passport JWT pipeline.
**When to use:** Applied globally via APP_GUARD. Every HTTP request goes through it.

```typescript
// backend/src/common/auth/better-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { BETTER_AUTH } from './better-auth.module';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class BetterAuthGuard implements CanActivate {
  private readonly logger = new Logger(BetterAuthGuard.name);

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: any,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for @Public() decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Map to AuthenticatedRequest shape (backward compatible)
    request.user = {
      id: session.user.id,
      userId: session.user.id,
      tenantId: session.user.tenantId,
      email: session.user.email,
      firstName: session.user.firstName ?? null,
      lastName: session.user.lastName ?? null,
      role: session.user.role ?? 'member',
      sessionId: session.session.id,
    };

    return true;
  }
}
```

### Pattern 2: @Public() Decorator

**What:** Marks routes that skip auth (health, webhooks, auth proxy).
**When to use:** On controllers/handlers that must be accessible without a session.

```typescript
// backend/src/common/auth/public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

### Pattern 3: Guard Execution Order

**What:** NestJS executes guards in registration order. Global guards run before controller/handler guards.
**When to use:** Understanding the request lifecycle.

```
Request → ThrottlerGuard → BetterAuthGuard → LegalAcceptanceGuard → ConsentGuard
       → Controller-level: TenantGuard → RolesGuard
       → CorrelationInterceptor → Handler
```

**Critical ordering:**
1. BetterAuthGuard MUST run before LegalAcceptanceGuard/ConsentGuard (they need `request.user`)
2. TenantGuard runs at controller level (after BetterAuthGuard has set `request.user`)
3. RolesGuard runs at controller level (after both BetterAuthGuard and TenantGuard)

### Pattern 4: Session-to-User Mapping

**What:** Map better-auth session response to existing `AuthenticatedRequest.user` interface.
**When to use:** In the BetterAuthGuard, ensuring backward compatibility.

```typescript
// better-auth getSession returns:
{
  session: { id, token, userId, expiresAt, ipAddress, userAgent, createdAt, updatedAt },
  user: { id, email, name, emailVerified, image, tenantId, firstName, lastName, role, isActive }
}

// Must map to existing AuthenticatedRequest.user:
{
  id: string;       // user.id
  userId: string;   // user.id (duplicated for backward compat)
  tenantId: string; // user.tenantId (from additionalFields)
  email: string;    // user.email
  firstName?: string | null;  // user.firstName (additionalField)
  lastName?: string | null;   // user.lastName (additionalField)
  role: string;     // user.role (additionalField, default "member")
  sessionId?: string | null;  // session.id
}
```

### Anti-Patterns to Avoid

- **Writing custom session DB queries in guards:** Always use `auth.api.getSession()`. It handles cookie caching, session refresh, and plugin hooks. The old JwtStrategy did direct Prisma queries -- that pattern is obsolete.
- **Keeping the Redis USER_SESSION cache alongside better-auth:** better-auth has its own `cookieCache` (compact strategy, 5 min). The old JwtStrategy's Redis cache is redundant. Do NOT dual-cache.
- **Modifying bodyParser in main.ts:** The NestJS instance is a session consumer only. It never handles auth POST bodies. No bodyParser changes needed.
- **Globally removing JwtAuthGuard from all 39 controller files:** Do NOT do a mass find-replace. Instead, register BetterAuthGuard as APP_GUARD (global) and add `@Public()` to routes that were previously unguarded. Then remove explicit `@UseGuards(JwtAuthGuard)` from controllers gradually.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session validation | Direct Prisma query for session lookup | `auth.api.getSession()` | Handles cookie caching, session refresh, expiry, and all plugin hooks |
| Header conversion | Manual cookie string construction | `fromNodeHeaders(request.headers)` | Correctly converts Node.js IncomingHttpHeaders to Web API Headers |
| Session caching | Redis USER_SESSION cache (old JwtStrategy) | better-auth's `cookieCache` | Already configured (compact, 5 min), signed cookie prevents tampering |
| Token extraction | Cookie extractors (old `cookieExtractor`) | better-auth internal cookie parsing | `auth.api.getSession()` handles cookie name, parsing, and validation |

**Key insight:** The entire 430-line JwtStrategy (Redis caching, session DB lookup, user validation, tenant checks, role checks, idle timeout) is replaced by ~40 lines in BetterAuthGuard because `auth.api.getSession()` handles all of it internally.

## Common Pitfalls

### Pitfall 1: Guard Registration Order
**What goes wrong:** BetterAuthGuard registered after LegalAcceptanceGuard/ConsentGuard in APP_GUARD providers array. Those guards need `request.user` but it hasn't been set yet.
**Why it happens:** NestJS executes APP_GUARD providers in array order.
**How to avoid:** Register BetterAuthGuard FIRST in the APP_GUARD providers, before ThrottlerGuard if possible (throttler doesn't need user context). Or at minimum: BetterAuthGuard before LegalAcceptanceGuard and ConsentGuard.
**Warning signs:** LegalAcceptanceGuard logs "no user context" for authenticated routes.

### Pitfall 2: Public Routes Not Marked
**What goes wrong:** Health checks, webhook endpoints, and the auth proxy route get rejected with 401 when BetterAuthGuard is registered globally.
**Why it happens:** Global guard applies to ALL routes unless explicitly skipped.
**How to avoid:** Create `@Public()` decorator. Apply to health endpoints, webhook controllers, and any routes that currently don't use `@UseGuards(JwtAuthGuard)`.
**Warning signs:** Health check fails after deploying, webhooks return 401.

### Pitfall 3: Cookie Not Forwarded to better-auth
**What goes wrong:** `auth.api.getSession()` returns null even though the browser sends the cookie.
**Why it happens:** Express `cookie-parser` middleware parses cookies and removes them from raw headers. But `fromNodeHeaders(request.headers)` reads the raw `cookie` header.
**How to avoid:** Verify that `cookie-parser` does NOT strip the raw `cookie` header from `request.headers`. It should not -- cookie-parser populates `req.cookies` as a parsed object but leaves the raw header intact. But verify this works in the actual codebase.
**Warning signs:** Session validation always fails, every request hits DB (no cookie cache).

### Pitfall 4: Tenant Context Not Set for Correlation Interceptor
**What goes wrong:** CorrelationInterceptor reads `req.user?.tenantId` but gets undefined because it runs before or at the same time as the guard.
**Why it happens:** Guards run before interceptors in NestJS lifecycle (guards -> interceptors -> pipes -> handler). So `request.user` IS set by the time CorrelationInterceptor runs.
**How to avoid:** This is actually fine -- NestJS lifecycle guarantees guards complete before interceptors. Just verify the flow works.
**Warning signs:** None expected -- this is a non-issue with correct NestJS lifecycle understanding.

### Pitfall 5: TenantGuard Double-Querying
**What goes wrong:** TenantGuard currently looks up the tenant by ID/slug from the database. With better-auth, tenantId is already validated as part of the user's additionalFields.
**Why it happens:** TenantGuard was designed for a JWT world where tenantId in the token could be forged.
**How to avoid:** Simplify TenantGuard -- the tenantId comes from a DB-backed session (not a JWT claim), so it's already trustworthy. Still verify tenant.isActive, but skip the header-based slug lookup.
**Warning signs:** N+1 DB queries on every request (session lookup + tenant lookup). Consider caching.

### Pitfall 6: AuthenticatedRequest.userId vs .id Mismatch
**What goes wrong:** Some code uses `req.user.userId`, other code uses `req.user.id`. The mapping must set both.
**Why it happens:** Historical inconsistency in the codebase.
**How to avoid:** Set both `id` and `userId` to `session.user.id` in the guard mapping. The `AuthenticatedRequest` interface already has both.
**Warning signs:** Prisma queries fail with "where clause expects string, got undefined."

## Code Examples

### BetterAuthGuard Session Validation

```typescript
// Source: better-auth v1.5.4 API + fromNodeHeaders
import { fromNodeHeaders } from 'better-auth/node';

const session = await this.auth.api.getSession({
  headers: fromNodeHeaders(request.headers),
});

// session is null if invalid/expired
// session.user includes additionalFields:
// { id, email, name, emailVerified, image, tenantId, firstName, lastName, role, isActive }
// session.session includes:
// { id, token, userId, expiresAt, ipAddress, userAgent, createdAt, updatedAt }
```

### Registering BetterAuthGuard as APP_GUARD

```typescript
// app.module.ts providers array -- ORDER MATTERS
providers: [
  { provide: APP_GUARD, useClass: ThrottlerGuard },
  { provide: APP_GUARD, useClass: BetterAuthGuard },  // MUST be before Legal/Consent
  { provide: APP_GUARD, useClass: LegalAcceptanceGuard },
  { provide: APP_GUARD, useClass: ConsentGuard },
  // ... interceptors
],
```

### Identifying Routes That Need @Public()

```typescript
// Routes currently WITHOUT @UseGuards(JwtAuthGuard) that need @Public():
// - HealthModule endpoints (health/*, health)
// - Webhook endpoints (webhooks/*)
// - Auth endpoints (if any NestJS-side auth routes exist)
// - Swagger docs endpoint
//
// Currently the JwtAuthGuard is NOT registered as APP_GUARD.
// It's applied per-controller with @UseGuards(JwtAuthGuard, ...).
// When we move to global BetterAuthGuard, every controller that
// currently doesn't have @UseGuards(JwtAuthGuard) needs @Public().
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JWT + Passport strategy + Redis cache (430 LOC) | `auth.api.getSession()` with cookieCache (~40 LOC) | Phase 52 | Eliminates JwtModule, PassportModule, JwtStrategy, custom cookie extractor |
| `__Host-access_token` / `access_token` cookie | `better-auth.session_token` cookie | Phase 50 | Cookie name change; old cookies are simply ignored |
| JWT claims (userId, tenantId, sessionId, role) | DB-backed session with user additionalFields | Phase 50 | No more JWT forgery risk; session revocation is instant |
| Redis USER_SESSION cache (5 min TTL) | better-auth cookieCache (compact, 5 min) | Phase 52 | Signed cookie serves as cache; no Redis hit for cached sessions |

**Deprecated/outdated:**
- `JwtAuthGuard`: Replaced by BetterAuthGuard (keep file until Phase 58 cleanup)
- `JwtStrategy`: All 430 lines replaced by better-auth's getSession (keep until Phase 58)
- `AuthConfigService.jwtSecret/jwtPublicKey`: No longer needed for session validation
- `CacheNamespace.USER_SESSION`: Redis cache replaced by cookieCache
- `passport-jwt`, `@nestjs/passport`, `@nestjs/jwt` packages: Dead after Phase 52, removed in Phase 58

## Open Questions

1. **Cookie-parser interaction with fromNodeHeaders**
   - What we know: cookie-parser populates `req.cookies` but typically leaves the raw `cookie` header intact in `req.headers`
   - What's unclear: Whether cookie-parser's behavior in this specific Express version strips or modifies the raw header
   - Recommendation: Test in dev environment during implementation. If broken, move cookie-parser middleware to apply AFTER the auth guard, or reconstruct the cookie header from `req.cookies`.

2. **LegalAcceptanceGuard / ConsentGuard pre-auth behavior**
   - What we know: These guards currently check `if (!request.user) return true` (skip when no user -- designed for APP_GUARD pre-auth pass-through)
   - What's unclear: With BetterAuthGuard as APP_GUARD running first, will these guards always have `request.user` set (even for public routes where BetterAuthGuard skips)?
   - Recommendation: For `@Public()` routes, BetterAuthGuard returns true without setting `request.user`. The existing `if (!request.user) return true` in LegalAcceptanceGuard/ConsentGuard handles this correctly. No change needed.

3. **isActive check location**
   - What we know: JwtStrategy checks `user.isActive` and `tenant.isActive` during validation. better-auth's getSession does NOT check isActive (it's a custom additionalField).
   - What's unclear: Should isActive be checked in BetterAuthGuard or TenantGuard?
   - Recommendation: Check `session.user.isActive === false` in BetterAuthGuard (throw 401). Check `tenant.isActive` in TenantGuard (already does this).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (via NestJS) |
| Config file | `backend/jest.config.ts` |
| Quick run command | `cd backend && npx jest --passWithNoTests --maxWorkers=1` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NEST-01 | BetterAuthGuard rejects invalid session with 401 | unit | `cd backend && npx jest src/common/auth/__tests__/better-auth.guard.spec.ts -x` | No - Wave 0 |
| NEST-01 | BetterAuthGuard allows valid session and sets request.user | unit | `cd backend && npx jest src/common/auth/__tests__/better-auth.guard.spec.ts -x` | No - Wave 0 |
| NEST-02 | TenantGuard reads tenantId from session user | unit | `cd backend && npx jest src/modules/auth/__tests__/tenant-isolation.spec.ts -x` | Yes (needs update) |
| NEST-03 | RolesGuard enforces roles from session user | unit | `cd backend && npx jest src/modules/auth/__tests__/roles-guard.integration.spec.ts -x` | Yes (needs update) |
| NEST-04 | No bodyParser changes needed (architecture validation) | manual-only | N/A | N/A |
| NEST-06 | BullMQ job tenantId matches authenticated user | unit | `cd backend && npx jest src/common/auth/__tests__/better-auth.guard.spec.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/common/auth/__tests__/better-auth.guard.spec.ts` -- covers NEST-01, NEST-06
- [ ] Update `backend/src/modules/auth/__tests__/tenant-isolation.spec.ts` -- covers NEST-02
- [ ] Update `backend/src/modules/auth/__tests__/roles-guard.integration.spec.ts` -- covers NEST-03

## Sources

### Primary (HIGH confidence)
- better-auth v1.5.4 installed package (`backend/node_modules/better-auth/dist/`) -- session API types, fromNodeHeaders signature
- Existing codebase (`backend/src/`) -- current guard implementations, tenant scoping, BullMQ job interfaces
- Phase 50 RESEARCH.md -- architecture decisions, dual-instance pattern, consumer-only approach
- Phase 50-02 PLAN.md -- BetterAuthModule wiring, rejection of @thallesp/nestjs-better-auth
- v5-ARCHITECTURE.md -- data flow diagrams, guard replacement pattern

### Secondary (MEDIUM confidence)
- v5-SUMMARY.md -- research flags for bodyParser concern
- NestJS guard execution order (well-documented NestJS lifecycle)

### Tertiary (LOW confidence)
- cookie-parser raw header preservation behavior -- needs runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and wired, no new dependencies
- Architecture: HIGH - clear pattern from existing code + better-auth API types
- Pitfalls: HIGH - identified from actual code analysis (guard order, cookie flow, tenant mapping)
- bodyParser: MEDIUM - architecture says "no changes needed" but success criteria lists it explicitly

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, better-auth 1.5.x API unlikely to change)
