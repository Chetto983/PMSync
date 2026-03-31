---
phase: 128-state-externalization
plan: 02
subsystem: infra
tags: [redis, lua, semaphore, circuit-breaker, concurrency, distributed-systems]

requires:
  - phase: 127-transport-connection-hardening
    provides: "Redis connection pooling and configuration"
provides:
  - "Redis Lua-based distributed counting semaphore for LLM triage concurrency"
  - "CircuitBreaker per-instance design documentation with tradeoff analysis"
affects: [ai-module, email-triage, horizontal-scaling]

tech-stack:
  added: []
  patterns: ["Redis Lua atomic scripts for distributed counting semaphore", "Fail-closed on Redis failure for LLM call protection"]

key-files:
  created:
    - backend/src/modules/ai/services/__tests__/email-triage-semaphore.spec.ts
  modified:
    - backend/src/modules/ai/services/email-triage.service.ts
    - backend/src/common/utils/circuit-breaker.utils.ts

key-decisions:
  - "Redis Lua ACQUIRE/RELEASE scripts for atomic semaphore (no race between GET and INCR)"
  - "Fail closed on Redis failure — block triage rather than allow LLM call storm"
  - "CircuitBreaker stays per-instance by design — industry standard, convergence within 90s"
  - "120s TTL safety net on semaphore key — auto-recovery if replica crashes"

patterns-established:
  - "Redis Lua counting semaphore: ACQUIRE checks-and-increments atomically, RELEASE decrements with floor at 0"
  - "Fire-and-forget release: errors swallowed with logging (best-effort decrement)"

requirements-completed: [SCAL-04]

duration: 5min
completed: 2026-03-31
---

# Phase 128 Plan 02: Distributed Semaphore & CircuitBreaker Documentation Summary

**Redis Lua-based distributed counting semaphore replacing in-memory semaphore for global LLM triage concurrency limit across replicas**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T10:02:36Z
- **Completed:** 2026-03-31T10:08:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced static in-memory semaphore (currentOperations + waitQueue) with Redis Lua-based distributed counting semaphore enforcing global 5-operation limit
- ACQUIRE script atomically checks count, increments, and sets TTL; RELEASE atomically decrements with floor at 0
- Fail-closed design: Redis failure blocks triage (prevents N*5 LLM call storm)
- CircuitBreaker documented with comprehensive per-instance design rationale and tradeoff analysis

## Task Commits

Each task was committed atomically:

1. **Task 1: Redis semaphore tests + implement distributed semaphore** - `5bf5840f` (feat)
2. **Task 2: Document CircuitBreaker per-instance design** - `143c793c` (docs)

## Files Created/Modified
- `backend/src/modules/ai/services/email-triage.service.ts` - Redis Lua ACQUIRE/RELEASE semaphore replacing static in-memory concurrency control
- `backend/src/modules/ai/services/__tests__/email-triage-semaphore.spec.ts` - 6 unit tests for acquire/release/integration
- `backend/src/common/utils/circuit-breaker.utils.ts` - Per-instance design JSDoc with tradeoff analysis and future mitigation path

## Decisions Made
- RedisConnectionService already available via @Global CacheModule — no ai.module.ts changes needed
- `err` parameter typed as `unknown` in catch handler to satisfy strict TypeScript (noImplicitAny)
- Tests run from main repo directory (worktree lacks node_modules); files copied for test execution then restored

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed implicit `any` on catch parameter**
- **Found during:** Task 1 (type-check)
- **Issue:** `.catch(err =>` triggers noImplicitAny in strict mode
- **Fix:** Changed to `.catch((err: unknown) =>`
- **Files modified:** backend/src/modules/ai/services/email-triage.service.ts
- **Verification:** Type-check clean for target file
- **Committed in:** 5bf5840f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type annotation fix. No scope creep.

## Issues Encountered
- Worktree has no node_modules; tests had to be copied to main repo for jest execution then restored

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Distributed semaphore ready for horizontal scaling (2-4 replicas)
- CircuitBreaker design documented for future scaling decisions
- Ready for Phase 128-03 (if exists) or next phase

---
*Phase: 128-state-externalization*
*Completed: 2026-03-31*
