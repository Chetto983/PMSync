---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Completed 53-01-PLAN.md
last_updated: "2026-03-09T07:51:27Z"
last_activity: 2026-03-09 -- 53-01 complete (frontend auth foundation)
progress:
  total_phases: 9
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** v5.0 better-auth Migration -- Phase 53 Plan 02 next

## Current Position

Phase: 53 of 58 (Frontend Auth UI) -- Plan 01 complete
Plan: 1 of 3 in Phase 53
Status: Executing
Last activity: 2026-03-09 -- 53-01 complete (frontend auth foundation)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 6.4 min
- Total execution time: 0.85 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 50 - Schema & Infrastructure | 2/2 | 17 min | 8.5 min |
| 51 - Core Email/Password Auth | 2/2 | 11 min | 5.5 min |
| 52 - NestJS Session Validation | 3/3 | 13 min | 4.3 min |
| 53 - Frontend Auth UI | 1/3 | 9 min | 9 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

- Clean slate migration: existing users re-register (login is broken anyway)
- Dual-instance pattern: better-auth in Next.js (provider) + NestJS (consumer), shared DB
- No JWT: pure DB-backed sessions with httpOnly cookies
- additionalFields for tenantId on user (better-auth has no tenant concept)
- bodyParser disabled selectively for auth routes only
- [50-01] Keep passwordHash, isMfaEnabled, lastActivityAt as deprecated optional for backward compat
- [50-01] Session.tenantId kept optional (not removed) to avoid breaking NestJS auth services
- [50-01] Compound unique @@unique([tenantId, email]) retained alongside @unique on email
- [50-02] Custom minimal BetterAuthModule instead of @thallesp/nestjs-better-auth (bodyParser uncertainty)
- [50-02] Consumer instance is read-only: no emailAndPassword, no hooks -- all mutations in Next.js only
- [51-01] void before sendTransactionalEmail to avoid timing attacks (fire-and-forget)
- [51-01] No baseURL on authClient -- same-origin Next.js avoids cookie issues
- [51-01] HIBP checks both password and newPassword via nullish coalescing for reset-password
- [51-02] Used requestPasswordReset (not forgetPassword) -- better-auth v1.5 typed client
- [51-02] Spread firstName/lastName via Record<string,string> cast for additionalFields compatibility
- [51-02] Always show success on forgot-password to prevent email enumeration
- [52-01] Global @Public() opt-out pattern instead of per-controller @UseGuards opt-in
- [52-01] BetterAuthGuard order: Throttler -> BetterAuth -> Legal -> Consent
- [52-01] BetterAuthModule @Global() for guard DI without explicit imports
- [52-01] AuthController per-route @Public() (not class-level) to keep me/logout protected
- [52-01] No bodyParser changes (NEST-04) -- NestJS is session consumer only
- [52-02] TenantGuard requires zero code changes -- BetterAuthGuard maps session to identical request.user shape
- [52-02] RolesGuard requires zero code changes -- already reads request.user.role
- [52-02] BullMQ tenantId propagation unaffected -- same req.user.tenantId shape
- [Phase 52]: Test update is correctness fix -- Plan 02 intentionally changed guard chain, test must reflect new reality
- [53-01] Type inference createAuthClient<typeof auth>() fails across client/server boundary; using untyped client
- [53-01] viewPaths uses SIGN_IN/SIGN_UP keys mapping to login/register
- [53-01] Middleware is optimistic cookie-existence check only; real validation in useSession and NestJS guards

### Pending Todos

None.

### Blockers/Concerns

- Schema collision: better-auth wants to own User/Session tables; PMSync has 42 FK chains to User
- Cookie name change: `__Host-access_token` -> `better-auth.session_token` affects WebSocket + CSRF
- api.generated.ts placeholder (carries forward from v4.1)

## Session Continuity

Last session: 2026-03-09T07:51:27Z
Stopped at: Completed 53-01-PLAN.md
Resume file: .planning/phases/53-frontend-auth-ui/53-01-SUMMARY.md
