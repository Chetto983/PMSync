# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** v5.1 Test Coverage & Polish

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-10 — Milestone v5.1 started

## Accumulated Context

### Decisions

(Carried from v5.0)
- Dual-instance pattern: better-auth in Next.js (provider) + NestJS (consumer), shared DB
- No JWT: pure DB-backed sessions with httpOnly cookies
- Global @Public() opt-out pattern instead of per-controller @UseGuards opt-in
- BetterAuthGuard order: Throttler -> BetterAuth -> Legal -> Consent
- Flat role model: Member.role defaults to admin, no owner/admin/member hierarchy
- adminRoles=['super-admin'] to separate from workspace admin role
- api.generated.ts placeholder (carries forward from v4.1)

### Pending Todos

None.

### Roadmap Evolution

(New milestone — no changes yet)

### Blockers/Concerns

- api.generated.ts placeholder (carries forward from v4.1)

## Session Continuity

Last session: —
Stopped at: —
Resume file: None
