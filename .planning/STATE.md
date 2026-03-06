---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Completed 52-03-PLAN.md (gap closure)
last_updated: "2026-03-06T22:17:43.070Z"
last_activity: 2026-03-06 -- 52-03 complete (gap closure)
progress:
  total_phases: 9
  completed_phases: 3
  total_plans: 7
  completed_plans: 7
---

---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Completed 52-03-PLAN.md (gap closure)
last_updated: "2026-03-06T22:14:08.859Z"
last_activity: 2026-03-06 -- 52-03 complete (gap closure - stale JwtAuthGuard refs fixed)
progress:
  total_phases: 9
  completed_phases: 3
  total_plans: 7
  completed_plans: 7
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** v5.0 better-auth Migration -- Phase 52 executing

## Current Position

Phase: 52 of 58 (NestJS Session Validation) -- Plan 3 of 3 COMPLETE
Plan: 3 of 3
Status: Phase 52 complete (including gap closure), ready for Phase 53
Last activity: 2026-03-06 -- 52-03 complete (gap closure)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 6 min
- Total execution time: 0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 50 - Schema & Infrastructure | 2/2 | 17 min | 8.5 min |
| 51 - Core Email/Password Auth | 2/2 | 11 min | 5.5 min |
| 52 - NestJS Session Validation | 3/3 | 13 min | 4.3 min |

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

### Pending Todos

None.

### Blockers/Concerns

- Schema collision: better-auth wants to own User/Session tables; PMSync has 42 FK chains to User
- Cookie name change: `__Host-access_token` -> `better-auth.session_token` affects WebSocket + CSRF
- api.generated.ts placeholder (carries forward from v4.1)

## Session Continuity

Last session: 2026-03-06T22:14:08.856Z
Stopped at: Completed 52-03-PLAN.md (gap closure)
Resume file: None
Next action: Plan Phase 53
