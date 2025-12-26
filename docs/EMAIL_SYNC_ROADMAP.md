# Email-Sync Module Roadmap

**Created:** 2025-12-26
**Last Updated:** 2025-12-26 (Multi-Tenant Scalability Audit)
**Status:** Active Development
**Module:** `backend/src/modules/email-sync/`

---

## Executive Summary

This roadmap outlines the prioritized improvements for the email-sync module based on comprehensive audits by 4 specialized agents (Bug Detection, Race Condition, Dead Code, Duplicate Code).

### Current State

| Metric | Value |
|--------|-------|
| **Critical Issues** | 0 (all resolved) |
| **High Priority Issues** | 0 ✅ (all resolved) |
| **Medium Priority Issues** | 6 remaining |
| **Low Priority Issues** | 10 remaining |
| **Dead Code Items** | ~10 items remaining (~200 LOC) |
| **Duplicate Code** | 12 patterns (~400-500 LOC) |
| **Technical Debt** | ~30-40 hours estimated |
| **Multi-Tenant Ready** | 85% (see Phase 6) |
| **Target Scale** | 1000+ concurrent users |

### Key Achievements (Completed)

- CRIT-1: Gmail historyId BigInt overflow
- CRIT-2: Operation timeouts in sync worker
- CRIT-3: Token expiration during long syncs
- CRIT-4: Redis-backed ResilienceService for horizontal scaling
- CRIT-5: Queue backpressure mechanism
- All original SEC-* and RC-* issues from initial audit
- **RC-16/RC-17:** ✅ Atomic circuit breaker transitions with Lua script
- **RC-19:** ✅ Atomic rate limit check+increment with Lua script
- **RC-20/RC-21:** ✅ Queue capacity TOCTOU fix with atomic provider counter
- **NEW-1:** ✅ DegradedMode health check recovery
- **NEW-11:** ✅ Lock fail-closed with retry logic
- **Phase 3 (Partial):** ✅ Removed ~300 LOC dead code (utilities, factory methods, unused services)

---

## Phase 1: Critical Race Conditions (Week 1) ✅ COMPLETED & VALIDATED

**Goal:** Fix remaining HIGH priority race conditions in CRIT-4/CRIT-5 implementations
**Validated:** 2025-12-26 via `backend/scripts/validate-phase1-race-conditions.ts`

### 1.1 Circuit Breaker Atomicity (RC-16, RC-17) ✅ COMPLETED

**Files:** `resilience.service.ts`
**Status:** ✅ Implemented with Lua script `CIRCUIT_LUA_SCRIPT`
**Validation:** ✅ Concurrent success updates handled atomically (8 closed transitions)

**Solution Implemented:**

- Created atomic Lua script for circuit breaker state transitions
- Single `executeCircuitLuaScript()` method handles check/success/failure atomically
- Eliminates TOCTOU gap between read and write operations
- Added health check interval for degraded mode recovery (NEW-1 fix)

**Issue (was):** Non-atomic read-modify-write in circuit breaker state transitions

- `getCircuitStatusFromRedis` + `saveCircuitStatusToRedis` had TOCTOU gap
- Success counter lost updates when multiple instances succeed in half-open

**Solution:** Implement Lua script for atomic operations:

```lua
-- Atomic circuit state transition
local key = KEYS[1]
local state = redis.call('HGET', key, 'state')
local nextRetry = tonumber(redis.call('HGET', key, 'nextRetry')) or 0
local now = tonumber(ARGV[1])
local action = ARGV[2] -- 'check', 'success', 'failure'

if action == 'check' then
  if state == 'open' and now >= nextRetry then
    redis.call('HSET', key, 'state', 'half-open', 'successCount', '0')
    return {'half-open', 0, 0}
  end
  return {state or 'closed', redis.call('HGET', key, 'failures') or 0, redis.call('HGET', key, 'successCount') or 0}
elseif action == 'success' then
  if state == 'half-open' then
    local newCount = redis.call('HINCRBY', key, 'successCount', 1)
    local threshold = tonumber(ARGV[3])
    if newCount >= threshold then
      redis.call('HMSET', key, 'state', 'closed', 'failures', '0', 'successCount', '0')
      return {'closed', 0, 0}
    end
    return {'half-open', 0, newCount}
  end
  return {state, redis.call('HINCRBY', key, 'failures', -1), 0}
elseif action == 'failure' then
  local failures = redis.call('HINCRBY', key, 'failures', 1)
  local threshold = tonumber(ARGV[3])
  if failures >= threshold then
    redis.call('HMSET', key, 'state', 'open', 'nextRetry', ARGV[4])
    return {'open', failures, 0}
  end
  return {state, failures, 0}
end
```

**Tasks:**

- [x] Create `resilience-circuit.lua` script
- [x] Add `executeCircuitLuaScript()` method
- [x] Update `getCircuitStatusFromRedis()` to use Lua
- [x] Update `recordSuccessDistributed()` to use Lua
- [x] Update `recordFailureDistributed()` to use Lua
- [x] Add unit tests for concurrent circuit operations

---

### 1.2 Rate Limit Atomicity (RC-19) ✅ COMPLETED

**Files:** `resilience.service.ts`
**Status:** ✅ Implemented with Lua script `RATE_LIMIT_LUA_SCRIPT`
**Validation:** ✅ Concurrent requests handled atomically (5/20 allowed, final count: 5)

**Issue (was):** Rate limit check and record are separate operations

- `recordRequestDistributed` increments counters
- Gap allows multiple requests to pass before increment

**Solution:** Atomic rate limit check + increment:

```lua
-- Atomic rate limit check + increment
local key = KEYS[1]
local now = tonumber(ARGV[1])
local limitPerSecond = tonumber(ARGV[2])
local limitPerMinute = tonumber(ARGV[3])
local cooldownMs = tonumber(ARGV[4])

local lastReq = tonumber(redis.call('HGET', key, 'lastRequestAt')) or 0
local reqSec = tonumber(redis.call('HGET', key, 'requestsThisSecond')) or 0
local reqMin = tonumber(redis.call('HGET', key, 'requestsThisMinute')) or 0

-- Reset counters if window expired
if now - lastReq >= 1000 then reqSec = 0 end
if now - lastReq >= 60000 then reqMin = 0 end

-- Check limits BEFORE increment
if reqSec >= limitPerSecond then
  return {0, reqSec, reqMin, lastReq + 1000}  -- Rate limited (per second)
end
if reqMin >= limitPerMinute then
  return {0, reqSec, reqMin, lastReq + cooldownMs}  -- Rate limited (per minute)
end

-- Atomic increment
redis.call('HMSET', key,
  'requestsThisSecond', reqSec + 1,
  'requestsThisMinute', reqMin + 1,
  'lastRequestAt', now)
redis.call('EXPIRE', key, 120)
return {1, reqSec + 1, reqMin + 1, 0}  -- Allowed
```

**Tasks:**

- [x] Create `resilience-ratelimit.lua` script
- [x] Add `executeRateLimitLuaScript()` method
- [x] Merge `checkRateLimitDistributed` + `recordRequestDistributed` into single atomic operation
- [x] Add unit tests for concurrent rate limit scenarios

---

### 1.3 Provider Counter Race (RC-20, RC-21, NEW-3) ✅ COMPLETED

**Files:** `queue.service.ts`
**Status:** ✅ Implemented with atomic pipeline + job-provider mapping
**Validation:** ✅ Atomic increment working (10/20 allowed, final count: 10)

**Issues (were):**
1. Check capacity then increment has TOCTOU gap

2. Job removed before `decrementProviderCountForJob` can fetch providerId
3. Counter never decremented = gradual drift positive

**Solution:** Atomic increment with limit check + store providerId mapping:

```typescript
// Atomic check + increment
private async atomicIncrementProviderCount(
  priority: QueuePriority,
  providerId: string,
  jobId: string,
): Promise<{ allowed: boolean; currentCount: number }> {
  const countKey = `queue:provider-count:${priority}:${providerId}`;
  const mappingKey = `queue:job-provider:${jobId}`;
  const limit = DEFAULT_QUEUE_LIMITS[priority].maxPerProvider;

  const pipeline = this.redisConnection.pipeline();
  pipeline.incr(countKey);
  pipeline.expire(countKey, 3600);
  pipeline.set(mappingKey, providerId, 'EX', 3600);

  const results = await pipeline.exec();
  const newCount = results?.[0]?.[1] as number;

  if (newCount > limit) {
    // Rollback - exceeded limit
    await this.redisConnection.decr(countKey);
    await this.redisConnection.del(mappingKey);
    return { allowed: false, currentCount: newCount - 1 };
  }

  return { allowed: true, currentCount: newCount };
}

// Decrement using stored mapping (no job fetch needed)
private async decrementProviderCountByJobId(
  priority: QueuePriority,
  jobId: string,
): Promise<void> {
  const mappingKey = `queue:job-provider:${jobId}`;
  const providerId = await this.redisConnection.get(mappingKey);

  if (providerId) {
    await this.decrementProviderJobCount(priority, providerId);
    await this.redisConnection.del(mappingKey);
  }
}
```

**Tasks:**

- [x] Add job-to-provider mapping in Redis
- [x] Replace `checkQueueCapacity` + `incrementProviderJobCount` with atomic operation
- [x] Update `decrementProviderCountForJob` to use mapping instead of job fetch
- [x] Add cleanup for orphaned mappings
- [x] Add unit tests for counter balance

---

## Phase 2: Bug Fixes (Week 2)

### 2.1 Lock Fail-Open Fix (NEW-11)

**Files:** `provider-token.service.ts`
**Effort:** 1-2 hours
**Risk:** HIGH - Concurrent token refreshes defeat locking purpose

**Issue:** `acquireLock()` returns `true` on Redis error, allowing operation without lock

**Solution:** Change to fail-closed behavior:

```typescript
private async acquireLock(lockKey: string, ttlMs: number): Promise<boolean> {
  try {
    const result = await this.redis.set(lockKey, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  } catch (error) {
    this.logger.error(`Lock acquisition failed (fail-closed): ${error.message}`);
    return false; // FAIL CLOSED - do not proceed without lock
  }
}
```

**Tasks:**

- [ ] Change `acquireLock` to return `false` on error
- [ ] Add retry logic in caller for transient failures
- [ ] Add metric for lock acquisition failures

---

### 2.2 DegradedMode Recovery (NEW-1)

**Files:** `resilience.service.ts`
**Effort:** 2-3 hours
**Risk:** MEDIUM - Service stays degraded after transient Redis failure

**Issue:** `degradedMode` set to `true` on error but only reset on initial connection events

**Solution:** Add periodic health check and recovery:

```typescript
private healthCheckInterval: NodeJS.Timeout;

async onModuleInit(): Promise<void> {
  // ... existing code ...

  // Periodic health check to recover from degraded mode
  this.healthCheckInterval = setInterval(() => {
    this.checkRedisHealth();
  }, 30000); // Check every 30 seconds
}

private async checkRedisHealth(): Promise<void> {
  if (!this.degradedMode) return;

  try {
    const pong = await this.redis.ping();
    if (pong === 'PONG') {
      this.logger.log('CRIT-4: Redis recovered, exiting degraded mode');
      this.degradedMode = false;
    }
  } catch {
    // Still degraded
  }
}

async onModuleDestroy(): Promise<void> {
  if (this.healthCheckInterval) {
    clearInterval(this.healthCheckInterval);
  }
  // ... existing code ...
}
```

**Tasks:**

- [ ] Add health check interval
- [ ] Add `checkRedisHealth()` method
- [ ] Clear interval on destroy
- [ ] Add metric for degraded mode duration

---

### 2.3 Bulk Sync Backpressure (NEW-6)

**Files:** `queue.service.ts`
**Effort:** 2-3 hours
**Risk:** MEDIUM - Bulk operations bypass per-provider limits

**Issue:** `addBulkSyncJobs` doesn't check capacity or increment provider counters

**Solution:** Add capacity checks to bulk operations:

```typescript
async addBulkSyncJobs(jobs: SyncJobData[]): Promise<{ added: number; dropped: number }> {
  let added = 0;
  let dropped = 0;

  for (const [providerId, providerJobs] of jobsByProvider) {
    // Check capacity before bulk add
    const queue = this.getQueueByPriority(providerJobs[0].priority);
    const capacityCheck = await this.checkQueueCapacity(
      queue,
      providerJobs[0].priority,
      providerId
    );

    if (!capacityCheck.hasCapacity) {
      this.logger.warn(`Bulk sync dropped for ${providerId}: ${capacityCheck.reason}`);
      dropped += providerJobs.length;
      continue;
    }

    // ... existing bulk add logic ...

    // Increment counter for each added job
    for (const job of addedJobs) {
      await this.incrementProviderJobCount(job.priority, job.providerId);
      added++;
    }
  }

  return { added, dropped };
}
```

**Tasks:**

- [ ] Add capacity check before bulk add
- [ ] Add provider counter increments for bulk jobs
- [ ] Return statistics on added vs dropped
- [ ] Add logging for dropped bulk jobs

---

### 2.4 Driver Connection Leak (NEW-9)

**Files:** `base-email-sync.service.ts`
**Effort:** 2-3 hours
**Risk:** MEDIUM - Token refresh can leak driver connections

**Issue:** If exception occurs after `refreshDriverIfNeeded` creates new driver, old driver in finally block

**Solution:** Track driver in mutable holder:

```typescript
interface DriverHolder {
  driver: IEmailDriver;
  tokenExpiresAt: Date | null | undefined;
}

protected async syncFullWithDriver(
  driverHolder: DriverHolder,
  // ... other params
): Promise<SyncResult> {
  try {
    // Refresh updates the holder directly
    await this.refreshDriverIfNeeded(driverHolder, providerId);

    // Use driverHolder.driver throughout
    const messages = await driverHolder.driver.listMessages(...);
    // ...
  } finally {
    // Holder always has current driver reference
  }
}
```

**Tasks:**

- [ ] Create `DriverHolder` interface
- [ ] Update `syncFullWithDriver` to use holder
- [ ] Update `syncIncrementalWithDriver` to use holder
- [ ] Ensure finally block disconnects correct driver

---

## Phase 3: Dead Code Cleanup (Week 3) - IN PROGRESS

**Goal:** Remove ~500 LOC of unused code
**Effort:** 4-6 hours
**Status:** ✅ HIGH/MEDIUM items completed (2025-12-26)

### 3.1 Unused Utilities (HIGH Priority) ✅ COMPLETED

| File | Item | Action | Status |
|------|------|--------|--------|
| `utils/email-metadata.util.ts` | Entire file | DELETE | ✅ Deleted |
| `utils/folder-exclusion.util.ts` | Entire file | DELETE | ✅ Deleted |

### 3.2 Unused Factory Methods (MEDIUM Priority) ✅ COMPLETED

| File | Methods | Action | Status |
|------|---------|--------|--------|

| `drivers/driver.factory.ts` | `getDriver()` | DELETE | ✅ Deleted |
| `drivers/driver.factory.ts` | `isSupported()`, `getSupportedProviders()` | DELETE | ✅ Deleted |
| `drivers/driver.factory.ts` | `createResilientDriver()` | DELETE | ✅ Deleted |
| `drivers/driver.factory.ts` | `wrapWithResilience()` | DELETE | ✅ Deleted |
| `drivers/driver.factory.ts` | `isResilienceAvailable()`, `getResilienceService()` | DELETE | ✅ Deleted |
| `drivers/resilience/resilient-driver.wrapper.ts` | Entire file (unused) | DELETE | ✅ Deleted |

### 3.3 Unused ResilienceService Methods (MEDIUM Priority)

| File | Methods | Action |
|------|---------|--------|

| `resilience.service.ts:854-865` | `getAllCircuitStatus()`, `getAllRateLimitStatus()` | DELETE or expose via API |
| `resilience.service.ts:868-908` | `resetMetrics()`, `cleanup()` | Schedule cleanup() or DELETE |
| `resilience.service.ts:580-592` | `resetCircuitBreaker()` | DELETE or expose via API |
| `resilience.service.ts:756-768` | `resetRateLimit()` | DELETE or expose via API |

### 3.4 Unused Base Class Methods (LOW Priority)

| File | Methods | Action |
|------|---------|--------|

| `base-email-sync.service.ts:1083-1086` | `isSystemFolder()` | DELETE |
| `base-email-sync.service.ts:1096-1128` | `notifyMailboxChange()` | DELETE |
| `base-email-sync.service.ts:1137-1148` | `calculateSyncStats()` | DELETE |
| `base-email-sync.service.ts:1268-1274` | `validateEmailAddress()` | DELETE |
| `base-email-sync.service.ts:1282-1297` | `formatTimestamp()` | DELETE |

### 3.5 Unused Constants (LOW Priority)

| File | Constants | Action |
|------|-----------|--------|

| `constants/email-sync.constants.ts:103-113` | `GMAIL_CATEGORY_MAP` | DELETE |
| `constants/email-sync.constants.ts:123-131` | `MICROSOFT_DESTINATIONS` | DELETE |
| `constants/email-sync.constants.ts:140-165` | `CANONICAL_TO_IMAP_FOLDER_MAP`, `IMAP_SYNC_FOLDERS` | DELETE |
| `constants/email-sync.constants.ts:337-345` | `DTO_LIMITS` | DELETE |

### 3.6 Unused Interfaces (LOW Priority)

| File | Interfaces | Action |
|------|------------|--------|
| `interfaces/sync-job.interface.ts:38-44` | `CircuitBreakerState` | DELETE |
| `interfaces/webhook.interface.ts:87-90` | `RenewWebhookOptions` | DELETE |

### 3.7 Unused Services (EVALUATE) ✅ COMPLETED

| File | Service | Action | Status |
|------|---------|--------|--------|

| `services/cross-provider-sync.service.ts` | `CrossProviderSyncService` | DELETE | ✅ Deleted |
| `services/cross-provider-dedup.service.ts` | `CrossProviderDedupService` | DELETE | ✅ Deleted |
| `services/cross-provider-conflict.service.ts` | `CrossProviderConflictService` | DELETE | ✅ Deleted |

**Note:** All three cross-provider services were confirmed unused - methods defined but never called from anywhere in the codebase. Module imports updated accordingly.

---

## Phase 4: Code Consolidation (Week 4)

**Goal:** Reduce duplication by ~400-500 LOC
**Effort:** 16-24 hours

### 4.1 BaseWorker Abstract Class (HIGH Priority)

**Files:** All 5 workers
**Savings:** ~175 LOC

```typescript
// src/common/workers/base.worker.ts
abstract class BaseWorker<TData, TResult> implements OnModuleInit, OnModuleDestroy {
  protected redis: Redis;
  protected worker: Worker<TData, TResult>;
  protected readonly logger: Logger;

  abstract getQueueName(): string;
  abstract getConcurrency(): number;
  abstract processJob(job: Job<TData>): Promise<TResult>;

  async onModuleInit(): Promise<void> {
    this.redis = new Redis(getRedisConnectionOptions());
    this.worker = new Worker<TData, TResult>(
      this.getQueueName(),
      (job) => this.processJob(job),
      { connection: this.redis, concurrency: this.getConcurrency() }
    );
    this.setupEventHandlers();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.redis?.quit();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => this.onCompleted(job));
    this.worker.on('failed', (job, err) => this.onFailed(job, err));
    this.worker.on('error', (err) => this.onError(err));
  }

  protected onCompleted(job: Job<TData>): void {
    this.logger.debug(`Job ${job.id} completed`);
  }

  protected onFailed(job: Job<TData> | undefined, err: Error): void {
    this.logger.error(`Job ${job?.id} failed: ${err.message}`);
  }

  protected onError(err: Error): void {
    this.logger.error(`Worker error: ${err.message}`);
  }
}
```

**Tasks:**
- [ ] Create `BaseWorker` abstract class
- [ ] Refactor `sync.worker.ts` to extend BaseWorker
- [ ] Refactor `sync-back.worker.ts`
- [ ] Refactor `email-send.worker.ts`
- [ ] Refactor `bulk-operations.worker.ts`
- [ ] Refactor `folder-operations.worker.ts`

---

### 4.2 Token Refresh Consolidation (HIGH Priority)

**Files:** `provider-token.service.ts`
**Savings:** ~55 LOC

```typescript
private async refreshTokenWithLock<T>(
  provider: ProviderEntity,
  providerType: 'google' | 'microsoft',
  refreshFn: (refreshToken: string) => Promise<{ access_token: string; expires_in?: number }>,
): Promise<string> {
  const lockKey = `token-refresh:${provider.id}`;
  const lockTtlMs = 30000;

  const acquired = await this.acquireLock(lockKey, lockTtlMs);
  if (!acquired) {
    await this.waitForLockRelease(lockKey);
    return this.getAccessToken(provider.id);
  }

  try {
    const decryptedRefresh = this.decrypt(provider.encryptedRefreshToken);
    const tokens = await refreshFn(decryptedRefresh);

    await this.updateProviderTokens(provider.id, {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
    });

    return tokens.access_token;
  } finally {
    await this.releaseLock(lockKey);
  }
}

// Usage:
async refreshGoogleToken(provider: ProviderEntity): Promise<string> {
  return this.refreshTokenWithLock(provider, 'google', (refreshToken) =>
    this.googleOAuthService.refreshAccessToken(refreshToken)
  );
}

async refreshMicrosoftToken(provider: ProviderEntity): Promise<string> {
  return this.refreshTokenWithLock(provider, 'microsoft', (refreshToken) =>
    this.microsoftOAuthService.refreshAccessToken(refreshToken)
  );
}
```

**Tasks:**
- [ ] Create generic `refreshTokenWithLock()` method
- [ ] Refactor `refreshGoogleTokenWithLock()` to use generic
- [ ] Refactor `refreshMicrosoftTokenWithLock()` to use generic

---

### 4.3 withTimeout Utility (MEDIUM Priority)

**Files:** Multiple
**Savings:** ~40 LOC

```typescript
// src/common/utils/async.utils.ts
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName = 'Operation',
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeoutId.unref?.();
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}
```

**Tasks:**
- [ ] Create `async.utils.ts` with `withTimeout()`
- [ ] Update `resilience.service.ts` to import utility
- [ ] Update `sync.worker.ts` to import utility

---

### 4.4 Error Message Utility (LOW Priority)

**Files:** ~30 occurrences
**Savings:** Cleaner code, not LOC

```typescript
// src/common/utils/error.utils.ts
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

**Tasks:**
- [ ] Create `error.utils.ts`
- [ ] Find/replace `error instanceof Error ? error.message : String(error)`

---

### 4.5 Migrate Lock Implementation (MEDIUM Priority)

**Files:** `provider-token.service.ts`
**Issue:** Duplicates `RedisLockService` functionality

**Tasks:**
- [ ] Replace manual SETNX locking with `RedisLockService.withLock()`
- [ ] Remove duplicate `acquireLock()`, `releaseLock()`, `waitForLockRelease()`

---

## Phase 5: Monitoring & Observability (Week 5)

### 5.1 Expose ResilienceService Metrics

**Tasks:**
- [ ] Add `/api/v1/email-sync/resilience/metrics` endpoint
- [ ] Add `/api/v1/email-sync/resilience/circuits` endpoint
- [ ] Add `/api/v1/email-sync/resilience/ratelimits` endpoint
- [ ] Schedule `cleanup()` to run hourly

### 5.2 Add Alerting Thresholds

**Tasks:**
- [ ] Alert when queue utilization > 80%
- [ ] Alert when circuit breaker trips
- [ ] Alert when degradedMode duration > 5 minutes
- [ ] Alert when provider counter drift detected

---

## Phase 6: Multi-Tenant Scalability (1000+ Users)

**Goal:** Ensure worker infrastructure can handle 1000+ concurrent users without conflicts
**Effort:** 8-12 hours
**Status:** NEW - Audit completed 2025-12-26

### Audit Summary

| Component | Status | Rating |
|-----------|--------|--------|
| BaseWorker | Solid foundation | ⭐⭐⭐⭐ |
| RedisLockService | Production-ready | ⭐⭐⭐⭐⭐ |
| SyncWorker | Good with minor gaps | ⭐⭐⭐⭐ |
| EmailSendWorker | Good | ⭐⭐⭐⭐ |
| FolderOperationsWorker | Excellent locking | ⭐⭐⭐⭐⭐ |
| BulkOperationsWorker | Excellent locking | ⭐⭐⭐⭐⭐ |
| SyncBackWorker | Needs improvement | ⭐⭐⭐ |

**Sources:** [BullMQ Concurrency](https://docs.bullmq.io/guide/workers/concurrency), [Redis Distributed Locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/), [12 Redis Locking Patterns](https://medium.com/@navidbarsalari/the-twelve-redis-locking-patterns-every-distributed-systems-engineer-should-know-06f16dfe7375)

---

### 6.1 SyncBackWorker Missing Distributed Lock (HIGH Priority)

**Files:** `workers/sync-back.worker.ts`
**Effort:** 1 hour
**Risk:** HIGH - Concurrent sync-back jobs can race on same provider

**Issue:** SyncBackWorker processes provider sync operations without distributed locking, unlike FolderOperationsWorker and BulkOperationsWorker which have proper locks.

**Impact for 1000 users:**
- Concurrent sync-back jobs for same provider flood API rate limits
- Race conditions on IMAP flag updates
- Inconsistent state on Gmail/Microsoft batch modify

**Solution:**
```typescript
protected async processJob(job: Job<SyncBackJobData>): Promise<SyncBackJobResult> {
  const { tenantId, providerId, providerType, action } = job.data;

  // Add distributed lock per provider
  const lockKey = this.generateLockKey('sync-back', `${providerId}:${action}`);

  return await this.redisLock.withLock(
    lockKey,
    300000, // 5 min TTL for batch operations
    async () => {
      // ... existing batch processing logic
    },
    { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 2000 }
  );
}
```

**Tasks:**
- [ ] Inject `RedisLockService` into SyncBackWorker
- [ ] Add lock acquisition around `processJob` core logic
- [ ] Add lock key per provider+action combination
- [ ] Test concurrent sync-back operations

---

### 6.2 Job Deduplication for Sync Jobs (HIGH Priority)

**Files:** `services/sync-scheduler.service.ts`, queue enqueue points
**Effort:** 1-2 hours
**Risk:** HIGH - Duplicate sync jobs for same mailbox

**Issue:** Sync jobs are enqueued without BullMQ jobId deduplication. Same provider can have multiple concurrent sync jobs queued.

**Per BullMQ docs:** "BullMQ can block jobs with the same jobId from being added multiple times"

**Solution:**
```typescript
// When enqueueing sync jobs
await this.queue.add('sync', jobData, {
  jobId: `sync:${providerId}:${syncType}:${Math.floor(Date.now() / 60000)}`,
  // Deduplicates within 1-minute windows
});

// For webhook-triggered syncs
await this.queue.add('sync', jobData, {
  jobId: `webhook-sync:${providerId}:${changeId}`,
});
```

**Tasks:**
- [ ] Add jobId to sync job enqueue in scheduler
- [ ] Add jobId to webhook-triggered sync jobs
- [ ] Add jobId to manual sync triggers
- [ ] Test deduplication under load

---

### 6.3 SyncWorker Should Extend BaseWorker (MEDIUM Priority)

**Files:** `workers/sync.worker.ts`
**Effort:** 2-3 hours
**Risk:** MEDIUM - Inconsistent behavior, duplicated code

**Issue:** SyncWorker implements its own lifecycle instead of extending BaseWorker like other workers. ~200 LOC of duplicated patterns.

**Current state:**
- ✅ EmailSendWorker extends BaseWorker
- ✅ SyncBackWorker extends BaseWorker
- ✅ FolderOperationsWorker extends BaseWorker
- ✅ BulkOperationsWorker extends BaseWorker
- ❌ SyncWorker does NOT extend BaseWorker

**Tasks:**
- [ ] Refactor SyncWorker to extend BaseWorker
- [ ] Move priority queue handling to config array pattern
- [ ] Remove duplicated lifecycle code
- [ ] Ensure multi-queue workers work with BaseWorker

---

### 6.4 EmailSend Rate Limiting Increase (MEDIUM Priority)

**Files:** `workers/email-send.worker.ts`
**Effort:** 30 min
**Risk:** MEDIUM - Bottleneck for high-volume sending

**Current config:**
```typescript
concurrency: 3,
limiter: { max: 10, duration: 60000 } // 10 sends/minute
```

**With 1000 users:** Only 30 emails/minute system-wide causes significant backlog

**Recommended config:**
```typescript
concurrency: 10, // Was 3
limiter: { max: 50, duration: 60000 } // 50 sends/minute per worker
```

**Provider limits reference:**
- Gmail: 100 messages/second burst
- Microsoft: 30 messages/minute per mailbox
- IMAP: Varies by provider

**Tasks:**
- [ ] Increase concurrency to 10
- [ ] Increase rate limit to 50/minute
- [ ] Add per-provider rate limiting (see 6.6)
- [ ] Monitor queue depth after change

---

### 6.5 Fencing Tokens for Long-Running Syncs (LOW Priority)

**Files:** `common/services/redis-lock.service.ts`
**Effort:** 2-3 hours
**Risk:** LOW - Edge case for very long operations

**Issue:** Per Redis docs: "You should implement fencing tokens. This is especially important for processes that can take significant time."

Sync operations can run 10-15 minutes. If lock expires mid-operation, another worker could acquire lock and both write to same resources.

**Solution:**
```typescript
async acquireLockWithFence(key: string, ttlMs: number): Promise<{ lockId: string; fenceToken: number } | null> {
  const lockId = await this.acquireLock(key, ttlMs);
  if (!lockId) return null;

  // Increment global fence counter atomically
  const fenceToken = await this.redis.incr(`fence:${key}`);
  return { lockId, fenceToken };
}

// In database writes, verify fence token is still valid
async writeWithFence(key: string, currentFence: number, writeFn: () => Promise<void>) {
  const latestFence = await this.redis.get(`fence:${key}`);
  if (parseInt(latestFence || '0') > currentFence) {
    throw new Error('Stale lock - another process has taken over');
  }
  await writeFn();
}
```

**Tasks:**
- [ ] Add `acquireLockWithFence()` to RedisLockService
- [ ] Add `writeWithFence()` helper
- [ ] Update SyncWorker to use fencing for critical writes
- [ ] Add tests for fence token scenarios

---

### 6.6 Per-Provider Rate Limiting (LOW Priority)

**Files:** New utility or ResilienceService extension
**Effort:** 3-4 hours
**Risk:** LOW - Enhancement for fairness

**Issue:** Current rate limiting is per-worker, not per-provider-type. Gmail, Microsoft, and IMAP have different limits.

**Solution:**
```typescript
const PROVIDER_LIMITS: Record<string, { perSecond: number; perMinute: number }> = {
  google: { perSecond: 25, perMinute: 100 },    // Gmail API limits
  microsoft: { perSecond: 10, perMinute: 30 },  // Graph API limits
  imap: { perSecond: 5, perMinute: 60 },        // Conservative IMAP
};

async checkProviderRateLimit(providerId: string, providerType: string): Promise<boolean> {
  const limits = PROVIDER_LIMITS[providerType];
  const key = `rate:${providerType}:${providerId}`;
  // Use INCR + EXPIRE pattern from Phase 1.2
}
```

**Tasks:**
- [ ] Define provider-specific rate limits
- [ ] Add rate limit check before provider API calls
- [ ] Add metrics for rate limit hits per provider type
- [ ] Consider BullMQ Pro group rate limiting for future

---

### Capacity Planning for 1000 Users

**Recommended Worker Deployment (3 pods):**

| Worker | Concurrency | Total Capacity |
|--------|-------------|----------------|
| SyncWorker (high) | 17 × 3 | 51 concurrent |
| SyncWorker (normal) | 10 × 3 | 30 concurrent |
| SyncWorker (low) | 7 × 3 | 21 concurrent |
| EmailSendWorker | 10 × 3 | 30 concurrent |
| SyncBackWorker | 5 × 3 | 15 concurrent |
| FolderOperationsWorker | 5 × 3 | 15 concurrent |
| BulkOperationsWorker | 2 × 3 | 6 concurrent |

**Total sync capacity:** 102 concurrent syncs
**Average sync time:** 30-60 seconds
**Throughput:** ~100-200 syncs/minute = 6000-12000 syncs/hour

**For 1000 users with 15-min sync interval:** 4000 syncs/hour needed ✅

---

## Timeline Summary

| Phase | Focus | Duration | Risk Reduction |
|-------|-------|----------|----------------|
| **Phase 1** | Race Conditions | Week 1 | HIGH |
| **Phase 2** | Bug Fixes | Week 2 | HIGH → MEDIUM |
| **Phase 3** | Dead Code | Week 3 | LOW (cleanup) |
| **Phase 4** | Consolidation | Week 4 | LOW (maintainability) |
| **Phase 5** | Monitoring | Week 5 | MEDIUM (observability) |
| **Phase 6** | Multi-Tenant Scale | Week 6 | HIGH (1000+ users) |

---

## Success Metrics

| Metric | Before | Target | After Phase |
|--------|--------|--------|-------------|
| HIGH Issues | 5 | 0 | Phase 1-2 |
| MEDIUM Issues | 6 | 0 | Phase 2 |
| Dead Code LOC | ~500 | 0 | Phase 3 |
| Duplicate LOC | ~450 | <100 | Phase 4 |
| Test Coverage | TBD | >80% | Phase 4 |
| Alerting Coverage | 0% | 100% | Phase 5 |

---

## Appendix: Issue Reference

### HIGH Priority Issues

| ID | Description | Phase |
|----|-------------|-------|
| RC-16 | Half-open circuit transition race | 1.1 |
| RC-17 | Success counter lost updates | 1.1 |
| RC-19 | Rate limit counter drift | 1.2 |
| NEW-3 | Provider counter never decrements | 1.3 |
| NEW-11 | Lock fails OPEN on Redis error | 2.1 |

### MEDIUM Priority Issues

| ID | Description | Phase |
|----|-------------|-------|
| NEW-1 | DegradedMode stuck after Redis failure | 2.2 |
| NEW-4 | Provider counter can go negative | 1.3 |
| NEW-6 | Bulk sync bypasses backpressure | 2.3 |
| NEW-9 | Driver connection leak on refresh | 2.4 |
| RC-18 | Failure counter lost updates | 1.1 |
| RC-20 | Check-increment race | 1.3 |

### LOW Priority Issues

| ID | Description | Phase |
|----|-------------|-------|
| NEW-2 | Missing await on retry rate limit | 2 |
| NEW-7 | Timer not unreferenced | 4.3 |
| NEW-8 | Error log level too severe | 2 |
| NEW-10 | Dedup TTL excessive | Backlog |
| NEW-12 | Parallel folder upsert race | Backlog |
| NEW-13 | isRunning flag race | Backlog |
| RC-21 | Orphan counter on job removal | 1.3 |
| RC-22 | Non-atomic increment + expire | 1.3 |
| RC-23 | Lock fail-open risk | 2.1 |
