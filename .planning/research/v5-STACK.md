# Technology Stack: better-auth Migration (v5.0)

**Project:** PMSync v5.0
**Researched:** 2026-03-06

## Recommended Stack

### Core Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `better-auth` | latest | Auth provider (login, register, MFA, social, sessions) | Replaces custom NestJS auth with battle-tested library; plugin ecosystem for org, 2FA, admin |
| `@better-auth/prisma-adapter` | latest | Database adapter for better-auth | Shares existing Prisma + PostgreSQL; no new DB infrastructure |
| `@thallesp/nestjs-better-auth` | latest | NestJS session validation guard + decorators | 17K weekly downloads, official NestJS integration docs reference it; gives AuthGuard, @Session(), @AllowAnonymous() |

### better-auth Plugins

| Plugin | Purpose | Why |
|--------|---------|-----|
| `organization` | Multi-tenant (replaces Tenant model) | Built-in roles, member management, invitations; maps to existing tenant concept |
| `twoFactor` | TOTP + backup codes | Replaces custom TotpService, BackupCodesService, OtpSecurityService |
| `bearer` | Bearer token support for non-cookie clients | Needed if any API client uses Authorization headers instead of cookies |
| `admin` | Admin user management | Ban/unban, impersonation, user CRUD; replaces manual admin endpoints |
| `customSession` | Extend session with tenantId | Attach tenantId to session for backward compatibility with existing guards |

### Preserved Stack (No Changes)

| Technology | Version | Purpose | Why Unchanged |
|------------|---------|---------|---------------|
| NestJS | 11 | Backend API server | Auth moves out, but all domain logic stays |
| Prisma | 7 | ORM / Database access | Shared by both Next.js (better-auth) and NestJS |
| PostgreSQL | latest | Primary database | Shared; better-auth uses same DB |
| Redis | latest | Caching, BullMQ, distributed locks | Session caching may shift to better-auth's cookieCache, but Redis stays for queues |
| BullMQ | latest | Background job processing | Jobs carry tenantId in data, no auth dependency |
| Next.js | 16 | Frontend + now auth provider | Was frontend-only; now also hosts better-auth |
| React | 19 | UI framework | No change |
| TanStack Query | latest | Data fetching | No change |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Auth library | better-auth | Auth.js (NextAuth v5) | better-auth has better plugin ecosystem (org, admin, 2FA built-in); Auth.js focuses on OAuth, weaker on email/password and multi-tenant |
| Auth library | better-auth | Clerk/Auth0 | Cloud dependency unacceptable for self-hosted requirement; vendor lock-in |
| Auth library | better-auth | Lucia Auth | Deprecated (author recommends rolling your own or better-auth) |
| NestJS integration | @thallesp/nestjs-better-auth | Custom guard | Community package is well-maintained, 17K weekly downloads; saves boilerplate |
| NestJS integration | @thallesp/nestjs-better-auth | @mguay/nestjs-better-auth | Lower adoption; @thallesp is referenced in official better-auth docs |
| Session strategy | Cookie + cookieCache | JWT (keep current) | better-auth is session-based by design; fighting it with JWT adds complexity |
| Tenant mapping | Organization plugin + bridge table | Custom tenant plugin | Organization plugin is mature, has roles/invitations/teams; reinventing is wasteful |

## Packages to REMOVE

| Package | Reason |
|---------|--------|
| `@nestjs/passport` | No more Passport strategies |
| `passport` | No more Passport |
| `passport-jwt` | No more JWT strategy |
| `@nestjs/jwt` | No more JWT signing/verification |
| `jsonwebtoken` | No more manual JWT operations |
| `otplib` (if used) | better-auth 2FA handles TOTP |
| `@simplewebauthn/*` | better-auth passkey plugin handles WebAuthn |

## Installation

```bash
# Frontend (Next.js)
npm install better-auth

# Backend (NestJS)
npm install @thallesp/nestjs-better-auth better-auth

# Remove deprecated packages
npm uninstall @nestjs/passport passport passport-jwt @nestjs/jwt
```

## Configuration

### Environment Variables (New)

```bash
# better-auth
BETTER_AUTH_SECRET=<random-32-char-string>  # replaces JWT_SECRET
BETTER_AUTH_URL=http://localhost:3001        # Next.js URL

# Social login (already exists, reuse)
GOOGLE_CLIENT_ID=<existing>
GOOGLE_CLIENT_SECRET=<existing>

# Remove these after migration:
# JWT_SECRET, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, JWT_LEGACY_HMAC_SECRET
# ACCESS_TOKEN_EXPIRES_IN, PASSWORD_RESET_SECRET
```

## Sources

- [better-auth Official Docs](https://better-auth.com/docs) -- HIGH confidence
- [better-auth Prisma Adapter](https://better-auth.com/docs/adapters/prisma) -- HIGH confidence
- [@thallesp/nestjs-better-auth npm](https://www.npmjs.com/package/@thallesp/nestjs-better-auth) -- MEDIUM confidence
- [better-auth NestJS Integration](https://better-auth.com/docs/integrations/nestjs) -- HIGH confidence
