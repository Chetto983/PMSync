# Phase 2: Race Condition Fixes - Research

## Purpose

This document captures research findings to inform the planning of Phase 2: Race Condition Fixes. The goal is to ensure folder operations are atomic and cannot corrupt data under concurrent load.

---

## 1. Current State Analysis

### 1.1 Existing Infrastructure

**RedisLockService** (`backend/src/common/services/redis-lock.service.ts`):
- Already exists in the codebase
- Used by VoltAgentService for memory operations
- Uses `ioredis` for Redis communication
- Basic lock/unlock pattern with TTL support

**PrismaRetryService** (`backend/src/common/services/prisma-retry.service.ts`):
- Handles P2002 (unique constraint) and P2034 (deadlock) errors
- Implements exponential backoff: `delay = Math.min(100 * Math.pow(2, attempt), 2000)`
- Phase 1 verified this already works - **no changes needed**

**AlertingService** (`backend/src/common/services/alerting.service.ts`):
- Centralized alerting with `warning` and `critical` levels
- Has patterns for queue utilization, provider errors, auth errors
- Can be extended for lock duration monitoring

**Folder-sync.service.ts** (1,629 lines):
- Currently has some Redis lock usage for sync operations
- Lock key patterns: `folder-sync:{providerId}`, `folder-crud:{providerId}`
- Missing: comprehensive CRUD operation locking (RC-A8)

### 1.2 Existing Stress Tests

The project has comprehensive stress testing infrastructure:
- `stress-test-folder-race-conditions.ts` - Tests RC-A1, RC-A8 lock patterns
- `test-redis-lock-contention.ts` - Tests lock acquisition, contention, TTL expiry
- Test patterns: 20-worker high contention, provider isolation, CRUD serialization

### 1.3 VoltAgent Conversation Structure

VoltAgent uses an external Memory API (`@voltagent/core`) with PostgreSQLMemoryAdapter:
- `memory.getConversation()` - Retrieve conversation
- `memory.saveMessage()` - Save messages
- `memory.updateConversation()` - Update metadata
- Context is built separately via `ChatContextBuilderService`

**Key Finding**: VoltAgent memory operations are **external** to Prisma transactions. The atomicity requirement applies to:
1. User's Prisma-based context updates (if any)
2. Memory API calls that need to succeed or fail together

---

## 2. Distributed Lock Patterns (2025/2026 Best Practices)

### 2.1 Recommended Approach: Single Redis Instance with SETNX

For this codebase's needs, the simple SETNX pattern is sufficient:

```typescript
// Pattern from existing stress tests - proven to work
async acquireLock(key: string, ttlMs: number): Promise<boolean> {
  const result = await redis.set(key, 'locked', 'PX', ttlMs, 'NX');
  return result === 'OK';
}
```

**Why not Redlock?**
- Redlock is for multi-Redis-instance deployments for fault tolerance
- This project uses a single Redis instance
- Added complexity not justified for current architecture

### 2.2 Lock Duration & TTL Best Practices

From [Redis Distributed Locking Guide](https://shayne007.github.io/2025/06/12/Redis-Distributed-Locking-Complete-Guide/):

| Scenario | Recommended TTL | Rationale |
|----------|-----------------|-----------|
| Folder sync | 5 minutes (300,000ms) | Large folders may take time; 4-min alert threshold gives 1-min buffer |
| Folder CRUD | 30 seconds | Simple operations should be fast |
| VoltAgent context | 10 seconds | Memory operations typically fast |

**Critical**: Always set TTL to prevent deadlocks if process crashes.

### 2.3 Lock Key Naming Convention

Current pattern is correct:
- `folder-sync:{providerId}` - Serializes sync for same provider
- `folder-crud:{providerId}` - Serializes CRUD for same provider

Different providers can operate in parallel (correct isolation).

### 2.4 Retry Pattern for Lock Contention

From [MurLock NestJS](https://github.com/felanios/murlock):

```typescript
// Exponential backoff with jitter
const retryDelay = 100; // base delay
const retryJitter = 50; // random 0-50ms added
const maxRetries = 30;

for (let attempt = 0; attempt < maxRetries; attempt++) {
  if (await acquireLock(key, ttl)) {
    return execute();
  }
  await sleep(retryDelay + Math.random() * retryJitter);
}
throw new LockAcquisitionError(key);
```

---

## 3. Lock Duration Monitoring & Alerting

### 3.1 RC-A1 Enhancement: 4-Minute Alert

From [Redis Monitoring Best Practices](https://last9.io/blog/redis-metrics-monitoring/):

**Implementation Pattern**:
```typescript
async syncWithMonitoring(providerId: string) {
  const lockKey = `folder-sync:${providerId}`;
  const lockTtlMs = 300_000; // 5 minutes
  const alertThresholdMs = 240_000; // 4 minutes

  const startTime = Date.now();
  let alertFired = false;

  // Monitor lock duration in background
  const monitorInterval = setInterval(() => {
    const duration = Date.now() - startTime;
    if (duration > alertThresholdMs && !alertFired) {
      alertFired = true;
      this.alertingService.createAlert(
        'warning',
        'folder_sync_long_running',
        `Folder sync for provider ${providerId} exceeds 4 minutes`,
        duration,
        alertThresholdMs
      );
    }
  }, 30_000); // Check every 30 seconds

  try {
    // ... actual sync logic
  } finally {
    clearInterval(monitorInterval);
  }
}
```

**Alternative: Lock Acquisition Timestamp**
```typescript
// Store start time in lock value
await redis.set(lockKey, JSON.stringify({
  startTime: Date.now(),
  holder: 'worker-123'
}), 'PX', ttlMs, 'NX');

// Background job checks for long-held locks
const lockData = JSON.parse(await redis.get(lockKey));
if (lockData && Date.now() - lockData.startTime > 240_000) {
  alert(`Lock ${lockKey} held for >4 minutes by ${lockData.holder}`);
}
```

### 3.2 Extending AlertingService

Add new method for lock duration alerts:
```typescript
checkLockDuration(lockKey: string, durationMs: number, thresholdMs: number): Alert | null {
  if (durationMs >= thresholdMs) {
    return this.createAlert(
      'warning',
      'lock_duration_exceeded',
      `Lock ${lockKey} held for ${Math.floor(durationMs / 1000)}s`,
      durationMs,
      thresholdMs
    );
  }
  return null;
}
```

---

## 4. Prisma Transaction Patterns for Atomicity

### 4.1 Interactive Transactions

From [Prisma Transactions Documentation](https://www.prisma.io/docs/orm/prisma-client/queries/transactions):

```typescript
// Pattern for RACE-03: Conversation + context atomicity
await this.prisma.$transaction(async (tx) => {
  // 1. Update user context in Prisma
  await tx.userContext.update({
    where: { userId_tenantId: { userId, tenantId } },
    data: { lastConversationAt: new Date() }
  });

  // 2. Update related entities
  await tx.conversationMetadata.upsert({
    where: { conversationId },
    create: { conversationId, userId, tenantId, ... },
    update: { updatedAt: new Date() }
  });

  // If any fails, both roll back
});
```

**Important**: VoltAgent's Memory API is **external** to Prisma. Options:

1. **Two-Phase Commit (Complex)**: Not recommended - adds significant complexity
2. **Compensating Transaction (Recommended)**: If Prisma succeeds but Memory fails, roll back Prisma changes
3. **Best-Effort with Logging**: Log discrepancies, fix via background job

### 4.2 Recommended Pattern for VoltAgent Atomicity

```typescript
async updateConversationWithContext(
  conversationId: string,
  userId: string,
  tenantId: string,
  contextUpdate: ContextData
): Promise<void> {
  // Phase 1: Prisma transaction (can rollback)
  const prismaResult = await this.prisma.$transaction(async (tx) => {
    await tx.userContext.update({ ... });
    await tx.conversationLog.create({ ... });
    return { success: true, timestamp: new Date() };
  });

  // Phase 2: VoltAgent Memory (no rollback - compensate on failure)
  try {
    await this.memory.updateConversation(conversationId, {
      metadata: { lastContextUpdate: prismaResult.timestamp }
    });
  } catch (error) {
    // Compensate: rollback Prisma changes
    await this.prisma.conversationLog.delete({
      where: { conversationId, createdAt: prismaResult.timestamp }
    });
    throw new AiError('Conversation update failed', AiErrorCode.INTERNAL_ERROR);
  }
}
```

### 4.3 Transaction Timeout

From [NestJS Prisma Transactions](https://wanago.io/2023/04/17/api-nestjs-prisma-transactions/):

```typescript
await this.prisma.$transaction(
  async (tx) => { /* ... */ },
  {
    maxWait: 5000,    // Wait max 5s to acquire connection
    timeout: 30000,   // Transaction must complete in 30s
    isolationLevel: 'Serializable' // Or 'ReadCommitted' for less strict
  }
);
```

---

## 5. LLM API Timeout Handling

### 5.1 Current Implementation

From `mistral.service.ts`:
```typescript
// Already has timeout pattern!
const timeoutMs = options?.timeoutMs ?? 60000; // Default 60s for RAG
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new AiError(
    `LLM request timed out after ${timeoutMs}ms`,
    AiErrorCode.PROVIDER_TIMEOUT
  )), timeoutMs);
});

const completion = await Promise.race([completionPromise, timeoutPromise]);
```

**Finding**: 60-second timeout is already implemented in `mistral.service.ts` for RAG responses.

### 5.2 RACE-04: Graceful Partial Response Fallback

From [LLM Error Handling Guide](https://markaicode.com/llm-error-handling-production-guide/):

**Pattern: Layered Fallback**
```typescript
async chatWithFallback(message: string): Promise<ChatResult> {
  try {
    // Try full response with timeout
    return await this.chat(message, { timeoutMs: 60000 });
  } catch (error) {
    if (error.code === AiErrorCode.PROVIDER_TIMEOUT) {
      // Fallback 1: Return cached similar response
      const cached = await this.semanticCache.findSimilar(message);
      if (cached) {
        return { text: cached.response, fromCache: true, isPartial: true };
      }

      // Fallback 2: Simple rule-based response
      return {
        text: this.getGracefulTimeoutResponse(message),
        isPartial: true,
        wasTimeout: true
      };
    }
    throw error;
  }
}

getGracefulTimeoutResponse(message: string): string {
  // Based on detected intent, provide basic response
  if (message.toLowerCase().includes('email')) {
    return "I'm processing your email request. This is taking longer than expected. Please try again in a moment.";
  }
  return "I'm having trouble completing your request right now. Please try again shortly.";
}
```

### 5.3 Circuit Breaker Pattern

From [Portkey Docs on Timeouts](https://portkey.ai/docs/product/ai-gateway/request-timeouts):

```typescript
class LlmCircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private isOpen = false;

  async call<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.isOpen && Date.now() - this.lastFailure < 60000) {
      return fallback(); // Circuit open - use fallback
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.isOpen = false;
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= 3) {
        this.isOpen = true;
      }
      return fallback();
    }
  }
}
```

---

## 6. Stress Testing Patterns

### 6.1 Existing Test Infrastructure

The project already has comprehensive stress tests. For Phase 2, extend:

**TEST-01: RC-A1 Monitoring**
```typescript
async function testMonitoringFires(): Promise<TestResult> {
  // Start a sync that will take >4 minutes (mock slow operation)
  // Verify alert is created with correct type and threshold
  // Verify alert fires exactly once
}
```

**TEST-02: RC-A8 Concurrent CRUD**
```typescript
async function testConcurrentCrud(): Promise<TestResult> {
  const operations = [
    { type: 'create', folder: 'Test1' },
    { type: 'rename', folder: 'Test1', newName: 'Test2' },
    { type: 'delete', folder: 'Test2' }
  ];

  // Fire all operations concurrently
  const results = await Promise.all(operations.map(op => executeCrud(op)));

  // Verify:
  // 1. No P2002 errors
  // 2. Operations executed in deterministic order
  // 3. Final state is consistent
}
```

**TEST-03: Conversation Atomicity**
```typescript
async function testConversationAtomicity(): Promise<TestResult> {
  // Start conversation + context update
  // Force Memory API to fail mid-transaction
  // Verify Prisma changes were rolled back
  // Verify no orphaned records
}
```

### 6.2 Load Testing Pattern

From [Stress Testing Race Conditions](https://www.thegreenreport.blog/articles/using-stress-tests-to-catch-race-conditions-in-api-rate-limiting-logic/):

```typescript
async function stressTenConcurrentSyncs(): Promise<TestResult> {
  const providers = await getTestProviders(10);
  const startTime = Date.now();

  // Fire all syncs at exactly the same moment
  const syncPromises = providers.map(p =>
    folderSyncService.syncProviderFolders(p.id)
  );

  const results = await Promise.allSettled(syncPromises);
  const duration = Date.now() - startTime;

  // Verify:
  // 1. All completed (no deadlocks)
  // 2. No duplicate folders created
  // 3. No data corruption
  // 4. Duration reasonable (not serialized across providers)

  const duplicates = await findDuplicateFolders();
  return {
    passed: duplicates.length === 0,
    details: `10 concurrent syncs in ${duration}ms, duplicates: ${duplicates.length}`
  };
}
```

---

## 7. Common Pitfalls to Avoid

### 7.1 Lock Pitfalls

| Pitfall | Mitigation |
|---------|------------|
| Forgetting TTL | Always set TTL, never indefinite lock |
| Lock not released on error | Use try/finally pattern |
| Wrong lock granularity | Lock at provider level, not global |
| Lock key collisions | Use consistent naming: `{operation}:{entityId}` |
| Checking lock then acquiring | Use atomic SETNX, not GET then SET |

### 7.2 Transaction Pitfalls

| Pitfall | Mitigation |
|---------|------------|
| Transaction too long | Keep transactions short (<30s) |
| External calls in transaction | Never call external APIs inside $transaction |
| Deadlock from lock order | Always acquire locks in same order |
| N+1 queries in transaction | Batch operations, use `createMany` |

### 7.3 Timeout Pitfalls

| Pitfall | Mitigation |
|---------|------------|
| No fallback on timeout | Always have graceful degradation |
| Infinite retries | Set max retry count |
| Timeout too short | 60s is reasonable for LLM; don't go lower |
| Not logging timeouts | Log for debugging and monitoring |

---

## 8. Implementation Recommendations

### 8.1 Priority Order

1. **RACE-02** (Folder CRUD locks) - Highest impact, builds on existing infrastructure
2. **RACE-01** (Monitoring) - Quick win, uses existing AlertingService
3. **RACE-04** (LLM timeout fallback) - Partially done, needs fallback logic
4. **RACE-03** (VoltAgent atomicity) - Most complex, needs careful design

### 8.2 Files to Modify

| Requirement | Files |
|-------------|-------|
| RACE-01 | `folder-sync.service.ts`, `alerting.service.ts` |
| RACE-02 | `folder-sync.service.ts` (lines 1032, 1087, 1149 per audit) |
| RACE-03 | New service: `conversation-atomicity.service.ts` or extend `chat-prepare.service.ts` |
| RACE-04 | `mistral.service.ts` or `voltagent.service.ts` |

### 8.3 Test Files to Create

| Test | File |
|------|------|
| TEST-01 | `stress-test-lock-monitoring.ts` |
| TEST-02 | Extend `stress-test-folder-race-conditions.ts` |
| TEST-03 | `test-conversation-atomicity.ts` |

---

## 9. Sources

- [Redis Distributed Locking: Complete Guide](https://shayne007.github.io/2025/06/12/Redis-Distributed-Locking-Complete-Guide/)
- [MurLock: NestJS Distributed Locking](https://github.com/felanios/murlock)
- [Eliminating Race Conditions in NestJS](https://medium.com/@ahsan-ali-mansoor/eliminating-race-conditions-in-nestjs-with-distributed-locking-04d16826dece)
- [Prisma Transactions Documentation](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [Interactive Transactions in Prisma](https://dev.to/ashukr22/interactive-transactions-in-prisma-a-developers-guide-4mg6)
- [Stop Passing the Hot Potato: Managing Prisma Transactions in NestJS](https://masoudx.medium.com/stop-passing-the-hot-potato-managing-prisma-transactions-in-nestjs-8f30eeb5bb54)
- [LLM Error Handling Best Practices](https://markaicode.com/llm-error-handling-production-guide/)
- [Building AI That Never Goes Down: Graceful Degradation](https://medium.com/@mota_ai/building-ai-that-never-goes-down-the-graceful-degradation-playbook-d7428dc34ca3)
- [Portkey Request Timeouts](https://portkey.ai/docs/product/ai-gateway/request-timeouts)
- [Using Stress Tests to Catch Race Conditions](https://www.thegreenreport.blog/articles/using-stress-tests-to-catch-race-conditions-in-api-rate-limiting-logic/)
- [Redis Metrics Monitoring Best Practices](https://last9.io/blog/redis-metrics-monitoring/)
- [The Twelve Redis Locking Patterns](https://medium.com/@navidbarsalari/the-twelve-redis-locking-patterns-every-distributed-systems-engineer-should-know-06f16dfe7375)

---

## 10. Key Decisions for Planning

| Decision Point | Recommendation | Rationale |
|----------------|----------------|-----------|
| Lock library | Use existing SETNX pattern | Already proven in codebase, no external deps |
| Lock TTL for sync | 5 minutes | Allows 4-min alert with 1-min buffer |
| Lock TTL for CRUD | 30 seconds | Simple ops should be fast |
| Transaction pattern | Interactive with compensating | Handles external Memory API |
| LLM fallback | Cached response + graceful message | Better UX than hard failure |
| Test approach | Real DB, not mocks | Per CLAUDE.md and existing patterns |

---

*Research completed: 2026-01-31*
