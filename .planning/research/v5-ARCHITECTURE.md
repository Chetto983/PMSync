# Architecture Patterns: better-auth Migration (v5.0)

**Domain:** Authentication migration in split Next.js + NestJS architecture
**Researched:** 2026-03-06
**Overall Confidence:** MEDIUM-HIGH

## The Core Architectural Decision

better-auth runs in **Next.js** as the auth provider. NestJS becomes a **session consumer** that validates sessions created by better-auth. This is a fundamental shift: auth moves from NestJS ownership to Next.js ownership.

### Current Architecture (v4.1)

```
Browser
  |
  |--- httpOnly cookie (JWT access_token) --->  NestJS Backend
  |                                              |
  |                                              +-- JwtStrategy (Passport)
  |                                              +-- JwtAuthGuard
  |                                              +-- TenantGuard
  |                                              +-- RolesGuard
  |                                              +-- AuthService (login, register, MFA, refresh)
  |                                              +-- Session table (DB)
  |                                              +-- RefreshToken table (DB)
  |                                              +-- Redis session cache
  |
  |--- /auth/me (cookie) ------------------>  NestJS /auth/me
  |                                              |
  |<-- user profile -----------------------------|
```

### Target Architecture (v5.0)

```
Browser
  |
  |--- better-auth client SDK ------------>  Next.js (better-auth server)
  |                                           |
  |                                           +-- betterAuth() instance
  |                                           +-- Prisma adapter (shared DB)
  |                                           +-- Session/User/Account/Verification tables
  |                                           +-- Organization plugin
  |                                           +-- 2FA plugin
  |                                           +-- Social login (Google OAuth)
  |                                           +-- Cookie: better-auth session token
  |
  |--- session cookie (auto-forwarded) --->  NestJS Backend
  |                                           |
  |                                           +-- BetterAuthGuard (replaces JwtAuthGuard)
  |                                           +-- Calls auth.api.getSession({headers})
  |                                           +-- TenantGuard (preserved, adapted)
  |                                           +-- RolesGuard (preserved, reads from session)
  |                                           +-- NO AuthService, NO JwtStrategy, NO RefreshToken
```

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Next.js better-auth instance** | Auth provider: login, register, social login, MFA, session creation/management, organization CRUD | Browser (cookies), PostgreSQL (Prisma adapter) |
| **Next.js API route handler** | Mounts better-auth at `/api/auth/*` | better-auth instance |
| **better-auth client SDK** | Frontend auth UI: sign-in forms, session hooks, organization switching | Next.js API route (`/api/auth/*`) |
| **NestJS BetterAuthGuard** | Session validation on every protected request | better-auth instance (via `auth.api.getSession`) or direct DB query |
| **NestJS TenantGuard** | Tenant isolation enforcement | Session data from BetterAuthGuard |
| **NestJS RolesGuard** | Role-based access control | Session data from BetterAuthGuard |
| **WebSocket handshake service** | WS auth via cookie extraction + session validation | better-auth session table (direct DB query) |
| **BullMQ workers** | Job context with tenantId (unchanged) | Job data payload (no session dependency) |

## Recommended Architecture: Dual-Instance Pattern

### Pattern: Shared better-auth Config, Two Instantiation Points

**Confidence: MEDIUM** -- This is the pattern recommended by the `@thallesp/nestjs-better-auth` community package and aligns with better-auth's official NestJS integration docs.

```typescript
// shared/auth-config.ts (importable by both Next.js and NestJS)
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { twoFactor } from "better-auth/plugins";

export function createAuthInstance(prisma: PrismaClient) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    session: {
      expiresIn: 60 * 60 * 24 * 7,  // 7 days
      updateAge: 60 * 60 * 24,       // refresh daily
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,              // 5-min cache (replaces Redis session cache)
        strategy: "compact",          // HMAC-signed, smallest payload
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        // maps to existing Tenant concept
      }),
      twoFactor({ appName: "PMSync" }),
    ],
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
  });
}
```

**Option A: `@thallesp/nestjs-better-auth` package (RECOMMENDED)**

```typescript
// NestJS side
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth"; // shared instance

@Module({
  imports: [AuthModule.forRoot({ auth })],
})
export class AppModule {}
```

This gives you:
- Global `AuthGuard` (replaces `JwtAuthGuard`)
- `@Session()` decorator (replaces `@Request() req: AuthenticatedRequest`)
- `@AllowAnonymous()` for public routes
- `@OptionalAuth()` for mixed routes
- WebSocket support via `@UseGuards(AuthGuard)`

**Option B: Custom guard with direct `auth.api.getSession()` call**

```typescript
// If @thallesp/nestjs-better-auth doesn't fit (e.g., tenant scoping needs)
@Injectable()
export class BetterAuthGuard implements CanActivate {
  constructor(private auth: AuthInstance) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new UnauthorizedException();
    request.user = this.mapSessionToUserContext(session);
    return true;
  }
}
```

**Decision: Use Option A (`@thallesp/nestjs-better-auth`) as baseline, with custom TenantGuard preserved.** The community package handles the boilerplate. The guard validates sessions by calling `auth.api.getSession()` internally. TenantGuard reads from the session's `activeOrganizationId`.

### Critical Detail: Body Parser

`@thallesp/nestjs-better-auth` requires `bodyParser: false` in NestJS app creation. The library re-adds default parsers. This is a breaking change to verify against existing middleware (CSRF, raw body for webhooks).

```typescript
const app = await NestFactory.create(AppModule, { bodyParser: false });
```

## Data Flow: End-to-End Session Lifecycle

### 1. Login Flow

```
Browser                     Next.js                      PostgreSQL
  |                           |                              |
  |-- signIn.email() -------> |                              |
  |                           |-- betterAuth handler         |
  |                           |   validates credentials      |
  |                           |-- INSERT session ----------> |
  |                           |-- INSERT account ----------> |
  |                           |                              |
  |<-- Set-Cookie: ---------- |                              |
  |    better-auth.session    |                              |
  |                           |                              |
```

### 2. Authenticated NestJS Request

```
Browser                     NestJS                       PostgreSQL
  |                           |                              |
  |-- GET /api/v1/emails ---> |                              |
  |   Cookie: session_token   |                              |
  |                           |                              |
  |                     BetterAuthGuard                      |
  |                           |                              |
  |              [cookieCache hit?]                           |
  |              YES: decode from signed cookie               |
  |              NO:  auth.api.getSession()                   |
  |                           |-- SELECT session ----------> |
  |                           |<-- session + user ---------- |
  |                           |                              |
  |                     TenantGuard                          |
  |                           |                              |
  |              [session.activeOrganizationId]               |
  |              == maps to tenant context                    |
  |                           |                              |
  |                     RolesGuard                           |
  |                           |                              |
  |              [session.user.role OR member.role]           |
  |                           |                              |
  |<-- 200 emails ----------- |                              |
```

### 3. WebSocket Authentication

```
Browser                     NestJS WS Gateway            PostgreSQL
  |                           |                              |
  |-- WS handshake ---------> |                              |
  |   Cookie: session_token   |                              |
  |                           |                              |
  |              RealtimeHandshakeService                     |
  |              (adapted for better-auth)                    |
  |                           |                              |
  |              Extract cookie from handshake headers        |
  |              Call auth.api.getSession() with headers      |
  |              OR: direct DB query on session table         |
  |                           |-- SELECT session ----------> |
  |                           |<-- session data ------------ |
  |                           |                              |
  |              Verify user.isActive, tenant.isActive        |
  |              Join tenant room                            |
  |                           |                              |
  |<-- WS connected ----------|                              |
```

### 4. BullMQ Job Context (UNCHANGED)

```
BullMQ Worker                                            PostgreSQL
  |                                                          |
  |-- processJob(job) ------>                                |
  |   job.data.tenantId       |                              |
  |   job.data.providerId     |                              |
  |                           |                              |
  |   // No session needed -- jobs carry tenantId directly   |
  |   // This pattern does NOT change with better-auth       |
```

**BullMQ jobs do not use sessions.** They carry `tenantId` and `providerId` directly in job data. No migration needed.

## Tenant Isolation: Organization Plugin Mapping

### Current Model

```
Tenant (id, name, slug, isActive)
  └── User (tenantId FK)
        └── Session (tenantId FK)
```

### better-auth Organization Model

```
Organization (id, name, slug, logo, metadata)
  └── Member (userId, organizationId, role)
Session (activeOrganizationId)
```

### Mapping Strategy

| Current Concept | better-auth Concept | Migration |
|----------------|--------------------| ----------|
| `Tenant` | `Organization` | Rename or shadow table |
| `User.tenantId` | `Member.organizationId` | User belongs to org via member table |
| `User.role` | `Member.role` | Role moves to membership |
| `Session.tenantId` | `Session.activeOrganizationId` | Session tracks active org |
| `TenantGuard` reads `req.user.tenantId` | Guard reads `session.activeOrganizationId` | Adapter needed |

### Critical Decision: Tenant Table vs Organization Table

**Option 1: Replace Tenant with Organization (RECOMMENDED)**

Drop the `Tenant` model. Let better-auth's `Organization` serve as the tenant. All 42+ models with `tenantId` FK get migrated to `organizationId`.

- Pro: Clean, single source of truth
- Con: Massive migration (42 models), all tenant-scoping middleware changes

**Option 2: Keep Tenant, Map Organization to Tenant**

Keep `Tenant` table. better-auth `Organization.id` maps to `Tenant.id` via a lookup/sync. TenantGuard reads `activeOrganizationId` and resolves to existing `tenantId`.

- Pro: Minimal data migration, existing tenant scoping works
- Con: Two sources of truth for the same concept, sync complexity

**Recommendation: Option 2 for v5.0, Option 1 for v6.0.** Clean slate for users (re-register) but NOT clean slate for data models. Keep existing tenant infrastructure, add a `tenantId` field to better-auth's Organization via schema customization, and map between them.

```typescript
organization({
  schema: {
    organization: {
      additionalFields: {
        tenantId: { type: "string", required: true },
        isActive: { type: "boolean", required: false, defaultValue: true },
      },
    },
  },
})
```

TenantGuard adaptation:

```typescript
// Adapted TenantGuard
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest();
  const session = request.session; // from BetterAuthGuard

  // better-auth stores activeOrganizationId in session
  const activeOrgId = session.session.activeOrganizationId;
  if (!activeOrgId) throw new BadRequestException('No active organization');

  // Look up organization to get tenantId mapping
  const org = await this.prisma.organization.findUnique({
    where: { id: activeOrgId },
  });

  if (!org?.tenantId) throw new ForbiddenException('Invalid organization');

  // Attach tenantId for downstream middleware (existing tenant scoping)
  request.activeTenantId = org.tenantId;
  request.user = {
    ...request.user,
    tenantId: org.tenantId,
  };

  return true;
}
```

## Database Schema Changes

### New Tables (better-auth managed)

```prisma
model User {
  // better-auth core fields
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // PMSync custom fields (preserved)
  tenantId      String?   // legacy, kept for backward compat during migration
  role          String    @default("member")
  isActive      Boolean   @default(true)
  avatarUrl     String?
  firstName     String?
  lastName      String?
  lastLogin     DateTime?

  // better-auth relations
  sessions      Session[]
  accounts      Account[]
  members       Member[]

  // PMSync relations (preserved)
  // ... all existing relations
}

model Session {
  id                    String   @id
  token                 String   @unique
  userId                String
  expiresAt             DateTime
  ipAddress             String?
  userAgent             String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  activeOrganizationId  String?  // organization plugin
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Account {
  id                String  @id
  userId            String
  accountId         String
  providerId        String  // "credential", "google", "microsoft"
  accessToken       String?
  refreshToken      String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope             String?
  idToken           String?
  password          String? // hashed password for credential accounts
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

// Organization plugin tables
model Organization {
  id        String   @id
  name      String
  slug      String   @unique
  logo      String?
  metadata  String?
  createdAt DateTime @default(now())

  // PMSync custom: maps to existing Tenant
  tenantId  String?  @unique
  isActive  Boolean  @default(true)

  members     Member[]
  invitations Invitation[]
}

model Member {
  id             String   @id
  userId         String
  organizationId String
  role           String   @default("member")
  createdAt      DateTime @default(now())
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

model Invitation {
  id             String   @id
  email          String
  inviterId      String
  organizationId String
  role           String
  status         String   @default("pending")
  expiresAt      DateTime
  createdAt      DateTime @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

// 2FA plugin table
model TwoFactor {
  id          String  @id
  userId      String
  secret      String?
  backupCodes String?
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Tables to DELETE

| Table | Reason |
|-------|--------|
| `RefreshToken` | better-auth manages session refresh internally |
| `PasswordResetToken` | better-auth `Verification` table handles this |
| `MfaSecret` | better-auth `TwoFactor` table replaces this |
| `MfaBackupCode` | better-auth stores backup codes in `TwoFactor.backupCodes` |
| `TrustedDevice` | better-auth 2FA has its own device trust (30-day cookie) |
| `WebAuthnCredential` | better-auth passkey plugin manages credentials |
| `OtpCode` (if exists) | better-auth handles OTP internally |

### Tables PRESERVED (no changes needed)

All 42+ models with `tenantId` FK remain unchanged. The `Tenant` table remains as-is. The `Organization.tenantId` field creates the bridge.

## NestJS Modules: What Changes

### DELETE Entirely

| Module/File | Reason |
|------------|--------|
| `AuthService` | better-auth handles all auth operations |
| `AuthRegistrationService` | better-auth handles registration |
| `AuthLoginService` | better-auth handles login |
| `AuthTokenService` | better-auth handles sessions (no JWT/refresh needed) |
| `AuthPasswordResetService` | better-auth handles password reset |
| `AuthConfigService` | Config moves to better-auth config |
| `OtpSecurityService` | better-auth 2FA plugin |
| `TotpService` | better-auth 2FA plugin |
| `BackupCodesService` | better-auth 2FA plugin |
| `TrustedDeviceService` | better-auth 2FA device trust |
| `WebAuthnService` | better-auth passkey plugin |
| `PasswordHashingService` | better-auth hashes passwords internally |
| `PasswordPolicyService` | Configure in better-auth or keep as validation |
| `JwtStrategy` | No more JWT -- session-based |
| `JwtAuthGuard` | Replaced by `AuthGuard` from `@thallesp/nestjs-better-auth` |
| `AuthController` | All auth endpoints move to Next.js `/api/auth/*` |
| `MfaController` | 2FA endpoints move to Next.js `/api/auth/*` |
| `cookie.helper.ts` | better-auth manages cookies |
| `auth-debug.middleware.ts` | Replaced by better-auth's session debugging |
| `PassportModule` import | No more Passport |
| `JwtModule` import | No more JWT |

### MODIFY

| Module/File | Change |
|------------|--------|
| `AuthModule` | Gut entirely, replace with `AuthModule.forRoot({ auth })` import |
| `TenantGuard` | Read `activeOrganizationId` from session instead of JWT `tenantId` |
| `RolesGuard` | Read role from session/member instead of JWT payload |
| `RealtimeHandshakeService` | Replace JWT verification with `auth.api.getSession()` |
| `AuthenticatedRequest` type | Change to match better-auth session shape |
| `base.worker.ts` | No change (jobs use `tenantId` from job data, not session) |

### PRESERVE (no changes)

| Module/File | Why |
|------------|-----|
| `RedisRateLimiterService` | Rate limiting still needed |
| All BullMQ workers | Jobs carry `tenantId` in data, no session dependency |
| `CacheService` | Still used for session caching (though better-auth has cookieCache) |
| `PrismaModule` | Shared DB, both Next.js and NestJS use it |
| All domain modules (email, calendar, contacts, etc.) | No auth logic, just guard decorators |

## Patterns to Follow

### Pattern 1: Session-to-UserContext Mapping

Map better-auth's session shape to the existing `AuthenticatedRequest.user` shape to minimize downstream changes.

```typescript
// adapter to preserve existing req.user shape
function mapBetterAuthSession(session: BetterAuthSession): UserContext {
  return {
    id: session.user.id,
    userId: session.user.id,
    tenantId: session.session.activeOrganizationId, // mapped via TenantGuard
    email: session.user.email,
    firstName: session.user.name?.split(' ')[0] ?? null,
    lastName: session.user.name?.split(' ').slice(1).join(' ') ?? null,
    role: session.user.role ?? 'member',
    sessionId: session.session.id,
  };
}
```

### Pattern 2: Cookie Forwarding (Next.js SSR to NestJS)

When Next.js server components call NestJS API, forward the session cookie.

```typescript
// Next.js server component or API route
import { headers } from 'next/headers';

const response = await fetch(`${NESTJS_URL}/api/v1/emails`, {
  headers: {
    cookie: (await headers()).get('cookie') ?? '',
  },
});
```

### Pattern 3: Organization as Tenant Bridge

```typescript
// On login/org-switch, set active organization
await authClient.organization.setActive({
  organizationId: selectedOrgId,
});
// This updates session.activeOrganizationId
// NestJS TenantGuard reads this on next request
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running better-auth in NestJS Instead of Next.js

**What:** Mounting better-auth's handler in NestJS via `toNodeHandler`.
**Why bad:** better-auth is designed for frameworks with native request/response handling. NestJS's body parser, interceptors, and middleware interfere. The `bodyParser: false` requirement already causes friction. Auth UI (login pages, OAuth callbacks) belongs in the frontend.
**Instead:** Run better-auth in Next.js. NestJS only validates sessions.

### Anti-Pattern 2: Duplicating Session Validation Logic

**What:** Writing custom session DB queries in NestJS instead of using `auth.api.getSession()`.
**Why bad:** Bypasses better-auth's cookie caching, session refresh, and plugin hooks.
**Instead:** Always use `auth.api.getSession()` which handles caching, refresh, and validation.
**Exception:** WebSocket handshake may need direct DB query if `fromNodeHeaders` doesn't work with Socket.IO handshake headers.

### Anti-Pattern 3: Keeping JWT Infrastructure "Just in Case"

**What:** Leaving JwtModule, JwtStrategy, and refresh token logic in place alongside better-auth.
**Why bad:** Two auth systems = confusion, security gaps, and maintenance burden.
**Instead:** Clean deletion. better-auth sessions replace JWT entirely.

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| Session validation | Cookie cache (no DB hit) | Cookie cache + Redis layer | Cookie cache + distributed Redis |
| Session storage | PostgreSQL | PostgreSQL with index tuning | PostgreSQL + session partitioning |
| Organization lookup | Direct query | Cached in Redis | Cached + read replica |
| WebSocket auth | Direct DB query | Redis-cached session | Shared Redis session store |

## Sources

- [better-auth Session Management](https://better-auth.com/docs/concepts/session-management) -- HIGH confidence
- [better-auth Prisma Adapter](https://better-auth.com/docs/adapters/prisma) -- HIGH confidence
- [better-auth Organization Plugin](https://better-auth.com/docs/plugins/organization) -- HIGH confidence
- [better-auth NestJS Integration](https://better-auth.com/docs/integrations/nestjs) -- HIGH confidence
- [better-auth Bearer Token Plugin](https://better-auth.com/docs/plugins/bearer) -- HIGH confidence
- [better-auth 2FA Plugin](https://better-auth.com/docs/plugins/2fa) -- HIGH confidence
- [better-auth API Concepts](https://better-auth.com/docs/concepts/api) -- HIGH confidence
- [better-auth Express Integration](https://better-auth.com/docs/integrations/express) -- HIGH confidence
- [@thallesp/nestjs-better-auth](https://github.com/ThallesP/nestjs-better-auth) -- MEDIUM confidence (community package, 17K weekly downloads)
- [better-auth Admin Plugin](https://better-auth.com/docs/plugins/admin) -- HIGH confidence
- [Prisma + better-auth Guide](https://www.prisma.io/docs/guides/betterauth-nextjs) -- HIGH confidence
- [better-auth Organization Discussions](https://github.com/better-auth/better-auth/discussions/3317) -- MEDIUM confidence
