---
phase: 146-ram-harden
plan: 01
subsystem: infra
tags: [bullmq, ioredis, redis, nestjs, queue-config, memory-optimization]

# Dependency graph
requires: []
provides:
  - getSharedWorkerConnection() singleton with maxRetriesPerRequest: null and lazyConnect: false
  - releaseSharedWorkerConnection() and forceCloseSharedWorkerConnection() ref-counted cleanup
  - getSharedRedisConnection() with enableOfflineQueue: false for producer fail-fast behavior
  - QUEUE_PRESETS with aggressive minimal retention (removeOnComplete: true, removeOnFail: count 20)
  - redis-connections.ts module as canonical home for Redis singletons
affects:
  - 146-02 (BaseWorker refactor — consumes getSharedWorkerConnection)
  - 146-03 (Inline worker migration — consumes getSharedWorkerConnection)
  - 146-04 (Queue service migration — consumes getSharedRedisConnection)
  - 146-05 (QueueHealthService rework + maxmemory-policy check)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-singleton producer/worker Redis connections with distinct tuning (D-02, D-14)"
    - "Connection singleton extraction to dedicated file for 500-line compliance"
    - "Re-export chain preserves public API after file split"

key-files:
  created:
    - backend/src/common/config/redis-connections.ts
  modified:
    - backend/src/common/config/queue.config.ts

key-decisions:
  - "Extract Redis singletons into redis-connections.ts instead of growing queue.config.ts past 500 lines (CLAUDE.md hard limit)"
  - "Re-export all 6 connection functions from queue.config.ts so existing consumers and the common/config barrel keep working unchanged"
  - "Producer connection uses enableOfflineQueue: false for fail-fast; worker connection keeps true so workers wait for reconnection (D-14)"
  - "All 9 QUEUE_PRESETS collapsed to the same retention profile — removeOnComplete: true, removeOnFail: { count: 20 } (D-08/D-09)"

patterns-established:
  - "Producer vs Worker connection split: separate singletons with different ioredis options"
  - "DLQ-first failure retention: BullMQ keeps only 20 recent failures per queue; dead-letter-queue.service is the durable audit surface"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-04-18
---

# Phase 146 Plan 01: Foundation — Redis Singletons & Aggressive Retention Summary

**Split Redis connection singletons into a dedicated `redis-connections.ts` module (producer + worker), added `enableOfflineQueue: false` on producers, and collapsed all 9 QUEUE_PRESETS to `removeOnComplete: true` / `removeOnFail: { count: 20 }` to stop BullMQ's completed-job memory bloat.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-18T17:37:37Z
- **Completed:** 2026-04-18T17:41:22Z
- **Tasks:** 2 / 2
- **Files modified:** 2 (1 created, 1 edited)

## Accomplishments

- New `backend/src/common/config/redis-connections.ts` owns all 6 BullMQ connection singletons (producer + worker, each with `get*`, `release*`, `forceClose*`), ref-counted and logger-wired.
- New worker singleton has `maxRetriesPerRequest: null`, `lazyConnect: false`, `enableOfflineQueue: true` — the three required BullMQ worker options. Producer singleton now has `enableOfflineQueue: false` for fast-fail behavior on `Queue.add()` when Redis is down.
- `queue.config.ts` dropped from 479 to 426 lines (well under the CLAUDE.md 500-line hard limit) and now re-exports the 6 connection functions from `redis-connections.ts` so the common/config barrel and all 9 existing consumer files keep working unchanged.
- All 9 QUEUE_PRESETS (`HIGH`, `NORMAL`, `LOW`, `AI_EMBEDDING`, `EMAIL_SYNC`, `FOLDER_OPS`, `CONTACTS_SYNC`, `CALENDAR_SYNC`, `SCHEDULED`) now use immediate completed-job removal (`removeOnComplete: true`) and only retain the last 20 failures per queue. Dead-letter-queue.service remains the durable failure audit trail.
- `cd backend && npx tsc --noEmit` clean after each task (pre-commit hook ran it as part of the commit gate).

## Task Commits

Each task committed atomically:

1. **Task 1: Extract Redis singletons to redis-connections.ts + add getSharedWorkerConnection** — `24aaceb8` (refactor)
2. **Task 2: Aggressive QUEUE_PRESETS retention (D-08/D-09)** — `449c1de3` (perf)

## Files Created/Modified

- `backend/src/common/config/redis-connections.ts` — **created.** 161 lines. Two ref-counted singletons (`sharedRedisConnection`, `sharedWorkerConnection`) with `get*`/`release*`/`forceClose*` exports. Producer has `enableOfflineQueue: false`; worker has `maxRetriesPerRequest: null`, `lazyConnect: false`, `enableOfflineQueue: true`.
- `backend/src/common/config/queue.config.ts` — **modified.** Removed the old `sharedRedisConnection` block (~55 lines) and re-exports the 6 functions from `./redis-connections`. Rewrote all 9 QUEUE_PRESETS to share the same aggressive retention profile. Final size 426 lines.

## Decisions Made

- **Re-export over direct migration of call sites:** Keeping `queue.config.ts` as the public import surface (via re-export) means Plans 02–05 and the common/config barrel need zero changes to consume the new worker singleton. Lower blast radius.
- **Producer/worker split at the singleton level, not per-instance:** BullMQ docs explicitly require different ioredis options for producers vs workers. Baking this into two distinct singletons prevents future misconfiguration.
- **Drop all preset-specific retention (AI_EMBEDDING had `count: 1000`, HIGH had `age: 3600`):** DLQ already audits failures durably; Redis was double-accounting. Uniform `count: 20` is easier to reason about and matches the phase-wide D-09 mandate.

## Deviations from Plan

None — plan executed exactly as written. The one judgement call (the plan hinted at reading the config barrel to decide whether to update it) was resolved by reading `common/config/index.ts`: it re-exports from `queue.config.ts`, so the re-export chain through `queue.config.ts → redis-connections.ts` is transitively sufficient. No barrel change needed.

## Issues Encountered

Pre-commit hook on both task commits ran `npm run type-check` (`tsc --noEmit`) and passed without changes. No runtime checks attempted — this is pure config/singleton refactoring and will be live-exercised by Plans 02–05 when consumers wire up.

## User Setup Required

None — no external service configuration required. All changes are internal backend refactoring.

## Next Phase Readiness

- **Plan 02 (BaseWorker refactor) unblocked:** `getSharedWorkerConnection` / `releaseSharedWorkerConnection` are now importable from `queue.config.ts` (direct or via the barrel).
- **Plan 03 (Inline worker migration) unblocked:** Same singleton is ready for `scheduled-jobs`, `reminder-notify`, `sla-timer`, `csat`.
- **Plan 04 (Queue service migration) unblocked:** Producer singleton now has `enableOfflineQueue: false` baked in — migrating services to `getSharedRedisConnection()` automatically picks up D-14 behavior.
- **BaseWorker.startWorker() still has the D-10 hardcoded override (`removeOnComplete: { count: 100 }`, `removeOnFail: { count: 50 }`).** Until Plan 02 fixes that override, the new aggressive preset values won't fully reach BullMQ on BaseWorker subclasses — they'll still convert `true` to `{ count: 100 }`. This is explicitly scheduled for Plan 02 per D-10 and is not a regression; inline-worker services (Plans 03/04) and plain Queue producers already honor the new presets via `getDefaultJobOptions()`.
- **No blockers for Plan 02.**

## Self-Check: PASSED

- `backend/src/common/config/redis-connections.ts` exists at expected path ✔
- `backend/src/common/config/queue.config.ts` updated (re-exports verified) ✔
- Commit `24aaceb8` (Task 1) in git log ✔
- Commit `449c1de3` (Task 2) in git log ✔
- `cd backend && npx tsc --noEmit` exits 0 ✔
- `queue.config.ts` line count 426 (< 500) ✔
- grep confirms all 6 connection function exports in redis-connections.ts ✔
- grep confirms all 9 QUEUE_PRESETS use `removeOnComplete: true` + `removeOnFail: { count: 20 }` ✔
- grep confirms `enableOfflineQueue: false` on producer, `true` on worker ✔
- grep confirms no singleton variables remain in queue.config.ts ✔

---
*Phase: 146-ram-harden*
*Completed: 2026-04-18*
