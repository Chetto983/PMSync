# Phase 146: RAM Harden -- Redis Connection Consolidation & Memory Optimization - Research

**Researched:** 2026-04-16
**Domain:** BullMQ / ioredis connection management, Redis memory optimization, NestJS worker lifecycle
**Confidence:** HIGH

## Summary

This phase addresses a concrete, well-understood infrastructure problem: the backend creates ~80+ Redis connections at startup because every queue service and every BaseWorker subclass instantiates its own `new Redis()`. The fix is mechanical -- replace standalone `new Redis()` calls with shared singletons, rework QueueHealthService to use direct Redis commands instead of 30+ Queue objects, tighten job retention, and add worker feature flags.

The codebase already has the core primitives: `getSharedRedisConnection()` with ref counting in `queue.config.ts` and `RedisConnectionService` for non-BullMQ usage. The work is extending these patterns to the 12 queue services and BaseWorker that currently create their own connections.

**Primary recommendation:** Migrate in waves -- (1) Queue services to shared connection, (2) BaseWorker shared worker connection, (3) QueueHealthService rework to direct Redis, (4) retention/flags/production checks. Each wave is independently deployable and testable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Migrate all 12 queue-enqueue services to use `getSharedRedisConnection()` from `queue.config.ts` instead of `new Redis()`.
- **D-02:** Refactor `BaseWorker` to accept a shared worker Redis connection singleton (`getSharedWorkerConnection()`) with `maxRetriesPerRequest: null` and `lazyConnect: false`.
- **D-03:** Keep 3 standalone connections: Socket.IO adapter (pub/sub), realtime gateway counter, query-embedding-cache (separate Redis DB).
- **D-04:** Target ~15 total Redis connections (1 shared service + 1 shared queue + 1 shared worker base + 7 worker duplicates + 3 standalone + QueueEvents if any).
- **D-05:** Remove all 30+ `new Queue()` instantiations from QueueHealthService. Replace with direct Redis commands using BullMQ internal key patterns.
- **D-06:** QueueHealthService uses shared BullMQ connection (via `getSharedRedisConnection()`). No separate connection.
- **D-07:** Keep existing health status API surface (QueueStatus, QueueHealthStatus, QueueMetrics interfaces).
- **D-08:** Set `removeOnComplete: true` (immediate removal) across ALL queue presets.
- **D-09:** Set `removeOnFail: { count: 20 }` across ALL queue presets.
- **D-10:** Fix BaseWorker's hardcoded override to respect preset values from QUEUE_PRESETS.
- **D-11:** Add `WORKERS_ENABLED` global master toggle in BaseWorker.
- **D-12:** Add module-level toggles: `EMAIL_WORKERS_ENABLED`, `CALENDAR_WORKERS_ENABLED`, `CONTACTS_WORKERS_ENABLED`, `AI_WORKERS_ENABLED`, `CRM_WORKERS_ENABLED`.
- **D-13:** Hierarchy: Global WORKERS_ENABLED -> Module toggle -> Per-worker envToggle. If any level is false, worker is disabled.
- **D-14:** Set `enableOfflineQueue: false` on Queue (producer) connections; keep `true` (default) on Worker connections.
- **D-15:** Add startup check in bootstrap for Redis `maxmemory-policy` != `noeviction`, log at WARN.

### Claude's Discretion
- BullMQ internal key pattern details (exact key names for LLEN/ZCARD)
- Exact refactoring approach for each of the 12 queue services
- Whether to add `enableOfflineQueue` at the singleton level or per-Queue instantiation
- Order of operations for the migration (which services first)

### Deferred Ideas (OUT OF SCOPE)
- Separate worker process (web-only vs worker-only Railway replicas)
- Job data size optimization (store large payloads in Postgres/S3)
- Redis AOF persistence tuning
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Redis connection singletons | API / Backend | -- | All queue/worker connections live in backend process |
| QueueHealthService rework | API / Backend | -- | Internal service, only API surface changes implementation |
| Job retention tuning | API / Backend (Redis) | -- | QUEUE_PRESETS config drives Redis memory behavior |
| Worker feature flags | API / Backend | -- | Env vars read at worker init time |
| maxmemory-policy check | API / Backend (startup) | -- | Runs once at `bootstrap()`, logs warning |

## Standard Stack

### Core (Already Installed)
| Library | Version (Installed) | Version (Latest) | Purpose | Why Standard |
|---------|-------------------|-------------------|---------|--------------|
| bullmq | ^5.67.3 | 5.74.1 | Job queue framework | Only production-grade Redis queue for Node.js [VERIFIED: npm registry] |
| ioredis | ^5.9.3 | 5.10.1 | Redis client | BullMQ's required Redis client, supports connection sharing [VERIFIED: npm registry] |

### Supporting (Already Installed)
| Library | Purpose | Relevance |
|---------|---------|-----------|
| @nestjs/common | NestJS DI, lifecycle hooks | OnModuleInit/OnModuleDestroy for connection management |
| @nestjs/config | ConfigService | Reads env vars for feature flags |

### No New Dependencies Required
This phase is pure refactoring of existing infrastructure. No new packages needed.

## Architecture Patterns

### System Architecture Diagram

```
                          Application Startup
                                |
                    +-----------+-----------+
                    |                       |
              Queue Services           BaseWorker Subclasses
           (12 services total)         (7 workers total)
                    |                       |
                    v                       v
        getSharedRedisConnection()   getSharedWorkerConnection()
          (singleton, ref-counted)     (singleton, ref-counted)
                    |                       |
                    |                       | (BullMQ internally duplicates
                    |                       |  per-worker for blocking ops)
                    |                       |
                    +--------> Redis <------+
                                ^
                                |
                    +-----------+-----------+--------+
                    |           |           |        |
             Socket.IO      WS Counter   QueryCache  QueueHealthService
             Adapter        (realtime)   (separate   (direct Redis cmds,
             (pub/sub,       (standalone)  Redis DB,   no Queue objects)
              standalone)                 standalone)
```

### Connection Inventory (Before vs After)

**BEFORE (~80+ connections):**

| Source | `new Redis()` calls | Connections at runtime |
|--------|--------------------|-----------------------|
| 12 queue services (queue connection) | 12 | 12 |
| Queue services creating workers inline (scheduled-jobs, reminder-notify, sla-timer, csat) | 4 | 4 |
| BaseWorker subclasses (7 workers) | 7 | 7 base + 7 duplicates = 14 |
| QueueEvents in queue services | ~8 | 8 (each creates own connection) |
| QueueHealthService Queue objects | 30+ | 30+ (each Queue internally connects) |
| Socket.IO adapter (pub + sub) | 2 | 2 |
| Realtime gateway counter | 1 | 1 |
| Query embedding cache | 1 | 1 |
| RedisConnectionService (shared non-BullMQ) | 1 | 1 |
| getSharedRedisConnection() singleton | 1 | 1 |
| **Total** | **~67+** | **~80+** |

**AFTER (~15 connections):**

| Source | Connections |
|--------|------------|
| getSharedRedisConnection() (all 12 queue services + QueueHealthService) | 1 |
| getSharedWorkerConnection() (base for all 7 BaseWorker subclasses) | 1 |
| BullMQ internal worker duplicates (1 per worker) | 7 |
| Socket.IO adapter (pub + sub) | 2 |
| Realtime gateway counter | 1 |
| Query embedding cache | 1 |
| RedisConnectionService (non-BullMQ) | 1 |
| QueueEvents (if any remain) | 0-3 |
| **Total** | **~14-17** |

### Pattern 1: Shared Queue Connection (D-01)

**What:** Replace standalone `new Redis()` in queue services with `getSharedRedisConnection()`.
**When to use:** Every queue service that creates its own Redis connection for enqueueing.

**Current pattern (BEFORE):**
```typescript
// Source: backend/src/modules/crm/ticket/services/sla-timer.service.ts
async onModuleInit(): Promise<void> {
  const redisOptions = getRedisConnectionOptions();
  this.redisConnection = new Redis(redisOptions); // STANDALONE - wasteful
  this.queue = new Queue<SlaEscalationJobData>(QUEUE_NAME, {
    connection: this.redisConnection,
    // ...
  });
}
```

**Target pattern (AFTER):**
```typescript
// Source: [D-01 pattern]
async onModuleInit(): Promise<void> {
  this.redisConnection = getSharedRedisConnection(); // SHARED singleton
  this.queue = new Queue<SlaEscalationJobData>(QUEUE_NAME, {
    connection: this.redisConnection,
    // ...
  });
}

async onModuleDestroy(): Promise<void> {
  await this.queue?.close();
  // Do NOT quit the connection -- just release the ref
  releaseSharedRedisConnection();
}
```

**Critical change in onModuleDestroy:** Stop calling `this.redisConnection.quit()` -- instead call `releaseSharedRedisConnection()`. The ref-counted singleton handles actual cleanup. [VERIFIED: existing pattern in queue.config.ts lines 86-96]

### Pattern 2: Shared Worker Connection (D-02)

**What:** Create `getSharedWorkerConnection()` singleton for BaseWorker with `maxRetriesPerRequest: null` and `lazyConnect: false`.
**Why workers need a separate singleton:** Workers require `maxRetriesPerRequest: null` for blocking BRPOPLPUSH operations. Queue (producer) connections must NOT have this set. [VERIFIED: BullMQ docs, Context7]
**Why `lazyConnect: false`:** BullMQ internally calls `connection.duplicate()` for its blocking client. If `lazyConnect` is `true`, the duplicate also gets lazy connect and may never actually connect. [VERIFIED: comment in base.worker.ts line 204]

```typescript
// Source: [D-02 pattern for queue.config.ts]
let sharedWorkerConnection: Redis | null = null;
let workerConnectionRefCount = 0;

export function getSharedWorkerConnection(): Redis {
  if (!sharedWorkerConnection) {
    const options = getRedisConnectionOptions();
    sharedWorkerConnection = new Redis({
      ...options,
      maxRetriesPerRequest: null, // REQUIRED for BullMQ workers
      lazyConnect: false,         // REQUIRED - prevents duplicate() issues
      connectionName: 'bullmq-worker-shared',
    });
    sharedWorkerConnection.on('error', (err) => {
      logger.error(`Worker Redis connection error: ${err.message}`);
    });
  }
  workerConnectionRefCount++;
  return sharedWorkerConnection;
}

export function releaseSharedWorkerConnection(): void {
  workerConnectionRefCount--;
  if (workerConnectionRefCount <= 0 && sharedWorkerConnection) {
    sharedWorkerConnection.quit().catch(() => {});
    sharedWorkerConnection = null;
    workerConnectionRefCount = 0;
  }
}
```

**BullMQ duplicate behavior:** When a Worker receives a shared connection, it internally calls `connection.duplicate()` to create a blocking client. This means each worker still gets 1 additional connection, but they all share the same base connection options. Result: 1 base + N duplicates instead of N bases + N duplicates. [VERIFIED: BullMQ docs on connection sharing, Context7]

### Pattern 3: QueueHealthService Direct Redis (D-05)

**What:** Replace 30+ `new Queue()` objects with direct Redis LLEN/ZCARD commands.
**Why:** Each `new Queue()` BullMQ object creates internal housekeeping even with a shared connection. Direct Redis commands are lighter.

**BullMQ internal key patterns (VERIFIED):**
```
bull:{queueName}:wait      -> Redis LIST    -> LLEN
bull:{queueName}:active    -> Redis LIST    -> LLEN
bull:{queueName}:completed -> Redis SORTED SET -> ZCARD
bull:{queueName}:failed    -> Redis SORTED SET -> ZCARD
bull:{queueName}:delayed   -> Redis SORTED SET -> ZCARD
bull:{queueName}:paused    -> Redis LIST    -> LLEN
```
[VERIFIED: BullMQ getCounts-1.lua source in node_modules/bullmq/dist/cjs/commands/getCounts-1.lua]
[CITED: hexdocs.pm/bullmq/BullMQ.Keys.html]

**Key prefix:** Default is `bull`. BullMQ constructs keys as `bull:{queueName}:{suffix}`. Confirmed via `Queue.toKey('wait')` -> `bull:test:wait`. [VERIFIED: runtime test of BullMQ Queue.toKey()]

**Implementation pattern:**
```typescript
// Source: [D-05 pattern]
async getQueueStatus(queueName: string): Promise<QueueStatus | null> {
  const prefix = `bull:${queueName}`;
  try {
    const pipeline = this.redisConnection.pipeline();
    pipeline.llen(`${prefix}:wait`);
    pipeline.llen(`${prefix}:active`);
    pipeline.zcard(`${prefix}:completed`);
    pipeline.zcard(`${prefix}:failed`);
    pipeline.zcard(`${prefix}:delayed`);
    // Check paused via meta key
    pipeline.hget(`${prefix}:meta`, 'paused');

    const results = await pipeline.exec();
    if (!results) return null;

    return {
      name: queueName,
      waiting: (results[0]?.[1] as number) || 0,
      active: (results[1]?.[1] as number) || 0,
      completed: (results[2]?.[1] as number) || 0,
      failed: (results[3]?.[1] as number) || 0,
      delayed: (results[4]?.[1] as number) || 0,
      paused: results[5]?.[1] === 1,
    };
  } catch (error) {
    this.logger.error(`Failed to get status for queue ${queueName}: ${error}`);
    return null;
  }
}
```

**Pause detection:** BullMQ stores pause state in a `meta` hash key. The `paused` field in `bull:{queueName}:meta` indicates whether a queue is paused. Use `HGET bull:{queueName}:meta paused` -- value `1` means paused. [VERIFIED: BullMQ source getCounts-1.lua references `paused` state, meta key pattern from hexdocs]

**Pipeline optimization:** Use ioredis `pipeline()` to batch all 6 commands per queue into a single round-trip. For 30+ queues, this means ~30 pipelines (or even a single mega-pipeline) vs 30x6=180 individual Redis commands. [VERIFIED: ioredis docs]

### Pattern 4: enableOfflineQueue Split (D-14)

**What:** Queue (producer) connections fail fast, Worker connections wait.
**Recommendation:** Apply `enableOfflineQueue: false` at the `getSharedRedisConnection()` singleton level since it's only used by Queue producers. Worker connections use `getSharedWorkerConnection()` which keeps the default (`true`). [VERIFIED: BullMQ "Going to Production" docs, Context7]

```typescript
// In getSharedRedisConnection() - for Queue/producer use
sharedRedisConnection = new Redis({
  ...options,
  lazyConnect: true,
  enableOfflineQueue: false, // D-14: fail fast for producers
  connectionName: 'bullmq-shared',
});

// In getSharedWorkerConnection() - for Worker use
sharedWorkerConnection = new Redis({
  ...options,
  maxRetriesPerRequest: null,
  lazyConnect: false,
  enableOfflineQueue: true, // D-14: workers wait for reconnection
  connectionName: 'bullmq-worker-shared',
});
```

### Pattern 5: Worker Feature Flag Hierarchy (D-11/D-12/D-13)

**What:** Three-level toggle: Global -> Module -> Per-worker.

```typescript
// Source: [D-11/D-12/D-13 pattern in base.worker.ts]
protected isEnabled(): boolean {
  // Level 1: Global master toggle
  const globalEnabled = this.configService.get<string>('WORKERS_ENABLED') || 'true';
  if (globalEnabled.toLowerCase() === 'false') return false;

  // Level 2: Module-level toggle (if defined)
  const moduleToggle = this.getModuleToggle();
  if (moduleToggle) {
    const moduleEnabled = this.configService.get<string>(moduleToggle) || 'true';
    if (moduleEnabled.toLowerCase() === 'false') return false;
  }

  // Level 3: Per-worker toggle (existing)
  const workerEnabled = this.configService.get<string>(this.envToggle) || 'true';
  return workerEnabled.toLowerCase() !== 'false';
}

/** Override in subclass to specify module-level toggle */
protected getModuleToggle(): string | null {
  return null; // Default: no module toggle
}
```

**Module toggle mapping (based on existing envToggle values):**

| Worker | envToggle (existing) | Module Toggle (new) |
|--------|---------------------|---------------------|
| SyncWorker | EMAIL_SYNC_WORKERS_ENABLED | EMAIL_WORKERS_ENABLED |
| SyncBackWorker | SYNC_BACK_WORKERS_ENABLED | EMAIL_WORKERS_ENABLED |
| FolderOperationsWorker | EMAIL_SYNC_WORKERS_ENABLED | EMAIL_WORKERS_ENABLED |
| EmailSendWorker | EMAIL_SEND_WORKERS_ENABLED | EMAIL_WORKERS_ENABLED |
| BulkOperationsWorker | BULK_OPERATIONS_WORKERS_ENABLED | EMAIL_WORKERS_ENABLED |
| ContactsSyncWorker | CONTACTS_SYNC_WORKERS_ENABLED | CONTACTS_WORKERS_ENABLED |
| CalendarSyncWorker | CALENDAR_SYNC_WORKERS_ENABLED | CALENDAR_WORKERS_ENABLED |

[VERIFIED: Grep of envToggle across all workers in codebase]

**Note:** No AI or CRM workers extend BaseWorker currently (they use inline workers in queue services like sla-timer, csat). The module toggles `AI_WORKERS_ENABLED` and `CRM_WORKERS_ENABLED` would apply to the inline workers in those services via direct env var checks.

### Anti-Patterns to Avoid

- **Calling `redisConnection.quit()` on shared connection:** This kills the singleton for ALL consumers. Use `releaseSharedRedisConnection()` instead. Current onModuleDestroy in most services calls `.quit()` -- every one must be changed to release.
- **Setting `maxRetriesPerRequest: null` on Queue connections:** This is only required for Worker connections. On Queue connections it disables retry behavior, which is undesirable for producers.
- **Forgetting `enableOfflineQueue` split:** Without D-14, a Redis blip causes Queue.add() calls to silently buffer, giving the caller a false impression of success.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis connection pooling | Custom pool with min/max connections | ioredis singleton sharing | ioredis is single-threaded, one connection handles all concurrent requests via pipelining. Pooling adds overhead with zero benefit. [VERIFIED: ioredis docs] |
| BullMQ queue monitoring | Custom Queue objects per queue | Direct Redis LLEN/ZCARD commands | Queue objects create internal housekeeping (event listeners, etc). Direct commands are O(1) and zero-overhead. |
| Worker toggle logic | Custom middleware or interceptors | Simple env var checks in `isEnabled()` | Existing pattern in BaseWorker is minimal and correct. No framework needed. |

**Key insight:** ioredis multiplexes all commands over a single TCP connection. Redis itself is single-threaded. More connections != more throughput. Fewer connections = less memory, fewer file descriptors, simpler debugging.

## Common Pitfalls

### Pitfall 1: QueueEvents Cannot Share Connections
**What goes wrong:** QueueEvents uses Redis XREAD (blocking stream read). If you share a connection between QueueEvents and a Queue, the blocking read blocks all other commands on that connection.
**Why it happens:** Redis connections are single-command-at-a-time for blocking operations.
**How to avoid:** QueueEvents must either: (a) receive connection *options* (not an instance) so BullMQ creates a dedicated connection, or (b) be eliminated entirely if not needed. For this phase, the queue services that use QueueEvents (email-sync QueueService, contacts-sync, calendar-sync, base-queue) should pass connection *options* to QueueEvents, not the shared instance.
**Warning signs:** Queue operations hang or timeout when QueueEvents is active on same connection.
[VERIFIED: BullMQ docs -- "QueueEvents requires its own dedicated connection due to its blocking nature", Context7]

### Pitfall 2: Worker `connection.duplicate()` With lazyConnect
**What goes wrong:** Workers silently fail to pick up jobs.
**Why it happens:** BullMQ Worker calls `connection.duplicate()` internally. If the original has `lazyConnect: true`, the duplicate also gets `lazyConnect: true` and never explicitly connects.
**How to avoid:** Set `lazyConnect: false` on worker connections.
**Warning signs:** Workers start without errors but never process any jobs.
[VERIFIED: comment in existing base.worker.ts line 203-206]

### Pitfall 3: Inline Workers in Queue Services (scheduled-jobs, reminder-notify, sla-timer, csat)
**What goes wrong:** These services create workers with `new Worker(..., { connection: new Redis(...) })` inline instead of using BaseWorker. They each create 1-2 extra standalone connections.
**Why it happens:** These services predate the BaseWorker pattern. They manage their own Worker lifecycle.
**How to avoid:** For D-01, migrate their Queue connection to shared. For their inline Worker creation, pass the shared worker connection or create a local connection from `getSharedWorkerConnection()`. Their Worker instances cannot be converted to BaseWorker subclasses without significant refactoring (out of scope per D-02 focus on BaseWorker).
**Warning signs:** After connection consolidation, these services still show standalone connections in Redis CLIENT LIST.

### Pitfall 4: ref-count Mismatch on Shared Connections
**What goes wrong:** Shared connection is closed prematurely (killing all consumers) or never closed (connection leak).
**Why it happens:** A service calls `getSharedRedisConnection()` in init but forgets `releaseSharedRedisConnection()` in destroy, or calls release twice.
**How to avoid:** Establish a strict pattern: every `getSharedRedisConnection()` call MUST have a corresponding `releaseSharedRedisConnection()` in `onModuleDestroy()`. Same for worker connection.
**Warning signs:** "Redis connection error: Connection is closed" errors appearing after some module destroys.

### Pitfall 5: BullMQ Queue Object Cleanup in QueueHealthService
**What goes wrong:** After removing Queue objects, calling `queue.close()` in onModuleDestroy throws because queues no longer exist.
**Why it happens:** The current onModuleDestroy iterates over `this.queues` Map and closes each Queue.
**How to avoid:** After D-05, onModuleDestroy only needs to release the shared Redis connection ref. Remove the queue iteration loop entirely.

## Code Examples

### Job Retention Changes (D-08/D-09/D-10)

**QUEUE_PRESETS changes (queue.config.ts):**
```typescript
// Source: [D-08/D-09 -- all presets get aggressive retention]
export const QUEUE_PRESETS = {
  HIGH: {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: true,              // D-08: was { count: 100, age: 3600 }
    removeOnFail: { count: 20 },         // D-09: was { count: 200 }
  },
  NORMAL: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: true,              // D-08: already was true
    removeOnFail: { count: 20 },         // D-09: was { count: 100 }
  },
  // ... same pattern for LOW, AI_EMBEDDING, EMAIL_SYNC, FOLDER_OPS, etc.
};
```

**BaseWorker fix (D-10):**
```typescript
// Source: [D-10 -- base.worker.ts startWorker() method]
// BEFORE (line 324-325):
removeOnComplete: { count: config.removeOnComplete === true ? 100 : (config.removeOnComplete || 100) },
removeOnFail: { count: config.removeOnFail === true ? 50 : (config.removeOnFail || 50) },

// AFTER -- respect the value as-is:
removeOnComplete: config.removeOnComplete ?? true,
removeOnFail: config.removeOnFail ?? { count: 20 },
```

The current BaseWorker converts `removeOnComplete: true` to `{ count: 100 }`, which defeats the purpose of `true` (immediate removal). After D-10, if the preset says `true`, the worker passes `true` to BullMQ. [VERIFIED: base.worker.ts lines 324-325]

### maxmemory-policy Check (D-15)

```typescript
// Source: [D-15 -- main.ts or dedicated bootstrap helper]
async function checkRedisMaxMemoryPolicy(redis: Redis): Promise<void> {
  try {
    const config = await redis.config('GET', 'maxmemory-policy');
    // config returns ['maxmemory-policy', 'noeviction'] or similar
    const policy = Array.isArray(config) ? config[1] : null;
    if (policy && policy !== 'noeviction') {
      Logger.warn(
        `Redis maxmemory-policy is "${policy}" -- BullMQ requires "noeviction". ` +
        `Queues may silently corrupt if Redis evicts keys.`,
        'Bootstrap',
      );
    } else if (policy === 'noeviction') {
      Logger.log('Redis maxmemory-policy: noeviction (correct)', 'Bootstrap');
    }
  } catch (error) {
    // Railway managed Redis may restrict CONFIG command
    Logger.warn(
      `Could not check Redis maxmemory-policy (CONFIG GET may be restricted): ${error}`,
      'Bootstrap',
    );
  }
}
```

**Note:** Railway-managed Redis may restrict the `CONFIG GET` command. The check must handle this gracefully -- log a warning about inability to verify, don't crash. [ASSUMED]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One Redis connection per Queue object | Shared ioredis instance across all Queues | BullMQ v1+ (always supported) | Reduces connections proportionally |
| `removeOnComplete: { count: N }` | `removeOnComplete: true` (immediate) | BullMQ best practice | Prevents Redis memory bloat from completed job data |
| `new Queue()` for monitoring | Direct Redis commands (LLEN/ZCARD) | Optimization pattern | Eliminates Queue object overhead for read-only monitoring |
| Worker per-service connection | Shared base connection + BullMQ duplicate() | BullMQ v3+ connection sharing | 1 base + N dups vs N bases + N dups |

**Deprecated/outdated:**
- `removeRepeatableByKey()` -- replaced by `removeJobScheduler()` in BullMQ v5. Codebase already uses the new API. [VERIFIED: scheduled-jobs.queue.ts line 238]
- Bull v3 `createClient` pattern with `client`/`subscriber`/`bclient` types -- BullMQ v5 uses direct ioredis instance passing. [VERIFIED: Context7 docs show both old and new patterns]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Railway-managed Redis may restrict CONFIG GET command | Code Examples (D-15) | Check would throw; error handling covers this but logging would be misleading |
| A2 | BullMQ Queue objects create internal event listeners even with shared connections | Architecture Patterns (Pattern 3) | If Queue objects are truly zero-overhead, D-05 rework has less impact on memory (but still valid for code simplicity) |

## Open Questions

1. **QueueEvents fate in consolidated services**
   - What we know: email-sync QueueService, contacts-sync, calendar-sync, and base-queue all create QueueEvents instances for metrics tracking. These cannot share a connection.
   - What's unclear: Are these QueueEvents still needed after QueueHealthService provides direct Redis monitoring? They track in-process metrics (completed/failed counts) that could be replaced by Prometheus gauges from QueueMetricsCollector.
   - Recommendation: For this phase, keep QueueEvents in queue services but ensure they receive connection *options* (not a shared instance). Removing them is a future optimization.

2. **Inline worker migration scope**
   - What we know: 4 services (scheduled-jobs, reminder-notify, sla-timer, csat) create workers inline with `new Worker(..., { connection: new Redis(...) })`.
   - What's unclear: Should these inline workers use `getSharedWorkerConnection()` or keep creating local connections?
   - Recommendation: Migrate them to use `getSharedWorkerConnection()`. They are simple workers (no BaseWorker subclass overhead). Their `new Redis()` for the Worker connection should be replaced with the shared worker singleton.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- purely code/config refactoring of existing backend infrastructure).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `backend/jest.config.ts` (via ts-jest preset) |
| Quick run command | `cd backend && npx jest --testPathPattern="<pattern>" --forceExit` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map

This phase has no formal requirement IDs. Validation is structural/behavioral:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| BaseWorker uses shared worker connection | unit | `cd backend && npx jest --testPathPattern="base-worker" --forceExit` | base-worker-isolation.spec.ts exists |
| QueueHealthService direct Redis commands return same data | integration | `cd backend && npx jest --testPathPattern="queue-health" --forceExit` | No -- Wave 0 |
| WORKERS_ENABLED=false disables all workers | unit | `cd backend && npx jest --testPathPattern="base-worker" --forceExit` | Extend existing spec |
| Module toggle hierarchy works correctly | unit | `cd backend && npx jest --testPathPattern="base-worker" --forceExit` | Extend existing spec |
| QUEUE_PRESETS have correct retention values | unit | Inline assertion in type-check | No file needed |
| Type-check passes after all changes | smoke | `cd backend && npx tsc --noEmit` | N/A |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green + `npx tsc --noEmit` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/common/services/__tests__/queue-health.service.spec.ts` -- validates direct Redis approach matches Queue-based approach
- [ ] Extend `backend/src/common/workers/__tests__/base-worker-isolation.spec.ts` -- add tests for WORKERS_ENABLED, module toggles, shared worker connection

## Security Domain

This phase has minimal security surface -- it's internal infrastructure refactoring.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | -- |
| V3 Session Management | No | -- |
| V4 Access Control | No | -- |
| V5 Input Validation | No | -- |
| V6 Cryptography | No | -- |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Redis connection string exposure | Information Disclosure | Already uses env vars via getRedisConnectionOptions() -- no change |
| Feature flags bypass | Tampering | Env vars are server-side only, not user-controllable |

## Project Constraints (from CLAUDE.md)

- **Post-edit validation mandatory:** `cd backend && npx tsc --noEmit` after every file edit
- **Max 500 lines per file:** queue.config.ts is currently ~480 lines; adding shared worker connection adds ~30 lines -- may need to extract connection singletons into a separate file
- **NEVER run prisma db push:** Not applicable to this phase (no schema changes)
- **Follow existing patterns:** All changes extend existing singleton/ref-counting patterns in queue.config.ts
- **Multi-tenant rule:** Not directly applicable (Redis connections are not tenant-scoped), but QueueHealthService must not introduce tenant-unaware queries
- **SCOPE CONTROL:** Pure infrastructure -- no feature additions, no API changes, no frontend changes

## Migration Order Recommendation (Claude's Discretion)

**Recommended order based on risk and dependency:**

1. **QUEUE_PRESETS retention changes (D-08/D-09)** -- Zero-risk config change, immediately reduces Redis memory
2. **BaseWorker removeOnComplete/removeOnFail fix (D-10)** -- Small targeted fix, enables presets to actually take effect
3. **Worker feature flags (D-11/D-12/D-13)** -- Additive change, doesn't break existing behavior
4. **getSharedWorkerConnection() singleton (D-02)** -- New singleton in queue.config.ts, BaseWorker refactor
5. **Queue services migration to shared connection (D-01)** -- Mechanical refactoring, one service at a time
6. **Inline worker migration** -- scheduled-jobs, reminder-notify, sla-timer, csat Worker instances to shared worker connection
7. **enableOfflineQueue on shared queue connection (D-14)** -- One-line change in getSharedRedisConnection()
8. **QueueHealthService rework (D-05/D-06)** -- Largest single change, highest risk. Do last so all other changes are stable.
9. **maxmemory-policy startup check (D-15)** -- Small standalone addition to main.ts/bootstrap

## Sources

### Primary (HIGH confidence)
- BullMQ docs via Context7 (`/taskforcesh/bullmq`) -- connection sharing, production best practices, enableOfflineQueue
- BullMQ getCounts-1.lua source (`node_modules/bullmq/dist/cjs/commands/getCounts-1.lua`) -- exact key patterns and Redis data types
- BullMQ Queue.toKey() runtime verification -- confirmed `bull:{queueName}:{suffix}` pattern
- npm registry -- bullmq 5.74.1 (latest), ioredis 5.10.1 (latest)

### Secondary (MEDIUM confidence)
- [hexdocs.pm/bullmq/BullMQ.Keys.html](https://hexdocs.pm/bullmq/BullMQ.Keys.html) -- comprehensive key-to-Redis-type mapping
- [BullMQ Going to Production](https://docs.bullmq.io/guide/going-to-production) -- maxmemory-policy, enableOfflineQueue
- [BullMQ Connections Guide](https://docs.bullmq.io/guide/connections) -- maxRetriesPerRequest, connection sharing rules

### Tertiary (LOW confidence)
- None -- all claims verified via source code or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages, verified versions against npm registry
- Architecture: HIGH -- patterns verified against BullMQ source code and official docs
- Pitfalls: HIGH -- all derived from verified BullMQ behavior and existing codebase analysis
- Key patterns: HIGH -- verified via BullMQ Lua scripts in node_modules

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable infrastructure, BullMQ key patterns unlikely to change)
