# Email Modules Consolidation - Detailed Roadmap

**Date**: 2025-01-04
**Status**: READY TO EXECUTE
**Total Estimated Time**: 8-10 hours (consolidation only, excluding driver split)

---

## Pre-Requisites Verified

| Item | Status | Location |
|------|--------|----------|
| Common folder | EXISTS | `backend/src/common/` |
| Redis lock service | EXISTS | `common/services/redis-lock.service.ts` |
| HTTP retry service | EXISTS | `common/services/retry.service.ts` |
| Error utils | EXISTS (partial) | `common/utils/error.utils.ts` |
| Stress test | EXISTS | `scripts/stress-test-atomic-sync.ts` |
| Test infrastructure | 70+ scripts | `scripts/test-*.ts` |

---

## Phase 1: Create Prisma Retry Service (1 hour)

### 1.1 Create `prisma-retry.service.ts`

**File**: `backend/src/common/services/prisma-retry.service.ts`

**Why**: Current retry.service.ts handles HTTP errors (429, 5xx). We need separate Prisma retry for P2002/P2034.

**Implementation**:
```typescript
@Injectable()
export class PrismaRetryService {
  private readonly MAX_RETRIES = 5;

  async withRetry<T>(
    operation: () => Promise<T>,
    options?: { maxRetries?: number; context?: string }
  ): Promise<T> {
    // Retry on P2002 (unique constraint) and P2034 (deadlock)
    // Exponential backoff: 100ms * 2^attempt, max 2000ms
  }
}
```

### 1.2 Real Test: Verify P2002/P2034 Retry

**Test Script**: `backend/scripts/test-prisma-retry.ts`

```bash
# Run after implementation
npx ts-node backend/scripts/test-prisma-retry.ts
```

**Test Scenarios**:
1. Simulate P2002 unique constraint violation with concurrent upserts
2. Simulate P2034 deadlock with concurrent transactions
3. Verify exponential backoff delays
4. Verify max retry limit respected

**Expected Output**:
```
✅ P2002 retry works (3 attempts, 700ms total)
✅ P2034 retry works (2 attempts, 300ms total)
✅ Max retries respected (fails after 5 attempts)
✅ Exponential backoff verified (100/200/400/800/1600ms)
```

---

## Phase 2: Consolidate IMAP Utils (1 hour)

### 2.1 Create `common/utils/imap-utils.ts`

**File**: `backend/src/common/utils/imap-utils.ts`

**Source**: Copy from `email-sync/utils/imap.utils.ts` (canonical version)

**Functions to include**:
- `parseImapExternalId(rawId: string): { uid: number; uidValidity: number; folder: string }`

### 2.2 Update Imports in 3 Files

| File | Line | Change |
|------|------|--------|
| `email/services/email-fetch.service.ts` | 246 | Import from `common/utils/imap-utils` |
| `email/services/attachment-on-demand.service.ts` | 453 | Import from `common/utils/imap-utils` |
| `email-sync/services/base-email-sync.service.ts` | 588 | Import from `common/utils/imap-utils` |

### 2.3 Real Test: Verify IMAP Sync Works

```bash
# Test IMAP sync end-to-end
npx ts-node backend/scripts/test-imap-sync.ts

# Test email fetch still works
npx ts-node backend/scripts/test-email-operations.ts
```

**Expected Output**:
```
✅ IMAP connection established
✅ Folder list retrieved (X folders)
✅ Message sync completed (Y messages)
✅ parseImapExternalId working correctly
✅ Attachment fetch works
```

---

## Phase 3: Consolidate Folder Utils (1 hour)

### 3.1 Create `common/utils/folder-utils.ts`

**File**: `backend/src/common/utils/folder-utils.ts`

**Functions to include**:
- `normalizeFolderName(name: string): string`
- Map: INBOX, Sent, Drafts, Trash, Spam, Archive, etc.

### 3.2 Update Imports in 2 Files

| File | Line | Change |
|------|------|--------|
| `base-email-sync.service.ts` | 1173 | Import from `common/utils/folder-utils` |
| `folder-sync.service.ts` | 856 | Import from `common/utils/folder-utils` |

### 3.3 Real Test: Verify Folder Sync Works

```bash
# Test full sync (includes folder sync)
npx ts-node backend/scripts/stress-test-atomic-sync.ts
```

**Expected Output**:
```
✅ No duplicate emails found
✅ Folder mapping correct (INBOX, Sent, etc.)
✅ Cross-folder deduplication working
```

---

## Phase 4: Extend Error Utils (30 min)

### 4.1 Add Functions to `common/utils/error.utils.ts`

**Current functions**: `getErrorMessage`, `getErrorDetails`

**Add**:
```typescript
export function isNotFoundError(error: unknown): boolean {
  // Check for 404, P2025, 'not found' message patterns
}

export function isRateLimitError(error: unknown): boolean {
  // Check for 429, 'rate limit', 'too many requests'
}

export function isServerError(error: unknown): boolean {
  // Check for 5xx status codes
}
```

### 4.2 Delete Inline Duplicates

| File | Lines | Action |
|------|-------|--------|
| `base-email-sync.service.ts` | 1255-1280 | DELETE isNotFoundError, import from common |
| `base-email-sync.service.ts` | 1282-1300 | DELETE isRateLimitError, import from common |
| `base-email-sync.service.ts` | 1301-1310 | DELETE isServerError, import from common |

### 4.3 Real Test: Type Check + Lint

```bash
# Verify no broken imports
npm run type-check

# Verify code quality
npm run lint -- backend/src/modules/email-sync

# Verify base sync still works
npx ts-node backend/scripts/stress-test-atomic-sync.ts
```

---

## Phase 5: Delete Dead Code (15 min)

### 5.1 Delete `extractPlainText`

**File**: `base-email-sync.service.ts`
**Lines**: 1314-1346 (32 lines)
**Reason**: Never called, dead code

### 5.2 Real Test: Verify No Regressions

```bash
# Full type check (catches if anything used deleted code)
npm run type-check

# Integration test
npx ts-node backend/scripts/test-email-operations.ts
```

---

## Phase 6: Fix Race Conditions (2 hours)

### 6.1 Fix RC-A1: FolderSync Parallel Upserts

**File**: `folder-sync.service.ts`
**Location**: `syncProviderFolders` method

**Fix**:
```typescript
async syncProviderFolders(tenantId: string, providerId: string): Promise<void> {
  const lockKey = `folder-sync:${providerId}`;
  await this.redisLock.withLock(lockKey, 30000, async () => {
    const folders = await driver.listFolders();
    await this.upsertFolders(folders);
  });
}
```

### 6.2 Fix RC-A8: Folder CRUD No Locking

**File**: `folder-sync.service.ts`
**Methods**: `createFolder`, `updateFolder`, `deleteFolder`

**Fix**: Add Redis lock per provider

### 6.3 Real Test: Concurrent Folder Operations

```bash
# Stress test with concurrent operations
npx ts-node backend/scripts/stress-test-atomic-sync.ts

# Multi-tenant stress test
npx ts-node backend/scripts/stress-test-multi-tenant.ts
```

**Expected Output**:
```
✅ No duplicate emails found
✅ No race conditions detected
✅ All folder operations atomic
✅ Redis locks working (X acquired, X released)
```

---

## Phase 7: Add P2034 Handling (1 hour)

### 7.1 Update `base-email-sync.service.ts`

**Location**: Lines 1036-1068 (current P2002 retry)

**Change**: Add P2034 to retry conditions

```typescript
const isRetryable = error.code === 'P2002' || error.code === 'P2034';
```

### 7.2 Real Test: Simulate Deadlock

```bash
# Create test that triggers P2034
npx ts-node backend/scripts/test-prisma-retry.ts
```

---

## Phase 8: Final Validation (1 hour)

### 8.1 Full Test Suite

```bash
# 1. Type check entire backend
npm run type-check

# 2. Lint email modules
npm run lint -- backend/src/modules/email
npm run lint -- backend/src/modules/email-sync

# 3. Stress test atomic sync
npx ts-node backend/scripts/stress-test-atomic-sync.ts

# 4. Multi-tenant stress test
npx ts-node backend/scripts/stress-test-multi-tenant.ts

# 5. Full integration test
npx ts-node backend/scripts/test-full-integration.ts

# 6. Email operations test
npx ts-node backend/scripts/test-email-operations.ts

# 7. IMAP sync test (if IMAP provider configured)
npx ts-node backend/scripts/test-imap-sync.ts
```

### 8.2 Expected Results

| Test | Expected |
|------|----------|
| type-check | 0 errors |
| lint | 0 errors, 0 warnings |
| stress-test-atomic-sync | All ✅ |
| stress-test-multi-tenant | All ✅ |
| test-full-integration | All ✅ |
| test-email-operations | All ✅ |

---

## Test Scripts to Create

### 1. `test-prisma-retry.ts`

```typescript
/**
 * Test Prisma Retry Service
 *
 * Tests P2002 (unique constraint) and P2034 (deadlock) retry logic
 *
 * Run: npx ts-node backend/scripts/test-prisma-retry.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function testP2002Retry() {
  // Create same record twice concurrently to trigger P2002
  const testId = `test-${Date.now()}`;

  const results = await Promise.allSettled([
    prisma.email.create({ data: { /* ... */ } }),
    prisma.email.create({ data: { /* ... */ } }),
  ]);

  // Verify retry happened and one succeeded
}

async function testP2034Retry() {
  // Create conflicting transactions to trigger deadlock
  // Verify retry and eventual success
}
```

### 2. `test-folder-consolidation.ts`

```typescript
/**
 * Test Folder Utils Consolidation
 *
 * Verifies normalizeFolderName works correctly after consolidation
 *
 * Run: npx ts-node backend/scripts/test-folder-consolidation.ts
 */
import { normalizeFolderName } from '../src/common/utils/folder-utils';

const testCases = [
  { input: 'INBOX', expected: 'inbox' },
  { input: 'Sent Items', expected: 'sent' },
  { input: '[Gmail]/Trash', expected: 'trash' },
  { input: 'Posta inviata', expected: 'sent' },
  { input: 'Bozze', expected: 'drafts' },
];

testCases.forEach(({ input, expected }) => {
  const result = normalizeFolderName(input);
  console.log(`${input} -> ${result} (expected: ${expected}) ${result === expected ? '✅' : '❌'}`);
});
```

---

## Summary Checklist

### Phase 1: Prisma Retry ⬜
- [ ] Create `prisma-retry.service.ts`
- [ ] Export from `common/services/index.ts`
- [ ] TEST: `npx ts-node backend/scripts/test-prisma-retry.ts`

### Phase 2: IMAP Utils ⬜
- [ ] Create `common/utils/imap-utils.ts`
- [ ] Update 3 import locations
- [ ] Delete old copies
- [ ] TEST: `npx ts-node backend/scripts/test-imap-sync.ts`

### Phase 3: Folder Utils ⬜
- [ ] Create `common/utils/folder-utils.ts`
- [ ] Update 2 import locations
- [ ] Delete old copies
- [ ] TEST: `npx ts-node backend/scripts/stress-test-atomic-sync.ts`

### Phase 4: Error Utils ⬜
- [ ] Add 3 functions to error.utils.ts
- [ ] Update imports in base-email-sync.service.ts
- [ ] Delete inline duplicates
- [ ] TEST: `npm run type-check`

### Phase 5: Dead Code ⬜
- [ ] Delete extractPlainText (32 lines)
- [ ] TEST: `npm run type-check`

### Phase 6: Race Conditions ⬜
- [ ] Fix RC-A1 in folder-sync.service.ts
- [ ] Fix RC-A8 in folder-sync.service.ts
- [ ] TEST: `npx ts-node backend/scripts/stress-test-atomic-sync.ts`

### Phase 7: P2034 Handling ⬜
- [ ] Add P2034 to retry conditions
- [ ] TEST: `npx ts-node backend/scripts/test-prisma-retry.ts`

### Phase 8: Final Validation ⬜
- [ ] All tests pass
- [ ] No type errors
- [ ] No lint errors

---

## Files Changed Summary

| Action | File | Lines Changed |
|--------|------|---------------|
| CREATE | `common/services/prisma-retry.service.ts` | +60 |
| CREATE | `common/utils/imap-utils.ts` | +40 |
| CREATE | `common/utils/folder-utils.ts` | +70 |
| EDIT | `common/utils/error.utils.ts` | +40 |
| EDIT | `email-fetch.service.ts` | -30, +1 |
| EDIT | `attachment-on-demand.service.ts` | -30, +1 |
| EDIT | `base-email-sync.service.ts` | -110, +5 |
| EDIT | `folder-sync.service.ts` | -35, +15 |
| DELETE | Dead code in base-email-sync | -32 |
| **NET** | | **-82 lines** |

---

---

## Phase 9: DEEP Production Stress Tests (CRITICAL)

**Problem**: Current tests pass but production fails. Tests only check database state AFTER sync - they don't TRIGGER the actual failure scenarios.

### 9.1 Create `stress-test-production-scenarios.ts`

This test suite TRIGGERS real production failure conditions:

```typescript
/**
 * DEEP Production Stress Test
 *
 * Unlike stress-test-atomic-sync.ts which checks DB state,
 * this test TRIGGERS actual production failure scenarios:
 *
 * 1. Multi-tenant concurrent sync (10 tenants syncing at once)
 * 2. Mid-sync token expiry (OAuth expires during sync)
 * 3. Folder rename during sync (race between sync and folder ops)
 * 4. Provider API failures (simulate Gmail/Microsoft errors)
 * 5. Redis lock contention (multiple processes fighting for locks)
 * 6. P2034 deadlock creation (actual deadlock scenarios)
 * 7. Large batch operations (1000+ emails at once)
 * 8. System folder protection (isSystem flag enforcement)
 *
 * Run: npx ts-node backend/scripts/stress-test-production-scenarios.ts
 */
```

### 9.2 Test Scenarios to Implement

#### TEST 1: Multi-Tenant Concurrent Sync Race

**What Production Fails On**: 10 tenants start full sync at same second.

```typescript
async function testMultiTenantConcurrentSync() {
  // Get 10 real provider configs from database
  const providers = await prisma.providerConfig.findMany({
    where: { isActive: true },
    take: 10,
  });

  // Trigger full sync for ALL at the same time
  const syncPromises = providers.map(p =>
    fetch(`http://localhost:3000/api/v1/email-sync/${p.id}/sync-full`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
  );

  const startTime = Date.now();
  const results = await Promise.allSettled(syncPromises);
  const duration = Date.now() - startTime;

  // Check for:
  // - P2002 errors (should be retried and succeed)
  // - P2034 deadlocks (should be retried and succeed)
  // - No duplicate emails created
  // - All syncs eventually complete

  const success = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  // After all syncs, verify no duplicates
  const duplicates = await checkForDuplicates();

  return {
    passed: failed === 0 && duplicates.length === 0,
    details: `${success}/${providers.length} syncs completed, ${duplicates.length} duplicates, ${duration}ms`
  };
}
```

#### TEST 2: Folder Rename During Active Sync

**What Production Fails On**: User renames folder while sync is running.

```typescript
async function testFolderRenameDuringSync() {
  // Start a long-running sync
  const syncPromise = triggerFullSync(providerId);

  // Wait 500ms (sync is in progress)
  await sleep(500);

  // Rename a folder via API
  const renamePromise = fetch(`/api/v1/folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: 'Renamed-' + Date.now() })
  });

  // Both should complete without errors
  const [syncResult, renameResult] = await Promise.all([syncPromise, renamePromise]);

  // Verify:
  // - Sync completed (with correct folder reference)
  // - Rename succeeded
  // - No orphaned emails (pointing to old folder name)
  // - No duplicate folders created
}
```

#### TEST 3: P2034 Deadlock Force Trigger

**What Production Fails On**: Two transactions lock same rows in opposite order.

```typescript
async function testP2034DeadlockRecovery() {
  // Create deadlock scenario:
  // Transaction 1: UPDATE emails SET read=true WHERE folder='INBOX' (locks INBOX rows)
  // Transaction 2: UPDATE emails SET read=true WHERE folder='SENT' (locks SENT rows)
  // Then each tries to access the other's rows -> DEADLOCK

  const email1 = await getRandomEmail('INBOX');
  const email2 = await getRandomEmail('SENT');

  // These will race and potentially deadlock
  const t1 = prisma.$transaction([
    prisma.email.update({ where: { id: email1.id }, data: { read: true } }),
    prisma.email.update({ where: { id: email2.id }, data: { starred: true } }),
  ]);

  const t2 = prisma.$transaction([
    prisma.email.update({ where: { id: email2.id }, data: { read: true } }),
    prisma.email.update({ where: { id: email1.id }, data: { starred: true } }),
  ]);

  // At least one should succeed with retry
  const results = await Promise.allSettled([t1, t2]);

  // With P2034 retry, at least one should succeed
  const success = results.filter(r => r.status === 'fulfilled').length;

  return {
    passed: success >= 1, // At least one should complete
    details: `Deadlock recovery: ${success}/2 transactions completed`
  };
}
```

#### TEST 4: System Folder Delete Protection

**What Production Fails On**: User tries to delete INBOX/SENT/TRASH via API.

```typescript
async function testSystemFolderProtection() {
  // Get system folders (isSystem = true)
  const systemFolders = await prisma.folder.findMany({
    where: { isSystem: true },
    take: 5,
  });

  const deleteAttempts = systemFolders.map(folder =>
    fetch(`/api/v1/folders/${folder.id}`, { method: 'DELETE' })
      .then(res => ({ folderId: folder.id, status: res.status }))
  );

  const results = await Promise.all(deleteAttempts);

  // ALL should fail with 403 or 400
  const blocked = results.filter(r => r.status === 403 || r.status === 400);

  return {
    passed: blocked.length === systemFolders.length,
    details: `System folder protection: ${blocked.length}/${systemFolders.length} blocked`
  };
}
```

#### TEST 5: Redis Lock Contention

**What Production Fails On**: 20 concurrent processes try to sync same provider.

```typescript
async function testRedisLockContention() {
  // Simulate 20 workers trying to sync same provider
  const providerId = 'test-provider';
  const lockKey = `email-sync:${providerId}`;

  const lockAttempts = Array(20).fill(null).map((_, i) =>
    redisLock.withLock(lockKey, 5000, async () => {
      await sleep(100); // Hold lock for 100ms
      return { worker: i, acquired: true };
    }).catch(err => ({ worker: i, acquired: false, error: err.message }))
  );

  const results = await Promise.all(lockAttempts);

  // Only ONE should acquire at a time
  // Others should wait and eventually succeed OR timeout gracefully
  const acquired = results.filter(r => r.acquired).length;
  const failed = results.filter(r => !r.acquired).length;

  return {
    passed: acquired === 20 || (acquired > 0 && failed < 5), // Most should succeed
    details: `Lock contention: ${acquired} acquired, ${failed} failed`
  };
}
```

#### TEST 6: Large Batch Operation (1000+ emails)

**What Production Fails On**: Bulk operations timeout or memory overflow.

```typescript
async function testLargeBatchOperation() {
  // Get a provider with many emails
  const provider = await prisma.providerConfig.findFirst({
    include: { _count: { select: { emails: true } } },
    orderBy: { emails: { _count: 'desc' } }
  });

  if (!provider || provider._count.emails < 100) {
    return { passed: true, details: 'Skipped - not enough emails for large batch test' };
  }

  // Trigger bulk mark-as-read for 1000 emails
  const emails = await prisma.email.findMany({
    where: { providerId: provider.id, read: false },
    take: 1000,
    select: { id: true }
  });

  const startTime = Date.now();
  const batchSize = 100;

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    await prisma.email.updateMany({
      where: { id: { in: batch.map(e => e.id) } },
      data: { read: true }
    });
  }

  const duration = Date.now() - startTime;

  return {
    passed: duration < 30000, // Should complete in < 30 seconds
    details: `Batch update: ${emails.length} emails in ${duration}ms (${Math.round(emails.length / (duration / 1000))}/sec)`
  };
}
```

#### TEST 7: Token Expiry During Sync

**What Production Fails On**: OAuth token expires mid-sync.

```typescript
async function testTokenExpiryDuringSync() {
  // Find a provider and artificially expire its token
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true }
  });

  // Set token expiry to 2 seconds from now
  await prisma.providerConfig.update({
    where: { id: provider.id },
    data: { tokenExpiresAt: new Date(Date.now() + 2000) }
  });

  // Start sync (should trigger refresh mid-sync)
  const response = await fetch(`/api/v1/email-sync/${provider.id}/sync-delta`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  // Should either:
  // 1. Refresh token and complete successfully
  // 2. Return 401 with clear error (not crash)

  return {
    passed: response.status === 200 || response.status === 401,
    details: `Token expiry handling: ${response.status} ${response.statusText}`
  };
}
```

### 9.3 Run Production Stress Test

```bash
# Run the deep production stress test
npx ts-node backend/scripts/stress-test-production-scenarios.ts
```

**Expected Output**:
```
============================================================
  DEEP PRODUCTION STRESS TEST
  Date: 2025-01-04T10:30:00.000Z
============================================================

1. Multi-Tenant Concurrent Sync
   ✅ PASSED - 10/10 syncs completed, 0 duplicates, 8234ms

2. Folder Rename During Sync
   ✅ PASSED - Sync completed, folder renamed, no orphans

3. P2034 Deadlock Recovery
   ✅ PASSED - 2/2 transactions recovered after retry

4. System Folder Protection
   ✅ PASSED - 5/5 delete attempts blocked

5. Redis Lock Contention
   ✅ PASSED - 20/20 workers eventually acquired lock

6. Large Batch Operation
   ✅ PASSED - 1000 emails in 4521ms (221/sec)

7. Token Expiry During Sync
   ✅ PASSED - Token refreshed mid-sync, sync completed

============================================================
  SUMMARY
============================================================
  Passed: 7/7 ✅
  Production-Ready: YES
============================================================
```

### 9.4 Failure Analysis Tools

If any test fails, run these diagnostic commands:

```bash
# Check for P2002 errors in recent logs
grep -r "P2002" backend/logs/*.log | tail -20

# Check for P2034 deadlocks
grep -r "P2034\|deadlock" backend/logs/*.log | tail -20

# Check Redis lock stats
redis-cli keys "email-sync:*" | head -20

# Check duplicate emails
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$queryRaw\`
  SELECT \"externalId\", COUNT(*) as cnt
  FROM emails
  GROUP BY \"externalId\", \"providerId\"
  HAVING COUNT(*) > 1
\`.then(console.log);
"
```

---

## Summary: Test Coverage Matrix

| Scenario | Current Test | Production Stress Test |
|----------|--------------|------------------------|
| P2002 unique constraint | ✅ Checks post-sync | ✅ TRIGGERS concurrent upserts |
| P2034 deadlock | ❌ Not tested | ✅ Forces actual deadlocks |
| Multi-tenant race | ❌ Not tested | ✅ 10 concurrent syncs |
| Folder rename race | ❌ Not tested | ✅ Rename during sync |
| Redis lock contention | ❌ Not tested | ✅ 20 workers compete |
| Large batch | ❌ Not tested | ✅ 1000+ email operations |
| Token expiry | ❌ Not tested | ✅ Token expires mid-sync |
| System folder delete | ❌ Not tested | ✅ isSystem enforcement |

---

## Post-Consolidation: Driver Split

After consolidation is complete, proceed with driver split as documented in [EMAIL_SYNC_REFACTOR_PLAN.md](./EMAIL_SYNC_REFACTOR_PLAN.md).

The driver split is a separate, larger effort (25-35 hours) that should be done after consolidation is stable.

---

*This roadmap uses only REAL tests with actual database, Redis, and provider connections. No mocks, no Jest. Phase 9 specifically TRIGGERS failure scenarios instead of just checking state.*
