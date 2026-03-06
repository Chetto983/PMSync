# Research Summary: better-auth Migration (v5.0)

**Domain:** Authentication migration in split Next.js + NestJS architecture
**Researched:** 2026-03-06
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

The migration from custom NestJS JWT auth to better-auth is architecturally clean but operationally complex. better-auth is a mature, TypeScript-native auth library with a plugin ecosystem that covers every feature in the v5.0 target list: email/password, social login (Google OAuth), 2FA (TOTP + passkeys), organizations (multi-tenant), and admin panel.

The core architectural shift: auth moves from NestJS ownership to Next.js ownership. better-auth runs as a Next.js API route handler (`/api/auth/*`), managing sessions, users, and accounts via its Prisma adapter against the shared PostgreSQL database. NestJS becomes a session consumer -- it validates sessions via `auth.api.getSession()` (using the `@thallesp/nestjs-better-auth` community package) instead of verifying JWT tokens.

The hardest part is not the auth library swap itself, but preserving tenant isolation. The existing system has 42+ Prisma models with `tenantId` FK, a Prisma tenant-scoping middleware, and guards that read `tenantId` from JWT claims. better-auth's Organization plugin provides `activeOrganizationId` on sessions, which must be mapped to the existing `tenantId` infrastructure. The recommended approach is keeping the `Tenant` table and adding a bridge `tenantId` column to the `Organization` model, rather than migrating all 42 models at once.

BullMQ jobs are unaffected -- they carry `tenantId` directly in job data and never use sessions. WebSocket auth requires adapting the handshake service to extract better-auth's session cookie (different cookie name) and validate via `auth.api.getSession()` instead of JWT verification.

## Key Findings

**Stack:** better-auth + `@thallesp/nestjs-better-auth` + Organization plugin. Delete Passport, JWT, and all custom auth services (~15 files).

**Architecture:** Dual-instance pattern -- better-auth runs in Next.js (auth provider), NestJS validates sessions (auth consumer). Session cookie flows from browser to both servers.

**Critical pitfall:** Body parser conflict (`bodyParser: false` requirement) will break existing CSRF middleware and must be tested against all NestJS middleware before deployment.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Schema & Infrastructure** - Prisma schema adaptation, better-auth instance setup
   - Addresses: Database tables (User, Session, Account, Verification, Organization, Member)
   - Avoids: Pitfall 5 (table conflicts) by manual schema adaptation

2. **NestJS Session Validation** - Replace JWT guards with better-auth session validation
   - Addresses: AuthGuard, TenantGuard, RolesGuard adaptation
   - Avoids: Pitfall 1 (body parser) and Pitfall 2 (tenant isolation gap)

3. **Frontend Auth UI** - Login pages, session hooks, organization switching
   - Addresses: better-auth client SDK integration, AuthContext replacement
   - Avoids: Pitfall 3 (cookie domain mismatch)

4. **WebSocket & Realtime** - Adapt WS handshake for better-auth sessions
   - Addresses: RealtimeHandshakeService adaptation
   - Avoids: Pitfall 6 (cookie name change)

5. **Social Login & MFA** - Google OAuth, TOTP, passkeys
   - Addresses: Differentiator features
   - Avoids: Scope creep by deferring to after core migration works

6. **Admin & Cleanup** - Admin panel, legacy code deletion
   - Addresses: Admin plugin, delete ~15 auth files, remove deprecated packages

**Phase ordering rationale:**
- Schema must come first because both NestJS guards and frontend auth depend on it
- NestJS guards before frontend because frontend can't test auth flows without working backend validation
- WebSocket after core HTTP auth because WS auth is a specialization of the same pattern
- Social login and MFA after core email/password because they're additive features
- Cleanup last because it's safe only after everything else works

**Research flags for phases:**
- Phase 1: Needs deeper research on exact better-auth Prisma schema vs. existing schema field-by-field diff
- Phase 2: Needs validation that `@thallesp/nestjs-better-auth` handles the `bodyParser: false` requirement cleanly with existing middleware
- Phase 4: Needs spike to confirm `auth.api.getSession()` works with Socket.IO handshake headers via `fromNodeHeaders`
- Phase 5: Standard patterns, unlikely to need research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | better-auth is well-documented; Prisma adapter, org plugin, 2FA plugin all verified via official docs |
| Features | HIGH | All target features (social login, 2FA, org, admin) are first-party better-auth plugins with official docs |
| Architecture | MEDIUM-HIGH | Dual-instance pattern is documented but the tenant bridge pattern (Organization.tenantId) is custom -- needs validation |
| Pitfalls | MEDIUM | Body parser conflict and cookie domain issues are documented; tenant isolation gap is inferred from codebase analysis |
| @thallesp/nestjs-better-auth | MEDIUM | 17K weekly downloads, referenced in official docs, but community-maintained; WebSocket support is recent |

## Gaps to Address

- **Exact cookie name** better-auth uses -- need to check source or config to know what `RealtimeHandshakeService` should extract
- **Argon2id vs bcrypt** -- need to verify which hashing algorithm better-auth uses by default and whether it's configurable
- **HIBP password policy** -- need to check if better-auth supports custom password validation hooks
- **`bodyParser: false` impact** -- need to audit every NestJS middleware that reads `req.body` (CSRF, correlation ID, request logging)
- **Prisma tenant-scoping middleware compatibility** -- the AsyncLocalStorage-based tenant context must work with better-auth's session flow through the adapted TenantGuard
- **better-auth session token format** -- is it opaque? JWT? Need to know for WebSocket auth where direct DB query may be needed
