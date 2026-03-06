---
phase: 50-schema-infrastructure
plan: 02
subsystem: auth
tags: [better-auth, nestjs, session-validation, di-module]

requires:
  - phase: 50-01
    provides: Prisma schema with better-auth tables, Next.js better-auth instance

provides:
  - NestJS better-auth consumer instance for session validation
  - BetterAuthModule with BETTER_AUTH DI token
  - AppModule wired with BetterAuthModule alongside legacy AuthModule

affects: [52-nestjs-session]

tech-stack:
  added: []
  patterns: [factory provider for better-auth DI, consumer-only better-auth instance]

key-files:
  created:
    - backend/src/common/auth/better-auth.instance.ts
    - backend/src/common/auth/better-auth.module.ts
  modified:
    - backend/src/app.module.ts
    - backend/.env.example

key-decisions:
  - "Consumer-only instance: no emailAndPassword or hooks enabled in NestJS -- read-only for session validation"
  - "Custom minimal module instead of @thallesp/nestjs-better-auth to avoid bodyParser uncertainty"
  - "BetterAuthModule coexists with legacy AuthModule until Phase 52 rewrites guards"

duration: 2min
completed: 2026-03-06
---

# Phase 50 Plan 02: NestJS Better-Auth Consumer Summary

**NestJS better-auth consumer instance with factory DI provider for session validation, wired into AppModule alongside legacy auth.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T20:21:21Z
- **Completed:** 2026-03-06T20:23:16Z
- **Tasks:** 2 (1 auto + 1 auto-approved checkpoint)
- **Files modified:** 4

## Accomplishments

- Created `better-auth.instance.ts` with session/user config mirroring the Next.js instance exactly (7-day expiry, daily refresh, 5-min cookie cache, compact strategy, all additionalFields)
- Created `BetterAuthModule` with `BETTER_AUTH` injection token via factory provider injecting PrismaService
- Wired BetterAuthModule into AppModule imports, positioned before AuthModule
- Added `BETTER_AUTH_SECRET` to `backend/.env.example` with comment that it must match frontend value
- No bodyParser changes to main.ts
- Legacy AuthModule untouched and fully functional

## Task Commits

Each task was committed atomically:

1. **Task 1: Create NestJS better-auth consumer instance and module** - `cdb99a7c` (feat)
2. **Task 2: Verify cross-service infrastructure** - Auto-approved (checkpoint:human-verify with auto_advance)

## Files Created/Modified

- `backend/src/common/auth/better-auth.instance.ts` - Consumer-only better-auth instance factory
- `backend/src/common/auth/better-auth.module.ts` - NestJS module with BETTER_AUTH DI token
- `backend/src/app.module.ts` - BetterAuthModule imported alongside existing AuthModule
- `backend/.env.example` - BETTER_AUTH_SECRET added with matching-frontend comment

## Decisions Made

- Used a custom minimal NestJS module rather than `@thallesp/nestjs-better-auth` AuthModule.forRoot() -- the community package has uncertain bodyParser behavior (Open Question 4 from research). Phase 52 will decide the final approach.
- Consumer instance is deliberately read-only: no emailAndPassword plugin, no hooks. All auth mutations happen in the Next.js instance only.
- BetterAuthModule is NOT @Global() -- it must be explicitly imported where needed, keeping the dependency graph clear.

## Deviations from Plan

None -- plan executed exactly as written.

---
*Phase: 50-schema-infrastructure*
*Completed: 2026-03-06*
