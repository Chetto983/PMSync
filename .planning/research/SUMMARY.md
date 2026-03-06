# Research Summary: better-auth Migration (v5.0)

**Synthesized:** 2026-03-06
**Sources:** STACK.md, FEATURES.md, PITFALLS.md, v5-ARCHITECTURE.md, v5-SUMMARY.md
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

better-auth v1.5.4 is the right choice. It covers every v5.0 auth need via built-in features or official plugins. The migration is a **net deletion** (~17 files removed, 5 npm packages dropped) with only 2-3 packages added.

**Architecture:** Dual-instance pattern. better-auth runs in both Next.js (auth provider, manages `/api/auth/*` routes) and NestJS (session consumer, validates via `auth.api.getSession()`). Both share the same PostgreSQL database and secret. No JWTs -- pure DB-backed sessions with optional cookie cache.

**Hardest parts:**
1. **Prisma schema collision** -- better-auth wants to own User/Session tables; PMSync has 42 FK chains to User
2. **Tenant isolation gap** -- better-auth has no tenant concept; must bridge via `additionalFields`
3. **WebSocket auth rewrite** -- 359 lines of JWT-specific handshake logic must be replaced
4. **bodyParser: false** -- NestJS integration requires disabling body parser, breaking existing routes

## Stack Additions

| Package | Purpose |
|---------|---------|
| `better-auth` ^1.5.4 | Auth framework (both Next.js + NestJS) |
| `@thallesp/nestjs-better-auth` ^2.4.0 | NestJS guards, decorators, session validation |

**Plugins (from better-auth/plugins):** `organization()`, `twoFactor()`, `admin()`, `passkey()`, `haveIBeenPwned()`

**Packages to remove:** `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `argon2`

## Feature Table Stakes

- Email/password (built-in)
- Google OAuth (built-in social provider)
- Email verification + password reset (built-in)
- Session management with configurable expiry (built-in)
- Rate limiting on auth endpoints (built-in)
- HIBP password check (`haveIBeenPwned()` plugin)

## Differentiators

- TOTP 2FA + backup codes (`twoFactor()` plugin)
- Passkeys/WebAuthn (`passkey()` plugin)
- Organizations with roles/permissions (`organization()` plugin)
- Admin panel with ban/impersonation (`admin()` plugin)
- Pre-built shadcn/ui auth components (`better-auth-ui`)

## Watch Out For

1. **Schema collision (CRITICAL):** Do NOT run `npx auth generate` against production schema. Manually adapt Prisma models. Use `additionalFields` for `tenantId`.
2. **Tenant isolation (CRITICAL):** better-auth has zero tenant awareness. TenantGuard must read `tenantId` from session user, not JWT claims.
3. **bodyParser: false (HIGH):** Apply selectively to auth routes only, not globally.
4. **Cookie name change (HIGH):** `__Host-access_token` -> `better-auth.session_token`. Update all consumers (WebSocket, CSRF).
5. **WebSocket auth (HIGH):** Opaque session tokens can't be verified with `jwtService.verifyAsync()`. Must use `auth.api.getSession()`.
6. **Audit trail gap (MEDIUM):** Wire better-auth hooks to existing audit logging before removing old auth code.
7. **GDPR (MEDIUM):** Add better-auth tables to data export and right-to-erasure flows.

## Recommended Phase Order

1. Schema & Infrastructure (Prisma models, better-auth instances)
2. NestJS Session Validation (guards, tenant bridge, bodyParser fix)
3. Frontend Auth UI (better-auth client, login pages, session hooks)
4. WebSocket & Realtime (handshake service rewrite)
5. Social Login & MFA (Google OAuth, TOTP, passkeys -- additive)
6. Organizations & Admin (org plugin, admin plugin, dashboard)
7. Compliance & Cleanup (audit hooks, GDPR, delete legacy code, tests)

---
*Synthesized: 2026-03-06 -- v5.0 better-auth Migration*
