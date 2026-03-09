---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Phase 59 context gathered
last_updated: "2026-03-09T13:19:14.457Z"
last_activity: 2026-03-09 -- 54-01 complete (WebSocket auth verification, NEST-05 satisfied)
progress:
  total_phases: 10
  completed_phases: 5
  total_plans: 10
  completed_plans: 10
---

---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Completed 54-01-PLAN.md
last_updated: "2026-03-09T13:18:00Z"
last_activity: 2026-03-09 -- 54-01 complete (WebSocket auth verification, NEST-05 satisfied)
progress:
  total_phases: 9
  completed_phases: 5
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** v5.0 better-auth Migration -- Phase 54 complete, Phase 55 next

## Current Position

Phase: 54 of 58 (WebSocket Auth) -- Plan 01 complete (all plans done)
Plan: 1 of 1 in Phase 54
Status: Executing
Last activity: 2026-03-09 -- 54-01 complete (WebSocket auth verification, NEST-05 satisfied)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 6.3 min
- Total execution time: 1.15 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 50 - Schema & Infrastructure | 2/2 | 17 min | 8.5 min |
| 51 - Core Email/Password Auth | 2/2 | 11 min | 5.5 min |
| 52 - NestJS Session Validation | 3/3 | 13 min | 4.3 min |
| 53 - Frontend Auth UI | 2/2 | 27 min | 13.5 min |
| 54 - WebSocket Auth | 1/1 | 1 min | 1 min |

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
- [53-02] SessionUser interface defined manually with additionalFields (type inference impossible across client/server)
- [53-02] 401 interceptor simplified to signOut + redirect; JWT refresh queue removed (DB sessions)
- [53-02] Removed setUser from avatar handlers; better-auth manages user state via session
- [53-02] Removed token references from hooks; better-auth uses cookies, no JWT exposed to client
- [54-01] No new code needed -- Phase 52 already implemented WS auth migration to better-auth session cookies
- [54-01] NEST-05 verified via existing 7-test suite + source pattern confirmation (zero JWT remnants)

### Pending Todos

None.

### Roadmap Evolution

- Phase 59 added: safety

### Blockers/Concerns

- Schema collision: better-auth wants to own User/Session tables; PMSync has 42 FK chains to User
- Cookie name change: `__Host-access_token` -> `better-auth.session_token` affects WebSocket + CSRF
- api.generated.ts placeholder (carries forward from v4.1)

## Session Continuity

Last session: 2026-03-09T13:19:14.454Z
Stopped at: Phase 59 context gathered
Resume file: .planning/phases/59-safety/59-CONTEXT.md
