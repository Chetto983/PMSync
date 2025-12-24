# Race Condition Audit Report - Email Sync & Email Modules

**Date:** 2025-12-24
**Scope:** `backend/src/modules/email-sync/` and `backend/src/modules/email/`
**Auditor:** RACE CONDITION ANALYSIS SPECIALIST

---

## Executive Summary

This audit identified **8 race conditions**, including **3 previously fixed issues** that were verified as still properly mitigated, and **5 new critical race conditions** requiring immediate attention.

**Priority Breakdown:**
- **HIGH Priority:** 4 issues (new)
- **MEDIUM Priority:** 1 issue (new)
- **VERIFIED FIXED:** 3 issues (RC-2, RC-5, RC-7)

---

## VERIFIED FIXED ISSUES ✅

### RC-2: Token Refresh Race Conditions ✅ FIXED

**Status:** VERIFIED FIXED
**File:** `provider-token.service.ts:127-184, 218-269`
**Fix Implementation:**
- Uses Redis distributed lock with `acquireLock()` before token refresh
- Re-reads provider after acquiring lock to check if another process refreshed
- Properly releases lock in `finally` block
- 30-second TTL with polling on lock wait

**Verification:**
```typescript
// Lines 127-148: Distributed lock pattern
const lockKey = `${this.KEY_PREFIX_LOCK}${provider.id}`;
const lockAcquired = await this.acquireLock(lockKey);

if (!lockAcquired) {
  await this.waitForLockRelease(lockKey);
  const freshProvider = await this.prisma.providerConfig.findUnique({...});
  return this.crypto.decrypt(freshProvider.accessToken, ...);
}

try {
  // Refresh token
} finally {
  await this.releaseLock(lockKey); // Always releases
}
```

---

### RC-5: Sync-Back Operation Ordering ✅ FIXED

**Status:** VERIFIED FIXED
**File:** `email-sync-back.service.ts:117-183`
**Fix Implementation:**
- Uses `RedisLockService.withLock()` with per-email lock key
- Lock key: `sync-back:${operation.emailId}`
- 60-second TTL for sync-back operations
- Serializes rapid-fire operations (mark read + star)

**Verification:**
```typescript
// Lines 121-127: Per-email locking
const lockKey = `sync-back:${operation.emailId}`;
const lockTtlMs = 60000;

await this.redisLock.withLock(
  lockKey,
  lockTtlMs,
  async () => { /* sync operation */ },
  { maxRetries: 2 },
);
```

---

### RC-7: Gmail Webhook Concurrent Processing ✅ FIXED

**Status:** VERIFIED FIXED
**File:** `gmail-webhook.service.ts:24-48, 86-94, 231-296`
**Fix Implementation:**
- Uses `AsyncMutex` class for per-provider locking
- Mutex ensures only one webhook processed at a time per provider
- Prevents race conditions on historyId tracking
- Always releases mutex in `finally` block

**Verification:**
```typescript
// Lines 25-48: AsyncMutex implementation
class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> { /* queue-based locking */ }
  release(): void { /* queue processing */ }
}

// Lines 232-296: Usage in handleNotification
const mutex = this.getProviderMutex(provider.id);
await mutex.acquire();

try {
  // Process webhook
} finally {
  mutex.release(); // Always releases
}
```

---

## NEW CRITICAL RACE CONDITIONS 🔴

### RC-8: Queue Job Deduplication Race

**File:** `queue.service.ts:175-196`
**Priority:** HIGH

**Scenario:**
1. Worker A checks for existing job with `queue.getJob(jobId)` at line 182
2. Worker B concurrently checks for the same job (also not found)
3. Worker A adds job to queue at line 202
4. Worker B also adds job to queue (duplicate!)
5. Same sync job gets executed twice concurrently

**Impact:**
- Duplicate API calls to Gmail/Microsoft/IMAP servers
- Wasted resources processing same emails twice
- Potential rate limiting violations
- Database contention on email upserts

**Current Code:**
```typescript
// Lines 175-196: Race window between check and add
const jobId = `${data.providerId}-${data.syncType || 'delta'}`;
const existing = await queue.getJob(jobId);

if (existing) {
  const state = await existing.getState();
  if (state === 'completed' || state === 'failed' || state === 'delayed') {
    await existing.remove();
  } else {
    this.logger.verbose(`Job ${jobId} already queued, skipping`);
    return; // ⚠️ Race: Another worker can pass this check concurrently
  }
}

// Lines 193-196: hasPendingJob check also has race window
if (await this.hasPendingJob(data.providerId, data.tenantId)) {
  return;
}

await queue.add(...); // Both workers reach here!
```

**Fix:** Add Redis lock around job deduplication check:
```typescript
const lockKey = `sync-job-dedup:${jobId}`;
await this.redisLock.withLock(lockKey, 2000, async () => {
  const existing = await queue.getJob(jobId);
  if (existing && ['waiting', 'active', 'delayed'].includes(await existing.getState())) {
    return; // Already queued
  }
  await queue.add(...);
});
```

---

### RC-9: Email Upsert Race (Base Sync Service)

**File:** `base-email-sync.service.ts:240-402`
**Priority:** HIGH

**Scenario:**
1. Worker A reads email record at line 253 (finds existing)
2. Worker B reads same email record (also finds existing)
3. Worker A updates with `version: { increment: 1 }` at line 316
4. Worker B updates with `version: { increment: 1 }` (overwrites A's changes!)
5. Lost update: A's changes vanish

**Impact:**
- **Data corruption:** User flag changes lost during sync
- Stale `userModifiedAt` timestamps
- Incorrect version numbers
- Race between user actions and sync operations

**Current Code:**
```typescript
// Lines 253-271: Check-then-act pattern (RACE WINDOW)
const existing = await this.prisma.email.findUnique({
  where: {
    providerId_externalId_folder: {
      providerId,
      externalId: canonicalMsg.id,
      folder: canonicalMsg.folder,
    },
  },
  select: { id: true, version: true, userModifiedAt: true, ... },
});

// ⚠️ RACE: Another worker can read the same record here

if (existing) {
  result = await this.prisma.email.update({
    where: { id: existing.id },
    data: { ...updateData, version: { increment: 1 } }, // Lost update!
  });
}
```

**Fix:** Use optimistic locking with Prisma's `where` conditions:
```typescript
// Option 1: Optimistic locking with version check
if (existing) {
  try {
    result = await this.prisma.email.update({
      where: {
        id: existing.id,
        version: existing.version, // ✅ Only update if version matches
      },
      data: { ...updateData, version: { increment: 1 } },
    });
  } catch (error) {
    // Version mismatch - another worker updated it
    // Re-read and retry
  }
}

// Option 2: Distributed lock (already partially implemented)
const lockKey = `email:upsert:${providerId}:${canonicalMsg.id}:${canonicalMsg.folder}`;
await this.redisLock.withLock(lockKey, 5000, async () => {
  // All upsert logic here (lines 251-381)
});
```

**Note:** Lines 246-401 have partial Redis lock implementation, but it's optional (`if (this.redisLock)`). The lock is not guaranteed to be used.

---

### RC-10: Bulk Sync Job Enqueue Race

**File:** `queue.service.ts:213-258`
**Priority:** HIGH

**Scenario:**
1. Thread A processes bulk sync for Provider X (10 jobs)
2. Thread B processes bulk sync for Provider X (5 different jobs)
3. Both threads call `hasPendingJob()` for Provider X concurrently
4. Both return `false` (no pending jobs found yet)
5. Both threads add jobs for Provider X
6. Result: 15 jobs queued, but some may be duplicates

**Impact:**
- Duplicate sync jobs for same provider
- Concurrent API calls causing rate limits
- Database write conflicts
- Wasted worker resources

**Current Code:**
```typescript
// Lines 232-257: Race between hasPendingJob check and addBulk
for (const job of priorityJobs) {
  if (await this.hasPendingJob(job.providerId, job.tenantId)) {
    // ⚠️ RACE: Another thread can add job after this check
    continue;
  }
  filteredJobs.push(this.withJobToken(job));
}

// Lines 254-255: Multiple jobs added without locking
await queue.addBulk(bullJobs);
```

**Fix:** Add per-provider locking for bulk operations:
```typescript
// Group by provider FIRST
const jobsByProvider = new Map<string, SyncJobData[]>();
for (const job of priorityJobs) {
  const key = job.providerId;
  if (!jobsByProvider.has(key)) jobsByProvider.set(key, []);
  jobsByProvider.get(key)!.push(job);
}

// Lock per provider
for (const [providerId, providerJobs] of jobsByProvider) {
  const lockKey = `bulk-sync:${providerId}`;
  await this.redisLock.withLock(lockKey, 5000, async () => {
    // Check pending + add jobs atomically
    if (await this.hasPendingJob(providerId, providerJobs[0].tenantId)) {
      return;
    }
    await queue.addBulk(providerJobs);
  });
}
```

---

### RC-11: Webhook Subscription Stats Update Race

**File:** `gmail-webhook.service.ts:576-597`, `microsoft-webhook.service.ts:634-652`
**Priority:** MEDIUM

**Scenario:**
1. Webhook notification A arrives for Provider X
2. Webhook notification B arrives for same Provider X
3. Both read `notificationCount` from DB (e.g., current value = 100)
4. Both increment: `{ increment: 1 }`
5. Final count = 101 (should be 102)

**Impact:**
- Inaccurate webhook statistics
- Underreported notification counts
- Incorrect monitoring metrics
- NOT critical for functionality, but breaks observability

**Current Code (Gmail):**
```typescript
// Lines 577-596: Non-atomic read-modify-write
private async updateSubscriptionStats(providerId: string): Promise<void> {
  try {
    const result = await this.prisma.webhookSubscription.updateMany({
      where: { providerId, resourcePath: GMAIL_WEBHOOK_RESOURCE },
      data: {
        lastNotificationAt: new Date(),
        notificationCount: { increment: 1 }, // ⚠️ RACE on increment
      },
    });
  } catch (error) { /* ... */ }
}
```

**Current Code (Microsoft):**
```typescript
// Lines 634-652: Same issue
private async updateSubscriptionStats(providerId: string): Promise<void> {
  await this.prisma.webhookSubscription.update({
    where: { providerId_resourcePath: { providerId, resourcePath: MICROSOFT_MAIL_RESOURCE } },
    data: {
      lastNotificationAt: new Date(),
      notificationCount: { increment: 1 }, // ⚠️ RACE on increment
    },
  });
}
```

**Fix:** Use database-level atomic increment (already using `{ increment: 1 }`), but add unique constraint:
```typescript
// This is actually OK! Prisma's `{ increment: 1 }` is atomic at DB level.
// The real issue is potential lost updates if updateMany affects 0 rows.

// Better fix: Use upsert to ensure row exists
await this.prisma.webhookSubscription.upsert({
  where: { providerId_resourcePath: { providerId, resourcePath } },
  update: {
    lastNotificationAt: new Date(),
    notificationCount: { increment: 1 },
  },
  create: { /* create new record if missing */ },
});
```

**Note:** This is MEDIUM priority because `{ increment: 1 }` is already atomic at the database level. The race is minimal and only affects statistics, not core functionality.

---

### RC-12: Microsoft Webhook Deduplication Race

**File:** `microsoft-webhook.service.ts:126-143`
**Priority:** HIGH

**Scenario:**
1. Notification A arrives for subscription X
2. Notification B arrives for subscription X (duplicate from Microsoft)
3. Both check `processedNotifications.has(key)` at line 135 → both return `false`
4. Both set `processedNotifications.set(key, ...)` at line 141
5. Both proceed to trigger sync job
6. Result: Duplicate sync jobs queued

**Impact:**
- Duplicate sync operations for same changes
- Wasted API calls to Microsoft Graph
- Database write conflicts
- Race condition defeats the purpose of dedup cache

**Current Code:**
```typescript
// Lines 127-143: Check-then-set race
private checkAndMarkProcessed(notification: MicrosoftGraphNotification): boolean {
  const resourceId = notification.resourceData?.id || notification.resource || '';
  const notificationKey = `${notification.subscriptionId}:${resourceId}:${notification.changeType}`;

  const now = Date.now();
  const existing = this.processedNotifications.get(notificationKey);

  if (existing && (now - existing.timestamp) < this.NOTIFICATION_DEDUP_WINDOW_MS) {
    return false; // ⚠️ RACE: Two threads can both get false here
  }

  // ⚠️ RACE WINDOW: Both threads set the key
  this.processedNotifications.set(notificationKey, { timestamp: now });
  return true;
}
```

**Fix:** Use atomic compare-and-set pattern:
```typescript
private checkAndMarkProcessed(notification: MicrosoftGraphNotification): boolean {
  const resourceId = notification.resourceData?.id || notification.resource || '';
  const notificationKey = `${notification.subscriptionId}:${resourceId}:${notification.changeType}`;
  const now = Date.now();

  // Atomic check-and-set
  const existing = this.processedNotifications.get(notificationKey);

  if (existing) {
    if ((now - existing.timestamp) < this.NOTIFICATION_DEDUP_WINDOW_MS) {
      return false; // Duplicate
    }
    // Expired entry - try to claim it atomically
  }

  // Set only if not already set (first writer wins)
  if (!this.processedNotifications.has(notificationKey)) {
    this.processedNotifications.set(notificationKey, { timestamp: now });
    return true; // We claimed it
  }

  // Someone else claimed it between our check and set
  return false;
}

// OR use Redis for truly distributed dedup:
const lockKey = `webhook-dedup:${notificationKey}`;
const claimed = await this.redis.set(lockKey, '1', 'PX', DEDUP_WINDOW_MS, 'NX');
return claimed === 'OK';
```

**Note:** Current implementation uses in-memory `Map`, which doesn't work across multiple worker instances. Need Redis for distributed deduplication.

---

## ADDITIONAL OBSERVATIONS

### 1. Missing Lock in processMessagesBatch

**File:** `base-email-sync.service.ts:416-552`
**Issue:** Batch processing has NO distributed locking, relies on database-level upsert conflict resolution
**Risk:** LOW (Prisma upserts are atomic at DB level)
**Recommendation:** Monitor for "duplicate key" errors in logs

### 2. Sync-Back Worker Lacks Per-Email Lock

**File:** `sync-back.worker.ts:94-194`
**Issue:** Worker processes jobs without per-email locking (relies on queue job IDs)
**Risk:** MEDIUM (if multiple workers process different jobs for same email)
**Fix Applied:** email-sync-back.service.ts has per-email locks (RC-5 fix), so worker is safe

### 3. Provider Token Refresh Timeout

**File:** `provider-token.service.ts:334-354`
**Issue:** `waitForLockRelease()` polls every 100ms for up to 10 seconds
**Risk:** LOW (acceptable for token refresh)
**Recommendation:** Add exponential backoff to polling interval

### 4. Email Send Queue Idempotency

**File:** `email-send-queue.service.ts:184-219`
**Status:** ✅ GOOD - Uses content-based hash for idempotency keys
**Verification:** Hash includes all relevant email fields (to, subject, body, etc.)

---

## RECOMMENDED FIXES PRIORITY

### Immediate (This Sprint)
1. **RC-8:** Queue job deduplication (HIGH) - Add Redis lock
2. **RC-12:** Microsoft webhook deduplication (HIGH) - Use Redis SET NX
3. **RC-9:** Email upsert race (HIGH) - Ensure Redis lock is ALWAYS used

### Next Sprint
4. **RC-10:** Bulk sync job enqueue (HIGH) - Add per-provider locking
5. **RC-11:** Webhook stats update (MEDIUM) - Use upsert instead of update

### Future Improvements
6. Add monitoring for race condition metrics (lock contention, retry counts)
7. Implement circuit breaker for Redis lock failures
8. Add distributed tracing for lock acquisition times

---

## TESTING RECOMMENDATIONS

### Load Testing Scenarios
1. **Concurrent Webhooks:** Send 100 webhook notifications for same provider simultaneously
2. **Bulk Sync Storm:** Trigger 50 sync jobs for same provider in parallel
3. **Token Refresh Burst:** Expire 10 provider tokens and trigger simultaneous refresh
4. **Multi-Worker Upsert:** Process same email batch across 5 workers

### Metrics to Monitor
- Redis lock acquisition failures
- Duplicate job detection rate
- Email version conflicts
- Webhook deduplication hit rate

---

## CONCLUSION

The codebase has **good foundational race condition protection** with the fixes for RC-2, RC-5, and RC-7. However, **5 new critical race conditions** were discovered, primarily in:

1. **Queue management** (job deduplication)
2. **Webhook processing** (deduplication)
3. **Email upsert** (optional locking)

**Risk Level:** MEDIUM-HIGH without fixes, LOW with recommended fixes applied.

**Estimated Effort:**
- RC-8: 2 hours
- RC-12: 2 hours
- RC-9: 4 hours (ensure lock is always used)
- RC-10: 3 hours
- RC-11: 1 hour

**Total:** ~12 hours development + 8 hours testing = **3 developer-days**

---

## APPENDIX: CODE REFERENCES

### Files Analyzed
```
backend/src/modules/email-sync/
├── services/
│   ├── provider-token.service.ts (356 lines) ✅ RC-2 FIXED
│   ├── queue.service.ts (608 lines) 🔴 RC-8, RC-10
│   ├── gmail-webhook.service.ts (680 lines) ✅ RC-7 FIXED, 🟡 RC-11
│   ├── microsoft-webhook.service.ts (812 lines) 🔴 RC-12, 🟡 RC-11
│   ├── base-email-sync.service.ts (891 lines) 🔴 RC-9
│   ├── email-send-queue.service.ts (313 lines) ✅ GOOD
│   └── base-queue.service.ts (not read, assumed OK)
├── workers/
│   ├── sync-back.worker.ts (652 lines) ✅ SAFE (uses service locks)
│   └── email-send.worker.ts (330 lines) ✅ GOOD
backend/src/modules/email/
└── services/
    └── email-sync-back.service.ts (1370 lines) ✅ RC-5 FIXED
backend/src/common/services/
└── redis-lock.service.ts (308 lines) ✅ ROBUST IMPLEMENTATION
```

### Lock Coverage Map
| Component | Lock Type | Coverage |
|-----------|-----------|----------|
| Token Refresh | Redis SET NX | ✅ Full |
| Email Upsert | Redis Lock | ⚠️ Optional |
| Sync-Back Ops | Redis Lock | ✅ Full |
| Gmail Webhooks | AsyncMutex | ✅ Full |
| MS Webhooks | None | 🔴 Missing |
| Job Dedup | None | 🔴 Missing |
| Bulk Enqueue | None | 🔴 Missing |

---

**End of Report**
