---
phase: 127-transport-connection-hardening
plan: 01
subsystem: infra
tags: [socket.io, websocket, prisma, pg-pool, railway, connection-pooling]

requires:
  - phase: 126-cron-to-bullmq-migration
    provides: BullMQ-only job scheduling (no @Cron multi-fire risk)
provides:
  - WebSocket-only Socket.IO transport (no polling fallback)
  - Explicit pg.Pool config via DB_POOL_MAX/TIMEOUT/IDLE env vars
  - Pool sizing documentation for Railway multi-replica deployment
affects: [128-resilience-patterns, 129-bullmq-scaling]

tech-stack:
  added: []
  patterns: [env-var-controlled-pool-sizing, url-param-stripping]

key-files:
  created: []
  modified:
    - frontend/lib/websocket-client.ts
    - backend/src/prisma/prisma-client.factory.ts
    - backend/.env.example

key-decisions:
  - "Pool default max=20 (conservative for 2-4 replicas with max_connections=100)"
  - "Strip connection_limit/pool_timeout from DATABASE_URL rather than just ignoring"

patterns-established:
  - "DB pool sizing via env vars, not URL params (Prisma 7 adapter-pg pattern)"

requirements-completed: [SCAL-01, SCAL-02]

duration: 2min
completed: 2026-03-31
---

# Phase 127 Plan 01: Transport & Connection Hardening Summary

**WebSocket-only Socket.IO transport and explicit pg.Pool config via env vars for Railway multi-replica deployment**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T09:36:09Z
- **Completed:** 2026-03-31T09:38:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed HTTP long-polling fallback from Socket.IO client, matching server's websocket-only config
- Rewrote prisma-client.factory.ts with explicit pg.Pool options (max, connectionTimeoutMillis, idleTimeoutMillis) controlled by DB_POOL_MAX/TIMEOUT/IDLE env vars
- Added URL param stripping to remove legacy connection_limit/pool_timeout that pg.Pool silently ignores
- Updated .env.example with pool sizing formula documentation

## Task Commits

Each task was committed atomically:

1. **Task 1: Force WebSocket-only transport on Socket.IO client** - `8ed6457f` (feat)
2. **Task 2: Fix DB connection pool config and add env var overrides** - `c0624f90` (feat)

## Files Created/Modified
- `frontend/lib/websocket-client.ts` - Removed 'polling' from transports array
- `backend/src/prisma/prisma-client.factory.ts` - Rewritten with explicit pg.Pool config via env vars
- `backend/.env.example` - Removed URL pool params, added DB_POOL_* section with sizing docs

## Decisions Made
- Pool default max=20 is conservative but safe for 2-4 replicas; Railway max_connections=100 allows up to 30 per replica with 2 replicas
- Strip connection_limit/pool_timeout from URL proactively rather than just ignoring, to prevent confusion for future developers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Existing deployments will use defaults (max=20, timeout=20s, idle=30s) unless DB_POOL_* env vars are explicitly set.

## Next Phase Readiness
- Transport and pool config hardened for multi-replica Railway deployment
- Ready for Phase 128 (resilience patterns) and Phase 129 (BullMQ scaling)

---
*Phase: 127-transport-connection-hardening*
*Completed: 2026-03-31*
