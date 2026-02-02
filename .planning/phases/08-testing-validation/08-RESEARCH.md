# Phase 8 Research: Testing & Validation

## Research Question

"What do I need to know to PLAN Phase 8 well?"

## Executive Summary

Phase 8 validates the stability of the refactored codebase under production-like stress scenarios. The existing test infrastructure in `backend/scripts/` is substantial (15+ stress test files), but there are critical gaps against the Phase 8 success criteria. The primary work is:
1. Enhancing existing tests to meet specific success criteria thresholds
2. Creating new tests for token expiry mid-sync and explicit deadlock recovery
3. Documenting baseline metrics and test infrastructure

## 1. Review of Existing Stress Test Scripts

### Inventory of Test Scripts (backend/scripts/)

| Script | Coverage | Phase 8 Relevance |
|--------|----------|-------------------|
| `stress-test-multi-tenant.ts` | Basic tenant isolation | Partial - needs 10-tenant simultaneous test |
| `stress-test-multi-tenant-sync.ts` | 10 concurrent sync, lock contention | HIGH - covers criteria 1, 4 |
| `stress-test-race-condition-fixes.ts` | RC-A1 monitoring, atomicity rollback | HIGH - covers lock duration monitoring |
| `stress-test-folder-race-conditions.ts` | Folder sync serialization | PARTIAL - needs rename during sync |
| `stress-test-atomic-sync.ts` | P2002 handling, tenant isolation | HIGH - covers dedup, composite PK |
| `stress-test-production-scenarios.ts` | Multi-tenant, folder rename, P2034 | HIGH - covers criteria 2, 3, 5 |
| `stress-test-1000-users.ts` | DB stress, queue throughput, memory | HIGH - covers criteria 5 (large batch) |
| `stress-test-hybrid-sync.ts` | isBodyFetched consistency | LOW - data integrity, not stress |
| `test-redis-lock-contention.ts` | Lock acquisition, contention | HIGH - covers criteria 4 |
| `test-tenant-isolation.ts` | Cache key isolation, GDPR | HIGH - covers criteria 1 |
| `test-prisma-retry.ts` | P2002/P2034 retry logic | HIGH - covers criteria 3 |

### What Existing Scripts Already Cover

**Criteria 1 (Multi-tenant isolation):**
- `stress-test-multi-tenant-sync.ts`: Tests 10 concurrent syncs for different providers
- `stress-test-atomic-sync.ts`: Tests tenant isolation via composite PK (Test 12)
- `test-tenant-isolation.ts`: Tests cache key isolation per tenant

**Criteria 2 (Folder rename during sync):**
- `stress-test-production-scenarios.ts`: References folder rename but implementation unclear
- GAP: No explicit test for folder rename mid-sync with orphan detection

**Criteria 3 (P2034 deadlock recovery):**
- `test-prisma-retry.ts`: Tests serializable isolation conflicts
- GAP: Does not force an actual PostgreSQL deadlock (uses isolation level conflicts as proxy)

**Criteria 4 (Redis lock contention):**
- `test-redis-lock-contention.ts`: Tests up to 20 workers competing
- `stress-test-multi-tenant-sync.ts`: Tests 20 workers against 5 providers

**Criteria 5 (Large batch 1000+ emails):**
- `stress-test-1000-users.ts`: Creates 1000 providers x 10 emails = 10,000 emails
- `stress-test-atomic-sync.ts`: Tests concurrent upserts

**Criteria 6 (Token expiry mid-sync):**
- GAP: No existing test for OAuth token refresh during active sync

## 2. Gap Analysis: Missing vs Required

### Critical Gaps

| Success Criteria | Gap | Severity |
|-----------------|-----|----------|
| Cross-tenant data leaks | Need to verify zero leaked emails, not just isolation | MEDIUM |
| Folder rename orphans | No test explicitly renames during sync | HIGH |
| P2034 actual deadlock | Tests use serializable isolation as proxy, not real deadlock | MEDIUM |
| Token expiry mid-sync | No test exists | HIGH |
| Performance baseline | No documented baseline metrics | HIGH |

### Detailed Gap Analysis

#### Gap 1: Explicit Cross-Tenant Data Leak Detection
Current tests verify tenant isolation via composite PK, but Phase 8 requires proving "zero cross-tenant data leaks". Need:
- Query emails grouped by tenant, verify each email's provider belongs to same tenant
- Verify no email was synced into wrong provider

#### Gap 2: Folder Rename During Sync
Need to simulate:
1. Start sync (acquire lock)
2. Concurrently rename folder via CRUD
3. Verify no orphaned email references (emails pointing to old folder path)

#### Gap 3: True P2034 Deadlock
`test-prisma-retry.ts` uses serializable isolation to trigger conflicts, but PostgreSQL deadlocks (P2034) require:
- Two transactions acquiring resources in opposite order
- Real row-level locking (not isolation level conflicts)

Strategy: Create two concurrent transactions that:
1. Transaction A: UPDATE email WHERE id = 1; UPDATE email WHERE id = 2;
2. Transaction B: UPDATE email WHERE id = 2; UPDATE email WHERE id = 1;

#### Gap 4: Token Expiry Mid-Sync
Need to simulate:
1. Start sync with valid OAuth token
2. Mid-sync, invalidate token (set expiry to past)
3. Verify OAuth refresh triggers without data loss
4. Verify sync completes with refreshed token

Challenge: Requires mocking token expiry or using a test provider with short-lived tokens.

#### Gap 5: Performance Baseline Documentation
No documented baseline for:
- Time to sync 1000 emails
- Lock contention success rate threshold
- Memory growth limits
- P95/P99 latency targets

## 3. Testing Patterns and Frameworks

### Current Pattern: Real Database/Redis Tests (No Mocks)

All existing stress tests follow the pattern established in Phase 2:
- Use `createPrismaClient()` for real database
- Use `ioredis` for real Redis
- No Jest mocks for infrastructure

This is the correct approach for Phase 8 validation.

### Test Structure Pattern

```typescript
interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  duration?: number;
}

async function runTest(
  name: string,
  fn: () => Promise<{ passed: boolean; details: string }>
): Promise<void> {
  // Timing, error handling, result collection
}
```

### Parallelization Pattern

For concurrent tests:
```typescript
// Workers competing for same resource
const workers = Array.from({ length: N }, async (_, i) => {
  while (attempts < maxAttempts) {
    const acquired = await redis.set(key, `worker-${i}`, 'PX', ttl, 'NX');
    if (acquired === 'OK') {
      // Do work
      await redis.del(key);
      return;
    }
    await new Promise(r => setTimeout(r, backoff));
  }
});
await Promise.all(workers);
```

### Metric Collection Pattern

```typescript
const metrics = {
  operations: { dbReads: 0, errors: 0 },
  latency: { dbRead: [], dbWrite: [] },
  memory: { initial: process.memoryUsage(), peak: process.memoryUsage() }
};

function percentile(arr: number[], p: number): number { /* ... */ }
function calcStats(arr: number[]): { min, max, avg, p50, p95, p99 } { /* ... */ }
```

## 4. Potential Risks and Edge Cases

### Risk 1: Database Connection Pool Exhaustion
**Scenario:** 100+ concurrent workers exhaust Prisma connection pool
**Mitigation:** Existing tests cap concurrency at 50 workers; Phase 8 tests should respect this

### Risk 2: Redis Lock TTL Expiry During Test
**Scenario:** Lock expires before work completes, causing false serialization
**Mitigation:** Use 5-minute TTL (300,000ms) as established in Phase 2

### Risk 3: P2034 Test Non-Determinism
**Scenario:** Deadlock may not occur reliably
**Mitigation:** Run multiple iterations, accept 1+ deadlock as proof

### Risk 4: Token Refresh Racing
**Scenario:** Multiple threads try to refresh token simultaneously
**Mitigation:** Token refresh should have its own lock or idempotency

### Risk 5: Test Data Cleanup Failures
**Scenario:** Failed test leaves stale data affecting next run
**Mitigation:** Use unique test tenant IDs with timestamps, cleanup at start and end

### Edge Cases to Test

1. **Provider with no folders** - Sync should handle gracefully
2. **Empty batch** - 0 emails in folder should not error
3. **Unicode folder names** - Non-ASCII paths (e.g., "Received/Fatture")
4. **Very long subject lines** - 500+ character subjects
5. **Concurrent rename and delete** - Race between rename and delete folder
6. **Token refresh timeout** - What if OAuth provider is slow?

## 5. Recommendations for Test Infrastructure and Tooling

### Recommendation 1: Create Test Baseline Document

Create `.planning/phases/08-testing-validation/BASELINE-METRICS.md`:
```markdown
# Phase 8 Performance Baseline

| Metric | Target | Measured |
|--------|--------|----------|
| 10-tenant concurrent sync | Complete without cross-tenant leaks | TBD |
| Folder rename during sync | 0 orphaned references | TBD |
| P2034 deadlock recovery | 100% recovery rate | TBD |
| 20-worker lock contention | 80%+ success rate | TBD |
| 1000-email batch sync | < 60 seconds | TBD |
| Token refresh mid-sync | 0 data loss | TBD |
```

### Recommendation 2: Create Test Runner Script

Create `backend/scripts/run-phase8-validation.ts` that:
1. Runs all Phase 8 tests in sequence
2. Collects unified metrics
3. Generates pass/fail report against success criteria
4. Outputs baseline metrics document

### Recommendation 3: P2034 Deadlock Test Strategy

For reliable deadlock creation:
```typescript
// Transaction A and B acquire rows in opposite order
async function createDeadlock() {
  const tx1 = prisma.$transaction([
    prisma.$executeRaw`SELECT * FROM emails WHERE id = ${id1} FOR UPDATE`,
    new Promise(r => setTimeout(r, 100)), // Allow tx2 to acquire id2
    prisma.$executeRaw`SELECT * FROM emails WHERE id = ${id2} FOR UPDATE`,
  ]);

  const tx2 = prisma.$transaction([
    prisma.$executeRaw`SELECT * FROM emails WHERE id = ${id2} FOR UPDATE`,
    new Promise(r => setTimeout(r, 100)), // Allow tx1 to acquire id1
    prisma.$executeRaw`SELECT * FROM emails WHERE id = ${id1} FOR UPDATE`,
  ]);

  // One will get P2034
  await Promise.allSettled([tx1, tx2]);
}
```

### Recommendation 4: Token Expiry Test Strategy

Option A: Mock token validation
```typescript
// In test, override token validation to expire mid-sync
jest.mock('../src/modules/auth/token-validator', () => ({
  isTokenValid: jest.fn()
    .mockReturnValueOnce(true)  // First check passes
    .mockReturnValueOnce(false) // Mid-sync check fails
}));
```

Option B: Use test provider with 1-minute token
- Create dedicated test provider with short token lifetime
- Start sync, wait for expiry, verify refresh

### Recommendation 5: Organize Tests by Plan

| Plan | Tests to Create/Enhance |
|------|------------------------|
| 08-01 | Multi-tenant isolation stress (enhance existing) |
| 08-02 | Folder rename during sync (new), lock contention (enhance) |
| 08-03 | P2034 deadlock (new), token expiry (new) |
| 08-04 | Baseline metrics document, test runner script |

## 6. Success Criteria Mapping to Plans

| Criterion | Plan | How Verified |
|-----------|------|--------------|
| 1. Multi-tenant zero leaks | 08-01 | Query all emails, verify tenantId matches provider's tenantId |
| 2. Folder rename no orphans | 08-02 | Rename during sync, count emails with invalid folder paths |
| 3. P2034 deadlock recovery | 08-03 | Force deadlock, verify PrismaRetryService retries and succeeds |
| 4. 20-worker lock success | 08-02 | Run existing test, verify 80%+ success rate |
| 5. 1000-email batch | 08-02 | Run existing test with timing, verify < 60s baseline |
| 6. Token expiry no data loss | 08-03 | Simulate expiry mid-sync, verify 0 lost emails |

## 7. Conclusion

Phase 8 has substantial existing test infrastructure but requires:
1. **Enhancement** of multi-tenant and lock contention tests to meet exact thresholds
2. **New tests** for folder rename during sync and token expiry
3. **Documentation** of baseline metrics and test infrastructure

The existing patterns (real database/Redis, concurrent workers, metric collection) are well-established and should be followed. Key risks are non-determinism in deadlock tests and the challenge of simulating token expiry without mocks.

---
*Research completed: 2026-02-02*
*Requirements: TEST-04, TEST-06, TEST-07*
