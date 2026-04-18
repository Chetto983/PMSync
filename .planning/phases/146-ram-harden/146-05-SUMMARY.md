---
phase: 146-ram-harden
plan: 05
subsystem: infra
tags: [bullmq, ioredis, redis, nestjs, queue-health, memory-optimization]

# Dependency graph
requires:
  - 146-01 (getSharedRedisConnection, releaseSharedRedisConnection, QUEUE_NAMES)
provides:
  - QueueHealthService implementation that uses direct Redis LLEN/ZCARD/HGET via pipeline
  - Elimination of ~30 BullMQ Queue objects from the monitoring path
affects:
  - health.controller.ts (consumer — API surface unchanged, transparent swap)
  - queue-metrics.collector.ts (consumer — API surface unchanged, transparent swap)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct Redis key inspection for BullMQ queue counts via ioredis pipeline (bull:{name}:{wait|active|completed|failed|delayed|meta})"
    - "Defensive HGET result typing guard (=== 1 || === '1') for paused detection across ioredis return shapes"
    - "Parallel queue-status fetches via Promise.all instead of sequential await loop"

key-files:
  created: []
  modified:
    - backend/src/common/services/queue-health.service.ts

key-decisions:
  - "Drop the bullmq Queue import entirely from QueueHealthService — it is no longer needed once we read BullMQ's internal keys directly"
  - "Keep all three exported interfaces (QueueStatus, QueueHealthStatus, QueueMetrics) and all public methods identical — D-07 contract is unbroken"
  - "getQueueStatuses() runs all per-queue pipelines concurrently via Promise.all — wall time is now dominated by the slowest queue, not the sum"
  - "Keep onModuleInit's verbose log line (queue count + '(direct Redis)' marker) so operators can confirm from logs that the refactor is live"

patterns-established:
  - "BullMQ internal key pattern usage: bull:{queueName}:{wait|active} as LIST (LLEN), bull:{queueName}:{completed|failed|delayed} as SORTED SET (ZCARD), bull:{queueName}:meta as HASH with 'paused' field (HGET)"
  - "Pipeline-per-queue pattern: 6 commands in one round-trip per queue, parallelized across all queues"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-04-18
---

# Phase 146 Plan 05: QueueHealthService — Direct Redis Commands Summary

**Replaced ~30 BullMQ `Queue` instantiations in `QueueHealthService` with direct Redis LLEN/ZCARD/HGET pipeline commands, eliminating per-queue event listeners, Lua script loading, and housekeeping overhead while keeping the public API surface byte-identical.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 1 / 1
- **Files modified:** 1

## Accomplishments

- `QueueHealthService.onModuleInit` no longer creates any `Queue` objects. It grabs the shared Redis connection via `getSharedRedisConnection()` and stores `Object.values(QUEUE_NAMES)` into a plain `queueNames: string[]`. Result: ~30 fewer Queue objects at startup, each of which previously registered event listeners and triggered Lua script loading on its internal connection.
- `QueueHealthService.getQueueStatus` now issues a single ioredis pipeline per queue: `LLEN bull:{name}:wait`, `LLEN bull:{name}:active`, `ZCARD bull:{name}:completed`, `ZCARD bull:{name}:failed`, `ZCARD bull:{name}:delayed`, `HGET bull:{name}:meta paused`. One round-trip per queue, O(1) per count.
- Pause detection uses the defensive guard `pausedValue === 1 || pausedValue === '1'` because ioredis pipeline results can return either an integer or a string depending on the server response; both shapes indicate a paused queue per BullMQ's meta-hash convention.
- `getQueueStatuses()` now runs all per-queue pipelines in parallel via `Promise.all`, so wall-clock latency is dominated by the slowest queue rather than the sequential sum of all of them. The original implementation awaited each queue one at a time.
- `onModuleDestroy()` no longer iterates over a Queue map calling `.close()` — it clears `this.queueNames` and calls `releaseSharedRedisConnection()`. Simpler, and safe because there are no per-queue resources owned by this service anymore.
- The `bullmq` import is gone entirely from `queue-health.service.ts`.
- `QueueStatus`, `QueueHealthStatus`, `QueueMetrics` interfaces are **untouched**. `getHealthStatus`, `getQueueStatuses`, `getQueueStatus`, `checkRedisHealth`, `getPrometheusMetrics`, `isHealthy` all have identical signatures and return-shape contracts. `OpsAlertService` optional injection and T-1703/T-1801 depth alerts are preserved verbatim.
- TypeScript compilation passes (validated against the main backend's `node_modules` since the worktree has none; zero errors on the edited file).

## Task Commits

1. **Task 1: Remove Queue objects, implement direct Redis pipeline monitoring** — `4c79207b` (refactor)

## Files Created/Modified

- `backend/src/common/services/queue-health.service.ts` — **modified.** 354 lines. Dropped `import { Queue } from 'bullmq'`. Replaced `private queues: Map<string, Queue>` with `private queueNames: string[] = []`. Rewrote `onModuleInit`, `getQueueStatus`, `getQueueStatuses`, `onModuleDestroy`. Added inline docstring describing the BullMQ internal key-to-Redis-type mapping. Net diff: +68 / -51 lines (the file grew slightly because the docstring for `getQueueStatus` is more explicit about what it's reading from Redis and why).

## Decisions Made

- **Drop the `bullmq` import entirely from this file.** The only previous use was the `Queue` class; nothing else from `bullmq` was consumed. Keeping a now-unused import would be misleading.
- **Use `this.queueNames.includes(queueName)` in `getQueueStatus` as the "known queue" guard** rather than a `Set` lookup. The array has ~30 entries, called at most a few times per request, and `Array.prototype.includes` is O(n) but n is tiny — readability wins over a micro-optimization that would require a second field.
- **Keep `getPrometheusMetrics`, `getHealthStatus`, `checkRedisHealth`, `isHealthy` verbatim.** They all route through `getQueueStatuses()` and `checkRedisHealth()`, so the refactor transparently reaches them. No consumer-visible change.
- **Preserve the T-1703 / T-1801 depth-alert block inside `getHealthStatus` untouched.** It operates on the `QueueStatus` objects the new implementation produces — same shape, same semantics — so the alert logic is oblivious to the internal change.

## Deviations from Plan

None. The plan specified exactly this rewrite; acceptance criteria all verified via grep:

- `queue-health.service.ts` does NOT import `Queue` from `'bullmq'` ✔
- Does NOT contain `new Queue(` ✔
- Does NOT contain `private queues: Map` ✔
- Contains `private queueNames: string[] = []` ✔
- Contains `pipeline` / `llen` / `zcard` / `hget` in `getQueueStatus` ✔
- Contains `` `bull:${queueName}:wait` `` key pattern ✔
- Paused check uses `pausedValue === 1 || pausedValue === '1'` ✔
- Exports `QueueStatus`, `QueueHealthStatus`, `QueueMetrics` interfaces unchanged ✔
- `onModuleDestroy` contains `releaseSharedRedisConnection()` and does NOT iterate over queues ✔
- `onModuleInit` does NOT create Queue objects ✔

## Issues Encountered

- **Worktree has no `node_modules`.** Running `cd backend && npx tsc --noEmit` directly in the worktree fails with hundreds of module-resolution errors (every `@nestjs/*`, `ioredis`, `bullmq`, etc. missing). This is a worktree-environment limitation, not a code problem. Validated the edited file against the main repo's `node_modules` by copying it in temporarily: `cd D:/MailAgent/backend && npx tsc --noEmit` exits 0 with zero errors. Restored the main repo file afterwards — no pollution. The real type-check gate will also run via the pre-commit hook when this worktree branch is merged back to main.
- No other issues. BullMQ internal key patterns (`bull:{name}:wait`, `:active`, `:completed`, `:failed`, `:delayed`, `:meta` with `paused` field) were pre-verified in 146-RESEARCH.md against BullMQ's `getCounts-1.lua` source.

## User Setup Required

None — pure internal refactor with preserved public API.

## Next Phase Readiness

- **No consumers break.** `health.controller.ts` and `queue-metrics.collector.ts` call `getHealthStatus()` / `getQueueStatuses()` — same signatures, same return shapes, same semantics. Transparent swap.
- **Connection inventory moves in the right direction.** Before: `QueueHealthService` owned ~30 `Queue` objects, each attached to the shared connection but each creating internal per-queue housekeeping on it (event listeners, Lua script loads). After: one shared connection reference, zero Queue objects. This is the contribution of Plan 05 to the phase target of ~15 total Redis connections.
- **Ready for final phase integration / phase verification.** This plan's only dependency was 146-01 (shared connection singletons + QUEUE_NAMES), which is merged. Plan 05 can land in any merge order relative to the other Wave 2 plans because it doesn't touch shared infrastructure files.

## Self-Check: PASSED

- `backend/src/common/services/queue-health.service.ts` exists at expected path ✔
- Commit `4c79207b` (Task 1) in git log ✔ (`git log --oneline -1` = `4c79207b refactor(146-05): remove Queue objects from QueueHealthService — direct Redis pipeline`)
- grep confirms no `from 'bullmq'` import in queue-health.service.ts ✔
- grep confirms no `new Queue(` in queue-health.service.ts ✔
- grep confirms `private queueNames: string[] = []` present ✔
- grep confirms `pipeline`, `llen`, `zcard`, `hget` used in getQueueStatus ✔
- grep confirms `bull:${queueName}:wait` key pattern present ✔
- grep confirms paused guard `=== 1 || pausedValue === '1'` present ✔
- grep confirms `QueueStatus`, `QueueHealthStatus`, `QueueMetrics` still exported ✔
- grep confirms `releaseSharedRedisConnection()` in onModuleDestroy ✔
- `npx tsc --noEmit` against main repo node_modules exits 0 (worktree has no node_modules) ✔

---
*Phase: 146-ram-harden*
*Completed: 2026-04-18*
