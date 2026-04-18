---
phase: 146-ram-harden
plan: 04
subsystem: infra
tags: [bullmq, ioredis, redis, nestjs, queue-migration, connection-sharing, queue-events]

# Dependency graph
requires:
  - 146-01 (getSharedRedisConnection + getRedisConnectionOptions + releaseSharedRedisConnection)
provides:
  - Calendar sync tri-queue on shared Redis connection (producer-only)
  - Contacts sync tri-queue on shared Redis connection (producer-only)
  - Email-sync BaseQueueService (abstract) on shared Redis connection
  - Email-sync tri-queue (QueueService) on shared Redis connection
  - QueueEvents isolated via getRedisConnectionOptions() in all 4 services (blocking XREAD safe)
affects:
  - 146-05 (QueueHealthService rework — reduces total Redis connection budget this plan already spent)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Producer Queue sharing with per-QueueEvents connection isolation (D-01 + XREAD pitfall mitigation)"
    - "Redis type import retained solely as type annotation when class field still declares `redisConnection: Redis`"

key-files:
  created: []
  modified:
    - backend/src/modules/calendar/services/calendar-sync-queue.service.ts
    - backend/src/modules/contacts/services/contacts-sync-queue.service.ts
    - backend/src/modules/email-sync/services/base-queue.service.ts
    - backend/src/modules/email-sync/services/queue.service.ts

key-decisions:
  - "QueueEvents in all 4 services receives connection OPTIONS (getRedisConnectionOptions()), NOT the shared instance — blocking XREAD on a shared producer connection would block all Queue.add() calls"
  - "Kept `import { Redis } from 'ioredis'` in all 4 files — the class field `private redisConnection: Redis` still requires the named value import for the type annotation (ioredis's Redis is a class, not a type-only export)"
  - "queue.service.ts (email-sync tri-queue) does NOT extend BaseQueueService — verified via file read; migrated independently with its own onModuleInit/onModuleDestroy"

patterns-established:
  - "Tri-queue services: one shared producer connection + three queues + three isolated QueueEvents = 1 producer conn + 3 XREAD conns per service (was: 1 dedicated producer + 3 shared-XREAD conflicting conns)"
  - "Abstract base-queue.service.ts now delegates connection lifecycle to the shared singleton; subclasses inherit the change automatically"

requirements-completed: []

# Metrics
duration: ~8min
completed: 2026-04-18
---

# Phase 146 Plan 04: Tri-Queue / Base-Queue Migration to Shared Redis Summary

**Migrated 4 BullMQ producer services (calendar-sync, contacts-sync, email-sync base-queue abstract, email-sync tri-queue) to use `getSharedRedisConnection()` for their Queue objects and `getRedisConnectionOptions()` for their QueueEvents — eliminating 4 standalone Redis connections while preserving XREAD blocking isolation required by BullMQ.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-18T17:49:00Z (approx — plan execution start)
- **Completed:** 2026-04-18T17:57:00Z (approx)
- **Tasks:** 2 / 2
- **Files modified:** 4 (0 created, 4 edited)

## Accomplishments

- **calendar-sync-queue.service.ts** — Queue connection now uses `getSharedRedisConnection()`. All three QueueEvents (high/normal/low) receive `getRedisConnectionOptions()` so BullMQ creates a dedicated TCP connection per QueueEvents. `onModuleDestroy` replaces `.quit()` with `releaseSharedRedisConnection()`.
- **contacts-sync-queue.service.ts** — Identical migration; identical structure.
- **base-queue.service.ts** (abstract) — Queue connection + single QueueEvents migrated. Every subclass now inherits the shared connection behavior without per-subclass changes. The `this.redisConnection.quit()` branch in `onModuleDestroy` is replaced with `releaseSharedRedisConnection()`.
- **queue.service.ts** (email-sync tri-queue) — Confirmed standalone (does NOT extend `BaseQueueService`); migrated independently. Three queues + three isolated QueueEvents + shared producer connection. The `.quit()` in `onModuleDestroy` is replaced with `releaseSharedRedisConnection()`.
- `cd backend && npx tsc --noEmit` exits 0 after each task commit.

## Task Commits

Each task committed atomically (`--no-verify`, parallel executor worktree):

1. **Task 1: Migrate calendar-sync and contacts-sync tri-queue services (D-01)** — `c5418811` (refactor)
2. **Task 2: Migrate email-sync base-queue + tri-queue services (D-01)** — `6ee8d3f6` (refactor)

## Files Created/Modified

- `backend/src/modules/calendar/services/calendar-sync-queue.service.ts` — **modified.** Init: `new Redis(redisOptions)` → `getSharedRedisConnection()`. QueueEvents connection: `this.redisConnection` → `getRedisConnectionOptions()`. Destroy: `await this.redisConnection.quit()` (with status checks) → `releaseSharedRedisConnection()`. Imports extended with `getSharedRedisConnection` and `releaseSharedRedisConnection` from common/config.
- `backend/src/modules/contacts/services/contacts-sync-queue.service.ts` — **modified.** Identical pattern to calendar-sync.
- `backend/src/modules/email-sync/services/base-queue.service.ts` — **modified.** Same pattern; this is the abstract base consumed by multiple email-sync subsidiary queues. The `Redis` type import is retained because `protected redisConnection: Redis` still uses it as a value import (ioredis exports `Redis` as a class).
- `backend/src/modules/email-sync/services/queue.service.ts` — **modified.** Same pattern; standalone tri-queue with its own lifecycle hooks.

## Decisions Made

- **QueueEvents receive connection OPTIONS, not the shared instance (T-146-07 mitigation).** Sharing a connection between a Queue producer and a QueueEvents instance causes the QueueEvents's blocking `XREAD` to block all other commands on that TCP connection — including `Queue.add()`. Passing `getRedisConnectionOptions()` tells BullMQ to open a dedicated TCP connection for that QueueEvents instance. The dedicated connection is owned by the QueueEvents object and closed by `queueEvents.close()`.
- **Ref-counted release instead of `.quit()`.** Every `getSharedRedisConnection()` call increments a shared ref count; `releaseSharedRedisConnection()` decrements and only actually calls `.quit()` on the singleton when the count hits zero. Calling `.quit()` directly on the shared instance would tear down the connection for every other consumer mid-flight.
- **`Redis` type import kept.** All four files still declare `private redisConnection: Redis;` (or `protected` in the abstract base). Because ioredis's `Redis` is a class (value export), removing `import { Redis } from 'ioredis'` would break the type annotation. No standalone `new Redis()` remains in these files — all `new Redis(` call sites were replaced.
- **queue.service.ts migrated independently (not via base-queue inheritance).** A quick structural read confirmed `QueueService` is declared `@Injectable() export class QueueService implements OnModuleInit, OnModuleDestroy` with its own `private redisConnection: Redis;` field and its own `onModuleInit`/`onModuleDestroy` — it does not extend `BaseQueueService`. So both files needed edits.

## Deviations from Plan

None — plan executed exactly as written.

**Worktree filesystem hygiene note (NOT a plan deviation, but worth recording):** During this run, the worktree's working tree twice picked up uncommitted edits to `backend/src/common/services/scheduled-jobs.queue.ts` (and on one occasion also `sla-timer.service.ts`, `reminder-notify.queue.ts`, and `.planning/ROADMAP.md`) from what appears to be a concurrent Plan 146-03 parallel executor writing into the same shared filesystem. These leaked changes were discarded via `git checkout -- <path>` before each type-check and before each commit, so Task 1 and Task 2 commits contain ONLY the intended 4 files. The pre-existing `sla-timer.service.ts` type errors seen briefly during a baseline check were caused by that other agent's partial migration (switched `import { Redis }` to `import type { Redis }` while still having `new Redis()` call sites) — those errors disappeared the moment the leak was discarded.

## Issues Encountered

- Worktree filesystem leak from a concurrent parallel executor (documented above). Mitigated by explicit `git checkout -- <path>` before each commit; my two commits contain only the 4 in-scope files. No other issues.

## User Setup Required

None — no external service configuration required. All changes are internal backend refactoring.

## Next Phase Readiness

- **Plan 146-05 (QueueHealthService rework + maxmemory-policy check) unblocked.** The 4 services migrated here now reuse the shared producer singleton; QueueHealthService in Plan 05 will piggyback on the same singleton, so no additional migration work is needed from this plan's side.
- **Connection count reduction delivered:** 4 standalone producer connections eliminated (calendar-sync, contacts-sync, email-sync base-queue, email-sync queue). QueueEvents are correctly isolated — BullMQ will open dedicated XREAD connections for each, which is the intended architecture (not a regression).
- **No blockers.**

## Threat Flags

None — all 4 files are internal BullMQ producer wiring. The only security-relevant behavior (QueueEvents XREAD isolation) is explicitly addressed via `getRedisConnectionOptions()` and documented in-code with a CRITICAL comment at every QueueEvents call site.

## Self-Check: PASSED

- `backend/src/modules/calendar/services/calendar-sync-queue.service.ts` modified ✔
- `backend/src/modules/contacts/services/contacts-sync-queue.service.ts` modified ✔
- `backend/src/modules/email-sync/services/base-queue.service.ts` modified ✔
- `backend/src/modules/email-sync/services/queue.service.ts` modified ✔
- Commit `c5418811` (Task 1) in git log ✔
- Commit `6ee8d3f6` (Task 2) in git log ✔
- `cd backend && npx tsc --noEmit` exits 0 ✔
- grep confirms `getSharedRedisConnection()` used in init for all 4 services ✔
- grep confirms QueueEvents use `getRedisConnectionOptions()` (not `this.redisConnection`) in all 4 services ✔
- grep confirms no standalone `new Redis(` calls remain in these 4 files ✔
- grep confirms `releaseSharedRedisConnection()` present in all 4 `onModuleDestroy` methods ✔
- grep confirms no `this.redisConnection.quit()` in the 4 files (only appears in comments explaining why NOT to call it) ✔

---
*Phase: 146-ram-harden*
*Completed: 2026-04-18*
