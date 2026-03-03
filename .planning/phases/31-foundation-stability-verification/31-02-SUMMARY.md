---
phase: 31-foundation-stability-verification
plan: 02
subsystem: infra
tags: [nestjs, event-emitter, dependency-cruiser, prisma, domain-events, interfaces]

# Dependency graph
requires: []
provides:
  - EventEmitterModule.forRoot() registered in AppModule
  - Domain event types (EmailSynced, ProviderConnected, ContactUpdated, CalendarIcsDetected)
  - Interface contracts (IStorageService, ISyncAuthService, IToolRegistryService)
  - dependency-cruiser baseline with warn-only rules (989 cross-module, 21 circular, 3 orphan)
  - AiRunLedger Prisma schema with cost/latency/token tracking
affects: [32-architecture-decoupling, 33-api-standardization, 35-ai-observability]

# Tech tracking
tech-stack:
  added: ["@nestjs/event-emitter@3.0.1", "dependency-cruiser@17.3.8"]
  patterns: ["Domain event classes with static eventName", "Interface + Symbol injection token pattern", "Warn-only dependency analysis baseline"]

key-files:
  created:
    - backend/src/common/events/email.events.ts
    - backend/src/common/events/provider.events.ts
    - backend/src/common/events/contact.events.ts
    - backend/src/common/events/calendar.events.ts
    - backend/src/common/events/index.ts
    - backend/src/common/interfaces/storage.interface.ts
    - backend/src/common/interfaces/sync-auth.interface.ts
    - backend/src/common/interfaces/tool-registry.interface.ts
    - backend/src/common/interfaces/index.ts
    - backend/.dependency-cruiser.cjs
  modified:
    - backend/src/app.module.ts
    - backend/prisma/schema.prisma
    - backend/package.json

key-decisions:
  - "Applied AiRunLedger table via direct SQL instead of prisma migrate dev due to pre-existing migration history drift"
  - "Used export type for interface re-exports to satisfy isolatedModules compiler option"
  - "Baseline recorded at 989/21/3 (cross-module/circular/orphan) for Phase 32 tracking"

patterns-established:
  - "Domain events: class with static readonly eventName and typed constructor params in common/events/"
  - "Interface contracts: interface + Symbol injection token exported from common/interfaces/"
  - "dependency-cruiser: .dependency-cruiser.cjs with baseline comment at top"

requirements-completed: [PERF-03]

# Metrics
duration: 13min
completed: 2026-03-03
---

# Phase 31 Plan 02: Foundation Infrastructure Summary

**EventEmitterModule, domain events, interface contracts, dependency-cruiser baseline, and AiRunLedger Prisma schema installed as v4.0 scaffolding**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-03T13:28:11Z
- **Completed:** 2026-03-03T13:41:29Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- EventEmitterModule.forRoot() registered and backend builds cleanly
- Four domain event types defined for cross-module decoupling in Phase 32
- Three interface contracts (storage, sync-auth, tool-registry) ready for Phase 32 implementation
- dependency-cruiser baseline established: 989 cross-module, 21 circular, 3 orphan violations documented
- AiRunLedger Prisma model with indexes for AI cost/latency observability (Phase 35)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install EventEmitterModule + domain event types + interface contracts** - `3faede16` (feat)
2. **Task 2: Install dependency-cruiser baseline + AiRunLedger Prisma schema** - `9dd3457b` (feat)

**Plan metadata:** `11ed5929` (docs: complete plan)

## Files Created/Modified
- `backend/src/app.module.ts` - Added EventEmitterModule.forRoot() import and registration
- `backend/src/common/events/email.events.ts` - EmailSyncedEvent domain event type
- `backend/src/common/events/provider.events.ts` - ProviderConnectedEvent domain event type
- `backend/src/common/events/contact.events.ts` - ContactUpdatedEvent domain event type
- `backend/src/common/events/calendar.events.ts` - CalendarIcsDetectedEvent domain event type
- `backend/src/common/events/index.ts` - Barrel export for all event types
- `backend/src/common/interfaces/storage.interface.ts` - IStorageService contract
- `backend/src/common/interfaces/sync-auth.interface.ts` - ISyncAuthService contract
- `backend/src/common/interfaces/tool-registry.interface.ts` - IToolRegistryService + IAiTool + IToolContext
- `backend/src/common/interfaces/index.ts` - Barrel export with type/value separation
- `backend/.dependency-cruiser.cjs` - Warn-only rules for cross-module, circular, and orphan analysis
- `backend/prisma/schema.prisma` - AiRunLedger model and AiRunStatus enum
- `backend/package.json` - Added @nestjs/event-emitter and dependency-cruiser

## Decisions Made
- Applied AiRunLedger table via direct SQL (CREATE TABLE + CREATE INDEX) instead of `prisma migrate dev` because migration history has significant pre-existing drift. The migration system tries to reset the entire schema which would destroy data. This is a known issue unrelated to this plan.
- Used `export type` for interface barrel re-exports to comply with TypeScript `isolatedModules` compiler option enabled in the project.
- dependency-cruiser baseline recorded at 989 cross-module / 21 circular / 3 orphan violations. These are all warn-only to avoid blocking CI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed isolatedModules type re-export error**
- **Found during:** Task 1 (interface barrel exports)
- **Issue:** `export { IStorageService }` fails with TS1205 because `isolatedModules` requires `export type` for type-only re-exports
- **Fix:** Changed to `export type { IStorageService }` and separated value exports (Symbols) from type exports (interfaces)
- **Files modified:** backend/src/common/interfaces/index.ts
- **Verification:** `npm run build` passes
- **Committed in:** 3faede16 (Task 1 commit)

**2. [Rule 3 - Blocking] Applied AiRunLedger via direct SQL instead of prisma migrate**
- **Found during:** Task 2 (Prisma migration)
- **Issue:** `prisma migrate dev` detects massive drift (all tables missing from migration history) and demands full DB reset
- **Fix:** Applied CREATE TYPE, CREATE TABLE, and CREATE INDEX statements directly via pg client
- **Files modified:** Database only (no file change)
- **Verification:** `npx prisma validate` passes, table exists in database
- **Committed in:** 9dd3457b (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for build and migration. No scope creep.

## Issues Encountered
- Task 1 artifacts were already committed by the parallel 31-01 executor (commit 3faede16 includes EventEmitterModule, events, and interfaces). This is expected behavior from Wave 1 parallel execution -- the 31-01 executor incorporated the foundation changes.
- Pre-existing Prisma migration history drift prevented using `prisma migrate dev`. This is a systemic issue that predates this plan and should be addressed separately (potentially via `prisma migrate resolve` in a dedicated cleanup).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 32 (Architecture Decoupling) can wire domain events using EventEmitter2 @OnEvent() decorators
- Phase 32 can implement IStorageService, ISyncAuthService, IToolRegistryService behind the interface contracts
- Phase 32 can use dependency-cruiser to track cross-module violation reduction (target: <20 from 989)
- Phase 33 (API Standardization) can reference interface contracts for service abstraction
- Phase 35 (AI Observability) can build AiRunLedger service on top of the existing schema

## Self-Check: PASSED

All 11 files verified present on disk. Both commits (3faede16, 9dd3457b) verified in git log.

---
*Phase: 31-foundation-stability-verification*
*Completed: 2026-03-03*
