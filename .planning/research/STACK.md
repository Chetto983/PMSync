# Technology Stack: better-auth Migration

**Project:** PMSync v5.0
**Researched:** 2026-03-06
**Focus:** What to ADD/CHANGE for better-auth integration with existing NestJS + Next.js stack
**Overall confidence:** HIGH (official docs verified, npm versions checked, source code reviewed)

## Executive Summary

better-auth v1.5.4 is the auth framework to adopt. It is database-session-based (not JWT), has a Prisma adapter that accepts your existing PrismaClient, and provides plugins for every feature on the v5.0 roadmap: 2FA, passkeys, organizations, admin panel, and social login. The NestJS integration (`@thallesp/nestjs-better-auth` v2.4.0) is community-maintained but officially listed on better-auth docs, with 17K weekly downloads. It provides a global AuthGuard that calls `auth.api.getSession({ headers })` on each request -- meaning NestJS validates sessions by querying the same session table that Next.js writes to. No JWTs, no Passport, no custom token logic.

The migration is a **net deletion**: you remove ~15 custom auth services, 7 Prisma models, and 5 npm packages. You add 2 npm packages (`better-auth`, `@thallesp/nestjs-better-auth`). The frontend drops the custom auth store/context in favor of `better-auth/react` hooks.

**PACKAGES TO ADD (backend):** 2
**PACKAGES TO ADD (frontend):** 1
**PACKAGES TO REMOVE (backend):** 5-7
**PRISMA MODELS TO DROP:** 7 (replaced by better-auth schema)
**CUSTOM AUTH FILES TO DELETE:** ~17

---

## Recommended Stack Additions

### Core Auth Library

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `better-auth` | ^1.5.4 | Auth framework (server instances in both Next.js and NestJS) | Latest stable (Feb 28 2026, 600+ commits, 70 new features). DB-backed sessions, Prisma adapter, plugin ecosystem. Replaces 15+ custom auth services. Lucia Auth deprecated, Auth.js lacks plugin ecosystem. |
| `@thallesp/nestjs-better-auth` | ^2.4.0 | NestJS guards, decorators, session validation | Official community integration linked from better-auth docs. 17K weekly npm downloads. Provides AuthGuard, @Session(), @Roles(), @OrgRoles(), @AllowAnonymous(), @OptionalAuth(), @Hook()/@BeforeHook()/@AfterHook(). Requires better-auth >= 1.3.8. |

### better-auth Plugins (all imported from `better-auth/plugins`)

| Plugin | Purpose | What It Replaces | DB Changes |
|--------|---------|-----------------|------------|
| `organization()` | Multi-tenant orgs with roles (owner/admin/member), invitations, teams | Custom RolesGuard, manual role management | Creates `organization`, `member`, `invitation` tables. Adds `activeOrganizationId` to `session`. |
| `twoFactor()` | TOTP + OTP + backup codes + trusted devices | Custom TotpService, BackupCodesService, OtpSecurityService, TrustedDeviceService | Adds `twoFactorEnabled` to `user`. Creates `twoFactor` table. |
| `admin()` | User CRUD, ban/unban, impersonation, session management | Manual admin queries | Adds `role`, `banned`, `banReason`, `banExpires` to `user`. Adds `impersonatedBy` to `session`. |
| `passkey()` | WebAuthn/FIDO2 passkeys (uses SimpleWebAuthn internally) | Custom WebAuthnService | Creates `passkey` table. |

### Frontend Auth Client

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `better-auth/react` | (bundled) | React hooks: `useSession()`, `signIn`, `signUp`, `signOut`, `organization`, `twoFactor` | Type-safe, auto cookie management. Replaces custom auth-store.ts + auth-context.tsx + use-auth.ts. |

### Infrastructure (NO changes needed)

| Existing Tech | Role in better-auth Setup |
|---------------|--------------------------|
| PostgreSQL | better-auth session/user storage via Prisma adapter |
| Redis | Optional secondary storage for session caching (recommended) |
| Prisma 7 | better-auth Prisma adapter accepts existing PrismaClient instance. Must specify `output` path for Prisma 7. |

---

## How NestJS Validates better-auth Sessions

**This is the critical integration question.**

### Answer: `auth.api.getSession({ headers })` -- Database Session Lookup

### Architecture: Next.js Owns Auth Routes, NestJS Validates Sessions

```
Browser (cookie: better_auth.session_token)
  |
  |--> Next.js (better-auth server instance)
  |     - Mounts /api/auth/* routes (login, register, OAuth, 2FA, passkeys)
  |     - Manages session cookies
  |     - Runs better-auth plugins
  |
  |--> NestJS API (session validation only)
        - @thallesp/nestjs-better-auth mounts catch-all /api/auth/*
        - Global AuthGuard calls auth.api.getSession({ headers: req.headers })
        - Session cookie forwarded from browser -> validated against DB
        - @Session() decorator injects { user, session } into controllers
```

### Session Validation Flow (HIGH confidence -- verified from guard source)

The `@thallesp/nestjs-better-auth` AuthGuard:

1. Extracts request headers (including session cookie)
2. Calls `auth.api.getSession({ headers })` on the better-auth instance
3. better-auth checks: cookie cache -> secondary storage (Redis) -> database
4. Returns `{ user, session }` or null
5. Guard attaches `user` and `session` to `req.user` and `req.session`
6. If null and route is not `@AllowAnonymous()`, throws UnauthorizedException
7. If `@Roles()` set, checks `user.role` against required roles
8. If `@OrgRoles()` set, checks member role via organization plugin API

**Both Next.js and NestJS need their OWN better-auth instance** configured identically (same database, same plugins, same secret). They share the same session table in PostgreSQL.

### Session Storage Tiers (Performance)

better-auth supports three-tier session lookup to minimize DB queries:

| Tier | Mechanism | Config | Latency |
|------|-----------|--------|---------|
| 1. Cookie cache | Session data in signed/encrypted cookie, auto-refreshed | `session.cookieCache: { enabled: true, maxAge: 300 }` | ~0ms (no network) |
| 2. Secondary storage | Redis for shared session state | `secondaryStorage: redisAdapter(redis)` | ~1ms |
| 3. Database | PostgreSQL via Prisma adapter | Always present as fallback | ~5-20ms |

**Recommendation:** Enable cookie cache (5 min) for NestJS. Most API requests validate from the cookie signature without any DB or Redis call. Redis secondary storage is optional but good for session revocation propagation.

Cookie cache encoding options: `compact` (base64, smallest), `jwt` (standard JWT format), `jwe` (fully encrypted). Use `compact` for performance.

---

## NestJS Integration Setup

### Shared better-auth Instance

```typescript
// backend/src/lib/auth.ts
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization, twoFactor, admin, passkey } from 'better-auth/plugins';
import { PrismaClient } from '../generated/prisma'; // Prisma 7 output path

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL, // Next.js URL for OAuth callbacks
  plugins: [
    organization(),
    twoFactor({ appName: 'PMSync' }),
    admin(),
    passkey({
      rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
      origin: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
    }),
  ],
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 }, // 5 min
    expiresIn: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // refresh daily
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: {
    additionalFields: {
      tenantId: { type: 'string', required: true },
      isActive: { type: 'boolean', defaultValue: true },
    },
  },
});
```

### AppModule Registration

```typescript
// backend/src/app.module.ts
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './lib/auth';

@Module({
  imports: [
    AuthModule.forRoot({ auth }),
    // ... existing modules
  ],
})
export class AppModule {}
```

### CRITICAL: Disable Body Parser

```typescript
// backend/src/main.ts
const app = await NestFactory.create(AppModule, { bodyParser: false });
// @thallesp/nestjs-better-auth re-adds default body parsers automatically.
// If you need req.rawBody (webhooks), use enableRawBodyParser in AuthModule.forRoot().
```

### Controller Pattern

```typescript
import { Session, AllowAnonymous, Roles, OrgRoles } from '@thallesp/nestjs-better-auth';

@Controller('api/v1/emails')
export class EmailsController {
  @Get()
  async listEmails(@Session() session: UserSession) {
    // session.user.id, session.user.tenantId available
    // TenantGuard reads tenantId from session.user
  }

  @Post('admin/users')
  @Roles('admin')
  async adminAction(@Session() session: UserSession) { ... }

  @Get('public/health')
  @AllowAnonymous()
  async health() { ... }
}
```

---

## What to REMOVE (Replaced by better-auth)

### Backend Services to Delete (~17 files)

| File/Service | Replaced By |
|-------------|-------------|
| `services/auth-login.service.ts` | better-auth credential auth |
| `services/auth-registration.service.ts` | better-auth signup |
| `services/auth-token.service.ts` | better-auth session tokens |
| `services/auth-password-reset.service.ts` | better-auth password reset flow |
| `services/auth-config.service.ts` | better-auth config |
| `services/auth.service.ts` (facade) | better-auth API |
| `services/totp.service.ts` | `twoFactor()` plugin |
| `services/backup-codes.service.ts` | `twoFactor()` plugin |
| `services/otp-security.service.ts` | `twoFactor()` plugin |
| `services/webauthn.service.ts` | `passkey()` plugin |
| `services/trusted-device.service.ts` | better-auth session + cookie cache |
| `services/password-hashing.service.ts` | better-auth uses scrypt internally |
| `services/password-policy.service.ts` | better-auth handles validation |
| `strategies/jwt.strategy.ts` | No JWTs -- session-based auth |
| `guards/jwt-auth.guard.ts` | `@thallesp/nestjs-better-auth` AuthGuard |
| `helpers/cookie.helper.ts` | better-auth manages cookies |
| `controllers/auth.controller.ts` | better-auth /api/auth/* routes |
| `controllers/mfa.controller.ts` | better-auth 2FA plugin endpoints |

### Backend Packages to Remove

| Package | Why |
|---------|-----|
| `@nestjs/jwt` | No more JWTs -- DB sessions |
| `@nestjs/passport` | No more Passport strategies |
| `passport` | Not needed |
| `passport-jwt` | Not needed |
| `argon2` | better-auth uses scrypt (clean slate, no migration) |

### Packages to KEEP (still used elsewhere)

| Package | Why Keep |
|---------|---------|
| `otplib` | Check if better-auth 2FA plugin fully replaces. If yes, remove. |
| `@simplewebauthn/server` | better-auth passkey plugin wraps this, but check if any code uses it directly. |
| `@simplewebauthn/browser` (frontend) | better-auth/react passkey client may replace this. Verify. |

### Frontend Files to Replace

| File | Replaced By |
|------|-------------|
| `stores/auth-store.ts` | `better-auth/react` hooks (`useSession()`) |
| `lib/context/auth-context.tsx` | better-auth React client |
| `lib/hooks/use-auth.ts` | `useSession()`, `signIn.email()`, `signOut()` |
| `pages/auth/oauth-callback.tsx` | better-auth handles OAuth callbacks |

### Prisma Models to DROP (replaced by better-auth schema)

| Model | Replaced By |
|-------|-------------|
| `Session` | better-auth `session` table |
| `RefreshToken` | Not needed (no refresh tokens) |
| `MfaSecret` | better-auth `twoFactor` table |
| `MfaBackupCode` | better-auth `twoFactor` table |
| `TrustedDevice` | better-auth session management |
| `WebAuthnCredential` | better-auth `passkey` table |
| `PasswordResetToken` | better-auth `verification` table |

### Prisma Models to KEEP but MODIFY

| Model | Change |
|-------|--------|
| `User` | Merge with better-auth `user` schema. Add `name` (concat firstName+lastName), `emailVerified`, `image`. Keep `tenantId` via `additionalFields`. Drop `passwordHash` (moves to `account` table). |

---

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| Auth.js (NextAuth) | Inferior plugin ecosystem. No built-in org/roles/admin/passkey. Community momentum shifted to better-auth in 2025-2026. |
| Lucia Auth | Deprecated January 2025. Author explicitly recommends better-auth. |
| Clerk / Auth0 / Supertokens | SaaS dependency. PMSync is self-hosted. better-auth is self-hosted by design. |
| Custom JWT layer on top of better-auth | better-auth sessions are database-backed. JWTs add complexity without benefit. Cookie cache provides the same "avoid DB on every request" benefit without JWT revocation problems. |
| Separate auth microservice | Overkill. better-auth runs in-process. |
| `@better-auth/cli` (old) | Deprecated in v1.5. Use `npx auth` CLI instead. |
| `@mguay/nestjs-better-auth` | Alternative NestJS integration. Lower downloads, not linked from official docs. @thallesp is the canonical one. |
| Custom NestJS guard (DIY) | Reinventing what @thallesp provides. The library handles HTTP, GraphQL, WebSocket, role guards, org guards. |

---

## Database Schema Changes

### better-auth Core Tables (auto-generated via `npx auth generate`)

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `user` | id, name, email, emailVerified, image, createdAt, updatedAt | Extend with `tenantId`, `isActive` via additionalFields |
| `session` | id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt | Cookie-based, DB-validated. Org plugin adds `activeOrganizationId`. Admin plugin adds `impersonatedBy`. |
| `account` | id, userId, accountId, providerId, accessToken, refreshToken, password, scope | Links social + credential auth. Password stored here, not in user table. |
| `verification` | id, identifier, value, expiresAt, createdAt, updatedAt | Email verification, password reset tokens. |

### Plugin Tables

| Table | Plugin | Key Fields |
|-------|--------|-----------|
| `twoFactor` | 2FA | id, userId, secret, backupCodes |
| `passkey` | Passkey | id, userId, credentialID, publicKey, counter, transports |
| `organization` | Organization | id, name, slug, logo, metadata, createdAt |
| `member` | Organization | id, userId, organizationId, role, createdAt |
| `invitation` | Organization | id, email, inviterId, organizationId, role, status, expiresAt |

### Admin Plugin (modifies existing tables)

| Table | Added Fields |
|-------|-------------|
| `user` | role (default: "user"), banned, banReason, banExpires |
| `session` | impersonatedBy |

### Tenant Isolation Strategy

**Problem:** better-auth has no native multi-tenancy concept. The `organization` plugin models user-facing organizations, NOT data isolation tenants.

**Solution:** These are separate concerns. Keep them separate:

1. **TenantGuard** continues to enforce data isolation via `tenantId` on all Prisma queries
2. `tenantId` is a custom field on better-auth's `user` model via `additionalFields`
3. After `@Session()` provides the user, TenantGuard reads `user.tenantId`
4. better-auth's `organization` plugin is for the NEW v5.0 feature: user-facing teams/orgs

---

## Environment Variables

### New

| Variable | Purpose | Example |
|----------|---------|---------|
| `BETTER_AUTH_SECRET` | Session signing/encryption secret (min 32 chars) | Random 64-char hex string |
| `BETTER_AUTH_URL` | Base URL for OAuth callbacks and CORS | `http://localhost:3001` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | From Google Cloud Console |
| `WEBAUTHN_RP_ID` | WebAuthn relying party ID | `localhost` or `pmsync.app` |

### Removed (no longer needed)

| Variable | Why |
|----------|-----|
| `JWT_SECRET` | No more JWTs |
| `JWT_PRIVATE_KEY` | No more ES256 |
| `JWT_PUBLIC_KEY` | No more ES256 |
| `ACCESS_TOKEN_EXPIRES_IN` | better-auth manages session TTL |
| `PASSWORD_RESET_SECRET` | better-auth verification table |

---

## Installation

```bash
# Frontend (Next.js) -- better-auth server + React client
cd frontend
npm install better-auth

# Backend (NestJS) -- better-auth + NestJS integration
cd backend
npm install better-auth @thallesp/nestjs-better-auth

# Remove deprecated auth packages
cd backend
npm uninstall @nestjs/jwt @nestjs/passport passport passport-jwt argon2

# Generate better-auth Prisma schema additions
npx auth generate
# Then: npx prisma migrate dev
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Auth framework | better-auth v1.5 | Auth.js (NextAuth) | No org/roles/admin plugins. Weaker session management. Community shifted to better-auth. |
| Auth framework | better-auth v1.5 | Lucia Auth | Deprecated Jan 2025. Author recommends better-auth as successor. |
| Auth framework | better-auth v1.5 | Clerk | SaaS, not self-hosted. Vendor lock-in. |
| Auth framework | better-auth v1.5 | Supertokens | More complex setup, less TypeScript-native, smaller plugin ecosystem. |
| NestJS integration | @thallesp v2.4 | @mguay/nestjs-better-auth | Lower adoption. Not linked from official docs. |
| NestJS integration | @thallesp v2.4 | Custom guard | Reinventing solved problem. Library handles HTTP, GraphQL, WebSocket, roles, orgs. |
| Session validation | DB sessions + cookie cache | JWT tokens | JWTs can't be revoked without DB anyway. DB sessions simpler, more secure. Cookie cache gives same performance. |
| Password hashing | better-auth default (scrypt) | Keep Argon2id | Clean slate migration (all users re-register). No password migration needed. Scrypt is OWASP-acceptable. |

---

## Key Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| `bodyParser: false` breaks existing endpoints | HIGH | @thallesp re-adds default parsers. Test all POST/PUT endpoints after migration. |
| Community-maintained NestJS integration | MEDIUM | 17K weekly downloads, actively maintained (2.4.0 published 7 days ago). Pin version. Have fallback plan: custom guard is ~50 lines. |
| better-auth Prisma schema conflicts with existing models | MEDIUM | Clean slate migration. Drop old auth tables, generate new ones. Run `npx auth generate` to see exact schema before applying. |
| Session table lacks `tenantId` | LOW | Not needed on session table itself. `tenantId` is on the user. Session -> user -> tenantId chain works. |
| Two better-auth instances (Next.js + NestJS) out of sync | MEDIUM | Share config via shared package or env vars. Both read same DB. Test session validation from NestJS after login on Next.js. |

---

## Sources

### Official Documentation (HIGH confidence)
- [better-auth introduction](https://better-auth.com/docs/introduction)
- [better-auth NestJS integration](https://better-auth.com/docs/integrations/nestjs)
- [better-auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)
- [better-auth session management](https://better-auth.com/docs/concepts/session-management)
- [better-auth database concepts](https://better-auth.com/docs/concepts/database)
- [better-auth performance optimization](https://better-auth.com/docs/guides/optimizing-for-performance)
- [better-auth organization plugin](https://better-auth.com/docs/plugins/organization)
- [better-auth admin plugin](https://better-auth.com/docs/plugins/admin)
- [better-auth 2FA plugin](https://better-auth.com/docs/plugins/2fa)
- [better-auth passkey plugin](https://better-auth.com/docs/plugins/passkey)
- [better-auth Google OAuth](https://better-auth.com/docs/authentication/google)
- [better-auth v1.5 release blog](https://better-auth.com/blog/1-5)

### NestJS Integration (HIGH confidence)
- [@thallesp/nestjs-better-auth GitHub](https://github.com/ThallesP/nestjs-better-auth)
- [@thallesp/nestjs-better-auth npm](https://www.npmjs.com/package/@thallesp/nestjs-better-auth)

### Community/Articles (MEDIUM confidence)
- [NestJS + BetterAuth Part 1 (Medium)](https://medium.com/@andysenclave/nestjs-betterauth-part-1-from-zero-to-login-prisma-cookies-cfcc3e7ecec0)
- [NestJS + BetterAuth Part 2 (Medium)](https://medium.com/@andysenclave/nestjs-betterauth-part-2-next-js-client-csr-ssr-middleware-1423f6c9309e)
- [better-auth + NestJS + tRPC (Michael Guay)](https://michaelguay.dev/how-to-integrate-better-auth-with-nestjs-trpc/)

---

*Last updated: 2026-03-06 -- v5.0 better-auth Migration research*
