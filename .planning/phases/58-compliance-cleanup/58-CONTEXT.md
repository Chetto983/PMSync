# Phase 58: Compliance & Cleanup - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Auth events feed into the existing audit trail, all legacy auth code is deleted, and auth test suite covers better-auth flows. **Partial scope:** Org-dependent GDPR bits (CLN-02, CLN-03) deferred until Phase 56 (Organizations) ships.

**In scope:** CLN-01 (audit trail hooks), CLN-04 (legacy code deletion), CLN-05 (auth test suite, partial — no org/admin flows).

**Out of scope (deferred to post-org):** GDPR export with org membership tables, right-to-erasure cascade into org tables, org/admin test flows.

</domain>

<decisions>
## Implementation Decisions

### Audit trail scope (CLN-01)
- Hook into better-auth lifecycle via `databaseHooks` and `hooks.after` middleware for: login success, login failure, logout, signup, email verification, password change, password reset request, 2FA enable/disable, passkey register/remove, social account link/unlink
- Use existing `AuditLog` Prisma model — no schema changes needed
- Capture per event: userId, tenantId, eventType, ipAddress, userAgent, metadata (provider name for OAuth, method for 2FA)
- Fire-and-forget pattern (don't block auth response for audit writes) — consistent with AiRunLedger pattern

### Legacy code deletion (CLN-04)
- Phase 55 already deleted MFA-specific old code (4 backend + 6 frontend files)
- Remaining old auth code to delete: JWT-related services (token generation, refresh rotation, family-based theft detection), old AuthGuard (JWT-based), old auth DTOs, old session management, deprecated npm packages (jsonwebtoken, passport, passport-jwt, passport-local, @nestjs/passport)
- Delete deprecated Prisma fields: passwordHash, isMfaEnabled, lastActivityAt on User model; old RefreshToken/RefreshTokenFamily models if they exist
- Verification: `npm run build` + `npm run type-check` must pass after deletion; grep for deleted imports

### Auth test suite (CLN-05, partial)
- Integration tests using better-auth test client (not E2E with browser)
- Flows to cover: email signup, email signin, email verification, password reset, session validation (NestJS BetterAuthGuard), 2FA TOTP enable/verify, social login mock, session revocation
- Mock external providers (Google/Microsoft OAuth) at the HTTP level
- No org or admin flow tests (deferred)

### Claude's Discretion
- Exact audit event type naming convention
- Test file organization and test runner configuration
- Order of legacy code deletion (services first vs packages first)
- Whether to create a migration for deprecated field removal or use `db push`

</decisions>

<specifics>
## Specific Ideas

No specific requirements — user granted full discretion on implementation approach for all 3 areas.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AuditLog` Prisma model: already has userId, tenantId, action, details, ipAddress, userAgent fields
- `AuditLogService`: existing service for writing audit entries (used by GDPR compliance from v3.1)
- `better-auth.instance.ts`: databaseHooks.user.create.after already implemented for workspace provisioning — same pattern for audit hooks
- `BetterAuthGuard`: Phase 52 implementation is the reference for session validation testing

### Established Patterns
- Fire-and-forget telemetry: AiRunLedger pattern (void before async write)
- Test pattern: existing `better-auth.guard.spec.ts` with mock PrismaService and mock session responses
- `withoutTenantScopingAsync`: needed for audit writes that cross tenant boundaries

### Integration Points
- `better-auth.instance.ts` hooks.before/after middleware — primary insertion point for audit events
- `backend/src/modules/compliance/` — existing audit infrastructure
- `backend/src/modules/auth/` — old auth code lives here, target for deletion
- `frontend/lib/auth-client.ts` — already using better-auth client, no changes expected

</code_context>

<deferred>
## Deferred Ideas

- CLN-02: GDPR data export including organization membership tables — requires Phase 56
- CLN-03: Right to erasure cascade into organization and membership tables — requires Phase 56
- CLN-05 (org/admin): Test flows for organization CRUD, invitations, role changes, admin ban/unban/impersonation — requires Phases 56+57
- Phase 56 (Organizations) and Phase 57 (Admin Panel) — user explicitly deferred as too complex for now

</deferred>

---

*Phase: 58-compliance-cleanup*
*Context gathered: 2026-03-09*
