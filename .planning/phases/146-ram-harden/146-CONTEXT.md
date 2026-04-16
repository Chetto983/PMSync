# Phase 146: RAM Harden — Redis Connection Consolidation & Memory Optimization - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce backend RAM usage on Railway by consolidating ~80+ Redis connections into ~15, replacing QueueHealthService Queue object bloat with direct Redis commands, aggressively lowering BullMQ job retention, adding global + module-level worker feature flags, and applying BullMQ production best practices (enableOfflineQueue, maxmemory-policy verification).

</domain>

<decisions>
## Implementation Decisions

### Connection Consolidation
- **D-01:** Migrate all 12 queue-enqueue services (scheduled-jobs, sla-timer, csat, reminder-notify, calendar-webhook, contacts-sync-queue, email-sync base-queue, email-sync queue, contact-embedding, email-embedding, bulk-operations-queue, stage-automation) to use `getSharedRedisConnection()` from `queue.config.ts` instead of creating standalone `new Redis()` instances.
- **D-02:** Refactor `BaseWorker` to accept a shared worker Redis connection singleton instead of each worker creating `new Redis(redisOptions)`. Create a new `getSharedWorkerConnection()` singleton in `queue.config.ts` with `maxRetriesPerRequest: null` and `lazyConnect: false`. BullMQ will internally duplicate this per-worker, yielding 1 base + N duplicates instead of N bases + N duplicates.
- **D-03:** Keep 3 standalone connections that are justified: Socket.IO adapter (pub/sub), realtime gateway counter, query-embedding-cache (separate Redis DB).
- **D-04:** Target: ~15 total Redis connections (1 shared service + 1 shared queue + 1 shared worker base + 7 worker duplicates + 3 standalone + QueueEvents if any).

### QueueHealthService Rework
- **D-05:** Remove all 30+ `new Queue()` instantiations from QueueHealthService. Replace with direct Redis commands using BullMQ's internal key patterns (`bull:{queueName}:wait` → LLEN, `bull:{queueName}:active` → LLEN, `bull:{queueName}:failed` → ZCARD, `bull:{queueName}:delayed` → ZCARD, `bull:{queueName}:completed` → ZCARD).
- **D-06:** QueueHealthService continues to use the shared BullMQ connection (via `getSharedRedisConnection()`). No separate connection needed for monitoring.
- **D-07:** Keep the existing health status API surface (QueueStatus, QueueHealthStatus, QueueMetrics interfaces) — only the internal implementation changes.

### Job Retention — Aggressive Minimal
- **D-08:** Set `removeOnComplete: true` (immediate removal) across ALL queue presets. No completed job data kept in Redis.
- **D-09:** Set `removeOnFail: { count: 20 }` across ALL queue presets. DLQ already captures failures for debugging; Redis doesn't need to hoard them.
- **D-10:** Fix BaseWorker's hardcoded override (`removeOnComplete: { count: 100 }`, `removeOnFail: { count: 50 }`) — it should respect the preset values from `QUEUE_PRESETS` instead of overriding them.

### Worker Feature Flags — Global + Module
- **D-11:** Add `WORKERS_ENABLED` global master toggle in BaseWorker. When `false`, ALL workers skip initialization. Enables "web-only" Railway replicas that serve HTTP but don't consume queues.
- **D-12:** Add module-level toggles: `EMAIL_WORKERS_ENABLED`, `CALENDAR_WORKERS_ENABLED`, `CONTACTS_WORKERS_ENABLED`, `AI_WORKERS_ENABLED`, `CRM_WORKERS_ENABLED`. Each disables all workers in that module.
- **D-13:** Hierarchy: Global `WORKERS_ENABLED` → Module toggle → Per-worker `envToggle`. If any level is `false`, worker is disabled. Per-worker toggles (existing) still work as override.

### BullMQ Production Best Practices
- **D-14:** Set `enableOfflineQueue: false` on Queue (producer) connections for fast-fail behavior when Redis is temporarily down. Keep `enableOfflineQueue: true` (default) on Worker connections so they wait indefinitely.
- **D-15:** Add a startup check in the application bootstrap (main.ts or a dedicated health module) that warns if Redis `maxmemory-policy` is not set to `noeviction`. Log at WARN level — don't block startup, but surface the misconfiguration clearly.

### Claude's Discretion
- BullMQ internal key pattern details (exact key names for LLEN/ZCARD) — Claude researches BullMQ source to find correct patterns
- Exact refactoring approach for each of the 12 queue services — some may need constructor injection changes
- Whether to add `enableOfflineQueue` at the singleton level or per-Queue instantiation
- Order of operations for the migration (which services first)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Redis & Queue Infrastructure
- `backend/src/common/config/queue.config.ts` — Shared connection singletons, QUEUE_NAMES registry, presets
- `backend/src/common/services/redis-connection.service.ts` — Non-BullMQ shared Redis connection
- `backend/src/common/services/queue-health.service.ts` — QueueHealthService to be reworked
- `backend/src/common/workers/base.worker.ts` — BaseWorker with per-worker Redis connections to consolidate

### Queue Services Creating Standalone Connections (migration targets)
- `backend/src/common/services/scheduled-jobs.queue.ts` — 2 `new Redis()` calls
- `backend/src/modules/telegram/services/reminder-notify.queue.ts` — 2 `new Redis()` calls
- `backend/src/modules/crm/ticket/services/sla-timer.service.ts` — 2 `new Redis()` calls
- `backend/src/modules/crm/ticket/services/csat.service.ts` — 2 `new Redis()` calls
- `backend/src/modules/calendar/services/abstract-calendar-webhook.service.ts` — 1 `new Redis()` call
- `backend/src/modules/calendar/services/calendar-sync-queue.service.ts` — 1 `new Redis()` call
- `backend/src/modules/contacts/services/contacts-sync-queue.service.ts` — 1 `new Redis()` call
- `backend/src/modules/email-sync/services/base-queue.service.ts` — 1 `new Redis()` call
- `backend/src/modules/email-sync/services/queue.service.ts` — 1 `new Redis()` call

### Workers (BaseWorker subclasses)
- `backend/src/modules/email-sync/workers/sync.worker.ts`
- `backend/src/modules/email-sync/workers/sync-back.worker.ts`
- `backend/src/modules/email-sync/workers/folder-operations.worker.ts`
- `backend/src/modules/email-sync/workers/email-send.worker.ts`
- `backend/src/modules/email-sync/workers/bulk-operations.worker.ts`
- `backend/src/modules/contacts/workers/contacts-sync.worker.ts`
- `backend/src/modules/calendar/workers/calendar-sync.worker.ts`

### BullMQ Official Documentation
- [Connections](https://docs.bullmq.io/guide/connections) — Connection sharing rules, maxRetriesPerRequest
- [Going to Production](https://docs.bullmq.io/guide/going-to-production) — maxmemory-policy, enableOfflineQueue, persistence
- [Reusing Redis Connections](https://docs.bullmq.io/bull/patterns/reusing-redis-connections) — Queue/Worker sharing patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getSharedRedisConnection()` in `queue.config.ts` — Singleton with ref counting, already used by some services
- `releaseSharedRedisConnection()` — Proper cleanup for shared connection
- `RedisConnectionService` — Injectable singleton for non-BullMQ Redis usage
- `QUEUE_NAMES` registry — Complete list of all 30+ queue names
- `QUEUE_PRESETS` — Centralized retention/retry configs (targets for D-08/D-09 changes)
- `BaseWorker.isEnabled()` — Existing env toggle pattern to extend for D-11/D-12/D-13

### Established Patterns
- Ref-counted singleton (`connectionRefCount` in queue.config.ts) — extend for worker connection
- `envToggle` abstract property on BaseWorker — module toggles follow same pattern
- `onModuleDestroy` cleanup in all queue services — must update to release shared connection refs

### Integration Points
- `health.controller.ts` / `health.module.ts` — Consumes QueueHealthService (API surface stays same)
- `queue-metrics.collector.ts` — Consumes QueueHealthService for Prometheus metrics
- `main.ts` — Startup location for maxmemory-policy check (D-15)

</code_context>

<specifics>
## Specific Ideas

- BullMQ docs confirm: Queue instances CAN share a single ioredis connection. Workers CAN share but each internally duplicates. QueueEvents CANNOT share.
- ioredis is single-threaded — one client handles many concurrent requests. No need for connection pooling libraries.
- Job return values accumulate in Redis memory (GitHub issue #366) — `removeOnComplete: true` is the fix.
- Redis `maxmemory-policy: noeviction` is BullMQ's ONLY required Redis config. Without it, queues silently corrupt.

</specifics>

<deferred>
## Deferred Ideas

- **Separate worker process** — Deploy "web-only" and "worker-only" Railway replicas as separate services. The global `WORKERS_ENABLED` toggle enables this but actual Railway service split is a separate ops phase.
- **Job data size optimization** — Store large payloads in Postgres/S3 and reference by ID in BullMQ jobs. Requires per-queue audit of payload sizes.
- **Redis AOF persistence tuning** — BullMQ recommends AOF with 1s fsync. Railway manages Redis config, may not be tunable.

</deferred>

---

*Phase: 146-ram-harden*
*Context gathered: 2026-04-16*
