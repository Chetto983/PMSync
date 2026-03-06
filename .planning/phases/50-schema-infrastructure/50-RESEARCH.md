# Phase 50: Schema & Infrastructure - Research

**Researched:** 2026-03-06
**Domain:** better-auth integration with Prisma, Next.js (Pages Router), NestJS dual-instance pattern
**Confidence:** MEDIUM-HIGH

## Summary

Phase 50 establishes the foundation for the better-auth migration: Prisma schema with better-auth tables, a working better-auth instance in Next.js (Pages Router) serving `/api/auth/*`, a read-only consumer instance in NestJS for session validation, DB-backed httpOnly cookie sessions, and HIBP password checking on signup.

The primary challenge is schema collision. better-auth expects to own `user`, `session`, `account`, and `verification` tables with specific field names. PMSync's existing `User` model has 42+ FK chains, uses `tenantId` (foreign to better-auth), and stores `passwordHash` directly (better-auth puts password in the `Account` table under `providerId: "credential"`). The clean-slate migration decision (users re-register) simplifies this -- we can reshape the User/Session models without data migration concerns.

better-auth uses scrypt for password hashing by default. The current codebase uses Argon2id via `@node-rs/argon2`. better-auth provides `emailAndPassword.password.hash` and `verify` config hooks to swap in a custom hashing algorithm, so Argon2id can be preserved. HIBP checking is not built into better-auth but can be implemented via the `hooks.before` mechanism using `createAuthMiddleware`, intercepting the `/sign-up/email` path and validating the password against the HIBP k-anonymity API before better-auth processes the request.

**Primary recommendation:** Manually adapt the existing Prisma schema to match better-auth's required fields (do NOT run `npx auth generate` blindly). Use `additionalFields` for `tenantId` on User. Configure custom Argon2id hash/verify functions. Wire HIBP as a before-hook.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORE-06 | User session persists via httpOnly cookie (DB-backed, no JWT) | better-auth's default session strategy is DB-backed httpOnly cookies with `cookieCache` (compact strategy). No JWT anywhere in the new auth path. Session table stores token, userId, expiresAt, ipAddress, userAgent. |
| CORE-07 | Compromised passwords blocked via HIBP check on signup/change | better-auth has `hooks.before` via `createAuthMiddleware`. Intercept `/sign-up/email` path, extract password from `ctx.body`, run HIBP k-anonymity check (existing `PasswordPolicyService.checkBreached()` logic), throw `APIError` if breached. The existing HIBP implementation can be extracted as a pure function and reused. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | latest (>=1.4) | Auth provider: login, register, session management | Replaces 17 custom auth services; plugin ecosystem; official Prisma adapter |
| `@node-rs/argon2` | (existing) | Password hashing | Already in project; OWASP 2025 recommended; better-auth's scrypt default is overridden via `emailAndPassword.password` config |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@thallesp/nestjs-better-auth` | latest | NestJS session validation guard + decorators | NestJS consumer instance; provides AuthGuard, @Session(), @AllowAnonymous() |
| `better-auth/node` | (bundled) | `toNodeHandler` for Pages Router, `fromNodeHeaders` for NestJS | Pages Router API route handler; NestJS header conversion |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@thallesp/nestjs-better-auth` | Custom guard calling `auth.api.getSession()` | Custom guard = more boilerplate but full control over tenant mapping. Use community package as baseline, extend if needed. |
| `toNodeHandler` (Pages Router) | `toNextJsHandler` (App Router) | Project uses Pages Router exclusively. No App Router directory exists. Use `toNodeHandler`. |
| Custom HIBP hook | No HIBP (accept regression) | CORE-07 requires HIBP. Must implement as before-hook since better-auth has no built-in HIBP support. |

**Installation:**

```bash
# Frontend (Next.js) -- better-auth provider instance
cd frontend && npm install better-auth

# Backend (NestJS) -- better-auth consumer + NestJS integration
cd backend && npm install better-auth @thallesp/nestjs-better-auth
```

## Architecture Patterns

### Recommended Project Structure

```
frontend/
  lib/
    auth.ts              # better-auth server instance (shared config)
    auth-client.ts       # better-auth client for React hooks
  pages/
    api/
      auth/
        [...all].ts      # Catch-all route -> toNodeHandler(auth.handler)

backend/
  src/
    common/
      auth/
        better-auth.instance.ts   # NestJS-side better-auth instance (read-only consumer)
        hibp.util.ts              # Extracted HIBP check (pure function)
    modules/
      auth/
        auth.module.ts            # Gutted: AuthModule.forRoot({ auth })
        guards/
          tenant.guard.ts         # Adapted: reads activeOrganizationId from session
          roles.guard.ts          # Adapted: reads role from session
```

### Pattern 1: better-auth Instance in Next.js (Pages Router)

**What:** Mount better-auth as the auth provider in Next.js using `toNodeHandler` for Pages Router catch-all API route.
**When to use:** All auth operations (login, register, session create/refresh, password reset).

```typescript
// frontend/lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { hash, verify } from "@node-rs/argon2";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => {
        return hash(password, {
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        });
      },
      verify: async ({ hash: storedHash, password }: { hash: string; password: string }) => {
        return verify(storedHash, password);
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days
    updateAge: 60 * 60 * 24,       // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,              // 5-min cache
      strategy: "compact",
    },
  },
  user: {
    additionalFields: {
      tenantId: { type: "string", required: false, input: false },
      firstName: { type: "string", required: false },
      lastName: { type: "string", required: false },
      role: { type: "string", required: false, defaultValue: "member" },
      isActive: { type: "boolean", required: false, defaultValue: true },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const password = ctx.body?.password;
        if (password) {
          const { breached } = await checkHIBP(password);
          if (breached) {
            throw new APIError("BAD_REQUEST", {
              message: "This password has appeared in data breaches and cannot be used",
            });
          }
        }
      }
    }),
  },
});
```

```typescript
// frontend/pages/api/auth/[...all].ts
import { toNodeHandler } from "better-auth/node";
import { auth } from "@/lib/auth";

export const config = { api: { bodyParser: false } };
export default toNodeHandler(auth.handler);
```

### Pattern 2: NestJS Consumer Instance

**What:** NestJS validates sessions created by the Next.js better-auth instance via shared DB. Uses `@thallesp/nestjs-better-auth` for guard integration.
**When to use:** Every authenticated NestJS API request.

```typescript
// backend/src/common/auth/better-auth.instance.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

export function createBetterAuthInstance(prisma: PrismaClient) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: process.env.BETTER_AUTH_SECRET,
    // Same session config as Next.js instance
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "compact",
      },
    },
    user: {
      additionalFields: {
        tenantId: { type: "string", required: false, input: false },
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
        role: { type: "string", required: false, defaultValue: "member" },
        isActive: { type: "boolean", required: false, defaultValue: true },
      },
    },
  });
}
```

```typescript
// backend/src/app.module.ts (excerpt)
import { AuthModule } from "@thallesp/nestjs-better-auth";

@Module({
  imports: [
    AuthModule.forRoot({ auth: betterAuthInstance }),
    // ...
  ],
})
export class AppModule {}
```

### Pattern 3: HIBP as Extracted Pure Function

**What:** Extract the HIBP k-anonymity check from `PasswordPolicyService` into a standalone pure function usable by both NestJS and Next.js.
**When to use:** Password validation during signup and password change.

```typescript
// Shared or duplicated in both frontend/lib and backend/src/common/auth
export async function checkHIBP(
  password: string,
  threshold = 3,
  timeoutMs = 3000,
): Promise<{ breached: boolean; count: number }> {
  try {
    const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.substring(0, 5);
    const suffix = sha1.substring(5);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true" },
        signal: controller.signal,
      });
      if (!response.ok) return { breached: false, count: 0 };
      const body = await response.text();
      for (const line of body.split("\n")) {
        const [hashSuffix, countStr] = line.trim().split(":");
        if (hashSuffix === suffix) {
          const count = parseInt(countStr, 10) || 0;
          return { breached: count > threshold, count };
        }
      }
      return { breached: false, count: 0 };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return { breached: false, count: 0 }; // best-effort
  }
}
```

### Anti-Patterns to Avoid

- **Running `npx auth generate` on existing schema:** Will conflict with existing User/Session models. Manually adapt the Prisma schema instead. Use the CLI output as a reference only.
- **Keeping JWT infrastructure alongside better-auth:** Two auth systems = confusion, security gaps. Delete JWT/Passport infrastructure completely (Phase 58 handles final cleanup, but Phase 50 should NOT wire both).
- **Using `toNextJsHandler` with Pages Router:** This project uses Pages Router exclusively. Use `toNodeHandler` from `better-auth/node`.
- **Hardcoding cookie names in downstream code:** better-auth uses `better-auth.session_token` by default. Do not reference `__Host-access_token` or `access_token` anywhere in new code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management | Custom session table + cookie logic | better-auth's built-in session with cookieCache | Cookie signing, expiry, refresh, DB storage, cache invalidation -- all handled |
| Password hashing orchestration | Custom hash/verify/rehash pipeline | better-auth's `emailAndPassword.password` config | Provide Argon2id hash/verify functions; better-auth calls them at the right time |
| Session validation in NestJS | Custom guard with raw DB queries | `@thallesp/nestjs-better-auth` AuthGuard | Handles header conversion, cookie parsing, cache check, session refresh |
| CSRF for auth routes | Custom CSRF middleware for better-auth | better-auth has built-in CSRF protection | better-auth handles CSRF internally for its own endpoints |

**Key insight:** better-auth is opinionated about owning the auth lifecycle. Fighting its conventions (custom session tables, custom cookie names, custom CSRF for auth routes) creates maintenance burden. Accept its defaults where possible, customize only where PMSync requirements demand it (Argon2id, HIBP, tenantId).

## Common Pitfalls

### Pitfall 1: Schema Field Name Mismatch

**What goes wrong:** better-auth expects `emailVerified` (boolean), `name` (single string), `image` (avatar). Current PMSync User has `firstName`/`lastName` (separate), `avatarUrl`, no `emailVerified`, and `passwordHash` on User (better-auth puts password on Account table).
**Why it happens:** better-auth has a fixed core schema. Custom fields go via `additionalFields`, but the core fields must exist with correct names.
**How to avoid:** Add better-auth's required core fields (`name`, `emailVerified`, `image`) to the User model. Keep `firstName`/`lastName` as `additionalFields`. The `name` field can be computed from `firstName + lastName` during registration. Remove `passwordHash` from User -- password moves to Account table.
**Warning signs:** Prisma migration fails; better-auth throws "column not found" errors on startup.

### Pitfall 2: Body Parser Conflict with `@thallesp/nestjs-better-auth`

**What goes wrong:** The NestJS integration requires `bodyParser: false` in `NestFactory.create()`. This breaks existing middleware that reads `req.body` (CSRF middleware, validation pipes, webhook handlers).
**Why it happens:** better-auth needs raw request body access. NestJS's default body parser consumes the stream.
**How to avoid:** For Phase 50, the NestJS instance is read-only (session validation only). It does NOT need to handle auth endpoints. Therefore, do NOT set `bodyParser: false` globally. Instead, use `@thallesp/nestjs-better-auth`'s `AuthModule.forRoot()` which should handle body parsing selectively, OR configure a custom guard that calls `auth.api.getSession()` directly without needing body parsing at all (session validation only reads cookies/headers, not body).
**Warning signs:** 400 errors on existing NestJS endpoints after adding better-auth. Empty `req.body` in middleware logs.

### Pitfall 3: Cookie Domain Mismatch (Dev vs Prod)

**What goes wrong:** better-auth sets cookies from Next.js (port 3001). NestJS on port 3000 never receives the cookie because browsers scope cookies by origin.
**Why it happens:** Different ports = different origins in dev. Cookie `domain` and `sameSite` settings must align.
**How to avoid:** In dev, ensure CORS `credentials: true` on both services, and better-auth cookie config uses `sameSite: "lax"` (not "strict") with appropriate domain. In production, both services share the same domain (e.g., `pmsync.com`). Test cookie presence by logging `req.headers.cookie` in the NestJS guard early.
**Warning signs:** All NestJS requests return 401. `req.cookies` is empty in NestJS.

### Pitfall 4: Scrypt vs Argon2id Regression

**What goes wrong:** better-auth defaults to scrypt. If you forget to configure custom hash/verify, all new passwords are hashed with scrypt instead of Argon2id.
**Why it happens:** better-auth's default hashing algorithm is scrypt (Node.js native). The project standard is Argon2id via `@node-rs/argon2`.
**How to avoid:** Always configure `emailAndPassword.password.hash` and `emailAndPassword.password.verify` with `@node-rs/argon2` functions. Write a test that verifies a newly created user's password hash starts with `$argon2id$`.
**Warning signs:** New user passwords stored with `$scrypt$` prefix in Account table.

### Pitfall 5: CSRF Middleware Interference with Auth Routes

**What goes wrong:** The existing CSRF middleware (`csrf.middleware.ts`) runs on all POST routes. better-auth handles its own CSRF internally. If the existing CSRF middleware runs on `/api/auth/*` routes proxied through NestJS (if any), it will reject better-auth requests.
**How to avoid:** better-auth auth routes run through Next.js, not NestJS. Ensure no NestJS proxy forwards to better-auth. The CSRF excluded paths list in `csrf.middleware.ts` already excludes auth paths -- but these are NestJS auth paths (`/api/v1/auth/*`). If NestJS no longer handles auth, this is moot. But if any NestJS route proxies to better-auth, add those paths to the exclusion list.
**Warning signs:** 403 CSRF errors on auth endpoints.

### Pitfall 6: Shared PrismaClient Between Next.js and NestJS

**What goes wrong:** Both Next.js and NestJS instantiate separate PrismaClient instances connecting to the same database. If Prisma schema is out of sync between the two, one side fails.
**Why it happens:** The Prisma schema lives in `backend/prisma/schema.prisma`. Next.js needs access to the same schema and generated client.
**How to avoid:** Either: (a) share the Prisma client package via workspace symlink, or (b) copy/reference the schema from backend and generate a separate client for frontend. Option (a) is cleaner. Ensure `prisma generate` is run for both.
**Warning signs:** "Unknown model" errors in Next.js; "column does not exist" in one but not the other.

## Code Examples

### Prisma Schema: better-auth Core Tables (Adapted for PMSync)

```prisma
// Source: better-auth docs + PMSync requirements
// DO NOT run `npx auth generate` -- manually adapt

model User {
  id            String    @id @default(cuid())
  name          String    // better-auth core field (computed: firstName + lastName)
  email         String    @unique  // better-auth: unique on email (no tenantId compound)
  emailVerified Boolean   @default(false)
  image         String?   // better-auth core field (maps to avatarUrl)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // PMSync additional fields (via better-auth additionalFields)
  tenantId      String?   // legacy tenant FK, set after org creation
  firstName     String?
  lastName      String?
  role          String    @default("member")
  isActive      Boolean   @default(true)
  lastLogin     DateTime?
  deletedAt     DateTime?

  // better-auth relations
  sessions      Session[]
  accounts      Account[]

  // PMSync relations (preserved from existing schema)
  tenant              Tenant?   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // ... all 42+ existing relations preserved ...

  @@index([tenantId])
  @@map("users")
}

model Session {
  id                    String   @id @default(cuid())
  token                 String   @unique
  userId                String
  expiresAt             DateTime
  ipAddress             String?
  userAgent             String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  activeOrganizationId  String?  // organization plugin (future Phase 56)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

model Account {
  id                    String    @id @default(cuid())
  userId                String
  accountId             String
  providerId            String    // "credential", "google"
  accessToken           String?
  refreshToken          String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  idToken               String?
  password              String?   // hashed password for credential provider
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("accounts")
}

model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("verifications")
}
```

### Critical Schema Changes from Current

| Change | Current | Target | Impact |
|--------|---------|--------|--------|
| `User.email` | `@@unique([tenantId, email])` | `@unique` (email alone) | better-auth requires globally unique emails. Compound unique with tenantId is incompatible. |
| `User.passwordHash` | On User model | Moved to `Account.password` | better-auth stores password in Account table for multi-provider support |
| `User.name` | Does not exist | Required `String` | better-auth core field; compute from firstName/lastName |
| `User.emailVerified` | Does not exist | Required `Boolean` | better-auth core field |
| `Session.tenantId` | Required FK | Removed (use `activeOrganizationId` later) | Session scoping via org plugin, not direct tenantId |
| `Session.token` | `@@unique([tenantId, token])` | `@unique` (token alone) | better-auth expects simple unique token |
| `Account` table | Does not exist | New table | Stores credential/OAuth provider info |
| `Verification` table | Does not exist | New table | Email verification, password reset tokens |
| `RefreshToken` table | Exists | DELETE | better-auth manages session refresh internally |

### NestJS `main.ts` Impact

The critical question for Phase 50: does `@thallesp/nestjs-better-auth` require `bodyParser: false`?

**Answer:** Yes, BUT only if NestJS handles auth routes. For Phase 50, NestJS is a session consumer only (reads cookies, validates sessions). Auth routes are in Next.js. The `bodyParser: false` requirement applies when better-auth handles incoming auth requests in NestJS. Since we are NOT routing auth through NestJS, we can skip `bodyParser: false` for now and add it only if needed.

Alternative: Use a custom guard that calls `auth.api.getSession()` with `fromNodeHeaders(request.headers)` -- this only reads headers/cookies, no body parsing needed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Passport + JWT | better-auth sessions | 2024-2025 | No more JWT signing/verification; cookie-based sessions |
| bcrypt hashing | Argon2id (OWASP 2025) | 2025 | `@node-rs/argon2` already in use; preserve via better-auth config |
| Custom session table with tenantId | better-auth Session + Organization plugin | 2025-2026 | Session no longer carries tenantId directly; uses activeOrganizationId |
| Custom HIBP service | better-auth before-hook | N/A | Extract existing HIBP logic into pure function, wire as hook |
| scrypt (better-auth default) | Argon2id (override) | Project decision | Must configure `emailAndPassword.password` to use Argon2id |

**Deprecated/outdated:**
- `RefreshToken` table: better-auth does not use refresh tokens; sessions are extended via `updateAge`
- `MfaSecret`, `MfaBackupCode` tables: replaced by better-auth 2FA plugin (Phase 55)
- `TrustedDevice`, `WebAuthnCredential` tables: replaced by better-auth plugins (Phase 55)
- `JwtStrategy`, `PassportModule`: no more JWT/Passport

## Open Questions

1. **Shared Prisma Client Strategy**
   - What we know: Both Next.js and NestJS need the same Prisma schema and generated client. Schema lives in `backend/prisma/schema.prisma`.
   - What's unclear: Best way to share the generated client. Options: (a) npm workspace symlink, (b) separate prisma schema copy in frontend, (c) publish as internal package.
   - Recommendation: For v5.0, option (b) -- add a `prisma/schema.prisma` reference in the frontend that points to the backend schema, or generate the client in a shared location. Keep it simple.

2. **`@@unique([tenantId, email])` Removal**
   - What we know: better-auth requires `email @unique` globally. Current schema has `@@unique([tenantId, email])`, allowing same email across tenants.
   - What's unclear: Are there users with the same email in different tenants?
   - Recommendation: Clean slate migration means no existing data to worry about. Change to `@unique` on email alone. Accept that one email = one user across all tenants (matches better-auth's model; organization plugin handles multi-tenancy).

3. **Cookie Configuration for Cross-Port Dev**
   - What we know: Next.js on 3001, NestJS on 3000. Cookies set by Next.js must be readable by NestJS.
   - What's unclear: Exact better-auth cookie config needed for cross-port dev.
   - Recommendation: Test with `sameSite: "lax"`, no explicit domain (defaults to current host). Both ports share `localhost` so cookies should work. If not, configure a dev reverse proxy.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.2 + Vitest 4.0 (both available) |
| Config file | `backend/jest.config.js`, `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern="auth" --no-coverage -t "PATTERN" --passWithNoTests` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-06 | better-auth instance initializes and creates DB-backed session on signup | integration | `cd backend && npx jest --testPathPattern="better-auth-session" --no-coverage` | No - Wave 0 |
| CORE-06 | Session cookie is httpOnly, no JWT in response | unit | `cd backend && npx jest --testPathPattern="session-cookie" --no-coverage` | No - Wave 0 |
| CORE-07 | HIBP check rejects breached password during signup | unit | `cd backend && npx jest --testPathPattern="hibp" --no-coverage` | Partial - `password-policy.spec.ts` exists but tests old service |
| CORE-07 | HIBP check allows clean password | unit | `cd backend && npx jest --testPathPattern="hibp" --no-coverage` | Partial |

### Sampling Rate

- **Per task commit:** `cd backend && npx jest --testPathPattern="better-auth|hibp|session" --no-coverage`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/src/__tests__/better-auth-instance.spec.ts` -- covers CORE-06 (instance initialization, session creation)
- [ ] `backend/src/__tests__/hibp-hook.spec.ts` -- covers CORE-07 (HIBP via better-auth before-hook)
- [ ] `frontend/lib/__tests__/auth.test.ts` -- covers CORE-06 (Next.js better-auth instance config verification)
- [ ] Prisma schema migration test: verify `npx prisma validate` passes after schema changes

## Sources

### Primary (HIGH confidence)

- [better-auth Official Docs - Email/Password](https://better-auth.com/docs/authentication/email-password) -- custom hash/verify, password config
- [better-auth Hooks](https://better-auth.com/docs/concepts/hooks) -- createAuthMiddleware, before hooks, ctx properties
- [better-auth Database Schema](https://better-auth.com/docs/concepts/database) -- core table fields, additionalFields, table name customization
- [better-auth Prisma Adapter](https://better-auth.com/docs/adapters/prisma) -- prismaAdapter config, schema generation
- [better-auth Session Management](https://better-auth.com/docs/concepts/session-management) -- cookieCache strategies (compact/jwt/jwe), session expiry
- [better-auth Next.js Integration](https://better-auth.com/docs/integrations/next) -- Pages Router setup, toNodeHandler, bodyParser config
- [better-auth NestJS Integration](https://better-auth.com/docs/integrations/nestjs) -- dual-instance pattern, bodyParser requirement

### Secondary (MEDIUM confidence)

- [@thallesp/nestjs-better-auth npm](https://www.npmjs.com/package/@thallesp/nestjs-better-auth) -- 17K weekly downloads, AuthGuard, @Session()
- [@thallesp/nestjs-better-auth GitHub](https://github.com/ThallesP/nestjs-better-auth) -- bodyParser behavior, forRoot config
- [Prisma + better-auth Guide](https://www.prisma.io/docs/guides/betterauth-nextjs) -- official Prisma guide

### Tertiary (LOW confidence)

- `@thallesp/nestjs-better-auth` bodyParser auto-re-add behavior -- stated in README but exact middleware re-addition behavior not verified in source code. Need to test.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- better-auth is well-documented, Prisma adapter is official, `@node-rs/argon2` already in project
- Architecture: MEDIUM-HIGH -- dual-instance pattern documented in official better-auth NestJS docs and community package; Pages Router support confirmed
- Pitfalls: HIGH -- based on codebase analysis (42 FK chains, CSRF middleware, bodyParser in main.ts, Argon2id usage) and official docs
- HIBP integration: MEDIUM -- hooks.before with createAuthMiddleware is documented but HIBP specifically is not a documented use case; the pattern is straightforward

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (better-auth is fast-moving; check for breaking changes before execution)
