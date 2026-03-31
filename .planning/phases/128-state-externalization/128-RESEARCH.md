# Phase 128: State Externalization - Research

**Researched:** 2026-03-31
**Domain:** Redis-based state externalization for horizontal scaling
**Confidence:** HIGH

## Summary

Phase 128 addresses SCAL-04: three in-memory state holders that diverge across backend replicas. After reading all three source files, the situation is clearer than expected:

1. **TriageLearningService** (`triage-learning.service.ts`) already uses Redis as its persistent store. The problem is two `Map` objects (`signalBuffer` and `scoreCache`) that buffer/cache in-memory. With N replicas, each replica buffers independently, meaning signals hitting replica A are invisible to replica B until flushed. The `scoreCache` is a read-through cache that will naturally diverge.

2. **CircuitBreaker** (`circuit-breaker.utils.ts`) is a pure in-memory utility class used via a global singleton registry. It tracks failure counts, timestamps, and state (CLOSED/OPEN/HALF_OPEN) per provider-operation pair. With N replicas, each replica has its own breaker state -- one replica could have OPEN while another is CLOSED.

3. **EmailTriageService** (`email-triage.service.ts`) has a static in-memory semaphore (`currentOperations` counter + `waitQueue` array) limiting concurrent LLM triage operations to 5. With N replicas, the effective limit becomes N*5, which defeats the purpose of protecting the LLM API.

**Primary recommendation:** Use Redis atomic operations for signal buffer and semaphore; document CircuitBreaker as intentionally per-instance with explicit tradeoff analysis (shared CB via Redis adds latency to every API call for marginal benefit).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAL-04 | In-memory state in TriageLearningService, CircuitBreaker, and EmailTriage semaphore externalized to Redis | All three components identified, current implementations read, Redis patterns documented below |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Post-edit validation mandatory:** `cd backend && npx tsc --noEmit` after every file edit
- **Follow existing patterns:** RedisConnectionService and RedisLockService already exist -- use them
- **Multi-tenant rule:** Every query must include tenantId
- **Max 500 lines per file**
- **Scope control:** Do exactly what was asked, no extras
- **NEVER SUPPOSE:** If uncertain about behavior, verify by reading code

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | 5.9.3 | Redis client | Already used throughout backend via RedisConnectionService |
| @nestjs/common | 11.x | DI framework | Project standard |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| RedisLockService | N/A (internal) | Distributed locking with SET NX + Lua scripts | Semaphore implementation |
| RedisConnectionService | N/A (internal) | Shared ioredis connection | All Redis operations |

### No New Dependencies Required

All three externalization tasks can be accomplished with existing `ioredis` commands. No need for `redlock`, `redis-semaphore`, or similar packages.

## Architecture Patterns

### Pattern 1: Redis-Based Signal Buffer (TriageLearningService)

**What:** Replace the in-memory `signalBuffer` Map with Redis Lists. Each signal is RPUSH'd to a Redis list keyed by `triage:signal-buffer:{tenantId}:{senderEmail}`. The periodic flush reads (LRANGE + DEL) and computes scores.

**Why not just remove the buffer entirely?** The buffer exists for a reason: batching reduces Redis writes and allows EMA blending over multiple signals. Direct-to-hash writes would lose the batching optimization.

**Implementation approach:**
```typescript
// Record signal: RPUSH to Redis list (atomic, visible to all replicas)
const bufferKey = `triage:signal-buffer:${tenantId}:${senderEmail}`;
await this.redis.rpush(bufferKey, JSON.stringify(signal));
await this.redis.expire(bufferKey, 600); // 10 min TTL safety net

// Check length for threshold flush
const len = await this.redis.llen(bufferKey);
if (len >= FLUSH_THRESHOLD) {
  // Atomic drain: LRANGE + DEL in pipeline
  const pipeline = this.redis.pipeline();
  pipeline.lrange(bufferKey, 0, -1);
  pipeline.del(bufferKey);
  const results = await pipeline.exec();
  const rawSignals = results[0][1] as string[];
  // ... compute and flush
}
```

**scoreCache removal:** The `scoreCache` Map can be removed entirely. It's a read-through cache over Redis HGET which is already sub-millisecond. The cache adds complexity (staleness across replicas) for negligible performance gain. Redis HGET on a small hash is <1ms.

### Pattern 2: Per-Instance CircuitBreaker (Document Tradeoff)

**What:** Keep CircuitBreaker as per-instance in-memory state. Document the deliberate tradeoff.

**Why per-instance is correct:**
1. Circuit breakers protect the *calling* instance from cascade failure. If replica A sees Google 500s, it should stop calling. Replica B, which may be hitting a different Google endpoint or getting different results, should make its own decision.
2. Shared CB via Redis adds a Redis round-trip to EVERY external API call (check state before call, update after call). For email sync drivers that make hundreds of API calls per sync, this is unacceptable latency.
3. The failure window (60s) and reset timeout (30s) are short enough that replicas converge quickly anyway.
4. Industry practice: Netflix Hystrix, resilience4j, and Polly all use per-instance circuit breakers by default. Shared state is an anti-pattern for circuit breakers.

**What to document:**
- Per-instance means N replicas could each make `failureThreshold` calls before tripping, so worst case is N * failureThreshold requests to a failing service before all replicas stop.
- For PMSync with 2-4 replicas and failureThreshold=5, that's 10-20 requests max -- acceptable.
- If this becomes problematic at scale, the mitigation is a Redis INCR-based failure counter with TTL (shared counter, local decision).

### Pattern 3: Redis-Based Distributed Semaphore (EmailTriageService)

**What:** Replace the static in-memory semaphore with a Redis-based counting semaphore using INCR/DECR with TTL safety.

**Implementation approach using existing RedisLockService pattern:**
```typescript
const SEMAPHORE_KEY = 'pmsync:triage-semaphore:count';
const MAX_CONCURRENT = 5; // Global across all replicas
const SEMAPHORE_TTL = 120; // 2 min safety TTL per slot

async acquireSemaphore(): Promise<boolean> {
  // Atomic increment and check
  const script = `
    local current = tonumber(redis.call("GET", KEYS[1]) or "0")
    if current < tonumber(ARGV[1]) then
      redis.call("INCR", KEYS[1])
      redis.call("EXPIRE", KEYS[1], ARGV[2])
      return 1
    else
      return 0
    end
  `;
  const result = await this.redis.eval(script, 1, SEMAPHORE_KEY, MAX_CONCURRENT, SEMAPHORE_TTL);
  return result === 1;
}

releaseSemaphore(): void {
  // Atomic decrement, floor at 0
  const script = `
    local current = tonumber(redis.call("GET", KEYS[1]) or "0")
    if current > 0 then
      redis.call("DECR", KEYS[1])
    end
    return current - 1
  `;
  this.redis.eval(script, 1, SEMAPHORE_KEY).catch(err =>
    this.logger.error(`Semaphore release failed: ${err.message}`)
  );
}
```

**TTL safety:** The EXPIRE on each INCR prevents deadlocks if a replica crashes without releasing. The 2-minute TTL is longer than the max 30s wait + processing time, so slots won't expire during normal operation.

**Wait queue:** The in-memory `waitQueue` pattern doesn't translate to distributed. Instead, use a simple retry-with-backoff approach: if semaphore is full, return false immediately (skip triage for this sync, retry on next). This matches the current behavior where queue-full returns false.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distributed locking | Custom Redis lock | Existing `RedisLockService` | Already battle-tested with Lua scripts, fencing tokens, auto-renewal |
| Redis connection | New Redis() calls | Existing `RedisConnectionService` | Single shared connection, error handling, lifecycle management |
| Counting semaphore | Complex Redlock algorithm | Simple INCR/DECR + Lua + TTL | Redlock is for mutual exclusion; a counting semaphore needs simpler primitives |

## Common Pitfalls

### Pitfall 1: Semaphore Leak on Crash
**What goes wrong:** Process crashes after INCR but before DECR, permanently reducing available slots.
**Why it happens:** No automatic cleanup for crashed processes.
**How to avoid:** Use EXPIRE on the semaphore key. When all replicas are healthy, normal DECR keeps the count accurate. The TTL is a safety net that auto-resets if all replicas crash.
**Warning signs:** Semaphore count stuck at max with no active operations.

### Pitfall 2: Signal Buffer Race on Flush
**What goes wrong:** Two replicas both see len >= FLUSH_THRESHOLD and both drain the same signals.
**Why it happens:** LLEN + LRANGE + DEL is not atomic.
**How to avoid:** Use a Lua script that atomically reads and deletes, OR use RPOPLPUSH/LMPOP to atomically pop signals. Alternative: use RedisLockService.withLock() around the flush operation.
**Warning signs:** Duplicate signal processing, inflated totalSignals counts.

### Pitfall 3: Removing scoreCache Without Measuring
**What goes wrong:** If getSenderBehavior is called in a hot path (inside a loop per email), removing the cache increases Redis round-trips significantly.
**Why it happens:** Cache removal seems "simple" but the call frequency matters.
**How to avoid:** Check call sites. If called once per triage batch (it is -- via AttentionScoreService), removing cache is safe. If called per-email, keep a short-lived local cache (5s TTL Map with timestamp check).

### Pitfall 4: setInterval Flush in Multi-Replica
**What goes wrong:** With N replicas, flush runs N times per interval, but since signals are now in Redis, only one flush per key is needed.
**Why it happens:** Each replica has its own setInterval timer.
**How to avoid:** The flush is idempotent if using atomic LRANGE+DEL. Multiple flushes on an empty list are harmless (just no-ops). Keep the interval, it's a safety net.

## Code Examples

### Lua Script: Atomic Semaphore Acquire
```typescript
// Source: ioredis eval() documentation + existing pattern in RedisLockService
private readonly ACQUIRE_SCRIPT = `
  local current = tonumber(redis.call("GET", KEYS[1]) or "0")
  if current < tonumber(ARGV[1]) then
    redis.call("INCR", KEYS[1])
    redis.call("EXPIRE", KEYS[1], ARGV[2])
    return 1
  else
    return 0
  end
`;
```

### Lua Script: Atomic Buffer Drain
```typescript
// Source: Redis LRANGE + DEL pattern
private readonly DRAIN_SCRIPT = `
  local items = redis.call("LRANGE", KEYS[1], 0, -1)
  if #items > 0 then
    redis.call("DEL", KEYS[1])
  end
  return items
`;
```

### RedisConnectionService Injection Pattern (Existing)
```typescript
// Source: backend/src/modules/ai/services/triage-learning.service.ts (already does this)
constructor(private readonly redisConnection: RedisConnectionService) {}

onModuleInit() {
  this.redis = this.redisConnection.client;
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern="triage-learning\|circuit-breaker\|email-triage" --no-coverage` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAL-04a | Signal buffer uses Redis lists instead of Map | unit | `npx jest --testPathPattern="triage-learning" -t "signal buffer" --no-coverage` | No -- Wave 0 |
| SCAL-04b | CircuitBreaker documented as per-instance | manual-only | N/A (documentation review) | N/A |
| SCAL-04c | Triage semaphore uses Redis INCR/DECR | unit | `npx jest --testPathPattern="email-triage" -t "semaphore" --no-coverage` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit` (type-check)
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `backend/src/modules/ai/services/__tests__/triage-learning.spec.ts` -- covers SCAL-04a (mock Redis, verify RPUSH/LRANGE/DEL calls)
- [ ] `backend/src/modules/ai/services/__tests__/email-triage-semaphore.spec.ts` -- covers SCAL-04c (mock Redis, verify EVAL calls for acquire/release)
- [ ] No new test fixtures needed -- existing Redis mock patterns in codebase

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory Map buffers | Redis List buffers | This phase | Signals visible across all replicas |
| In-memory static counter semaphore | Redis INCR/DECR counting semaphore | This phase | Global concurrency limit enforced |
| In-memory read-through cache | Direct Redis HGET (sub-ms) | This phase | No stale cache across replicas |

## Open Questions

1. **Flush interval overlap safety**
   - What we know: Multiple replicas will each run flushAllBuffers() every 5 minutes. With Redis-backed buffers, this is safe because atomic drain is idempotent on empty lists.
   - What's unclear: Whether we should reduce flush frequency now that signals are immediately visible in Redis.
   - Recommendation: Keep 5-minute interval as-is. It's a safety net, not a primary mechanism. Optimize later if Redis load is concerning.

2. **Semaphore TTL tuning**
   - What we know: Current in-memory semaphore has a 30s wait timeout. LLM triage for 50 emails with 500ms delays takes ~25s.
   - What's unclear: Optimal TTL for the Redis semaphore key.
   - Recommendation: 120s TTL (2x max operation time). Conservative, prevents stuck slots.

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/ai/services/triage-learning.service.ts` -- full source read, signal buffer and scoreCache Maps identified
- `backend/src/common/utils/circuit-breaker.utils.ts` -- full source read, global singleton registry with per-instance state
- `backend/src/modules/ai/services/email-triage.service.ts` -- full source read, static counter + waitQueue semaphore
- `backend/src/common/services/redis-lock.service.ts` -- full source read, Lua scripts for atomic operations, SET NX pattern
- `backend/src/common/services/redis-connection.service.ts` -- full source read, shared ioredis connection

### Secondary (MEDIUM confidence)
- ioredis eval() for Lua scripting -- well-established pattern already used in RedisLockService
- Redis INCR/DECR counting semaphore pattern -- standard Redis pattern, no external library needed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already in project, no new packages
- Architecture: HIGH -- all three components read in full, patterns derive from existing codebase (RedisLockService Lua scripts)
- Pitfalls: HIGH -- identified from direct code reading, not speculation

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable domain, no external API changes)
