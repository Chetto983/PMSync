# Phase 146: RAM Harden -- Redis Connection Consolidation & Memory Optimization - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 17 modified files + 2 new test files
**Analogs found:** 17 / 19

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/common/config/redis-connections.ts` | config | singleton-factory | `queue.config.ts` (same pattern) | exact |
| `backend/src/common/config/queue.config.ts` | config | singleton-factory | itself (extend existing) | exact |
| `backend/src/common/workers/base.worker.ts` | middleware | event-driven | itself (refactor) | exact |
| `backend/src/common/services/queue-health.service.ts` | service | request-response | itself (rewrite internals) | exact |
| `backend/src/common/services/scheduled-jobs.queue.ts` | service | CRUD | `sla-timer.service.ts` (same inline-worker pattern) | exact |
| `backend/src/modules/telegram/services/reminder-notify.queue.ts` | service | CRUD | `scheduled-jobs.queue.ts` (same inline-worker pattern) | exact |
| `backend/src/modules/crm/ticket/services/sla-timer.service.ts` | service | CRUD | `csat.service.ts` (identical structure) | exact |
| `backend/src/modules/crm/ticket/services/csat.service.ts` | service | CRUD | `sla-timer.service.ts` (identical structure) | exact |
| `backend/src/modules/crm/automation/stage-automation.service.ts` | service | CRUD | `sla-timer.service.ts` (Queue-only, same CRM module) | exact |
| `backend/src/modules/calendar/services/abstract-calendar-webhook.service.ts` | service | event-driven | `sla-timer.service.ts` (same Queue+Worker init) | role-match |
| `backend/src/modules/calendar/services/calendar-sync-queue.service.ts` | service | CRUD | `contacts-sync-queue.service.ts` (identical tri-queue) | exact |
| `backend/src/modules/contacts/services/contacts-sync-queue.service.ts` | service | CRUD | `calendar-sync-queue.service.ts` (identical tri-queue) | exact |
| `backend/src/modules/email-sync/services/base-queue.service.ts` | service | CRUD | itself (abstract base, refactor) | exact |
| `backend/src/modules/email-sync/services/queue.service.ts` | service | CRUD | `contacts-sync-queue.service.ts` (same tri-queue) | exact |
| `backend/src/modules/email-sync/workers/sync.worker.ts` | middleware | event-driven | `contacts-sync.worker.ts` (BaseWorker subclass) | exact |
| `backend/src/modules/contacts/workers/contacts-sync.worker.ts` | middleware | event-driven | `sync.worker.ts` (BaseWorker subclass) | exact |
| `backend/src/modules/calendar/workers/calendar-sync.worker.ts` | middleware | event-driven | `sync.worker.ts` (BaseWorker subclass) | exact |
| `backend/src/main.ts` | config | bootstrap | itself (add startup check) | exact |
| `backend/src/common/workers/__tests__/base-worker-isolation.spec.ts` | test | unit | itself (extend) | exact |
| `backend/src/common/services/__tests__/queue-health.service.spec.ts` | test | unit | `base-worker-isolation.spec.ts` | role-match |

## Pattern Assignments

### `backend/src/common/config/redis-connections.ts` (config, singleton-factory -- NEW)

**Analog:** `queue.config.ts` -- extracted from the existing shared connection singleton pattern.

This new file holds all Redis connection singletons extracted from queue.config.ts to keep queue.config.ts under the 500-line CLAUDE.md hard limit. Contains `getSharedRedisConnection()` (moved from queue.config.ts, with `enableOfflineQueue: false` added per D-14) and the new `getSharedWorkerConnection()` (D-02, with `maxRetriesPerRequest: null`, `lazyConnect: false`, `enableOfflineQueue: true`). Both use the same ref-counted singleton pattern. queue.config.ts re-exports all 6 functions from this file.

---

### `backend/src/common/config/queue.config.ts` (config, singleton-factory)

**Analog:** Itself -- extend the existing `getSharedRedisConnection()` pattern.

**Existing shared connection singleton pattern** (lines 51-96):
```typescript
let sharedRedisConnection: Redis | null = null;
let connectionRefCount = 0;

export function getSharedRedisConnection(): Redis {
  if (!sharedRedisConnection) {
    const options = getRedisConnectionOptions();
    sharedRedisConnection = new Redis({
      ...options,
      lazyConnect: true,
      connectionName: 'bullmq-shared',
    });
    sharedRedisConnection.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });
    sharedRedisConnection.on('connect', () => {
      logger.log('Redis connected');
    });
  }
  connectionRefCount++;
  return sharedRedisConnection;
}

export function releaseSharedRedisConnection(): void {
  connectionRefCount--;
  if (connectionRefCount <= 0 && sharedRedisConnection) {
    sharedRedisConnection.quit().catch(() => {});
    sharedRedisConnection = null;
    connectionRefCount = 0;
  }
}
```

**D-02 new addition: Copy this exact pattern for worker connection**, but with `maxRetriesPerRequest: null` and `lazyConnect: false`. Place immediately after `forceCloseSharedRedisConnection()` (line 107).

**D-14 modification:** Add `enableOfflineQueue: false` to line 64 inside `getSharedRedisConnection()`.

**D-08/D-09 modification: QUEUE_PRESETS retention values** (lines 130-260):
- Current HIGH preset (lines 142-143): `removeOnComplete: { count: 100, age: 3600 }`, `removeOnFail: { count: 200 }`
- Target: All presets get `removeOnComplete: true` and `removeOnFail: { count: 20 }`

---

### `backend/src/common/workers/base.worker.ts` (middleware, event-driven)

**Analog:** Itself -- refactor internals.

**D-10: removeOnComplete/removeOnFail hardcode override** (lines 324-325):
```typescript
// CURRENT (BUG -- defeats removeOnComplete: true from presets):
removeOnComplete: { count: config.removeOnComplete === true ? 100 : (config.removeOnComplete || 100) },
removeOnFail: { count: config.removeOnFail === true ? 50 : (config.removeOnFail || 50) },
```
Replace with passthrough that respects the preset value as-is.

**D-02: Redis connection creation** (lines 207-212):
```typescript
// CURRENT -- standalone connection per worker:
const redisOptions = {
  ...getRedisConnectionOptions(),
  connectionName: `${this.workerName}-worker`,
  lazyConnect: false,
};
this.redisConnection = new Redis(redisOptions);
```
Replace with `getSharedWorkerConnection()` call.

**D-02: onModuleDestroy cleanup** (lines 454-465):
```typescript
// CURRENT -- quits standalone connection:
if (
  this.redisConnection &&
  this.redisConnection.status !== 'end' &&
  this.redisConnection.status !== 'close'
) {
  try {
    await this.redisConnection.quit();
  } catch (error) { ... }
}
```
Replace `this.redisConnection.quit()` with `releaseSharedWorkerConnection()`.

**D-11/D-12/D-13: isEnabled() hierarchy** (lines 167-170):
```typescript
// CURRENT -- single-level toggle:
protected isEnabled(): boolean {
  const value = this.configService.get<string>(this.envToggle) || 'true';
  return value.toLowerCase() !== 'false';
}
```
Expand to three-level check: `WORKERS_ENABLED` -> `getModuleToggle()` -> `this.envToggle`.

---

### `backend/src/common/services/queue-health.service.ts` (service, request-response)

**Analog:** Itself -- replace Queue objects with direct Redis commands.

**Current onModuleInit creates 30+ Queue objects** (lines 97-115):
```typescript
async onModuleInit() {
  this.redisConnection = getSharedRedisConnection();
  const queueNames = Object.values(QUEUE_NAMES);
  for (const name of queueNames) {
    try {
      const queue = new Queue(name, {
        connection: this.redisConnection,
      });
      this.queues.set(name, queue);
    } catch (error) { ... }
  }
}
```
Replace: Remove `queues` Map entirely. Store only `redisConnection` and list of queue names.

**Current getQueueStatus uses Queue API** (lines 190-219):
```typescript
async getQueueStatus(queueName: string): Promise<QueueStatus | null> {
  const queue = this.queues.get(queueName);
  if (!queue) return null;
  try {
    const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);
    return { name: queueName, waiting, active, completed, failed, delayed, paused: isPaused };
  } catch (error) { ... }
}
```
Replace with direct Redis pipeline commands (`LLEN`, `ZCARD`, `HGET`).

**Current onModuleDestroy closes all Queue objects** (lines 319-337):
```typescript
async onModuleDestroy() {
  for (const [name, queue] of this.queues) {
    try { await queue.close(); } catch (error) { ... }
  }
  this.queues.clear();
  releaseSharedRedisConnection();
}
```
Replace: Remove queue close loop. Keep only `releaseSharedRedisConnection()`.

**Interfaces to KEEP unchanged** (lines 12-58):
```typescript
export interface QueueStatus { ... }
export interface QueueHealthStatus { ... }
export interface QueueMetrics { ... }
```
D-07: These interfaces are the public API contract. Only the internal implementation changes.

**Consumer 1:** `health.controller.ts` line 17 -- injects `QueueHealthService`, calls `getHealthStatus()`, `getQueueStatuses()`.
**Consumer 2:** `queue-metrics.collector.ts` line 31 -- injects `QueueHealthService`, calls `getQueueStatuses()`.

---

### `backend/src/common/services/scheduled-jobs.queue.ts` (service, CRUD -- inline worker)

**Analog:** `backend/src/modules/crm/ticket/services/sla-timer.service.ts` (identical pattern).

**Queue connection creation pattern** (line 146):
```typescript
const redisOptions = getRedisConnectionOptions();
this.redisConnection = new Redis(redisOptions);
```
Replace with `getSharedRedisConnection()`.

**Inline Worker connection creation** (lines 175-183):
```typescript
this.worker = new Worker<ScheduledJobData>(
  QUEUE_NAMES.SYNC_SCHEDULER,
  async (job) => this.processJob(job),
  {
    connection: new Redis(redisOptions),  // STANDALONE -- wasteful
    concurrency: 1,
    lockDuration: 300000,
  },
);
```
Replace `new Redis(redisOptions)` with `getSharedWorkerConnection()`.

**Cleanup pattern** (lines 207-211):
```typescript
async onModuleDestroy() {
  await this.worker?.close();
  await this.queue?.close();
  await this.redisConnection?.quit();  // WRONG for shared connection
}
```
Replace `this.redisConnection?.quit()` with `releaseSharedRedisConnection()`. Add `releaseSharedWorkerConnection()` for the worker connection.

---

### `backend/src/modules/crm/ticket/services/sla-timer.service.ts` (service, CRUD -- inline worker)

**Analog:** `backend/src/modules/crm/ticket/services/csat.service.ts` (identical pattern).

**Queue connection** (lines 44-45):
```typescript
const redisOptions = getRedisConnectionOptions();
this.redisConnection = new Redis(redisOptions);
```

**Inline worker with separate connection** (lines 57-64):
```typescript
this.worker = new Worker<SlaEscalationJobData>(
  QUEUE_NAME,
  (job) => this.processEscalation(job),
  {
    connection: new Redis(redisOptions),
    concurrency: scaleForReplicas(5),
  },
);
```

**Cleanup** (lines 75-85):
```typescript
async onModuleDestroy(): Promise<void> {
  if (this.worker) await this.worker.close();
  if (this.queue) await this.queue.close();
  if (this.redisConnection && this.redisConnection.status !== 'end' && ...) {
    await this.redisConnection.quit();
  }
}
```
Same mechanical migration as scheduled-jobs: shared queue connection + shared worker connection + release instead of quit.

---

### `backend/src/modules/crm/ticket/services/csat.service.ts` (service, CRUD -- inline worker)

**Analog:** `sla-timer.service.ts` -- identical pattern, same migration.

**Queue connection** (lines 47-48): `new Redis(redisOptions)` -> `getSharedRedisConnection()`
**Worker connection** (line 61): `new Redis(redisOptions)` -> `getSharedWorkerConnection()`
**Cleanup** (lines 76-86): `.quit()` -> `releaseSharedRedisConnection()` + `releaseSharedWorkerConnection()`

---

### `backend/src/modules/crm/automation/stage-automation.service.ts` (service, CRUD -- Queue-only)

**Analog:** `sla-timer.service.ts` (same CRM module, simpler -- Queue-only, no inline Worker).

**Current Queue creation with connection options** (lines 15-27):
```typescript
this.queue = new Queue<StageAutomationJobData>(
  QUEUE_NAMES.CRM_STAGE_AUTOMATION,
  {
    connection: getRedisConnectionOptions(),  // passes options, not instance
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,   // D-08 violation: should be true
      removeOnFail: 50,        // D-09 violation: should be { count: 20 }
    },
  },
);
```

**Migration:**
- Replace `connection: getRedisConnectionOptions()` with `connection: getSharedRedisConnection()`
- Remove hardcoded `removeOnComplete: 100` and `removeOnFail: 50` -- use QUEUE_PRESETS values via `getDefaultJobOptions()` or inline `removeOnComplete: true`, `removeOnFail: { count: 20 }`
- Add `releaseSharedRedisConnection()` in `onModuleDestroy()`
- Add `CRM_WORKERS_ENABLED` env check (this service runs a Queue in the CRM module)
- No Worker connection needed (Queue-only service) -- no `getSharedWorkerConnection()` call

---

### `backend/src/modules/telegram/services/reminder-notify.queue.ts` (service, CRUD -- inline worker)

**Analog:** `scheduled-jobs.queue.ts` -- same split init (onModuleInit creates Queue, onApplicationBootstrap creates Worker).

**Queue connection** (lines 58-59):
```typescript
const redisOptions = getRedisConnectionOptions();
this.redisConnection = new Redis(redisOptions);
```

**Worker connection in onApplicationBootstrap** (lines 83-88):
```typescript
const redisOptions = getRedisConnectionOptions();
this.worker = new Worker<ReminderNotifyJobData>(
  QUEUE_NAMES.REMINDER_NOTIFY,
  async (job) => this.processNotification(job),
  {
    connection: new Redis(redisOptions),
    concurrency: 5,
    lockDuration: 30000,
  },
);
```

**Cleanup** (lines 111-115):
```typescript
async onModuleDestroy() {
  await this.worker?.close();
  await this.queue?.close();
  await this.redisConnection?.quit();
}
```

Same migration: shared queue + shared worker + release.

---

### `backend/src/modules/calendar/services/abstract-calendar-webhook.service.ts` (service, event-driven)

**Analog:** `sla-timer.service.ts` (same Queue + inline Worker pattern).

**Queue + Worker init** (lines 120-144):
```typescript
const redisOptions = getRedisConnectionOptions();
this.redisConnection = new Redis(redisOptions);

this.maintenanceQueue = new Queue(QUEUE_NAMES.WEBHOOK_MAINTENANCE, {
  connection: this.redisConnection,
  ...
});

this.maintenanceWorker = new Worker(
  QUEUE_NAMES.WEBHOOK_MAINTENANCE,
  async (job: Job) => { ... },
  {
    connection: this.redisConnection,  // NOTE: shares same connection for both Queue and Worker
    concurrency: 1,
  },
);
```

**PITFALL:** This service uses the SAME `redisConnection` for both Queue and Worker. Worker needs `maxRetriesPerRequest: null`. Split to `getSharedRedisConnection()` for Queue and `getSharedWorkerConnection()` for Worker.

**Cleanup** (lines 171-182): `.quit()` -> release both shared connections.

---

### `backend/src/modules/calendar/services/calendar-sync-queue.service.ts` (service, CRUD -- tri-queue)

**Analog:** `backend/src/modules/contacts/services/contacts-sync-queue.service.ts` (identical tri-queue pattern).

**Connection creation** (lines 91-92):
```typescript
const redisOptions = getRedisConnectionOptions();
this.redisConnection = new Redis(redisOptions);
```

**Three queues share one connection** (lines 102-117):
```typescript
this.highQueue = new Queue(..., { connection: this.redisConnection, ... });
this.normalQueue = new Queue(..., { connection: this.redisConnection, ... });
this.lowQueue = new Queue(..., { connection: this.redisConnection, ... });
```

**QueueEvents share same connection** (lines 133-134):
```typescript
const queueEvents = new QueueEvents(queue.name, {
  connection: this.redisConnection,
});
```
**PITFALL:** QueueEvents uses blocking XREAD -- cannot share a connection with Queue producers. After migration, QueueEvents must receive connection *options* (not the shared instance). Pass `getRedisConnectionOptions()` instead.

**Cleanup** (calendar-sync lines 185-209): closes queueEvents, queues, then `.quit()` on Redis. Replace `.quit()` with `releaseSharedRedisConnection()`. QueueEvents cleanup stays (they own their own connection).

---

### `backend/src/modules/contacts/services/contacts-sync-queue.service.ts` (service, CRUD -- tri-queue)

**Analog:** `calendar-sync-queue.service.ts` -- identical structure. Same migration.

---

### `backend/src/modules/email-sync/services/base-queue.service.ts` (service, CRUD -- abstract base)

**Analog:** Itself -- refactor internals.

**Connection creation** (lines 130-132):
```typescript
const redisOptions = getRedisConnectionOptions();
this.redisConnection = new Redis(redisOptions);
```

**QueueEvents shares connection** (lines 157-158):
```typescript
this.queueEvents = new QueueEvents(queueName, {
  connection: this.redisConnection,
});
```
Same PITFALL as tri-queue services: QueueEvents must get connection *options*, not shared instance.

**Cleanup** (lines 187-214): `.quit()` -> `releaseSharedRedisConnection()`. QueueEvents `.close()` stays.

---

### `backend/src/modules/email-sync/services/queue.service.ts` (service, CRUD -- tri-queue)

**Analog:** `contacts-sync-queue.service.ts` (same tri-queue pattern).

**Connection** (line 141): `this.redisConnection = new Redis(redisOptions);`
**QueueEvents** (line 252): `new QueueEvents(queue.name, { connection: this.redisConnection })`
Same migration as all tri-queue services.

---

### BaseWorker Subclasses (all workers use identical pattern)

**Files:** `sync.worker.ts`, `sync-back.worker.ts`, `folder-operations.worker.ts`, `email-send.worker.ts`, `bulk-operations.worker.ts`, `contacts-sync.worker.ts`, `calendar-sync.worker.ts`

**Analog:** Each other -- all extend `BaseWorker` identically.

**No changes needed in subclasses for D-02** -- the connection refactoring happens in `BaseWorker.onModuleInit()` and `BaseWorker.onModuleDestroy()`. Subclasses inherit the change.

**D-12/D-13: Module toggle -- add `getModuleToggle()` override.** Pattern from `sync.worker.ts` (lines 36-39):
```typescript
@Injectable()
export class SyncWorker extends BaseWorker<SyncJobData, SyncJobResult> {
  protected readonly logger = new Logger(SyncWorker.name);
  protected readonly workerName = 'email-sync';
  protected readonly envToggle = 'EMAIL_SYNC_WORKERS_ENABLED';
```
Each subclass adds:
```typescript
protected getModuleToggle(): string | null {
  return 'EMAIL_WORKERS_ENABLED'; // or CALENDAR_WORKERS_ENABLED, etc.
}
```

---

### `backend/src/main.ts` (config, bootstrap)

**Analog:** Itself -- add D-15 startup check.

**Insertion point:** After `app.listen()` completes (around line 658), before the startup trap stops. The `runStartupStep` helper (line 224) is the established pattern for adding bootstrap steps.

**Existing bootstrap step pattern** (line 644):
```typescript
await runStartupStep(trap, 'RedisIoAdapter.connectToRedis()', () =>
  redisIoAdapter.connectToRedis(),
);
```

**D-15 check should follow this pattern.** It needs a Redis connection -- use `getSharedRedisConnection()` from `queue.config.ts` (already imported by other parts of the app) or obtain from a NestJS service.

---

### `backend/src/common/workers/__tests__/base-worker-isolation.spec.ts` (test, unit)

**Analog:** Itself -- extend with new test cases.

**Existing test setup pattern** (lines 19-52):
```typescript
class TestWorker extends BaseWorker<{ data: string }, string> {
  protected readonly logger = new Logger('TestWorker');
  protected readonly workerName = 'test-worker';
  protected readonly envToggle = 'TEST_WORKERS_ENABLED';

  public exposeRecordError() {
    return (this as any).recordError.bind(this);
  }
  // ... expose internal methods for testing

  protected getWorkerConfig(): BaseWorkerConfig {
    return { queueName: 'test-queue', concurrency: 1 };
  }

  protected async processJob(job: Job<{ data: string }>): Promise<string> {
    return `processed: ${job.data.data}`;
  }
}
```

**Mock ConfigService pattern** (from existing tests, around line 58-60):
```typescript
let mockConfigService: Partial<ConfigService>;
```

Add tests for: `WORKERS_ENABLED=false` disables all, module toggle hierarchy, `getModuleToggle()` override.

---

### `backend/src/common/services/__tests__/queue-health.service.spec.ts` (test, unit -- NEW)

**Analog:** `base-worker-isolation.spec.ts` for test structure.

**No analog found** for testing direct Redis commands against QueueHealthService. Use the existing spec file pattern (Jest + ts-jest, mock Redis client with pipeline).

## Shared Patterns

### Pattern A: Queue Connection Migration (D-01)
**Source:** `backend/src/common/config/queue.config.ts` lines 60-96
**Apply to:** All 9 queue services + base-queue.service.ts + abstract-calendar-webhook.service.ts + queue.service.ts + stage-automation.service.ts

Before:
```typescript
const redisOptions = getRedisConnectionOptions();
this.redisConnection = new Redis(redisOptions);
```

After:
```typescript
this.redisConnection = getSharedRedisConnection();
```

### Pattern B: Worker Connection Migration (D-02)
**Source:** New `getSharedWorkerConnection()` (to be added to queue.config.ts, modeled on lines 60-96)
**Apply to:** `base.worker.ts` + 4 inline-worker services (scheduled-jobs, reminder-notify, sla-timer, csat) + abstract-calendar-webhook

Before:
```typescript
connection: new Redis(redisOptions)  // in Worker constructor options
```

After:
```typescript
connection: getSharedWorkerConnection()
```

### Pattern C: Cleanup Migration (D-01/D-02)
**Source:** `queue.config.ts` lines 86-96 (`releaseSharedRedisConnection`)
**Apply to:** All files that call `this.redisConnection.quit()` in `onModuleDestroy`

Before:
```typescript
async onModuleDestroy() {
  await this.worker?.close();
  await this.queue?.close();
  if (this.redisConnection && this.redisConnection.status !== 'end' && ...) {
    await this.redisConnection.quit();
  }
}
```

After:
```typescript
async onModuleDestroy() {
  await this.worker?.close();
  await this.queue?.close();
  releaseSharedRedisConnection();   // for queue connection
  releaseSharedWorkerConnection();  // for worker connection (if service has inline worker)
}
```

### Pattern D: QueueEvents Connection Isolation
**Source:** BullMQ docs (Pitfall 1 from RESEARCH.md)
**Apply to:** `base-queue.service.ts`, `queue.service.ts`, `contacts-sync-queue.service.ts`, `calendar-sync-queue.service.ts`

QueueEvents cannot share a connection (uses blocking XREAD). Pass connection *options*, not a shared instance:

Before:
```typescript
this.queueEvents = new QueueEvents(queueName, {
  connection: this.redisConnection,
});
```

After:
```typescript
this.queueEvents = new QueueEvents(queueName, {
  connection: getRedisConnectionOptions(),
});
```

### Pattern E: Error Handling in Redis Commands
**Source:** `queue-health.service.ts` lines 240-275 (checkRedisHealth)
**Apply to:** New direct Redis command implementation in QueueHealthService

```typescript
try {
  const start = Date.now();
  await this.redisConnection.ping();
  const latencyMs = Date.now() - start;
  // ... process results
} catch (error) {
  this.logger.error(`Redis health check failed: ${error}`);
  return { connected: false, latencyMs: -1, memoryUsedMB: 0, memoryPeakMB: 0 };
}
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/common/services/__tests__/queue-health.service.spec.ts` | test | unit | No existing test for QueueHealthService. Use `base-worker-isolation.spec.ts` structure as template. Mock ioredis pipeline for direct Redis command testing. |

## Metadata

**Analog search scope:** `backend/src/common/`, `backend/src/modules/`, `backend/src/main.ts`
**Files scanned:** 17 source files read in full, 17 `new Redis()` / `getRedisConnectionOptions()` call sites confirmed via grep
**Pattern extraction date:** 2026-04-16
