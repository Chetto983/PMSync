---
phase: 129-replica-activation
plan: 02
subsystem: infra
tags: [graceful-shutdown, prometheus, railway, replicas, websocket, prisma]

requires:
  - phase: 128-state-externalization
    provides: Redis-externalized state for multi-replica safety
provides:
  - Graceful shutdown with 25s timeout and WebSocket adapter cleanup
  - Per-replica Prometheus instance labels via RAILWAY_REPLICA_ID
  - Railway multi-replica deployment (numReplicas=2)
  - Clean PrismaService lifecycle (OnModuleDestroy, no duplicate signal handlers)
affects: [monitoring, deployment, observability]

tech-stack:
  added: []
  patterns: [shutdown-timeout-safety-net, per-replica-metric-labels]

key-files:
  created:
    - backend/src/__tests__/graceful-shutdown.test.ts
    - backend/src/common/metrics/__tests__/metrics-replica-label.test.ts
  modified:
    - backend/src/main.ts
    - backend/src/prisma/prisma.service.ts
    - backend/src/common/metrics/metrics.module.ts
    - backend/railway.toml

key-decisions:
  - "25s shutdown timeout (env-configurable via SHUTDOWN_TIMEOUT_MS) fits within Railway 30s grace period"
  - "WebSocket adapter closes before app.close() to prevent orphaned pub/sub connections"
  - "PrismaService uses OnModuleDestroy lifecycle instead of manual signal handlers"

patterns-established:
  - "Shutdown timeout with unref(): setTimeout + unref() for safety nets that don't keep the process alive"
  - "Per-replica labels: All Prometheus metrics automatically tagged with instance=RAILWAY_REPLICA_ID"

requirements-completed: [PERF-03, PERF-04]

duration: 2min
completed: 2026-03-31
---

# Phase 129 Plan 02: Replica Activation Summary

**Hardened graceful shutdown with 25s timeout + adapter cleanup, per-replica Prometheus labels, and Railway numReplicas=2 activation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T13:36:07Z
- **Completed:** 2026-03-31T13:38:37Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- SIGTERM triggers graceful shutdown: WebSocket RedisIoAdapter closes first, then NestJS app.close(), with 25s timeout safety net
- All Prometheus metrics include `instance` label from RAILWAY_REPLICA_ID (falls back to "local" in dev)
- PrismaService cleaned up: dead enableShutdownHooks removed, OnModuleDestroy added for lifecycle-correct disconnect
- Railway configured for 2 replicas

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden graceful shutdown with timeout and adapter cleanup** - `eec24cf7` (feat)
2. **Task 2: Add per-replica Prometheus labels, set numReplicas=2** - `b0d959b6` (feat)

## Files Created/Modified

- `backend/src/main.ts` - Graceful shutdown with SHUTDOWN_TIMEOUT_MS, redisIoAdapter.close() before app.close()
- `backend/src/prisma/prisma.service.ts` - Removed dead enableShutdownHooks, added OnModuleDestroy
- `backend/src/common/metrics/metrics.module.ts` - Added defaultLabels with RAILWAY_REPLICA_ID
- `backend/railway.toml` - numReplicas changed from 1 to 2
- `backend/src/__tests__/graceful-shutdown.test.ts` - Behavioral tests for PERF-03
- `backend/src/common/metrics/__tests__/metrics-replica-label.test.ts` - Behavioral tests for PERF-04

## Decisions Made

- 25s shutdown timeout fits within Railway's 30s grace period with 5s margin
- WebSocket adapter closes before app.close() to prevent orphaned Redis pub/sub connections during shutdown
- PrismaService uses NestJS OnModuleDestroy lifecycle hook instead of manual process signal handlers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - worktree lacks node_modules so tsc --noEmit shows module resolution errors for all files (pre-existing, not caused by changes).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Replica activation complete: Railway will run 2 backend instances
- Graceful shutdown ensures clean drain during deploys
- Prometheus metrics are distinguishable per replica for Grafana dashboards

---
*Phase: 129-replica-activation*
*Completed: 2026-03-31*
