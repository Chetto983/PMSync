---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: better-auth Migration
status: executing
stopped_at: Completed 50-01-PLAN.md
last_updated: "2026-03-06"
last_activity: 2026-03-06 -- 50-01 schema reshape + better-auth Next.js instance
progress:
  total_phases: 9
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
  percent: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** v5.0 better-auth Migration -- Phase 50 executing

## Current Position

Phase: 50 of 58 (Schema & Infrastructure)
Plan: 1 of 2
Status: Executing
Last activity: 2026-03-06 -- 50-01 complete (schema reshape + better-auth instance)

Progress: [█░░░░░░░░░] 5%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 15 min
- Total execution time: 0.25 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 50 - Schema & Infrastructure | 1/2 | 15 min | 15 min |

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

### Pending Todos

None.

### Blockers/Concerns

- Schema collision: better-auth wants to own User/Session tables; PMSync has 42 FK chains to User
- Cookie name change: `__Host-access_token` -> `better-auth.session_token` affects WebSocket + CSRF
- api.generated.ts placeholder (carries forward from v4.1)

## Session Continuity

Last session: 2026-03-06
Stopped at: Completed 50-01-PLAN.md (schema reshape + better-auth Next.js instance)
Resume file: None
Next action: Execute 50-02-PLAN.md (NestJS consumer instance)
