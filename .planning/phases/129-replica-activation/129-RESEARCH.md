# Phase 129: Replica Activation - Research

**Researched:** 2026-03-31
**Domain:** Railway multi-replica deployment, BullMQ concurrency tuning, Prometheus per-instance metrics, graceful shutdown
**Confidence:** HIGH

## Summary

Phase 129 activates Railway multi-replica deployment (numReplicas=2) with three engineering concerns: (1) BullMQ worker concurrency must be divided across replicas so total concurrency stays safe, (2) SIGTERM must trigger ordered graceful shutdown of HTTP, WebSocket, and BullMQ workers, and (3) Prometheus metrics must carry a per-replica label for Grafana differentiation.

The codebase is already well-prepared. BaseWorker has `onModuleDestroy` with `worker.close()` drain logic. The Prisma connection pool is already sized per-replica via `DB_POOL_MAX` (default 20, documented for 2-4 replicas). Socket.IO uses Redis adapter for cross-replica pub/sub. The `@willsoto/nestjs-prometheus` module is already wired. The main gap is: (a) worker concurrency values are hardcoded, not divided by replica count, (b) `main.ts` calls `app.close()` on SIGTERM but lacks a shutdown timeout safety net, (c) no `RAILWAY_REPLICA_ID` label is set on any metric, and (d) `railway.toml` has `numReplicas = 1`.

**Primary recommendation:** Add an env-driven concurrency divisor to all workers, add a shutdown timeout to main.ts, set prom-client `defaultLabels` with `RAILWAY_REPLICA_ID`, and flip `numReplicas = 2` in railway.toml after validation.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAL-03 | BullMQ worker concurrency tuned for N-replica deployment (per-instance limits, no duplicate job processing) | Workers use hardcoded concurrency; add env-driven divisor. BullMQ guarantees no duplicate processing via Redis locking -- concurrency tuning prevents resource exhaustion, not duplication. |
| PERF-03 | Graceful shutdown verified -- HTTP connection draining, WebSocket disconnect, BullMQ worker stop on SIGTERM | `app.enableShutdownHooks()` is called. BaseWorker.onModuleDestroy calls `worker.close()`. Missing: shutdown timeout safety net, explicit WebSocket adapter close, PrismaService disconnect order. |
| PERF-04 | Prometheus metrics include per-replica instance labels for Grafana differentiation | `@willsoto/nestjs-prometheus` supports `defaultLabels` in `PrometheusModule.register()`. `RAILWAY_REPLICA_ID` is auto-injected by Railway as a UUID. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Post-edit validation mandatory: `cd backend && npx tsc --noEmit` after every change
- Max 500 lines per file
- Follow existing patterns -- BaseWorker, queue.config.ts centralization
- Multi-tenant rule: every query MUST include tenantId
- Backend tech: NestJS 11, BullMQ 5.x, Prisma 7, Socket.IO 4.x, prom-client 15.x

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | ^5.67.3 | Job queue with Redis | Already in use; built-in at-least-once delivery prevents duplicates |
| prom-client | ^15.1.3 | Prometheus metrics | Already in use; `register.setDefaultLabels()` for per-replica labels |
| @willsoto/nestjs-prometheus | ^6.0.2 | NestJS Prometheus integration | Already in use; `defaultLabels` option in `PrometheusModule.register()` |
| @socket.io/redis-adapter | ^8.3.0 | Cross-replica WebSocket | Already in use; handles multi-instance pub/sub |
| ioredis | ^5.9.3 | Redis client | Already in use |

### No New Dependencies Needed

This phase requires zero new npm packages. All functionality is achievable with existing stack configuration changes.

## Architecture Patterns

### Pattern 1: Env-Driven Concurrency Divisor

**What:** Divide hardcoded concurrency values by `WORKER_REPLICA_COUNT` env var (default 1).
**When to use:** Any worker that uses BaseWorker or direct BullMQ Worker creation.
**Why not use RAILWAY_REPLICA_ID:** That is a UUID, not a count. The divisor must be an integer set by the operator.

```typescript
// In queue.config.ts -- add near the top
export function getReplicaCount(): number {
  const raw = process.env.WORKER_REPLICA_COUNT;
  const parsed = parseInt(raw ?? '1', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function scaleForReplicas(baseConcurrency: number): number {
  const replicas = getReplicaCount();
  return Math.max(1, Math.floor(baseConcurrency / replicas));
}
```

**Where to apply:** Every worker that sets concurrency. The key workers and their current values:

| Worker | Current Concurrency | With 2 Replicas |
|--------|-------------------|-----------------|
| SyncWorker high | 17 | 8 |
| SyncWorker normal | 10 | 5 |
| SyncWorker low | 7 | 3 |
| EmailSendWorker | 10 | 5 |
| FolderOperationsWorker | 5 | 2 |
| SyncBackWorker | 5 | 2 |
| BulkOperationsWorker | 2 | 1 |
| PushDispatchWorker | 5 | 2 |
| ContactsSyncWorker | 3 per queue | 1 per queue |
| CalendarSyncWorker | 3 per queue | 1 per queue |
| ScheduledJobsQueue | 1 | 1 (min) |
| EmbeddingWorkers | 1 | 1 (min) |
| StageAutomationWorker | 3 | 1 |
| ContactImportWorker | 1 | 1 (min) |
| SlaTimerService | 5 | 2 |
| ReminderScheduler | 1 | 1 (min) |

### Pattern 2: Graceful Shutdown with Timeout

**What:** Add a hard timeout to the SIGTERM handler so Railway does not kill the process ungracefully.
**Why:** `worker.close()` waits indefinitely for in-progress jobs. Railway sends SIGTERM and then SIGKILL after a timeout (default ~5s for Railway, configurable). If any job takes too long, the process gets SIGKILL-ed mid-cleanup.

```typescript
// In main.ts gracefulShutdown function
const SHUTDOWN_TIMEOUT_MS = 25000; // 25s -- Railway default grace period varies

const gracefulShutdown = async (signal: string) => {
  logger.log(`Received ${signal}, starting graceful shutdown...`);

  const forceExit = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await app.close(); // triggers onModuleDestroy on all providers
    logger.log('Application closed gracefully');
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    clearTimeout(forceExit);
    process.exit(1);
  }
};
```

### Pattern 3: Prometheus Default Labels with RAILWAY_REPLICA_ID

**What:** Set `RAILWAY_REPLICA_ID` as a default label on all Prometheus metrics.
**How:** Use `defaultLabels` in `PrometheusModule.register()` config.

```typescript
// In metrics.module.ts
PrometheusModule.register({
  path: '/metrics',
  defaultMetrics: { enabled: true },
  defaultLabels: {
    instance: process.env.RAILWAY_REPLICA_ID || 'local',
  },
}),
```

This adds `instance="<uuid>"` to every metric line, enabling Grafana queries like:
```promql
http_request_duration_seconds_bucket{instance="abc-123"}
```

### Pattern 4: WebSocket Adapter Cleanup on Shutdown

**What:** The RedisIoAdapter has a `close()` method but it is never called during NestJS shutdown lifecycle.
**Fix:** Make RedisIoAdapter implement `OnModuleDestroy` or explicitly close it in a shutdown hook.

### Anti-Patterns to Avoid

- **Do not use RAILWAY_REPLICA_ID as a concurrency divisor.** It is a UUID, not a sequential index. Use a separate `WORKER_REPLICA_COUNT` integer env var.
- **Do not rely on BullMQ for duplicate prevention as a concurrency fix.** BullMQ already guarantees no duplicate job processing via Redis atomic operations. The concurrency issue is resource exhaustion (too many concurrent DB/API calls), not job duplication.
- **Do not set concurrency to 0.** `Math.max(1, ...)` ensures at least 1 concurrent job per worker per replica.
- **Do not skip the shutdown timeout.** `worker.close()` has no built-in timeout. Without a safety net, a stuck job blocks the entire shutdown.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-replica metrics labels | Custom metric wrapper with replica param | `prom-client` `defaultLabels` / `PrometheusModule.register({ defaultLabels })` | Automatically applies to ALL metrics including default Node.js metrics |
| Job deduplication across replicas | Custom Redis lock before each job | BullMQ's built-in job ID deduplication | BullMQ atomically checks job existence in Redis |
| Cross-replica WebSocket | Custom Redis pub/sub for WS events | `@socket.io/redis-adapter` (already wired) | Industry standard, handles edge cases |
| Connection pool limiting | Custom connection counting | `DB_POOL_MAX` env var (already implemented in Phase 127) | pg.Pool handles this natively |

## Common Pitfalls

### Pitfall 1: Railway SIGKILL Timing
**What goes wrong:** Railway sends SIGTERM, waits for grace period, then SIGKILL. If `worker.close()` takes longer than the grace period, jobs are killed mid-processing and marked as stalled.
**Why it happens:** BullMQ `worker.close()` waits indefinitely for in-progress jobs.
**How to avoid:** Add a hard timeout in the SIGTERM handler (25s recommended, configurable via `SHUTDOWN_TIMEOUT_MS` env var). Also set Railway's `restartPolicyMaxRetries` reasonably.
**Warning signs:** Stalled jobs appearing after deployments. Workers reporting "stalled" events in health endpoint.

### Pitfall 2: Concurrency Multiplication Across Replicas
**What goes wrong:** With 2 replicas each running SyncWorker at concurrency 17, you get 34 concurrent sync jobs hitting the Google/Microsoft APIs. This can trigger rate limits or exhaust the DB connection pool.
**Why it happens:** Concurrency is hardcoded per-instance, not accounting for total replica count.
**How to avoid:** Divide concurrency by replica count. With 2 replicas: 17 becomes 8 per replica = 16 total (safe).
**Warning signs:** API rate limit errors spiking after increasing replicas. DB pool exhaustion warnings.

### Pitfall 3: PrismaService Double SIGTERM Handler
**What goes wrong:** `prisma.service.ts` registers its own SIGTERM/SIGINT handlers that call `app.close()`. This creates a recursive shutdown: main.ts calls `app.close()` -> triggers onModuleDestroy -> BUT prisma.service.ts has its own process signal handlers that ALSO call `app.close()`.
**Why it happens:** Legacy pattern from Prisma 4 era. NestJS `enableShutdownHooks()` already handles the lifecycle.
**How to avoid:** Remove the `enableShutdownHooks` method from PrismaService entirely. NestJS `app.enableShutdownHooks()` (called in main.ts) already triggers `onModuleDestroy` on all services, including PrismaService (which should just `$disconnect()` in its `onModuleDestroy`).
**Warning signs:** Double shutdown logs, race condition errors during deployment.

### Pitfall 4: Scheduled/Repeatable Jobs Running on All Replicas
**What goes wrong:** BullMQ repeatable jobs (migrated from @Cron in Phase 126) are safe -- they are deduplicated by BullMQ's scheduler. Only one instance of each repeatable job runs at a time. This is NOT a pitfall for this project.
**Why this is listed:** It is a common concern that can be dismissed. Phase 126 already migrated all @Cron to BullMQ repeatables, which have built-in single-execution guarantees.

### Pitfall 5: Redis Adapter Not Closed on Shutdown
**What goes wrong:** The `RedisIoAdapter` holds two Redis connections (pub/sub) that are never explicitly closed during NestJS shutdown. This can delay process exit or cause connection leak warnings.
**Why it happens:** `RedisIoAdapter` extends `IoAdapter` but is not registered as a NestJS provider with lifecycle hooks.
**How to avoid:** Either: (a) register the adapter's close in an `OnModuleDestroy` service, or (b) call `redisIoAdapter.close()` explicitly in the graceful shutdown handler before `app.close()`.

## Code Examples

### Example 1: Scaling concurrency in SyncWorker

```typescript
// sync.worker.ts - getWorkerConfig()
import { scaleForReplicas } from '../../../common/config/queue.config';

private readonly WORKER_CONFIG = {
  high: { concurrency: scaleForReplicas(17) },
  normal: { concurrency: scaleForReplicas(10) },
  low: { concurrency: scaleForReplicas(7) },
};
```

### Example 2: PrometheusModule with default labels

```typescript
// metrics.module.ts
PrometheusModule.register({
  path: '/metrics',
  defaultMetrics: { enabled: true },
  defaultLabels: {
    instance: process.env.RAILWAY_REPLICA_ID || 'local',
  },
}),
```

### Example 3: Graceful shutdown with timeout

```typescript
// main.ts
const SHUTDOWN_TIMEOUT_MS = parseInt(
  process.env.SHUTDOWN_TIMEOUT_MS ?? '25000', 10
);

const gracefulShutdown = async (signal: string) => {
  logger.log(`Received ${signal}, starting graceful shutdown...`);
  const forceExit = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // Close WebSocket adapter first (stops accepting new connections)
    await redisIoAdapter.close();
    // Close NestJS app (triggers all onModuleDestroy hooks including BaseWorker drain)
    await app.close();
    logger.log('Application closed gracefully');
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Error during shutdown: ${msg}`);
    clearTimeout(forceExit);
    process.exit(1);
  }
};
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run --reporter=verbose` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAL-03 | scaleForReplicas divides concurrency correctly | unit | `cd backend && npx vitest run src/common/config/__tests__/queue-config-scaling.test.ts -x` | Wave 0 |
| PERF-03 | Graceful shutdown calls worker.close and exits | unit | `cd backend && npx vitest run src/__tests__/graceful-shutdown.test.ts -x` | Wave 0 |
| PERF-04 | Prometheus metrics contain instance label | integration | `cd backend && npx vitest run src/common/metrics/__tests__/metrics-replica-label.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit`
- **Per wave merge:** `cd backend && npx vitest run`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `src/common/config/__tests__/queue-config-scaling.test.ts` -- covers SCAL-03 (scaleForReplicas unit test)
- [ ] `src/common/metrics/__tests__/metrics-replica-label.test.ts` -- covers PERF-04 (instance label presence)
- [ ] Graceful shutdown is best verified via Railway deploy smoke test (manual), not unit test

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Railway deployment | numReplicas=2 activation | N/A (remote) | -- | Cannot test locally; validate via Railway dashboard |
| Redis | BullMQ, Socket.IO adapter, metrics | Yes (Railway) | -- | Required, no fallback |
| PostgreSQL | Prisma | Yes (Railway) | -- | Required, no fallback |

**Missing dependencies with no fallback:**
- None. All required services are already running on Railway.

**Missing dependencies with fallback:**
- Local multi-replica testing: Cannot simulate Railway replicas locally. Fallback: test concurrency scaling logic with unit tests, validate on Railway staging.

## Open Questions

1. **Railway shutdown grace period**
   - What we know: Railway sends SIGTERM, then SIGKILL after a timeout. Default varies.
   - What's unclear: The exact grace period for the current Railway plan. Some sources say 5s, others 10s.
   - Recommendation: Set `SHUTDOWN_TIMEOUT_MS=25000` (25s) and verify via Railway docs or support. If too long, Railway SIGKILL will terminate anyway.

2. **WORKER_REPLICA_COUNT vs dynamic detection**
   - What we know: Railway provides `RAILWAY_REPLICA_ID` (UUID) but no `RAILWAY_REPLICA_COUNT`.
   - What's unclear: Whether Railway plans to add a replica count variable.
   - Recommendation: Use manual `WORKER_REPLICA_COUNT` env var. Simple, explicit, no API dependency.

## Sources

### Primary (HIGH confidence)
- Codebase: `backend/src/common/workers/base.worker.ts` -- BaseWorker lifecycle, onModuleDestroy drain
- Codebase: `backend/src/common/config/queue.config.ts` -- WORKER_PRESETS, QUEUE_NAMES
- Codebase: `backend/src/common/metrics/metrics.module.ts` -- PrometheusModule.register config
- Codebase: `backend/src/main.ts` -- SIGTERM handler, enableShutdownHooks
- Codebase: `backend/railway.toml` -- current numReplicas=1
- [BullMQ Concurrency Docs](https://docs.bullmq.io/guide/workers/concurrency) -- multi-worker recommendations
- [BullMQ Graceful Shutdown Docs](https://docs.bullmq.io/guide/workers/graceful-shutdown) -- worker.close() behavior

### Secondary (MEDIUM confidence)
- [Railway Variables Docs](https://docs.railway.com/reference/variables) -- RAILWAY_REPLICA_ID format
- [prom-client GitHub](https://github.com/siimon/prom-client) -- register.setDefaultLabels API
- [@willsoto/nestjs-prometheus](https://github.com/willsoto/nestjs-prometheus) -- defaultLabels option

### Tertiary (LOW confidence)
- Railway shutdown grace period exact timing -- needs verification per plan

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in codebase
- Architecture: HIGH -- patterns derived from existing codebase conventions
- Pitfalls: HIGH -- identified from direct code reading (PrismaService double handler, missing adapter close)
- Concurrency math: HIGH -- derived from actual hardcoded values in workers

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable infrastructure, no fast-moving deps)
