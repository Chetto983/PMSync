# Phase 01: Performance Foundation - Research Findings

**Date:** 2026-02-02
**Phase Goal:** Optimize backend before building frontend to ensure smooth experience
**Status:** RESEARCH COMPLETE

---

## Executive Summary

This phase focuses on backend performance optimization through database indexing, query fixes, cleanup jobs, and technical debt resolution. The codebase already has significant infrastructure in place (pgvector extension, BullMQ queues, PrismaRetryService), reducing implementation complexity.

**Key Finding:** The HNSW index migration already exists (`20250106_hnsw_vector_index/migration.sql`), but needs verification and potential parameter tuning. Focus should shift to N+1 fixes, orphan cleanup, composite indexes, and service wiring.

---

## 1. PERF-01: pgvector HNSW Index

### Current State

**Already implemented:** Migration exists at `backend/prisma/migrations/20250106_hnsw_vector_index/migration.sql`

```sql
-- Current index configuration
CREATE INDEX IF NOT EXISTS "embeddings_vector_hnsw_idx"
  ON "embeddings"
  USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Vector column:** `vector(1024)` - Mistral-embed dimensions

### Best Practices (2025)

#### HNSW Parameters Explained

| Parameter | Current | Recommended | Notes |
|-----------|---------|-------------|-------|
| `m` | 16 | **16-24** | Connections per node. Higher = better recall, more memory. 16 is good for ~100k vectors. |
| `ef_construction` | 64 | **64-128** | Build quality. Higher = better index, slower build. 64 is reasonable. |
| `ef_search` | 100 (runtime) | **40-200** | Query-time param. Higher = more accurate but slower. |

#### pgvector HNSW Performance Guidelines

```sql
-- Query-time tuning (already in embeddings.service.ts)
SET LOCAL hnsw.ef_search = 100;  -- For high-recall RAG
SET LOCAL hnsw.ef_search = 40;   -- For faster but less precise search
```

**Memory formula:** HNSW requires ~`4 * m * dimensions * rows` bytes
- At 100k embeddings: `4 * 16 * 1024 * 100000` = ~6.5 GB

#### Benchmark Target

- **<50ms for 100k embeddings** - Achievable with current config
- Compare against brute force (cosine distance scan)

### Actions Required

1. **Verify index exists** in production database
2. **Run benchmark** comparing HNSW vs sequential scan
3. **Document ef_search recommendations** for different use cases

### Implementation Notes

The `EmbeddingsService.findSimilarContent()` already sets `ef_search = 100` via `SET LOCAL`. No code changes needed.

---

## 2. PERF-02: N+1 Query Fix for Folder Counts

### Current State

**Already optimized!** The `FolderSyncQueryService.updateAllFolderCounts()` uses `groupBy`:

```typescript
// Lines 263-264 in folder-sync-query.service.ts
const totalCounts = await this.prisma.email.groupBy({ by: ['folder'], where: { providerId }, _count: { id: true } });
const unreadCounts = await this.prisma.email.groupBy({ by: ['folder'], where: { providerId, isRead: false }, _count: { id: true } });
```

This is already **O(5) queries** instead of O(4N+1) as noted in the comment (line 230).

### Potential Issues Found

However, `FoldersController.getFolders()` (lines 281-298) calls `updateAllFolderCounts()` **inside a loop**:

```typescript
// Lines 281-284 in folders.controller.ts - POTENTIAL PERFORMANCE ISSUE
for (const provider of providers) {
  await this.folderSyncService.updateAllFolderCounts(provider.id);
}
```

**Problem:** If user has 3 email providers, this runs 3 sequential update operations.

### Recommended Fix

```typescript
// Parallel execution instead of sequential
await Promise.all(
  providers.map(p => this.folderSyncService.updateAllFolderCounts(p.id))
);
```

### Benchmark Target

- **<100ms for 50 folders** - Should be achievable with current groupBy implementation

---

## 3. PERF-03: Orphaned Embedding Cleanup

### Current State

**Partial implementation exists:** `backend/scripts/check-orphan-embeddings.ts`

This script only **counts** orphans but doesn't delete them. It also uses **JSONB metadata** queries (anti-pattern per CLAUDE.md):

```typescript
// Current (inefficient) - queries metadata JSONB
WHERE e.id IS NULL AND emb.metadata->>'emailId' IS NOT NULL
```

### Best Practice: Use Indexed Fields

The schema has indexed fields `emailId` and `contactId` on the Embedding table:

```prisma
model Embedding {
  emailId   String?
  contactId String?
  // Indexes exist:
  @@index([emailId])
  @@index([contactId])
}
```

**Orphan detection should use these indexed fields, not JSONB metadata.**

### BullMQ Scheduled Job Pattern

Existing infrastructure at `common/services/scheduled-jobs.queue.ts`:

```typescript
export enum ScheduledJobType {
  EMAIL_EMBEDDING_CLEANUP = 'email-embedding-cleanup',
  // Already defined but handler may not be registered
}

export const SCHEDULED_JOB_PATTERNS: Record<ScheduledJobType, string> = {
  [ScheduledJobType.EMAIL_EMBEDDING_CLEANUP]: '*/30 * * * *', // Every 30 minutes
};
```

### Implementation Plan

1. **Create `OrphanEmbeddingCleanupService`** that:
   - Queries embeddings where `emailId IS NOT NULL` but no matching Email exists
   - Queries embeddings where `contactId IS NOT NULL` but no matching Contact exists
   - Also deletes embeddings where BOTH `emailId IS NULL AND contactId IS NULL`
   - Uses batch deletion (500 at a time)
   - Logs metrics

2. **Register handler** with `ScheduledJobsQueueService`:

```typescript
this.scheduledJobs.registerHandler(
  ScheduledJobType.EMAIL_EMBEDDING_CLEANUP,
  async (job) => this.cleanupOrphanedEmbeddings()
);
```

3. **Schedule:** Weekly (change from every 30 min) - `'0 3 * * 0'` (Sunday 3 AM)

### Efficient Orphan Query

```sql
-- Email orphans (indexed, O(n log n))
DELETE FROM embeddings
WHERE "emailId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.id = embeddings."emailId");

-- Contact orphans (indexed, O(n log n))
DELETE FROM embeddings
WHERE "contactId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = embeddings."contactId");

-- Completely unlinked (no email, no contact)
DELETE FROM embeddings
WHERE "emailId" IS NULL AND "contactId" IS NULL;
```

---

## 4. PERF-04: Composite Indexes

### Current Email Indexes (from schema.prisma)

```prisma
@@index([tenantId, folder, receivedAt])           // EXISTS
@@index([tenantId, isRead])                       // EXISTS (but missing receivedAt DESC)
@@index([tenantId, threadId])                     // EXISTS
@@index([tenantId, providerId, folder, receivedAt]) // EXISTS
```

### Required Indexes (from requirements)

| Index | Current | Action |
|-------|---------|--------|
| `(tenantId, folderId, receivedAt DESC)` | Partial (`tenantId, folder, receivedAt`) | **Already exists** - `folderId` vs `folder` naming difference only |
| `(tenantId, threadId)` | EXISTS | None needed |
| `(tenantId, isRead, receivedAt DESC)` | Partial (`tenantId, isRead`) | **Add `receivedAt DESC`** |

### PostgreSQL CONCURRENTLY Pattern

For production safety, indexes should be created with `CONCURRENTLY`:

```sql
-- Migration file: 20260202_composite_indexes/migration.sql
-- NOTE: CONCURRENTLY cannot be used inside Prisma transactions
-- Run this manually in production with psql

-- Improved index for unread emails (with sorting)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "emails_tenant_unread_received_idx"
  ON "emails" ("tenantId", "isRead", "receivedAt" DESC)
  WHERE "isDeleted" = false;  -- Partial index for efficiency

-- Verify index usage with EXPLAIN ANALYZE
```

### Migration Strategy

1. **Development:** Use regular `CREATE INDEX` in migration
2. **Production:** Run `CREATE INDEX CONCURRENTLY` via psql separately
3. **Prisma schema:** Add `@@index` annotation for documentation

---

## 5. DEBT-01: ConversationAtomicityService Wiring

### Current State

**Service exists** but is **not wired** to any VoltAgent operations:

```typescript
// voltagent.module.ts - Service is registered as provider and exported
providers: [
  ConversationAtomicityService, // RACE-03: Compensating transaction for VoltAgent
],
exports: [
  ConversationAtomicityService, // RACE-03: Compensating transaction for VoltAgent
],
```

**Usage grep shows 0 calls** to `withAtomicity()` outside the service definition itself.

### Service API

```typescript
async withAtomicity<T, R>(
  prismaOp: PrismaOperation<T>,
  memoryOp: MemoryOperation<T, R>,
  context: { userId?: string; conversationId?: string; operation?: string }
): Promise<AtomicOperationResult<R>>
```

### Where to Wire

1. **ConversationManagementService** - CRUD operations on conversations
2. **AIMemoryService** - Memory create/update operations
3. **EpisodicMemoryService** - Episode recording

### Example Wiring

```typescript
// In AIMemoryService.createMemory()
constructor(
  private readonly prisma: PrismaService,
  private readonly atomicity: ConversationAtomicityService,
) {}

async createMemoryAtomic(userId: string, content: string): Promise<AtomicOperationResult<Memory>> {
  return this.atomicity.withAtomicity(
    {
      execute: (tx) => tx.aiMemory.create({ data: { userId, content } }),
      compensate: (result) => this.prisma.aiMemory.delete({ where: { id: result.id } }),
    },
    {
      execute: async (memory) => {
        await this.voltAgentMemoryApi.store(memory);
        return memory;
      },
    },
    { userId, operation: 'createMemory' }
  );
}
```

---

## 6. DEBT-02: PrismaRetryService Integration

### Current State

**Service exists** at `common/services/prisma-retry.service.ts` but has **limited adoption**.

### Files with Inline Retry Logic (Replace with PrismaRetryService)

| File | Lines | Current Pattern |
|------|-------|-----------------|
| `folder-sync-query.service.ts` | 128-138, 166-175 | Manual `while (retryCount < MAX_RETRIES)` loop |
| `sync-message-processor.service.ts` | 617-631 | Manual retry with `isRetryable` check |
| `analytics.tools.ts` | 193-196 | `isPrismaUniqueConstraintError()` helper |
| `web-search.tools.ts` | 149-152 | `isPrismaUniqueConstraintError()` helper |

### Refactor Pattern

**Before (inline):**
```typescript
let retryCount = 0;
while (true) {
  try {
    return await this.prisma.folder.upsert({ ... });
  } catch (error) {
    if ((error.code === 'P2002' || error.code === 'P2034') && retryCount < MAX_RETRIES) {
      retryCount++;
      await new Promise(r => setTimeout(r, 50 * retryCount));
      continue;
    }
    throw error;
  }
}
```

**After (using PrismaRetryService):**
```typescript
constructor(private readonly prismaRetry: PrismaRetryService) {}

async upsertFolder(data: FolderData) {
  return this.prismaRetry.withRetry(
    () => this.prisma.folder.upsert({ where: {...}, create: {...}, update: {...} }),
    { loggerName: 'FolderSync', maxAttempts: 3 }
  );
}
```

### Standalone Function Available

For non-NestJS contexts (tools, scripts):

```typescript
import { withPrismaRetry } from '@common/services/prisma-retry.service';

const result = await withPrismaRetry(
  () => prisma.email.upsert({ ... }),
  { maxAttempts: 3 }
);
```

---

## 7. DEBT-03: DEPRECATED Marker Cleanup

### Current State

**Only 1 DEPRECATED marker found:**

```typescript
// usage-tracking.service.ts:317
// DEPRECATED: Always return true - proper enforcement via CostProtectionService.canProceed()
```

### Action Required

Add `@removal-date` annotation and create tracking issue:

```typescript
/**
 * @deprecated Since v1.0 - Use CostProtectionService.canProceed() instead
 * @removal-date 2026-04-01
 * @see https://github.com/org/repo/issues/XXX
 */
```

### Audit Pattern for Future

```typescript
// Use JSDoc standard @deprecated tag
/**
 * @deprecated Use newMethod() instead
 * @removal-date YYYY-MM-DD
 * @see ISSUE_URL
 */
```

---

## Implementation Priority

| Requirement | Effort | Impact | Priority |
|------------|--------|--------|----------|
| PERF-01 (HNSW) | Low (verify only) | High | P1 |
| PERF-02 (N+1 fix) | Low (small refactor) | Medium | P2 |
| PERF-03 (Orphan cleanup) | Medium (new job) | High | P1 |
| PERF-04 (Composite indexes) | Low (migration) | Medium | P2 |
| DEBT-01 (Atomicity wiring) | Medium (design) | High | P1 |
| DEBT-02 (PrismaRetry) | Medium (refactor) | Low | P3 |
| DEBT-03 (DEPRECATED) | Low (annotation) | Low | P3 |

---

## Testing Strategy

### HNSW Benchmark Script

```typescript
// scripts/benchmark-hnsw.ts
async function benchmarkVectorSearch() {
  const embedding = await generateTestEmbedding();

  // HNSW search (should use index)
  console.time('HNSW');
  await embeddingsService.findSimilarContent(tenantId, embedding, 10);
  console.timeEnd('HNSW');

  // Sequential scan (disable index)
  await prisma.$executeRaw`SET enable_indexscan = off`;
  console.time('Sequential');
  await embeddingsService.findSimilarContent(tenantId, embedding, 10);
  console.timeEnd('Sequential');
  await prisma.$executeRaw`SET enable_indexscan = on`;
}
```

### Orphan Cleanup Test

```sql
-- Count orphans before cleanup
SELECT COUNT(*) FROM embeddings
WHERE "emailId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.id = embeddings."emailId");

-- Run cleanup job
-- Verify count is 0
```

---

## Files to Modify

1. **New files:**
   - `backend/src/modules/ai/services/orphan-embedding-cleanup.service.ts`
   - `backend/prisma/migrations/20260202_composite_indexes/migration.sql`
   - `backend/scripts/benchmark-hnsw.ts`

2. **Modify:**
   - `folder-sync-query.service.ts` - Replace inline retry with PrismaRetryService
   - `sync-message-processor.service.ts` - Replace inline retry with PrismaRetryService
   - `conversation-management.service.ts` - Wire ConversationAtomicityService
   - `ai-memory.service.ts` - Wire ConversationAtomicityService
   - `usage-tracking.service.ts` - Add @removal-date to DEPRECATED comment
   - `folders.controller.ts` - Parallelize updateAllFolderCounts calls

---

## Dependencies

- **pgvector extension** - Already installed
- **BullMQ** - Already configured
- **Redis** - Already configured for locks and queues
- **PrismaRetryService** - Already implemented, needs injection

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| HNSW index missing in production | Verify with `\d embeddings` in psql |
| Orphan cleanup deletes valid data | Test in staging first, add dry-run flag |
| CONCURRENTLY blocks writes | Run during low-traffic window |
| Atomicity wiring breaks existing flows | Wrap in feature flag initially |

---

## References

- [pgvector HNSW Documentation](https://github.com/pgvector/pgvector#hnsw)
- [Prisma P2002/P2034 Handling](https://www.prisma.io/docs/concepts/components/prisma-client/error-reference)
- [BullMQ Repeatable Jobs](https://docs.bullmq.io/guide/jobs/repeatable)
- [PostgreSQL CREATE INDEX CONCURRENTLY](https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)
