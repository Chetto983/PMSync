---
phase: 128-state-externalization
plan: 01
subsystem: ai
tags: [redis, triage, lua, ioredis, signal-buffer, horizontal-scaling]

requires:
  - phase: 127-transport-connection-hardening
    provides: Redis connection pooling and shared RedisConnectionService
provides:
  - "Redis-backed signal buffer for TriageLearningService (multi-replica safe)"
  - "Atomic Lua drain script for buffer flush (LRANGE+DEL)"
  - "Direct Redis HGET for sender score reads (no in-memory cache)"
affects: [129-bullmq-circuit-breaker, horizontal-scaling]

tech-stack:
  added: []
  patterns: ["Redis RPUSH+LLEN for distributed buffering", "Lua LRANGE+DEL atomic drain", "Redis SCAN for key discovery"]

key-files:
  created:
    - backend/src/modules/ai/services/__tests__/triage-learning-redis.spec.ts
  modified:
    - backend/src/modules/ai/services/triage-learning.service.ts

key-decisions:
  - "recordSignal changed from sync void to async Promise<void> -- no external callers exist, fire-and-forget pattern preserved"
  - "Buffer TTL 600s as safety net for orphaned buffer keys"
  - "No in-memory scoreCache -- Redis HGET on small hashes is sub-ms, cache adds divergence risk across replicas"

patterns-established:
  - "Redis list buffer pattern: RPUSH+EXPIRE for writes, LLEN for threshold check, Lua LRANGE+DEL for atomic drain"
  - "Redis SCAN for distributed key discovery instead of in-memory Map iteration"

requirements-completed: [SCAL-04]

duration: 14min
completed: 2026-03-31
---

# Phase 128 Plan 01: Triage Learning Redis Externalization Summary

**TriageLearningService signal buffer and score cache moved from in-memory Maps to Redis lists with atomic Lua drain for multi-replica safety**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-31T10:02:26Z
- **Completed:** 2026-03-31T10:16:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced in-memory `signalBuffer` Map with Redis RPUSH to `triage:signal-buffer:{tenantId}:{senderEmail}` keys
- Removed `scoreCache` Map entirely; `getSenderBehavior` reads directly from Redis HGET (no divergence across replicas)
- Added atomic Lua drain script (LRANGE+DEL) for buffer flush, preventing race conditions between replicas
- `flushAllBuffers` now uses Redis SCAN to discover buffer keys instead of iterating in-memory Map

## Task Commits

Each task was committed atomically:

1. **Task 1: Write unit tests for Redis signal buffer operations** - `d3d00434` (test)
2. **Task 2: Externalize signal buffer to Redis lists and remove scoreCache** - `44696f47` (feat)

## Files Created/Modified
- `backend/src/modules/ai/services/__tests__/triage-learning-redis.spec.ts` - 6 unit tests covering rpush, drain threshold, direct HGET reads, SCAN-based flush
- `backend/src/modules/ai/services/triage-learning.service.ts` - Removed 2 Maps, added DRAIN_SCRIPT, rewrote recordSignal/getSenderBehavior/flushAllBuffers

## Decisions Made
- `recordSignal` changed from sync to async: no external callers exist in codebase (grep verified), so signature change is safe
- 600s TTL on buffer lists as safety net for orphaned keys (periodic flush runs every 5 min)
- No in-memory cache replacement: Redis HGET on small hashes is sub-ms, and any cache would diverge across replicas

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Worktree has no `node_modules`; tests and type-check had to be validated by temporarily copying files to main repo. All validations passed.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness
- TriageLearningService is fully externalized; safe for multi-replica deployment
- Ready for Phase 128-02 (CircuitBreaker state externalization, if planned)

---
*Phase: 128-state-externalization*
*Completed: 2026-03-31*
