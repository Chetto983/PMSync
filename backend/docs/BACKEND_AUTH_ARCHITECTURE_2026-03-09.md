# Backend Auth Architecture

Date: 2026-03-09
Scope: Current backend HTTP and websocket auth model
Status: Current reference

## Summary

The backend currently runs two auth layers:

- primary path: `better-auth` session cookies
- legacy path: JWT and refresh-cookie endpoints under `backend/src/modules/auth/`

The system should be understood as transition-state architecture. Contributors should build against the primary session model unless they are explicitly working on legacy auth migration or compatibility.

## Current Primary Auth Path

### HTTP

The active HTTP path is:

```text
browser request
  -> /api/auth handled by better-auth raw Express handler
  -> all other protected routes pass through BetterAuthGuard
  -> BetterAuthGuard maps session user to request.user
  -> TenantGuard resolves active tenant
  -> controller-level roles, quota, and consent guards apply
```

Key pieces:

- `backend/src/common/auth/better-auth.instance.ts`
- `backend/src/common/auth/better-auth.guard.ts`
- `backend/src/main.ts`
- `backend/src/modules/auth/guards/tenant.guard.ts`

### Session Model

- session store: database-backed through `better-auth`
- browser transport: cookies
- session lifetime: 7 days
- session update age: 1 day
- workspace provisioning occurs on sign-up when the user does not already have a tenant

User fields attached to session context include:

- `tenantId`
- `firstName`
- `lastName`
- `role`
- `isActive`

### CSRF

The backend uses double-submit-cookie CSRF protection for non-safe requests outside excluded routes.

Important behavior:

- `/api/auth` is excluded because `better-auth` handles its own trusted-origin checks
- several legacy `/api/v1/auth/*` routes are also excluded
- token is expected in `X-CSRF-Token`

Key file:

- `backend/src/common/middleware/csrf.middleware.ts`

## WebSocket Auth

Websocket authentication is aligned to the primary session model.

Flow:

- handshake headers are converted into a `better-auth` session lookup
- user and tenant are revalidated in Prisma
- tenant room assignment is derived from the persisted tenant

Key file:

- `backend/src/modules/realtime/services/realtime-handshake.service.ts`

## Legacy Auth Path

The backend still ships legacy auth routes and services under `backend/src/modules/auth/`.

This includes:

- login
- refresh
- MFA verification
- OTP flows
- WebAuthn login flows
- legacy auth cookies

This path is still operational and should be treated as live surface area, not dead code.

## Current Risks

### 1. Dual-Stack Complexity

The biggest backend auth risk is coexistence:

- `better-auth` is the global session gate
- legacy JWT flows still exist
- CSRF exclusions still account for legacy auth paths
- docs in the repo are not yet uniformly updated

This creates ambiguity around:

- canonical session source of truth
- refresh semantics
- migration completion status
- test expectations

### 2. Secret Separation Is Not Fully Clean

`CSRF_SECRET` falls back to `JWT_SECRET` if not explicitly provided.

That works operationally, but it is weaker than dedicated secret separation.

### 3. Enterprise SSO Is Not Yet the Active Platform Model

Provider OAuth is implemented for Google and Microsoft mailbox connectivity, but enterprise workforce login federation is not yet the current primary backend auth story.

## Contributor Rules

1. Treat `better-auth` as the primary backend auth model.
2. Do not add new product features on top of legacy JWT flows unless the task is explicitly a migration bridge.
3. Any new protected route should assume:
   `BetterAuthGuard -> TenantGuard -> feature-specific guards`
4. Any new websocket auth work should stay aligned with `better-auth`.
5. Do not expand CSRF exclusions without a written reason.

## Recommended Next Steps

1. Decide whether legacy JWT is still needed for active clients.
2. If not, decommission the legacy path in a controlled migration.
3. If yes, document the compatibility boundary explicitly.
4. Add a short backend migration checklist for:
   - HTTP auth
   - websocket auth
   - CSRF behavior
   - test fixtures
   - frontend session assumptions

## References

- `backend/src/common/auth/better-auth.instance.ts`
- `backend/src/common/auth/better-auth.guard.ts`
- `backend/src/modules/realtime/services/realtime-handshake.service.ts`
- `backend/src/common/middleware/csrf.middleware.ts`
- `backend/src/modules/auth/controllers/auth.controller.ts`
