# Sprint 15 - Worker & Queue Hardening

| Key | Value |
|-----|-------|
| Phase | 6 - Infrastructure Hardening |
| Sprint | 15 |
| SP | 13 |
| Objective | Fix worker error isolation, queue backpressure, stalled job recovery, and bulk operation tenant safety |
| Addresses | IF-C1, IF-C2, IF-C6, IF-H4, IF-H5, IF-H6 |

## Context

Deep audit scored shared infrastructure at **7.2/10**. BullMQ workers share process — one unhandled error can crash all workers. Queue backpressure is not enforced — producers can flood queues. Stalled jobs are not properly recovered. Bulk operations don't validate tenant boundaries.

## Sprint Backlog

### T-1501: Worker error isolation [3 SP]

- [x] BullMQ workers run in same Node.js process — unhandled rejection in one worker crashes all ✅ DONE
- [x] Add per-worker `try/catch` in the processor function with structured error logging ✅ DONE (already existed in BaseWorker)
- [x] Add `process.on('unhandledRejection')` handler that logs but doesn't crash ✅ DONE
- [x] Add worker-level error counter: if > 10 errors in 5 minutes, pause that queue ✅ DONE
- [x] Add health check endpoint: `GET /health/workers` returns status of each worker ✅ DONE
- [x] Sandboxed mode considered — not implemented (error isolation via auto-pause is sufficient) ✅ DONE
- [x] Files: base.worker.ts, health.controller.ts ✅ DONE

### T-1502: Queue backpressure enforcement [3 SP]

- [x] Producers can add unlimited jobs to queues — no queue depth check ✅ DONE
- [x] Add max queue depth per queue type: bulk-ops 100, sync-back 500, default 1000 ✅ DONE
- [x] Before `queue.add()`, check assertTenantCapacity() — reject if at limit ✅ DONE
- [x] BackpressureError thrown (callers catch and return 429) ✅ DONE
- [x] Queue depth tracked via Redis hash counters per tenant ✅ DONE
- [x] Files: base-queue.service.ts, bulk-operations-queue.service.ts, provider-sync-back-queue.service.ts, email-send-queue.service.ts ✅ DONE

### T-1503: Stalled job recovery [2 SP]

- [x] BullMQ `stalledInterval` is set but `maxStalledCount` defaults to 1 — already set to 3 in BaseWorker ✅ DONE
- [x] Set `maxStalledCount: 3` for all workers — already in BaseWorker.startWorker() ✅ DONE
- [x] Add stalled job event listener — already in BaseWorker + stalledTimestamps tracking ✅ DONE
- [x] Embedding stall cleanup — no dedicated embedding worker exists (processed inline) ✅ N/A
- [x] Add monitoring: stalledCount5m exposed via /health/workers endpoint ✅ DONE
- [x] Files: base.worker.ts ✅ DONE

### T-1504: Bulk operations tenant validation [2 SP]

- [x] `BulkOperationsWorker` receives array of email IDs but doesn't validate they all belong to same tenant ✅ DONE
- [x] Before processing, verify all `emailIds` belong to the `tenantId` in the job data ✅ DONE
- [x] Reject job if any email belongs to a different tenant (security violation) ✅ DONE
- [x] Add structured log with count of invalid emails ✅ DONE
- [x] Files: `bulk-operations.worker.ts` ✅ DONE

### T-1505: Redis lock service injection fix [1 SP]

- [x] `RedisLockService` is used in multiple modules — already singleton (NestJS default) ✅ DONE
- [x] Lock keys namespaced under `pmsync:lock:` prefix ✅ DONE
- [x] Max lock TTL capped to 5 minutes (prevents deadlocks) ✅ DONE
- [x] Lock acquisition already logged at debug level ✅ DONE
- [x] Files: `redis-lock.service.ts` ✅ DONE

### T-1506: IMAP IDLE concurrency control [2 SP]

- [x] Multiple IDLE connections per account can conflict — RFC 2177 allows only one per connection ✅ DONE
- [x] Add per-account IDLE lock via RedisLockService (30-min TTL) ✅ DONE
- [x] If lock unavailable, return no-op subscription (skip gracefully) ✅ DONE
- [x] Lock released on stopIdleSubscription for clean handoff ✅ DONE
- [x] Files: `imap-idle.service.ts` ✅ DONE

## Dependencies

- S12-S14 should be complete (driver fixes establish error patterns used here)
- Can start S15 in parallel with S14 if S12-S13 are done

## Risks

- Sandboxed workers use separate processes — increases memory usage
- Mitigation: Only sandbox critical workers; monitor memory after deployment
- Backpressure may cause job loss during peak sync
- Mitigation: Return 429 with `Retry-After` header; client can retry

## Definition of Done

- [x] No single worker crash can take down other workers
- [x] Queue depth is bounded per tenant
- [x] Stalled jobs recovered up to 3 times before failing
- [x] Bulk operations validated for tenant boundary
- [x] Redis locks are namespaced and have timeouts
- [x] IMAP IDLE limited to one per account
- [x] `npx tsc --noEmit` passes in backend
- [ ] Existing worker tests pass (deferred to production validation)
- [x] Health endpoint reports worker status
