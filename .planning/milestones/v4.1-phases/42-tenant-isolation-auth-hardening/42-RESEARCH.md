# Phase 42: Tenant Isolation & Auth Hardening - Research

**Researched:** 2026-03-04
**Domain:** Multi-tenant security, JWT auth, refresh token rotation
**Confidence:** HIGH

## Summary

Phase 42 requires two distinct workstreams: (1) switching the existing Prisma tenant-scoping extension from audit mode to enforce mode, and expanding RolesGuard coverage from ~7% to >=50% of controllers; (2) implementing refresh token rotation with short-lived access tokens and a frontend auto-refresh interceptor.

The codebase is well-prepared for both. The tenant-scoping extension already exists with full operation coverage (reads, writes, creates, upserts, unique lookups). The single change is flipping `AUDIT_MODE` from `true` to `false`. RolesGuard exists and works, but is only wired to 2 controllers (TenantsController, GdprController) plus 3 methods on EmailSyncController. For auth hardening, no refresh token infrastructure exists today -- the system uses a single JWT access token stored in an httpOnly cookie with a 7-day session TTL. The auth-config already defaults to 15m access token expiry, but the cookie maxAge is hardcoded to 7 days and there is no `/auth/refresh` endpoint.

**Primary recommendation:** Flip tenant-scoping to enforce mode, add RolesGuard to controllers per TSEC-03..06, create a RefreshToken Prisma model with family-based rotation, add `/auth/refresh` endpoint, and wire an axios 401-interceptor that retries with refresh before logging out.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TSEC-01 | Prisma extension auto-injects tenantId from AsyncLocalStorage | ALREADY DONE -- extension exists in `prisma/tenant-scoping/` with full operation coverage |
| TSEC-02 | Queries without tenant context throw TenantContextRequiredError | Flip `AUDIT_MODE = false` in `tenant-scoping.extension.ts` line 48 |
| TSEC-03 | RolesGuard applied to >=50% of controller methods | Currently 2/33 controllers + 3 methods. Need ~15 more controllers |
| TSEC-04 | Admin-only endpoints guarded (@Roles('admin')) for tenants, users controllers | TenantsController done. UsersController needs RolesGuard + @Roles |
| TSEC-05 | Write operations guarded (@Roles('admin', 'manager')) for contacts, emails controllers | ContactsController and EmailsController need RolesGuard + @Roles on mutations |
| TSEC-06 | Compliance/audit endpoints guarded | GdprController done. Need: consent, data-export, data-deletion, legal, compliance-dashboard |
| TSEC-07 | Integration test: non-admin calling admin endpoint returns 403 | Write test using supertest against guarded endpoints |
| AUTH-01 | Access token lifetime reduced to 15 minutes | AuthConfigService already defaults to 15m. Fix cookie maxAge to match access token, not 7 days |
| AUTH-02 | Refresh token rotation with one-time-use tokens | New RefreshToken model, family-based rotation, token reuse detection |
| AUTH-03 | /auth/refresh endpoint for token renewal | New endpoint in AuthController, issues new access+refresh pair |
| AUTH-04 | Frontend auto-refresh via axios interceptor on 401 | Replace current logout-on-401 with refresh-then-retry pattern |
| AUTH-05 | All refresh tokens invalidated on password change | Extend resetPassword to deleteMany RefreshToken records |
| TEST-01 | Tenant-scoping negative tests | Cross-tenant query returns zero, missing context throws |
| TEST-02 | RolesGuard integration tests | Each role level verified against guarded endpoints |
| TEST-03 | Refresh token rotation tests | Reuse detection, rotation chain, password-change invalidation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @prisma/client | existing | Tenant-scoping extension, RefreshToken model | Already in use; `Prisma.defineExtension` handles query interception |
| @nestjs/jwt | existing | Access + refresh token signing | Already in use; supports multiple secrets |
| passport-jwt | existing | JWT extraction from cookie/header | Already in use with cookie extractor |
| bcrypt | existing | Refresh token hashing | Already in use for passwords |
| nanoid | existing | Token family IDs, refresh token IDs | Already in use for session IDs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios | existing (frontend) | 401 interceptor for auto-refresh | Modify existing interceptor in api-client.ts |
| crypto (node) | built-in | HMAC-SHA256 for refresh token hashing | Same pattern as password reset token hashing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JWT refresh tokens | Opaque refresh tokens stored in DB | Opaque tokens are simpler and better for refresh tokens -- RECOMMENDED. No JWT decode needed for refresh, just DB lookup |
| Family-based rotation | Simple one-time-use | Family-based detects token theft; simple rotation misses it |

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── prisma/
│   └── tenant-scoping/
│       └── tenant-scoping.extension.ts   # Flip AUDIT_MODE to false
├── modules/auth/
│   ├── controllers/auth.controller.ts    # Add /auth/refresh, /auth/change-password
│   ├── services/auth.service.ts          # Add refresh token logic
│   ├── helpers/cookie.helper.ts          # Fix cookie maxAge, add refresh cookie
│   └── guards/roles.guard.ts            # No changes needed (already works)
├── modules/users/controllers/            # Add RolesGuard + @Roles
├── modules/contacts/controllers/         # Add RolesGuard + @Roles on writes
├── modules/email/controllers/            # Add RolesGuard + @Roles on writes
├── modules/compliance/controllers/       # Add RolesGuard to remaining controllers
frontend/
├── lib/api-client.ts                     # 401 interceptor with refresh-then-retry
└── stores/auth-store.ts                  # No changes (cookie-based)
```

### Pattern 1: Flip Tenant Scoping to Enforce Mode
**What:** Change `AUDIT_MODE` constant from `true` to `false`
**When to use:** Phase 42 -- this is the TSEC-02 requirement
**Critical safety check:** Verify ALL services that run without tenant context (cron jobs, webhooks, seeds) use `withoutTenantScoping()` or `withoutTenantScopingAsync()`. If any are missed, they will break with TenantContextRequiredError.

```typescript
// tenant-scoping.extension.ts line 48
const AUDIT_MODE = false; // was: true
```

**Before flipping, audit these code paths:**
- Cron/scheduled jobs (sync-scheduler, webhook-lifecycle, data-cleanup, health checks)
- Webhook handlers (calendar-webhook, contacts-webhook, autumn-webhook, email-sync webhook)
- Seed scripts
- Queue processors (BullMQ workers)
- The modified files in git status show services that may need withoutTenantScoping wrapping

### Pattern 2: Refresh Token Rotation (Family-Based)
**What:** Each login creates a token family. Each refresh creates a new token in the same family and invalidates the old one. Reuse of an already-consumed token invalidates the entire family (theft detection).

```typescript
// New Prisma model
model RefreshToken {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String
  familyId    String   // groups all tokens from a single login
  tokenHash   String   @unique // HMAC-SHA256 hash of the opaque token
  expiresAt   DateTime
  isUsed      Boolean  @default(false) // true after rotation
  replacedBy  String?  // ID of the token that replaced this one
  createdAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([userId])
  @@index([familyId])
  @@map("refresh_tokens")
}
```

**Rotation flow:**
```
1. Login -> create familyId, issue access_token (15m) + refresh_token (7d)
2. Access token expires -> frontend calls POST /auth/refresh with refresh_token
3. Backend: lookup by tokenHash, verify not used, verify not expired
4. Mark old token as used, create new token in same family
5. Return new access_token + new refresh_token
6. If used token is presented again -> THEFT DETECTED
   -> Delete ALL tokens in that family
   -> Force logout on all devices for that family
```

### Pattern 3: Dual Cookie Strategy
**What:** Two separate httpOnly cookies -- short-lived access_token and long-lived refresh_token
**Why:** Cookie-based auth is already in use. The refresh token needs a different path (`/api/v1/auth/refresh`) to avoid sending it on every request.

```typescript
// Access token cookie -- short-lived, sent on all API requests
export const ACCESS_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction || isCrossSiteDev,
  sameSite: isCrossSiteDev ? 'none' : 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutes
};

// Refresh token cookie -- long-lived, only sent to /auth/refresh
export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction || isCrossSiteDev,
  sameSite: isCrossSiteDev ? 'none' : 'lax',
  path: '/api/v1/auth/refresh', // CRITICAL: restrict path
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};
```

### Pattern 4: Frontend 401 Interceptor with Refresh
**What:** On 401, attempt silent refresh before logging out. Queues concurrent requests during refresh to avoid thundering herd.

```typescript
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => apiClient(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await apiClient.post('/auth/refresh'); // cookie sent automatically
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

### Pattern 5: RolesGuard Expansion Strategy
**What:** Add RolesGuard to controller classes and @Roles to specific methods.

**Current state (2/33 controllers have RolesGuard):**
- TenantsController: `@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)` -- DONE
- GdprController: `@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)` -- DONE
- EmailSyncController: 3 individual methods with `@UseGuards(RolesGuard)` -- PARTIAL

**Controllers that need RolesGuard per requirements:**

| Controller | Guard Level | @Roles | Requirement |
|------------|------------|--------|-------------|
| UsersController | class | `@Roles('admin')` | TSEC-04 |
| ContactsController | method (writes) | `@Roles('admin', 'manager')` | TSEC-05 |
| EmailsController | method (writes) | `@Roles('admin', 'manager')` | TSEC-05 |
| ConsentController | class | `@Roles('admin')` | TSEC-06 |
| DataExportController | class | `@Roles('admin')` | TSEC-06 |
| DataDeletionController | class | `@Roles('admin')` | TSEC-06 |
| LegalController | class | `@Roles('admin')` | TSEC-06 |
| LabelsController | method (writes) | `@Roles('admin', 'manager')` | >= 50% |
| TemplatesController | method (writes) | `@Roles('admin', 'manager')` | >= 50% |
| SignaturesController | method (writes) | `@Roles('admin', 'manager')` | >= 50% |
| FoldersController | method (writes) | `@Roles('admin', 'manager')` | >= 50% |
| SubscriptionController | class | `@Roles('admin')` | >= 50% |
| AiObservabilityController | class | `@Roles('admin')` | >= 50% |

This gets us to ~17/33 controllers (>50%) with RolesGuard.

### Anti-Patterns to Avoid
- **Adding RolesGuard without JwtAuthGuard first:** RolesGuard depends on `req.user` being populated by JwtAuthGuard. Always ensure the guard chain is `JwtAuthGuard, TenantGuard, RolesGuard`.
- **Storing refresh tokens in plaintext:** Always hash with HMAC-SHA256 before storing, same as password reset tokens.
- **Using JWT for refresh tokens:** Unnecessary complexity. Opaque tokens + DB lookup is simpler and allows instant revocation.
- **Sending refresh cookie on all requests:** Use `path: '/api/v1/auth/refresh'` to limit exposure.
- **Forgetting to handle concurrent 401s in frontend:** Without request queuing, multiple API calls will all trigger refresh simultaneously.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token family tracking | Custom linked list | Simple `familyId` column + `isUsed` flag | The linked-list approach adds complexity; a family ID with batch delete is simpler |
| Rate limiting on refresh | Custom counter | Existing `@Throttle()` decorator | Already used on login/OTP endpoints |
| Session cache invalidation | Manual Redis commands | Existing `CacheService.del()` | Already used in logout/password-reset |
| CSRF on refresh endpoint | Custom middleware | Existing CSRF middleware already configured | Refresh uses httpOnly cookie, CSRF already handles POST requests |

## Common Pitfalls

### Pitfall 1: Breaking Cron Jobs When Switching to Enforce Mode
**What goes wrong:** Cron jobs, queue workers, and webhooks that query tenant-scoped models without tenant context will throw TenantContextRequiredError.
**Why it happens:** These code paths don't go through the HTTP request pipeline, so CorrelationContext never sets a tenantId.
**How to avoid:** Before flipping AUDIT_MODE, grep for all `logger.warn('Unscoped query:')` in logs to find code paths that need `withoutTenantScoping()` wrapping. The modified files in git status (data-cleanup.service, hitl.service, contacts-sync-scheduler, sync-scheduler, webhook-lifecycle, health.service) are likely candidates.
**Warning signs:** Application fails to boot or cron jobs throw errors after the flip.

### Pitfall 2: Cookie MaxAge Mismatch
**What goes wrong:** Access token expires in 15 minutes but cookie lives for 7 days. Browser keeps sending an expired JWT.
**Why it happens:** Current `AUTH_COOKIE_OPTIONS.maxAge` is 7 days, matching the session TTL not the token TTL.
**How to avoid:** When implementing dual cookies, set access cookie maxAge to 15m and refresh cookie maxAge to 7d.
**Warning signs:** 401 errors after 15 minutes even though cookie is still present.

### Pitfall 3: Refresh Token Reuse Detection False Positives
**What goes wrong:** Legitimate client retries a refresh request (network timeout), and the server treats it as token theft.
**Why it happens:** First request consumed the token, retry uses the same (now-consumed) token.
**How to avoid:** Add a short grace period (~10 seconds) where a consumed token still returns the same new token pair (idempotency window). Store the replacement token pair temporarily.
**Warning signs:** Users randomly logged out across all devices.

### Pitfall 4: RolesGuard on Read Endpoints Breaks Regular Users
**What goes wrong:** Adding `@Roles('admin')` to a controller class-level guard blocks regular users from read endpoints.
**Why it happens:** Class-level guard applies to ALL methods including GETs.
**How to avoid:** For controllers with mixed access (TSEC-05), apply RolesGuard at CLASS level but only put @Roles on individual WRITE methods (POST, PUT, PATCH, DELETE). Methods without @Roles pass through RolesGuard (it returns true when no roles are required).
**Warning signs:** 403 errors on list/detail views for regular users.

### Pitfall 5: Frontend Refresh Loop
**What goes wrong:** If /auth/refresh itself returns 401 (e.g., refresh token expired), the interceptor tries to refresh again, creating an infinite loop.
**Why it happens:** The interceptor catches ALL 401s including the refresh endpoint's own 401.
**How to avoid:** Check if the failing request URL is `/auth/refresh` -- if so, skip retry and logout immediately.
**Warning signs:** Browser hangs, network tab shows repeated /auth/refresh calls.

## Code Examples

### Enforce Mode Flip
```typescript
// backend/src/prisma/tenant-scoping/tenant-scoping.extension.ts
// Line 48: Change from audit to enforce
const AUDIT_MODE = false;
```

### RefreshToken Schema Addition
```prisma
// backend/prisma/schema.prisma
model RefreshToken {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String
  familyId    String
  tokenHash   String   @unique
  expiresAt   DateTime
  isUsed      Boolean  @default(false)
  replacedBy  String?
  createdAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([userId])
  @@index([familyId])
  @@map("refresh_tokens")
}
```

### Refresh Endpoint
```typescript
// POST /auth/refresh
@Post('refresh')
@HttpCode(HttpStatus.OK)
@Throttle({ default: { limit: 10, ttl: 60000 } })
async refresh(
  @Req() req: ExpressRequest,
  @Res({ passthrough: true }) res: ExpressResponse,
) {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    throw new UnauthorizedException('No refresh token');
  }
  const result = await this.authService.rotateRefreshToken(refreshToken);
  setAccessCookie(res, result.accessToken);
  setRefreshCookie(res, result.refreshToken);
  return { success: true };
}
```

### Adding RolesGuard to a Controller (Class + Method Level)
```typescript
// Example: ContactsController with write-only guarding
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard) // Add RolesGuard
@Controller('contacts')
export class ContactsController {
  // GET methods -- no @Roles, so RolesGuard passes through
  @Get()
  findAll() { ... }

  // WRITE methods -- require admin or manager
  @Post()
  @Roles('admin', 'manager')
  create() { ... }

  @Put(':id')
  @Roles('admin', 'manager')
  update() { ... }

  @Delete(':id')
  @Roles('admin', 'manager')
  delete() { ... }
}
```

### Password Change Session Invalidation (AUTH-05)
```typescript
// In auth.service.ts -- add to changePassword / resetPassword
async invalidateAllTokensForUser(userId: string, tenantId: string) {
  // 1. Delete all refresh tokens
  await this.prisma.refreshToken.deleteMany({
    where: { userId, tenantId },
  });

  // 2. Delete all sessions (existing pattern)
  const sessions = await this.prisma.session.findMany({
    where: { userId },
    select: { id: true },
  });
  await Promise.all(
    sessions.map(s =>
      this.cacheService.del(`${tenantId}:${s.id}`, { namespace: CacheNamespace.USER_SESSION })
    ),
  );
  await this.cacheService.del(`${tenantId}:user:${userId}`, { namespace: CacheNamespace.USER_SESSION });
  await this.prisma.session.deleteMany({ where: { userId } });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived access tokens (24h+) | 15m access + 7d refresh with rotation | 2024-2025 | Industry standard since OWASP 2024 guidelines |
| Single token (access only) | Access + refresh pair | Standard | Balances UX (no re-login) with security (short exposure window) |
| Manual tenant filtering in queries | Prisma extension auto-injection | Already in codebase | Eliminates human error in tenant scoping |
| Audit-only tenant scoping | Enforce mode (throw on missing context) | This phase | Prevents silent data leaks |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (spec files) + Vitest (test files) |
| Config file | `backend/jest.config.js` + `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern="tenant-scoping" --no-coverage` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TSEC-02 | Query without context throws TenantContextRequiredError | unit | `npx jest --testPathPattern="tenant-scoping.extension" -t "enforce"` | Partially (audit mode tested) |
| TSEC-07 | Non-admin calling admin endpoint returns 403 | integration | `npx jest --testPathPattern="roles-guard.integration"` | No -- Wave 0 |
| TEST-01 | Cross-tenant query returns zero records | integration | `npx jest --testPathPattern="tenant-isolation"` | No -- Wave 0 |
| TEST-02 | RolesGuard per role level | integration | `npx jest --testPathPattern="roles-guard.integration"` | No -- Wave 0 |
| TEST-03 | Refresh token rotation chain | unit+integration | `npx jest --testPathPattern="refresh-token"` | No -- Wave 0 |
| AUTH-01 | Access token expires after 15min | integration | `npx jest --testPathPattern="token-expiry"` | No -- Wave 0 |
| AUTH-05 | Password change invalidates all sessions | integration | `npx jest --testPathPattern="password-change-invalidation"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern="tenant-scoping|roles-guard|refresh-token" --no-coverage`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/prisma/tenant-scoping/__tests__/tenant-scoping-enforce.spec.ts` -- covers TSEC-02
- [ ] `backend/src/modules/auth/__tests__/roles-guard.integration.spec.ts` -- covers TSEC-07, TEST-02
- [ ] `backend/src/modules/auth/__tests__/refresh-token.spec.ts` -- covers TEST-03, AUTH-02
- [ ] `backend/src/modules/auth/__tests__/tenant-isolation.spec.ts` -- covers TEST-01
- [ ] `backend/src/modules/auth/__tests__/password-change-invalidation.spec.ts` -- covers AUTH-05

## Open Questions

1. **changePassword endpoint does not exist**
   - What we know: `resetPassword` (via email token) invalidates sessions. But AUTH-05 says "changing password" not just "resetting password."
   - What's unclear: Should we create a new `POST /auth/change-password` (requires current password + new password, authenticated)?
   - Recommendation: Yes, create it. It is needed for AUTH-05 to be meaningful (users changing their own password while logged in).

2. **Modified files in git status may break on enforce mode**
   - What we know: 6 service files are modified on the working branch: data-cleanup, hitl, contacts-sync-scheduler, sync-scheduler, webhook-lifecycle, health.service
   - What's unclear: Are these modifications already wrapping operations in `withoutTenantScoping()`?
   - Recommendation: Read and verify each before flipping the flag. These are likely the cron/worker paths that need wrapping.

3. **Existing roles in the system**
   - What we know: JWT payload includes `role`, RolesGuard checks against it. The code references `super-admin`, `admin`, `manager`, `member`, `viewer`.
   - What's unclear: Are `manager`, `member`, `viewer` actually used or just planned?
   - Recommendation: Verify in the User model/seed data which roles exist. Only guard for roles that exist.

## Sources

### Primary (HIGH confidence)
- `backend/src/prisma/tenant-scoping/tenant-scoping.extension.ts` -- full extension source, AUDIT_MODE flag at line 48
- `backend/src/prisma/tenant-scoping/tenant-context.ts` -- AsyncLocalStorage context, bypass mechanism
- `backend/src/prisma/tenant-scoping/tenant-scoped-models.ts` -- 42 models, 5 composite PK models
- `backend/src/modules/auth/services/auth.service.ts` -- current token generation (single JWT, no refresh)
- `backend/src/modules/auth/services/auth-config.service.ts` -- refreshTokenSecret already configured, 15m default
- `backend/src/modules/auth/guards/roles.guard.ts` -- existing RolesGuard implementation
- `backend/src/modules/auth/strategies/jwt.strategy.ts` -- cookie extraction, session validation, cache
- `backend/src/modules/auth/helpers/cookie.helper.ts` -- httpOnly cookie, 7d maxAge
- `frontend/lib/api-client.ts` -- current 401 handler (immediate logout), CSRF interceptor
- `frontend/stores/auth-store.ts` -- cookie-based auth, no localStorage token

### Secondary (MEDIUM confidence)
- OWASP guidelines on refresh token rotation -- family-based rotation is standard recommendation
- NestJS guard ordering -- guards execute in array order, JwtAuthGuard must precede RolesGuard

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies needed
- Architecture: HIGH -- patterns derived directly from existing codebase patterns (cookie auth, session cache, guard chain)
- Pitfalls: HIGH -- identified from actual code paths (cron jobs, cookie maxAge, interceptor loops)

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain, no external dependency changes)
