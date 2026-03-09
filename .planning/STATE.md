---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Completed 58-01-PLAN.md
last_updated: "2026-03-09T16:03:22.947Z"
last_activity: 2026-03-09 -- Phase 55 Plan 03 complete (onboarding wizard + middleware)
progress:
  total_phases: 10
  completed_phases: 6
  total_plans: 22
  completed_plans: 16
  percent: 79
---

---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Completed 55-02-PLAN.md
last_updated: "2026-03-09T15:01:06.465Z"
last_activity: 2026-03-09 -- Phase 55 Plan 03 complete (onboarding wizard + middleware)
progress:
  [████████░░] 79%
  completed_phases: 5
  total_plans: 19
  completed_plans: 14
  percent: 74
---

---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Completed 55-01-PLAN.md
last_updated: "2026-03-09T14:54:38.941Z"
last_activity: 2026-03-09 -- Phase 55 Plan 01 complete (social login + 2FA plugins wired)
progress:
  [███████░░░] 74%
  completed_phases: 5
  total_plans: 19
  completed_plans: 12
  percent: 63
---

---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Completed 55-03-PLAN.md
last_updated: "2026-03-09T14:53:45Z"
last_activity: 2026-03-09 -- Phase 55 Plan 03 complete (onboarding wizard + middleware)
progress:
  total_phases: 10
  completed_phases: 5
  total_plans: 14
  completed_plans: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** v5.0 better-auth Migration -- Phase 55 (Social Login & MFA)

## Current Position

Phase: 55 of 59 (Social Login & MFA) -- Executing
Plan: 3 of 4 complete
Status: Executing Plan 04
Last activity: 2026-03-09 -- Phase 55 Plan 03 complete (onboarding wizard + middleware)

Progress: [████████████████████] 12/14 plans (86%)

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 6.5 min
- Total execution time: 1.32 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 50 - Schema & Infrastructure | 2/2 | 17 min | 8.5 min |
| 51 - Core Email/Password Auth | 2/2 | 11 min | 5.5 min |
| 52 - NestJS Session Validation | 3/3 | 13 min | 4.3 min |
| 53 - Frontend Auth UI | 2/2 | 27 min | 13.5 min |
| 54 - WebSocket Auth | 1/1 | 1 min | 1 min |
| 55 - Social Login & MFA | 3/4 | 16 min | 5.3 min |

*Updated after each plan completion*
| Phase 55 P04 | 12min | 2 tasks | 8 files |
| Phase 55 P02 | 8min | 2 tasks | 9 files |
| Phase 55 P05 | 8min | 1 tasks | 18 files |
| Phase 58 P01 | 4min | 2 tasks | 9 files |

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
- [55-01] Used prisma db push instead of migrate dev due to schema drift from previous phases
- [55-01] Social login buttons above email/password form with "or" divider per user decision
- [55-01] twoFactorClient onTwoFactorRedirect routes to /auth/two-factor
- [55-01] Named translation key twoFactorVerify to avoid collision with existing mfa settings section
- [55-03] Cookie-based onboarding check in Edge middleware (no DB calls); real validation in page via useSession()
- [55-03] StepProps in types.ts re-exported from OnboardingWizard for Plan 04 consumers
- [55-03] Cast session.user as SessionUser at page level (better-auth types miss additionalFields)
- [Phase 55]: [55-04] Email provider detection via domain heuristic, avatar as base64 via authClient, MFA QR via dynamic import of qrcode
- [Phase 55]: [55-02] Used QR code API instead of qrcode npm package to avoid adding dependency
- [Phase 55]: [55-02] UAParser v2 require() workaround for @types v0.7 mismatch
- [Phase 55]: [55-02] listUserPasskeys (not listPasskeys) is correct better-auth passkey method
- [Phase 55]: [55-02] authClient.setPassword cast needed -- types not exposed without open-api plugin
- [Phase 55]: Removed MFA challenge/passkey/WebAuthn endpoints from NestJS auth -- better-auth plugins handle all MFA now
- [Phase 58]: Exported getRequestIp from better-auth.instance.ts rather than duplicating
- [Phase 58]: Guards copied (not moved) to common/auth/ -- old files preserved for Plan 02 full directory deletion

### Pending Todos

None.

### Roadmap Evolution

- Phase 59 added: safety

### Blockers/Concerns

- Schema collision: better-auth wants to own User/Session tables; PMSync has 42 FK chains to User (resolved in Phase 50)
- ~~Cookie name change: `__Host-access_token` -> `better-auth.session_token` affects WebSocket + CSRF~~ (resolved -- Phase 54 confirmed WS works with new cookies)
- api.generated.ts placeholder (carries forward from v4.1)

## Session Continuity

Last session: 2026-03-09T16:03:22.941Z
Stopped at: Completed 58-01-PLAN.md
Resume file: None
