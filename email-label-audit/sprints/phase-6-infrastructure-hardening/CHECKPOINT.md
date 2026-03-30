# Sprint 15 — Checkpoint

## Status

- **Sprint:** 15 — Worker & Queue Hardening
- **Last Task Completed:** T-1506 — IMAP IDLE per-account concurrency control
- **Next Task:** Sprint 15 COMPLETE. Next: Sprint 16 (Security & Sync Hardening)
- **Tasks Done:** 6/6
- **SP Completed:** 13/13
- **Last Updated:** 2026-03-30 15:00

## Audit Findings Addressed

- IF-C1: BullMQ workers share process — one crash takes all — ✅ T-1501 (error counter + auto-pause + unhandledRejection handler)
- IF-C6: Queue backpressure not enforced — unlimited depth — ✅ T-1502 (per-tenant Redis hash counters, BackpressureError)
- IF-H4: Stalled BullMQ jobs maxStalledCount=1 — ✅ T-1503 (already 3 in BaseWorker, added stalledCount5m monitoring)
- IF-H5: Bulk operations don't validate tenant boundary — ✅ T-1504 (count check before processing)
- IF-C2: RedisLockService scope unclear — ✅ T-1505 (pmsync: namespace, 5-min TTL cap)
- IF-H6: IMAP IDLE multiple concurrent per account — ✅ T-1506 (Redis lock per account, 30-min TTL)

## Last Modified Files

- backend/src/common/workers/base.worker.ts (T-1501, T-1503: registry, error counter, auto-pause, stalled tracking)
- backend/src/modules/health/controllers/health.controller.ts (T-1501: GET /health/workers endpoint)
- backend/src/modules/email-sync/services/base-queue.service.ts (T-1502: BackpressureError, assertTenantCapacity)
- backend/src/modules/email-sync/services/bulk-operations-queue.service.ts (T-1502: 100/tenant limit)
- backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts (T-1502: 500/tenant limit)
- backend/src/modules/email-sync/services/email-send-queue.service.ts (T-1502: backpressure check)
- backend/src/modules/email-sync/workers/bulk-operations.worker.ts (T-1504: tenant validation)
- backend/src/common/services/redis-lock.service.ts (T-1505: pmsync: namespace, TTL cap)
- backend/src/modules/email-sync/drivers/imap/services/imap-idle.service.ts (T-1506: per-account IDLE lock)

## Key Decisions Made

- T-1501: Error threshold 10 errors/5min triggers auto-pause with 60s cooldown (not sandboxed — memory overhead not justified)
- T-1502: Per-tenant backpressure via Redis hash counters (O(1) check), not scanning queue jobs
- T-1503: maxStalledCount:3 was already in BaseWorker — added monitoring via stalledCount5m
- T-1504: Full count check (not sampling) since bulk ops are bounded (max 100/tenant from backpressure)
- T-1505: Changed lock prefix from `lock:` to `pmsync:lock:` — existing callers already use relative keys
- T-1506: 30-min IDLE lock TTL matches ImapFlow maxIdleTime (29 min)

## Patterns Established

- `BaseWorker.getAll()` — static registry for health endpoint queries
- `WorkerHealthStatus` — standardized health interface for all workers
- `BackpressureError` — typed error for queue capacity rejection
- `assertTenantCapacity()` — reusable backpressure check in BaseQueueService
- Per-account IDLE lock pattern — Redis lock with `idle:{accountId}` key

## Blockers / Notes

- None. Sprint 15 complete. Phase 6 continues with S16 (Security & Sync Hardening).

## Validation Status

- Backend tsc: ✅ passing (pre-existing CRM scoring errors excluded)
- Frontend tsc: not affected (backend-only sprint)
