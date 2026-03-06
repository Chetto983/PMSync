# Domain Pitfalls: better-auth Migration in PMSync

**Domain:** Enterprise auth migration (custom NestJS auth -> better-auth)
**Researched:** 2026-03-06
**Overall Confidence:** MEDIUM-HIGH (verified against official docs, GitHub issues, and codebase analysis)

---

## Critical Pitfalls

Mistakes that cause rewrites, security holes, or production outages.

---

### Pitfall 1: Prisma Schema Collision -- Existing User/Session vs better-auth Models

**What goes wrong:** better-auth requires four core models: `user`, `session`, `account`, `verification`. PMSync already has `User` (with 15+ custom fields: `tenantId`, `passwordHash`, `role`, `isActive`, `isMfaEnabled`, etc.) and `Session` (with `tenantId`, `token`, `expiresAt`, custom fields). The `npx auth@latest generate` CLI will try to overwrite or conflict with these existing models.

**Why it happens:** better-auth's schema generator assumes it owns these models. It expects specific field names (`name`, `emailVerified`, `image`) that don't exist in PMSync's schema, and PMSync has fields (`tenantId`, `passwordHash`, `role`, `isActive`) that better-auth doesn't know about.

**Consequences:**
- Running `npx auth@latest generate` clobbers your existing schema
- Prisma migration fails because the new schema is incompatible with existing data
- 42 tenant-scoped models reference `User` and `Session` via foreign keys -- breaking these breaks everything
- Composite primary keys on `Email`, `Folder`, `Embedding`, `CalendarEvent`, `Contact` (`@@id([id, tenantId])`) add migration complexity

**Prevention:**
1. Do NOT run `npx auth@latest generate` against the production schema. Create better-auth tables manually or in a dedicated Prisma schema file.
2. Use `modelName` mapping to give better-auth its own table names (e.g., `ba_user`, `ba_session`, `ba_account`, `ba_verification`) to avoid collision with existing PMSync models.
3. Add PMSync-specific fields (`tenantId`, `role`, `isActive`) to the better-auth user model via `additionalFields` in the auth config.
4. Plan a data migration strategy: since PROJECT.md says "clean slate: existing users re-register," you can drop old auth tables after migration, but you must preserve the `User.id` foreign key chain (or accept cascading deletes across 42 models).

**Detection:** Schema generation diffs. Run `npx prisma migrate diff` before applying any changes.

**Confidence:** HIGH -- verified against PMSync's `schema.prisma` and better-auth's [database docs](https://better-auth.com/docs/concepts/database).

**Phase:** Must be the FIRST thing addressed. Everything depends on correct schema.

---

### Pitfall 2: Split Architecture Session Validation -- NestJS Cannot Natively Validate better-auth Sessions

**What goes wrong:** better-auth is designed to run inside the framework that handles auth routes (Next.js). PMSync runs a separate NestJS backend (port 3000) and Next.js frontend (port 3001). better-auth's `auth.api.getSession()` requires the auth instance to be available on the same server that receives the request. The NestJS backend doesn't have a better-auth instance -- it's a consumer, not the auth server.

**Why it happens:** better-auth uses cookie-based sessions with signed cookies. The session token is stored in a `better-auth.session_token` cookie. For the NestJS backend to validate this, it needs either:
- A shared better-auth instance (requires NestJS integration package)
- Direct database lookup of the session token
- A proxy/shared-domain setup

**Consequences:**
- If you install better-auth only on Next.js, NestJS has no way to validate sessions
- The [NestJS integration](https://better-auth.com/docs/integrations/nestjs) package is **community-maintained**, not official -- it requires `bodyParser: false` which breaks existing NestJS JSON body parsing for all other routes
- better-auth's JWT plugin docs explicitly warn: "not meant as a replacement for the session" -- using it as a workaround is a security risk
- GitHub [Discussion #5716](https://github.com/better-auth/better-auth/discussions/5716) confirms: "no officially supported or secure way to achieve backend auth state verification across domains"

**Prevention:**
1. **Option A (Recommended):** Install better-auth on BOTH Next.js and NestJS, sharing the same database and `BETTER_AUTH_SECRET`. The NestJS side uses the `nestjs-better-auth` package with `AuthGuard` to validate sessions via the shared session table. This is the pattern described in the [NestJS integration docs](https://better-auth.com/docs/integrations/nestjs).
2. **Option B:** Run better-auth only on Next.js; NestJS validates sessions by directly querying the `session` table using the cookie token. This is fragile -- you're reimplementing session validation outside the framework.
3. **Option C:** Use Next.js as a BFF (Backend-for-Frontend) proxy -- all API calls go through Next.js API routes that validate the session, then forward to NestJS. This adds latency and complexity.
4. For Option A: the `bodyParser: false` requirement means you need to selectively disable body parsing only for better-auth routes, not globally. Use NestJS middleware to apply raw body parsing selectively.

**Detection:** Auth works on frontend but 401s on all NestJS API calls.

**Confidence:** HIGH -- verified against [official NestJS integration docs](https://better-auth.com/docs/integrations/nestjs) and [GitHub discussion](https://github.com/better-auth/better-auth/discussions/5716).

**Phase:** Architecture decision required BEFORE any implementation begins.

---

### Pitfall 3: Cookie Name and Prefix Mismatch -- __Host- vs better-auth Prefix

**What goes wrong:** PMSync currently uses `__Host-access_token` cookies in production (cookie.helper.ts line 28) with `sameSite: 'lax'`, `httpOnly: true`, `secure: true`, `path: '/'`. better-auth uses a completely different cookie naming convention: `better-auth.session_token` with the `__Secure-` prefix (not `__Host-`) in production. These are incompatible.

**Why it happens:**
- `__Host-` prefix requires: `Secure`, `Path=/`, and NO `Domain` attribute (cookie is locked to exact origin). PMSync uses this.
- `__Secure-` prefix requires only `Secure`. better-auth uses this.
- better-auth's cookie prefix is configurable (`cookiePrefix` option) but the `__Host-` prefix has additional browser-enforced constraints that better-auth doesn't explicitly support per [its cookie docs](https://better-auth.com/docs/concepts/cookies).
- During migration, old cookies and new cookies will coexist, causing confusion on which auth system is active.

**Consequences:**
- Frontend sends old `__Host-access_token` cookie; backend expects `better-auth.session_token` (or vice versa) -- instant 401 for all users
- WebSocket handshake service (`realtime-handshake.service.ts`) hardcodes `AUTH_COOKIE_NAME` import -- will break until updated
- Dev environment (localhost:3000/3001) vs production (HTTPS) cookie behavior differs
- Safari ITP blocks third-party cookies entirely -- if frontend and backend are on different domains in production, cookies won't work

**Prevention:**
1. Map out every cookie consumer: auth controller, WebSocket handshake, CSRF middleware, frontend API client.
2. Implement a transition period where both old and new cookies are accepted (dual-read).
3. Configure better-auth's `cookiePrefix` to match your naming convention, or update all consumers to use better-auth's default.
4. Test cookie behavior explicitly in: localhost dev, HTTPS dev proxy, and production domain setup.
5. Verify Safari/ITP compatibility -- if backend and frontend are on different (sub)domains, use a reverse proxy.

**Detection:** Auth works in Chrome but fails in Safari. Auth works in dev but fails in production (or vice versa).

**Confidence:** HIGH -- verified against PMSync's `cookie.helper.ts` and better-auth's [cookie docs](https://better-auth.com/docs/concepts/cookies).

**Phase:** Must be addressed in the same phase as session validation (Pitfall 2).

---

### Pitfall 4: Tenant Isolation Gap -- better-auth Has No Tenant Concept

**What goes wrong:** PMSync's entire data model is tenant-scoped. 42 Prisma models have `tenantId`. The `TenantGuard` enforces cross-tenant access control. The `TENANT_SCOPED_MODELS` set auto-injects tenant filtering. better-auth knows nothing about tenants -- its `User`, `Session`, and `Account` models have no `tenantId` field. The `organization` plugin provides multi-tenancy but uses its own `Organization` / `Member` tables, not PMSync's `Tenant` model.

**Why it happens:** better-auth's organization plugin is designed for greenfield apps. It assumes organizations are created through better-auth's API, not pre-existing in a `Tenant` table with 42 dependent models.

**Consequences:**
- Users created by better-auth have no `tenantId` -- they can't access any tenant-scoped data
- The `TenantGuard` requires `request.user.tenantId` (populated by JWT strategy) -- better-auth sessions don't include this
- BullMQ workers extract `tenantId` from job data (which was originally set from the authenticated user) -- if the auth chain breaks, workers process jobs without tenant context
- Prisma's auto-injected tenant scoping (`tenant-scoping.extension.ts`) depends on `tenantId` being present in the request context -- without it, queries either fail or return cross-tenant data (catastrophic security breach)

**Prevention:**
1. Use better-auth's `additionalFields` to add `tenantId` and `role` to the user model.
2. Implement a custom better-auth plugin or hook (`after` on session creation) that populates tenant context from your existing `Tenant` table.
3. The `TenantGuard` must be updated to extract tenant from better-auth's session data instead of JWT claims.
4. Every BullMQ job enqueue point must be audited to ensure `tenantId` is still correctly propagated.
5. Write integration tests that verify: user A in tenant X cannot see data from tenant Y, after migration.

**Detection:** Cross-tenant data leaks in production. Users seeing other tenants' emails. BullMQ jobs processing without tenant context.

**Confidence:** HIGH -- verified against PMSync's `tenant.guard.ts`, `tenant-scoped-models.ts`, and better-auth's organization plugin docs.

**Phase:** Immediately after schema (Pitfall 1). Must be solved before any guard/decorator migration.

---

### Pitfall 5: WebSocket Auth Breaks During Migration

**What goes wrong:** The `RealtimeHandshakeService` currently extracts JWT tokens from cookies (`AUTH_COOKIE_NAME`) or Bearer headers, verifies ES256/HS256 signatures with `JwtService`, validates `sessionId`, `userId`, and `tenantId` claims, then checks user/tenant active status in the database. better-auth replaces all of this -- different cookie names, different session token format (opaque token, not JWT), different validation flow.

**Why it happens:** better-auth sessions are opaque tokens stored in the database, not signed JWTs. You can't verify them locally with `jwtService.verifyAsync()` -- you must look them up in the database via `auth.api.getSession()`. The WebSocket handshake happens during the `upgrade` request, which has access to cookies but not to better-auth's request handling pipeline.

**Consequences:**
- All WebSocket connections fail immediately after migration (silent failure -- no error page, just "disconnected")
- Real-time features (email sync notifications, chat, presence) stop working
- Redis tenant connection counters become stale
- Users don't see new emails until they manually refresh

**Prevention:**
1. The WebSocket handshake service must be rewritten to validate sessions against the better-auth session table directly (query by `token` field).
2. Cookie extraction must use the new cookie name (`better-auth.session_token` or your custom prefix).
3. Maintain a fallback path that accepts both old JWT tokens and new session tokens during migration (dual-mode authentication).
4. Test WebSocket connections explicitly in your migration integration tests.
5. Add a health check endpoint that verifies WebSocket auth is working.

**Detection:** "Connected" event never fires. Realtime notifications stop. Email count badge doesn't update.

**Confidence:** HIGH -- verified against PMSync's `realtime-handshake.service.ts` (359 lines of JWT-specific validation logic).

**Phase:** Dedicated phase after core auth migration. Do not attempt to migrate HTTP auth and WebSocket auth simultaneously.

---

## Moderate Pitfalls

---

### Pitfall 6: BullMQ Worker Auth Context Loss

**What goes wrong:** BullMQ workers (`BaseWorker`, email-send, sync-back, embedding queues) process jobs that carry `tenantId` in job data. This `tenantId` was originally extracted from the authenticated user's JWT when the job was enqueued. Workers don't re-authenticate -- they trust the job data. During migration, if the job enqueue path changes (new session format, different user object shape), `tenantId` may be missing or incorrect in job payloads.

**Prevention:**
1. Audit every `queue.add()` call site to verify `tenantId` is still correctly extracted from the new auth session.
2. Workers should validate `tenantId` presence in job data and fail fast if missing (they already do this partially).
3. Add a migration test that enqueues and processes a job end-to-end with the new auth system.

**Detection:** BullMQ jobs fail with "Tenant ID not found" or succeed but write data to the wrong tenant.

**Confidence:** MEDIUM -- based on codebase analysis of `base.worker.ts` and queue services.

**Phase:** Same phase as tenant isolation (Pitfall 4).

---

### Pitfall 7: AI Tool Auth Context Loss

**What goes wrong:** AI chat tools (~20 tools as @Injectable ToolsService classes) execute within the context of an authenticated user. They access tenant-scoped data (emails, contacts, calendar events) using the user's identity. If the auth context propagation chain breaks (request -> AiChatService -> tool execution -> Prisma query), AI tools either fail or leak cross-tenant data.

**Prevention:**
1. Trace the auth context chain: HTTP request -> session validation -> `request.user` -> `AsyncLocalStorage` tenant context -> tool execution -> Prisma queries.
2. Ensure `request.user` is populated with `tenantId` by the new auth guard before it reaches AiChatService.
3. Test at least one AI tool end-to-end with the new auth system.

**Detection:** AI chat responds with "I don't have access to your data" or returns data from wrong tenant.

**Confidence:** MEDIUM -- based on codebase architecture knowledge.

**Phase:** After core HTTP auth migration is stable.

---

### Pitfall 8: Audit Trail Gap During Migration

**What goes wrong:** PMSync has GDPR-compliant audit logging (v3.1 AUDIT-01/02/03). `AuditLog` records are tenant-scoped and track all data access. During migration, there's a window where:
- Old auth events (login, logout, password change) stop being logged (old auth controller removed)
- New auth events from better-auth aren't yet connected to the audit system
- Session creation/destruction events change format

**Prevention:**
1. better-auth provides hooks (`after` callbacks on `signIn`, `signUp`, `signOut`, session events) -- wire these to your existing `AuditLog` table from day one.
2. Map old audit event types to new ones BEFORE removing old auth code.
3. Maintain audit coverage metrics: compare event counts before and after migration.
4. Never delete old auth code until the new audit trail is verified working.

**Detection:** Compliance audit finds gaps in login/logout records. Data access logs missing for a time period.

**Confidence:** MEDIUM -- better-auth hooks exist but audit integration is custom work.

**Phase:** Must be implemented in the same phase as auth controller migration.

---

### Pitfall 9: GDPR Compliance Gaps

**What goes wrong:** PMSync has extensive GDPR infrastructure: consent management (CONS-01/02/03), data export (DATA-01/02), right to erasure (DATA-03), PII tokenization (PII-01/02/03/04), legal acceptance flows (LEGAL-01/02). better-auth manages its own user data (email, name, sessions, accounts) outside this infrastructure.

**Consequences:**
- GDPR data export (Art. 20) must now include better-auth's `account` and `session` tables
- Right to erasure (Art. 17) must cascade delete into better-auth tables
- Consent tracking for auth-related processing must cover better-auth's data
- PII tokenization for AI calls must handle data from better-auth's user model

**Prevention:**
1. Add better-auth's tables (`account`, `verification`) to the GDPR data export query.
2. Add cascade deletes for better-auth tables in the `account-deletion.service.ts`.
3. Map better-auth's user fields (`name`, `email`, `image`) into the PII tokenization pipeline.
4. Update privacy policy text to reflect the new auth provider.

**Detection:** GDPR data export request returns incomplete data. User deletion leaves orphaned records in better-auth tables.

**Confidence:** MEDIUM -- GDPR infrastructure exists but integration with better-auth is entirely custom.

**Phase:** Same phase as audit trail (Pitfall 8). Do not defer GDPR compliance.

---

### Pitfall 10: bodyParser: false Breaks Existing NestJS Routes

**What goes wrong:** The NestJS better-auth integration [requires `bodyParser: false`](https://better-auth.com/docs/integrations/nestjs) in `NestFactory.create()`. This disables body parsing for ALL routes, not just better-auth routes. PMSync's 50+ API endpoints rely on automatic JSON body parsing.

**Prevention:**
1. Do NOT set `bodyParser: false` globally.
2. Use NestJS raw-body middleware selectively: apply raw body parsing only to `/api/auth/*` routes (better-auth routes).
3. Alternatively, mount better-auth as an Express sub-app with its own body parsing config.
4. Test existing POST/PUT/PATCH endpoints after the change.

**Detection:** All `@Body()` decorated parameters in controllers receive `undefined` after enabling better-auth.

**Confidence:** HIGH -- explicitly documented in better-auth's [NestJS integration](https://better-auth.com/docs/integrations/nestjs).

**Phase:** Same phase as NestJS integration setup.

---

## Minor Pitfalls

---

### Pitfall 11: Community-Maintained NestJS Package Risk

**What goes wrong:** The `nestjs-better-auth` package is maintained by community contributors, not the better-auth team. Breaking changes have already occurred (v2.x changed from `AuthModule.forRoot(auth)` to `AuthModule.forRoot({ auth })`). The package may lag behind better-auth releases.

**Prevention:**
1. Pin exact versions of `nestjs-better-auth` in `package.json`.
2. Consider a thin adapter layer you control, rather than depending on the community package's API surface.
3. Monitor the package's GitHub for breaking changes before upgrading better-auth itself.

**Confidence:** HIGH -- verified from [npm package](https://www.npmjs.com/package/@mguay/nestjs-better-auth) and [GitHub repos](https://github.com/underfisk/nestjs-better-auth).

---

### Pitfall 12: Session Cookie Caching and Revocation Race

**What goes wrong:** better-auth supports cookie caching (storing session data in a signed short-lived cookie to avoid DB lookups). If enabled, revoked sessions remain valid on other devices until the cache expires. PMSync currently validates sessions against the database on every WebSocket connection and enforces session concurrency limits.

**Prevention:**
1. Do NOT enable `cookieCache` until the migration is stable. Start with database-backed session validation.
2. If you later enable caching, set `maxAge` to match your security requirements (current access token is 15 minutes).
3. Sensitive operations (password change, MFA toggle) should always use `freshAge` checking.

**Confidence:** MEDIUM -- documented in better-auth's [session management docs](https://better-auth.com/docs/concepts/session-management).

---

### Pitfall 13: OAuth Callback URL Configuration

**What goes wrong:** PMSync already has Google OAuth for email provider connections (`ProviderConfig`). better-auth introduces its own OAuth for login (Google social login). Both use Google OAuth but with different callback URLs, scopes, and client configurations. Mixing them up breaks either email sync or auth login.

**Prevention:**
1. Use separate Google OAuth client IDs for auth login vs email provider connections.
2. Clearly document which OAuth flow is for auth and which is for email access.
3. Verify callback URLs match between Google Console, better-auth config, and existing provider config.

**Confidence:** MEDIUM -- based on PMSync architecture knowledge.

---

### Pitfall 14: Existing Test Suite Breaks

**What goes wrong:** PMSync has extensive auth tests: `cookie-hardening.spec.ts`, `session-hardening.spec.ts`, `jwt-es256.spec.ts`, `refresh-token.spec.ts`, `roles-guard.integration.spec.ts`, `tenant-isolation.spec.ts`, `password-policy.spec.ts`, `auth-login-hardening.spec.ts`, `auth-registration-hardening.spec.ts`. All of these test the current JWT-based auth system. They will all fail after migration.

**Prevention:**
1. Don't delete old tests -- rewrite them to test the equivalent better-auth behavior.
2. Some tests (tenant isolation, roles guard) test business logic that must survive the migration regardless of auth mechanism.
3. Create a test migration map: old test -> new test (or "covered by better-auth internally").

**Confidence:** HIGH -- 15+ auth test files exist in the codebase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Schema & Database | Pitfall 1 (schema collision), Pitfall 4 (no tenantId) | Manual schema creation, `additionalFields`, migration script |
| Architecture Decision | Pitfall 2 (split arch session validation) | Decide Option A/B/C before writing code |
| Cookie & Transport | Pitfall 3 (cookie prefix), Pitfall 10 (bodyParser) | Selective middleware, dual-read transition |
| Guard & Decorator Migration | Pitfall 4 (tenant isolation), Pitfall 6 (BullMQ), Pitfall 7 (AI tools) | Audit every auth consumer, integration tests |
| WebSocket Migration | Pitfall 5 (WS auth breaks) | Dual-mode auth, dedicated phase |
| Compliance | Pitfall 8 (audit gap), Pitfall 9 (GDPR) | Wire hooks before removing old code |
| Social Login & OAuth | Pitfall 13 (OAuth confusion) | Separate client IDs, clear documentation |
| Testing | Pitfall 14 (test suite breaks) | Test migration map, rewrite not delete |

---

## Recommended Pitfall-Driven Phase Order

Based on dependency analysis of these pitfalls, phases should be ordered:

1. **Architecture Decision** (Pitfall 2) -- How will NestJS validate sessions? This drives everything.
2. **Schema Migration** (Pitfalls 1, 4) -- Create better-auth tables with tenant support. No code changes yet.
3. **Core Auth Routes** (Pitfalls 3, 10) -- better-auth mounted in NestJS/Next.js, cookie config, body parser fix.
4. **Guard & Decorator Migration** (Pitfalls 4, 6, 7) -- Replace JwtAuthGuard, TenantGuard, role decorators.
5. **Compliance Hooks** (Pitfalls 8, 9) -- Audit logging, GDPR integration. Do NOT defer this.
6. **WebSocket Auth** (Pitfall 5) -- Rewrite handshake service. Separate phase because it's high-risk.
7. **Background Job Audit** (Pitfall 6) -- Verify BullMQ tenant context chain end-to-end.
8. **Social Login & MFA** (Pitfall 13) -- Google OAuth login, TOTP, passkeys.
9. **Old Auth Removal** -- Only after all above is stable and tested.

---

## Sources

- [better-auth NestJS Integration](https://better-auth.com/docs/integrations/nestjs)
- [better-auth Database/Schema](https://better-auth.com/docs/concepts/database)
- [better-auth Prisma Adapter](https://better-auth.com/docs/adapters/prisma)
- [better-auth Cookie Configuration](https://better-auth.com/docs/concepts/cookies)
- [better-auth Session Management](https://better-auth.com/docs/concepts/session-management)
- [better-auth Security Reference](https://better-auth.com/docs/reference/security)
- [GitHub Discussion #5716: Cross-domain session validation](https://github.com/better-auth/better-auth/discussions/5716)
- [GitHub Issue #6391: account.modelName override bug](https://github.com/better-auth/better-auth/issues/6391)
- [NestJS + BetterAuth Part 1 (Medium)](https://medium.com/@andysenclave/nestjs-betterauth-part-1-from-zero-to-login-prisma-cookies-cfcc3e7ecec0)
- [NestJS + BetterAuth Part 2 (Medium)](https://medium.com/@andysenclave/nestjs-betterauth-part-2-next-js-client-csr-ssr-middleware-1423f6c9309e)
- [nestjs-better-auth (underfisk)](https://github.com/underfisk/nestjs-better-auth)
- [nestjs-better-auth (ThallesP)](https://github.com/ThallesP/nestjs-better-auth)
- [ZenStack: Multi-Tenant with better-auth](https://zenstack.dev/blog/better-auth)
- PMSync codebase: `cookie.helper.ts`, `tenant.guard.ts`, `realtime-handshake.service.ts`, `base.worker.ts`, `tenant-scoped-models.ts`
