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

- [ ] BullMQ workers run in same Node.js process — unhandled rejection in one worker crashes all
- [ ] Add per-worker `try/catch` in the processor function with structured error logging
- [ ] Add `process.on('unhandledRejection')` handler that logs but doesn't crash
- [ ] Add worker-level error counter: if > 10 errors in 5 minutes, pause that queue
- [ ] Add health check endpoint: `GET /health/workers` returns status of each worker
- [ ] Consider `sandboxed: true` in BullMQ worker options for critical workers (email-sync, embedding)
- [ ] Files: all `*.worker.ts` files, `health.controller.ts`

### T-1502: Queue backpressure enforcement [3 SP]

- [ ] Producers can add unlimited jobs to queues — no queue depth check
- [ ] Add max queue depth per queue type:
  - `email-sync`: 1000 per tenant
  - `email-embedding`: 5000 per tenant
  - `bulk-operations`: 100 per tenant
  - `sync-back`: 500 per tenant
- [ ] Before `queue.add()`, check `queue.getJobCounts()` — reject if at limit
- [ ] Return `429 Too Many Requests` to API callers when queue is at capacity
- [ ] Add queue depth metric exposed via health endpoint
- [ ] Files: all `*.queue.ts` files, relevant service files

### T-1503: Stalled job recovery [2 SP]

- [ ] BullMQ `stalledInterval` is set but `maxStalledCount` defaults to 1 — jobs stall and are not retried
- [ ] Set `maxStalledCount: 3` for all workers (allow 3 stall recoveries before failing)
- [ ] Add stalled job event listener: log stalled job details for investigation
- [ ] For embedding jobs: on stall, check if embedding was partially created — clean up before retry
- [ ] Add monitoring: count of stalled jobs per queue per hour
- [ ] Files: all `*.worker.ts` files

### T-1504: Bulk operations tenant validation [2 SP]

- [ ] `BulkOperationsWorker` receives array of email IDs but doesn't validate they all belong to same tenant
- [ ] Before processing, verify all `emailIds` belong to the `tenantId` in the job data
- [ ] Reject job if any email belongs to a different tenant (security violation)
- [ ] Add structured log: `{ tenantId, emailCount, operation, validatedCount }`
- [ ] Files: `bulk-operations.worker.ts`, `bulk-operations.service.ts`

### T-1505: Redis lock service injection fix [1 SP]

- [ ] `RedisLockService` is used in multiple modules but injection scope is unclear
- [ ] Verify `RedisLockService` is `@Injectable({ scope: Scope.DEFAULT })` (singleton)
- [ ] Ensure lock keys are namespaced: `pmsync:lock:{operation}:{tenantId}:{resourceId}`
- [ ] Add lock timeout: max 5 minutes (prevent deadlocks from crashed processes)
- [ ] Add lock acquisition logging at debug level
- [ ] Files: `redis-lock.service.ts`, modules that inject it

### T-1506: IMAP IDLE concurrency control [2 SP]

- [ ] Multiple IDLE connections per account can conflict — RFC 2177 allows only one per connection
- [ ] Add per-account IDLE lock: only one IDLE connection active at a time
- [ ] If sync operation needs the connection, gracefully exit IDLE first
- [ ] Track IDLE state per connection: `{ accountId, startedAt, mailbox }`
- [ ] Files: `imap.driver.ts`, `imap-sync.service.ts`

## Dependencies

- S12-S14 should be complete (driver fixes establish error patterns used here)
- Can start S15 in parallel with S14 if S12-S13 are done

## Risks

- Sandboxed workers use separate processes — increases memory usage
- Mitigation: Only sandbox critical workers; monitor memory after deployment
- Backpressure may cause job loss during peak sync
- Mitigation: Return 429 with `Retry-After` header; client can retry

## Definition of Done

- [ ] No single worker crash can take down other workers
- [ ] Queue depth is bounded per tenant
- [ ] Stalled jobs recovered up to 3 times before failing
- [ ] Bulk operations validated for tenant boundary
- [ ] Redis locks are namespaced and have timeouts
- [ ] IMAP IDLE limited to one per account
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Existing worker tests pass
- [ ] Health endpoint reports worker status
