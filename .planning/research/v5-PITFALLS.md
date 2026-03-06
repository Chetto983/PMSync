# Domain Pitfalls: better-auth Migration (v5.0)

**Domain:** Authentication migration in split architecture
**Researched:** 2026-03-06

## Critical Pitfalls

Mistakes that cause rewrites or major security issues.

### Pitfall 1: Body Parser Conflict

**What goes wrong:** `@thallesp/nestjs-better-auth` requires `bodyParser: false` when creating the NestJS app. This breaks existing middleware that depends on parsed bodies (CSRF middleware, webhook signature verification, request logging).
**Why it happens:** better-auth needs to read the raw request body for its internal handling. NestJS's default body parser consumes the stream before better-auth can read it.
**Consequences:** Auth endpoints return empty/malformed responses. CSRF validation breaks. Webhook handlers fail.
**Prevention:** Before switching to `bodyParser: false`, audit every middleware and interceptor that reads `req.body`. The `@thallesp/nestjs-better-auth` package re-adds default body parsers for non-auth routes, but custom middleware may need adjustment. Test CSRF middleware, correlation ID interceptor, and webhook handlers explicitly.
**Detection:** 400/500 errors on auth endpoints. Empty request bodies in middleware logs.

### Pitfall 2: Tenant Isolation Gap During Migration

**What goes wrong:** better-auth's Organization plugin uses `activeOrganizationId` on the session, but existing code reads `tenantId` from JWT payload. During migration, if the mapping between Organization and Tenant is incomplete, some requests bypass tenant isolation.
**Why it happens:** 42+ models use `tenantId` FK. The Prisma tenant-scoping middleware reads `tenantId` from AsyncLocalStorage. If the adapted TenantGuard doesn't properly set this context, queries return cross-tenant data.
**Consequences:** Data leakage between tenants. GDPR violation.
**Prevention:** The adapted TenantGuard MUST set `request.activeTenantId` with the resolved `tenantId` (not `organizationId`). Write an integration test that proves: user in org A cannot see data from org B. Run this test before ANY deployment.
**Detection:** Cross-tenant data in API responses. Audit logs showing access to foreign tenant resources.

### Pitfall 3: Session Cookie Domain/Path Mismatch

**What goes wrong:** better-auth sets session cookies from Next.js (port 3001). NestJS runs on port 3000. If cookie domain or path is misconfigured, NestJS never receives the session cookie.
**Why it happens:** In development, Next.js and NestJS run on different ports. Browsers may scope cookies to the origin port. `sameSite`, `secure`, and `domain` settings must align between better-auth's cookie config and NestJS's expected cookie format.
**Consequences:** All NestJS requests return 401. WebSocket connections fail. App appears completely broken.
**Prevention:** In development, run both on same domain (e.g., reverse proxy). In production, ensure cookie `domain` is set to the parent domain (e.g., `.pmsync.com`). Test cookie presence in NestJS by logging `req.cookies` in the guard before any validation. better-auth's cookie name differs from the current `__Host-access_token` / `access_token` -- update all cookie extraction logic.
**Detection:** 401 on all authenticated endpoints. `req.cookies` is empty in NestJS logs.

### Pitfall 4: Concurrent Auth During Cutover

**What goes wrong:** If old JWT-based sessions and new better-auth sessions coexist during migration, some users have valid JWT cookies while others have better-auth session cookies. Guards must handle both, creating a window of inconsistency.
**Why it happens:** Users with active sessions at cutover time still have valid JWT cookies until they expire (15 minutes for access token).
**Consequences:** Some users get 401 errors. Some users can't logout properly. Security audit nightmare.
**Prevention:** Clean slate approach (PROJECT.md already specifies "existing users re-register"). Deploy better-auth with JWT infrastructure completely removed. No grace period, no dual-auth. Coordinate deployment to: (1) take app offline briefly, (2) deploy new auth, (3) all users re-register. Alternatively, expire all existing sessions before deployment.
**Detection:** Mixed JWT and session-cookie errors in logs.

## Moderate Pitfalls

### Pitfall 5: better-auth Session Table vs. Existing Session Table

**What goes wrong:** Both the current schema and better-auth need a `Session` model. If better-auth's `npx auth generate` runs, it may conflict with or overwrite the existing Session model.
**Prevention:** Do NOT run `npx auth generate` blindly. Manually adapt the existing Session model to match better-auth's required fields, or rename the existing model before generation. Compare field-by-field: better-auth needs `token` (unique), `userId`, `expiresAt`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt`. Current model has `tenantId` (not in better-auth's default schema). Use schema customization in better-auth's Prisma adapter to add `tenantId` or handle via the Organization plugin's `activeOrganizationId`.

### Pitfall 6: Cookie Name Change Breaks WebSocket Auth

**What goes wrong:** Current WebSocket handshake service extracts `__Host-access_token` or `access_token` from cookies. better-auth uses a different cookie name (e.g., `better-auth.session_token`). WebSocket connections silently fail.
**Prevention:** Update `RealtimeHandshakeService.extractToken()` to look for better-auth's cookie name. Check better-auth source or config for the exact cookie name. Test WebSocket auth explicitly after migration.

### Pitfall 7: Organization Plugin Schema Pollution

**What goes wrong:** The Organization plugin adds `organization`, `member`, `invitation` tables plus `activeOrganizationId` on Session. If these conflict with existing table names or indexes, Prisma migration fails.
**Prevention:** Check for naming conflicts before adding organization plugin. Use better-auth's schema customization to rename tables if needed (e.g., `ba_organization` prefix to avoid conflicts).

### Pitfall 8: `auth.api.getSession()` Performance in Hot Path

**What goes wrong:** Every NestJS request calls `auth.api.getSession()` which may hit the database if cookie cache is expired. At high request volume, this becomes a bottleneck.
**Prevention:** Enable `cookieCache` with `maxAge: 300` (5 minutes) -- matches current Redis session cache TTL. The `compact` strategy (HMAC-signed base64url) is the fastest encoding. For WebSocket, cache the validated session in memory for the connection lifetime.

### Pitfall 9: `fromNodeHeaders` Not Available in All Contexts

**What goes wrong:** `auth.api.getSession()` needs headers in Web API `Headers` format. NestJS passes Node.js `IncomingHttpHeaders`. The `fromNodeHeaders` helper from `better-auth/node` bridges this, but may not work in all NestJS contexts (WebSocket handshake, BullMQ).
**Prevention:** Use `fromNodeHeaders` for HTTP requests. For WebSocket, manually construct headers from handshake. For BullMQ, don't use sessions at all (jobs carry tenantId directly).

## Minor Pitfalls

### Pitfall 10: better-auth's `name` Field vs. PMSync's `firstName`/`lastName`

**What goes wrong:** better-auth stores a single `name` field. PMSync uses `firstName` and `lastName` separately. The session object has `user.name` but not `user.firstName`.
**Prevention:** Use better-auth's schema customization to add `firstName` and `lastName` to the User model. OR: parse `name` into first/last in the session-to-context mapper. Former is cleaner.

### Pitfall 11: HIBP Password Policy Loss

**What goes wrong:** Current auth has HIBP (Have I Been Pwned) password checking. better-auth's credential auth doesn't include this by default.
**Prevention:** Add password validation in better-auth's hooks or keep a thin validation middleware. Check if better-auth supports `beforeSignUp` hooks for custom password policy.

### Pitfall 12: Argon2id Hashing Preference

**What goes wrong:** Current auth uses Argon2id (OWASP 2025 recommended). better-auth may use bcrypt by default.
**Prevention:** Check better-auth's password hashing algorithm. If it's bcrypt, check if there's a config option to use Argon2. If not, this is a security regression to accept or work around.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Prisma schema migration | Pitfall 5: Table conflicts | Manual schema adaptation, no blind `auth generate` |
| NestJS guard replacement | Pitfall 1: Body parser conflict | Audit all middleware before `bodyParser: false` |
| TenantGuard adaptation | Pitfall 2: Tenant isolation gap | Integration test proving cross-tenant isolation |
| Frontend auth UI | Pitfall 3: Cookie domain mismatch | Reverse proxy in dev; test cookie presence |
| WebSocket auth | Pitfall 6: Cookie name change | Update cookie extraction in handshake service |
| Deployment/cutover | Pitfall 4: Concurrent auth | Clean slate, no dual-auth period |
| Performance tuning | Pitfall 8: getSession() in hot path | Enable cookieCache (compact, 5min) |

## Sources

- [better-auth NestJS Integration](https://better-auth.com/docs/integrations/nestjs) -- bodyParser requirement
- [@thallesp/nestjs-better-auth README](https://github.com/ThallesP/nestjs-better-auth) -- guard behavior, body parser details
- [better-auth Session Management](https://better-auth.com/docs/concepts/session-management) -- cookie caching, session refresh
- [better-auth Organization Plugin](https://better-auth.com/docs/plugins/organization) -- activeOrganizationId behavior
- Codebase analysis: `jwt.strategy.ts`, `tenant.guard.ts`, `realtime-handshake.service.ts`, `cookie.helper.ts`
