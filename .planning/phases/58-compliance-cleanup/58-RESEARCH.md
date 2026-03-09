# Phase 58: Compliance & Cleanup - Research

**Researched:** 2026-03-09
**Domain:** better-auth audit hooks, legacy auth deletion, integration testing
**Confidence:** HIGH

## Summary

Phase 58 covers three distinct areas: (1) wiring better-auth lifecycle events into the existing AuditLog system, (2) deleting all legacy JWT-based auth code, and (3) building an integration test suite for better-auth flows. The scope is constrained -- CLN-02 and CLN-03 (GDPR org-related) are deferred.

The codebase is well-prepared. The `AuditService` already supports fire-and-forget logging with `logAudit()`, the better-auth instance at `better-auth.instance.ts` already has `databaseHooks` and `hooks.before` patterns that can be extended for audit events. The old auth code is cleanly isolated in `backend/src/modules/auth/` with no frontend consumers -- the frontend uses better-auth client exclusively. The deletion is surgical: remove the old `AuthModule`, its services/controllers/strategies/DTOs/tests, the deprecated Prisma fields, the `RefreshToken` model, and 5 npm packages.

**Primary recommendation:** Execute in three sequential waves: (1) audit hooks first (additive, no risk), (2) legacy code deletion (subtractive, verify build), (3) test suite (validates everything works).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hook into better-auth lifecycle via `databaseHooks` and `hooks.after` middleware for: login success, login failure, logout, signup, email verification, password change, password reset request, 2FA enable/disable, passkey register/remove, social account link/unlink
- Use existing `AuditLog` Prisma model -- no schema changes needed
- Capture per event: userId, tenantId, eventType, ipAddress, userAgent, metadata (provider name for OAuth, method for 2FA)
- Fire-and-forget pattern (don't block auth response for audit writes)
- Phase 55 already deleted MFA-specific old code (4 backend + 6 frontend files)
- Remaining old auth code to delete: JWT-related services, old AuthGuard (JWT-based), old auth DTOs, old session management, deprecated npm packages
- Delete deprecated Prisma fields: passwordHash, isMfaEnabled, lastActivityAt on User model; old RefreshToken model
- Verification: `npm run build` + `npm run type-check` must pass after deletion; grep for deleted imports
- Integration tests using better-auth test client (not E2E with browser)
- Flows to cover: email signup, email signin, email verification, password reset, session validation (BetterAuthGuard), 2FA TOTP enable/verify, social login mock, session revocation
- Mock external providers (Google/Microsoft OAuth) at the HTTP level

### Claude's Discretion
- Exact audit event type naming convention
- Test file organization and test runner configuration
- Order of legacy code deletion (services first vs packages first)
- Whether to create a migration for deprecated field removal or use `db push`

### Deferred Ideas (OUT OF SCOPE)
- CLN-02: GDPR data export including organization membership tables -- requires Phase 56
- CLN-03: Right to erasure cascade into organization and membership tables -- requires Phase 56
- CLN-05 (org/admin): Test flows for organization CRUD, invitations, role changes, admin ban/unban/impersonation -- requires Phases 56+57
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLN-01 | Auth events logged to audit trail | Audit hooks in better-auth instance using existing AuditService fire-and-forget pattern |
| CLN-02 | GDPR data export includes better-auth tables | **DEFERRED** -- out of scope per CONTEXT.md |
| CLN-03 | Right to erasure cascades into better-auth tables | **DEFERRED** -- out of scope per CONTEXT.md |
| CLN-04 | Old auth code deleted, app builds cleanly | Full inventory of deletable files, packages, and Prisma models documented below |
| CLN-05 | Auth test suite covers better-auth flows (partial) | Jest test infrastructure exists; better-auth test patterns documented below |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | ^1.5.4 | Auth framework -- hooks/databaseHooks for audit events | Already installed, lifecycle events are the hook mechanism |
| @prisma/client | (existing) | AuditLog writes | Already used by AuditService |
| jest | ^30.2.0 | Test runner | Already configured in backend |
| ts-jest | ^29.4.6 | TypeScript transform for Jest | Already configured |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nock or msw | latest | HTTP-level mocking for OAuth providers | For social login test mocking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| nock | msw (Mock Service Worker) | msw is heavier but more modern; nock is lighter for pure HTTP mocking in Node |

**No new installations needed for CLN-01 or CLN-04.** For CLN-05 tests, consider whether `nock` or manual `jest.fn()` mocking is sufficient (the existing guard spec already mocks at the module level).

## Architecture Patterns

### Pattern 1: Audit Event Hook (CLN-01)

**What:** Add `hooks.after` entries in `better-auth.instance.ts` to fire audit writes after auth lifecycle events.

**When to use:** Every auth action that must be audited.

**Critical detail:** better-auth `hooks.after` receives `(context)` where `context` has `path`, `body`, `request`, `headers`, and the response data. The `databaseHooks` receive `(user/session, context)` with the created/updated record.

**Implementation approach:**

```typescript
// In better-auth.instance.ts, extend the existing hooks.after
hooks: {
  after: createAuthMiddleware(async (ctx) => {
    // Fire-and-forget audit write
    void logAuthEvent(prisma, ctx);
  }),
  before: createAuthMiddleware(async (ctx) => {
    // ... existing HIBP + ToS checks ...
  }),
},
```

**Key paths to audit (better-auth internal routes):**
| Path | Event Type | Notes |
|------|-----------|-------|
| `/sign-up/email` | `AUTH:SIGNUP` | databaseHooks.user.create.after already fires |
| `/sign-in/email` | `AUTH:LOGIN` | hooks.after on success |
| `/sign-out` | `AUTH:LOGOUT` | hooks.after |
| `/reset-password` | `AUTH:PASSWORD_RESET` | hooks.after |
| `/change-password` | `AUTH:PASSWORD_CHANGE` | hooks.after |
| `/verify-email` | `AUTH:EMAIL_VERIFIED` | hooks.after |
| `/two-factor/enable` | `AUTH:2FA_ENABLE` | hooks.after |
| `/two-factor/disable` | `AUTH:2FA_DISABLE` | hooks.after |
| `/passkey/register` | `AUTH:PASSKEY_REGISTER` | hooks.after |
| `/passkey/delete` | `AUTH:PASSKEY_REMOVE` | hooks.after |
| `/callback/:provider` | `AUTH:SOCIAL_LOGIN` | hooks.after, metadata includes provider |

**AuditLog mapping:**
- `action` = event type string (e.g., `AUTH:LOGIN`)
- `entity` = `'BetterAuth'`
- `entityId` = userId (from session or created user)
- `changes` = metadata JSON (provider, method, path)
- `ipAddress` from request headers
- `tenantId` from user record (requires lookup for some events)

**Problem: tenantId availability.** The hooks.after context may not always have tenantId readily available. For signup, the user just got provisioned. For login, the session result contains user data. Solution: use `withoutTenantScopingAsync` for audit writes (same pattern as workspace provisioning).

### Pattern 2: Legacy Code Deletion (CLN-04)

**What:** Remove old JWT-based auth infrastructure completely.

**Deletion inventory (verified by codebase scan):**

**Files to delete (backend/src/modules/auth/):**
| Path | Lines | Purpose |
|------|-------|---------|
| services/auth.service.ts | 95 | Facade delegating to sub-services |
| services/auth-config.service.ts | ~300 | JWT/ES256 config |
| services/auth-login.service.ts | ~350 | JWT login flow |
| services/auth-password-reset.service.ts | ~250 | JWT password reset |
| services/auth-registration.service.ts | ~220 | Registration with passwordHash |
| services/auth-token.service.ts | ~240 | JWT+refresh token management |
| services/backup-codes.service.ts | ~190 | Old backup codes (better-auth handles) |
| services/otp-security.service.ts | ~330 | Old OTP (better-auth handles) |
| services/password-hashing.service.ts | ~50 | bcrypt (better-auth handles) |
| services/password-policy.service.ts | ~110 | Policy checks (HIBP in better-auth hooks) |
| services/trusted-device.service.ts | ~250 | Old MFA device trust |
| strategies/jwt.strategy.ts | ~370 | Passport JWT strategy |
| guards/jwt-auth.guard.ts | 5 | Old JWT guard |
| controllers/auth.controller.ts | ~260 | Old auth endpoints |
| helpers/cookie.helper.ts | ~75 | JWT cookie helpers |
| dtos/*.ts | ~6 files | Old DTOs |
| auth.module.ts | 130 | Old module wiring JWT+Passport |
| **tests/** | 15 spec files | All old auth tests |

**Files to KEEP (still used by other modules):**
| Path | Reason |
|------|--------|
| guards/tenant.guard.ts | Used by 15+ controllers, reads request.user shape set by BetterAuthGuard |
| guards/roles.guard.ts | Used by 8+ controllers, reads request.user.role |
| decorators/roles.decorator.ts | Used with RolesGuard |

**CRITICAL:** TenantGuard and RolesGuard must be MOVED out of `modules/auth/` before deleting the auth module. Move to `common/auth/` or `common/guards/`.

**Prisma schema changes:**
- Remove `passwordHash` field from User (marked `@deprecated`)
- Remove `isMfaEnabled` field from User (marked `@deprecated`)
- Remove `lastActivityAt` field from Session (marked `@deprecated`)
- Remove entire `RefreshToken` model
- Use `prisma db push` (consistent with Phase 55 decision [55-01])

**npm packages to remove:**
| Package | Version | Replacement |
|---------|---------|-------------|
| jsonwebtoken | ^9.0.3 | better-auth DB sessions |
| passport | ^0.7.0 | better-auth guard |
| passport-jwt | ^4.0.1 | better-auth guard |
| @nestjs/passport | ^11.0.5 | BetterAuthGuard |
| @nestjs/jwt | ^11.0.2 | better-auth DB sessions |

**app.module.ts change:** Remove `AuthModule` import (keep `BetterAuthModule`).

### Pattern 3: Guard Relocation

**What:** TenantGuard, RolesGuard, and Roles decorator must move before AuthModule deletion.

**Target location:** `backend/src/common/auth/` (where BetterAuthGuard already lives).

**Files to move:**
- `modules/auth/guards/tenant.guard.ts` -> `common/auth/tenant.guard.ts`
- `modules/auth/guards/roles.guard.ts` -> `common/auth/roles.guard.ts`
- `modules/auth/decorators/roles.decorator.ts` -> `common/auth/roles.decorator.ts`

**Import updates needed:** ~20+ files import TenantGuard/RolesGuard/Roles from the old path.

### Anti-Patterns to Avoid
- **Deleting files before moving shared guards:** Will break 20+ controller imports immediately
- **Awaiting audit writes in hooks:** Blocks auth response latency; must be fire-and-forget
- **Creating new AuditLog model fields:** The existing model has `action`, `entity`, `entityId`, `changes` (JSON) -- sufficient for all event metadata
- **Running `prisma migrate dev` for schema changes:** Project has established pattern of `prisma db push` due to schema drift from prior phases

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth event lifecycle hooks | Custom middleware interceptors | better-auth `hooks.after` + `databaseHooks` | Framework provides typed context with path, body, request |
| Password hashing | Custom bcrypt wrapper | better-auth built-in | Already handles it internally |
| Session management | Custom session store | better-auth DB sessions | Already working since Phase 50 |
| TOTP/backup codes | Custom OTP service | better-auth `twoFactor` plugin | Already working since Phase 55 |

## Common Pitfalls

### Pitfall 1: Missing tenantId in audit hooks
**What goes wrong:** Auth hooks fire before workspace provisioning (signup) or with null tenantId
**Why it happens:** New users don't have a tenant yet during signup; some hook contexts don't include tenantId
**How to avoid:** For signup events, log with tenantId=null initially. For login/logout, extract tenantId from the session user data. Always use `withoutTenantScopingAsync` for audit writes.
**Warning signs:** Prisma errors on required tenantId field -- but AuditLog.tenantId is required. Must handle null case.

### Pitfall 2: Breaking imports during deletion
**What goes wrong:** Deleting `modules/auth/` breaks 20+ files importing TenantGuard/RolesGuard
**Why it happens:** Guards and decorators are co-located with old auth code
**How to avoid:** Move shared guards/decorators FIRST, update all imports, verify build, THEN delete old auth code
**Warning signs:** TypeScript compilation errors on guard imports

### Pitfall 3: RefreshToken FK cascade
**What goes wrong:** Dropping RefreshToken model fails if data exists
**Why it happens:** Foreign keys to User and Tenant
**How to avoid:** `prisma db push` handles this, but should verify no data exists first or do a `deleteMany` before schema push

### Pitfall 4: Jest mock paths for better-auth
**What goes wrong:** better-auth ESM imports fail in Jest
**Why it happens:** better-auth ships as ESM; Jest (CJS) needs explicit mocking
**How to avoid:** Existing `jest.config.js` already has `moduleNameMapper` for `better-auth/node`. Mock the entire better-auth module at module level (same as `better-auth.guard.spec.ts`)

### Pitfall 5: AuditLog tenantId is required
**What goes wrong:** AuditLog schema requires tenantId, but some auth events happen before tenant assignment
**Why it happens:** Signup creates user before workspace provisioning
**How to avoid:** For signup events specifically, either (a) skip audit write until after provisioning completes, or (b) use a sentinel tenantId like "SYSTEM" -- but option (a) is cleaner. Log in `databaseHooks.user.create.after` AFTER provisioning, where tenantId is now set.

## Code Examples

### Audit Hook Pattern
```typescript
// In better-auth.instance.ts -- extend existing hooks section
// Source: existing codebase pattern (AuditService + databaseHooks)

const AUDIT_PATHS: Record<string, string> = {
  '/sign-up/email': 'AUTH:SIGNUP',
  '/sign-in/email': 'AUTH:LOGIN',
  '/sign-out': 'AUTH:LOGOUT',
  '/reset-password': 'AUTH:PASSWORD_RESET',
  '/change-password': 'AUTH:PASSWORD_CHANGE',
  '/verify-email': 'AUTH:EMAIL_VERIFIED',
  '/two-factor/enable': 'AUTH:2FA_ENABLE',
  '/two-factor/disable': 'AUTH:2FA_DISABLE',
  '/passkey/register': 'AUTH:PASSKEY_REGISTER',
  '/passkey/delete/*': 'AUTH:PASSKEY_REMOVE',
};

async function logAuthEvent(
  prisma: PrismaClient,
  path: string,
  userId: string | null,
  tenantId: string | null,
  request: Request | undefined,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const eventType = Object.entries(AUDIT_PATHS).find(
    ([p]) => path === p || (p.endsWith('/*') && path.startsWith(p.slice(0, -2))),
  )?.[1];
  if (!eventType || !tenantId) return;

  try {
    await withoutTenantScopingAsync(() =>
      prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: eventType,
          entity: 'BetterAuth',
          entityId: userId ?? 'unknown',
          changes: metadata ?? null,
          ipAddress: getRequestIp(request),
        },
      }),
    );
  } catch {
    // Fire-and-forget -- never block auth
  }
}
```

### Guard Move Pattern
```typescript
// After moving to common/auth/tenant.guard.ts
// All consumers update import path:
// FROM: import { TenantGuard } from '../../../modules/auth/guards/tenant.guard';
// TO:   import { TenantGuard } from '../../../common/auth/tenant.guard';
```

### Test Pattern (better-auth guard mock)
```typescript
// Source: existing better-auth.guard.spec.ts pattern
jest.mock('../better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

// For integration tests, create a test helper:
function createMockBetterAuth(overrides?: Partial<{ getSession: jest.Mock }>) {
  return {
    api: {
      getSession: overrides?.getSession ?? jest.fn().mockResolvedValue({
        session: { id: 'test-sess' },
        user: {
          id: 'test-user',
          email: 'test@example.com',
          tenantId: 'test-tenant',
          role: 'member',
          isActive: true,
        },
      }),
    },
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JWT access + refresh tokens | DB-backed sessions with cookies | Phase 50 (2026-03-06) | No JWTs in the system |
| Passport.js strategy pattern | better-auth global guard | Phase 52 (2026-03-06) | Single BetterAuthGuard |
| Custom MFA (OTP, backup codes) | better-auth twoFactor plugin | Phase 55 (2026-03-09) | No custom MFA code |
| Custom password hashing | better-auth internal hashing | Phase 51 (2026-03-06) | No bcrypt in app code |

**Deprecated/outdated (to remove):**
- `JwtAuthGuard`: replaced by `BetterAuthGuard` (global APP_GUARD)
- `JwtStrategy`: no JWT validation needed
- `AuthTokenService`: refresh token rotation no longer exists
- `AuthModule`: entire module is dead code
- `RefreshToken` Prisma model: DB sessions replaced refresh tokens
- `passwordHash` on User: better-auth Account table stores credentials
- `isMfaEnabled` on User: better-auth twoFactor plugin manages state
- `lastActivityAt` on Session: better-auth uses `updatedAt`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + ts-jest 29.4.6 |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern="common/auth" --forceExit` |
| Full suite command | `cd backend && npx jest --forceExit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLN-01 | Auth events logged to AuditLog | unit | `cd backend && npx jest --testPathPattern="audit-hooks" --forceExit` | No -- Wave 0 |
| CLN-04 | Old code deleted, build passes | smoke | `cd backend && npm run build && npm run type-check` | N/A (build check) |
| CLN-05 | Auth flows work end-to-end | integration | `cd backend && npx jest --testPathPattern="better-auth-flows" --forceExit` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npm run type-check`
- **Per wave merge:** `cd backend && npx jest --forceExit`
- **Phase gate:** Full suite green + `npm run build` clean

### Wave 0 Gaps
- [ ] `backend/src/common/auth/__tests__/audit-hooks.spec.ts` -- covers CLN-01
- [ ] `backend/src/common/auth/__tests__/better-auth-flows.spec.ts` -- covers CLN-05
- [ ] No new framework install needed -- Jest already configured

## Open Questions

1. **AuditLog for signup without tenantId**
   - What we know: AuditLog.tenantId is required (non-nullable FK to Tenant)
   - What's unclear: Whether to log signup before or after workspace provisioning
   - Recommendation: Log in `databaseHooks.user.create.after` callback, AFTER `provisionWorkspaceForUser` completes, where tenantId is set. For social-login-first-time users (where provisioning may differ), handle similarly.

2. **Social login callback path pattern**
   - What we know: better-auth uses `/callback/:provider` internally
   - What's unclear: Exact path string in hooks.after context for social logins
   - Recommendation: Log the path and inspect during development; use startsWith matching

3. **Login failure auditing**
   - What we know: `hooks.after` only fires on success (successful response)
   - What's unclear: Whether failed login attempts (wrong password) trigger `hooks.after`
   - Recommendation: Use `hooks.before` with try-catch or check if better-auth has an `onError` hook. If not, accept that only successful logins are audited (which is the common pattern for audit trails). Failed attempts are already rate-limited by Throttle.

## Sources

### Primary (HIGH confidence)
- Codebase scan of `backend/src/modules/auth/` -- verified all files to delete
- Codebase scan of `backend/src/common/auth/` -- verified better-auth infrastructure
- `backend/prisma/schema.prisma` -- verified AuditLog model, deprecated fields, RefreshToken model
- `backend/package.json` -- verified npm packages to remove
- `backend/src/common/auth/better-auth.instance.ts` -- verified hook patterns
- `backend/src/common/services/audit.service.ts` -- verified AuditService API

### Secondary (MEDIUM confidence)
- better-auth v1.5 hook behavior (hooks.after context shape) -- based on codebase usage patterns and better-auth docs general structure

### Tertiary (LOW confidence)
- Login failure hook behavior -- needs runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all existing libraries, no new dependencies
- Architecture: HIGH -- extending existing patterns (hooks, AuditService, fire-and-forget)
- Pitfalls: HIGH -- verified by codebase scan of import dependencies and Prisma schema
- Audit hook details: MEDIUM -- better-auth hook context shape inferred from existing usage
- Login failure auditing: LOW -- needs runtime verification

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- no expected framework changes)
