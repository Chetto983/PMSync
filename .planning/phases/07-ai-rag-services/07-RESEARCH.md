# Phase 7: AI/RAG Services - Research

**Researched:** 2026-02-02
**Domain:** Internal codebase refactoring - knowledge-base.service.ts extraction
**Confidence:** HIGH (codebase analysis, established patterns from Phases 3-6)

## Summary

This research analyzes `knowledge-base.service.ts` (1,371 lines) to identify natural extraction boundaries for RAG-related components. The file handles embedding generation, CRUD operations, vector search, and backfill orchestration for emails and contacts.

**Key finding:** The file has 4 clear functional groups:
1. **Embedding Composer** (lines 843-983): `composeEmailEmbeddingContent()`, `composeContactEmbeddingContent()`, `chunkContentForEmbedding()`, `composeEmailEmbeddingContentWithAttachments()`
2. **Embedding CRUD** (lines 484-569, 1096-1370): `listEmbeddings()`, `deleteEmbedding()`, `deleteEmbeddingsForEmail()`, `deleteEmbeddingsForContact()`, `bulkDeleteEmbeddingsByEmailIds()`, `bulkDeleteEmbeddingsByContactIds()`
3. **Embedding Search** (lines 571-770): `searchKnowledgeBase()`, `hydrateKnowledgeHits()`, `fetchEmailHydrationMap()`
4. **Embedding Backfill** (lines 106-169): `backfillEmailEmbeddingsForTenant()`, `fetchEmailsWithoutEmbeddings()`, `countEmailsWithoutEmbeddings()`, `cleanupOldEmbeddings()`, `getEmbeddingStats()`

**Primary recommendation:** Extract 4 services following the proven facade pattern from Phases 3-6, with KnowledgeBaseService becoming a thin facade delegating to sub-services.

## Current File Analysis

### Line Count by Section

| Section | Lines | Method(s) | Responsibility |
|---------|-------|-----------|----------------|
| Interfaces + Constructor | 1-104 | interfaces, constructor | Setup |
| **Backfill Operations** | 106-169 | `backfillEmailEmbeddingsForTenant()` | Batch embedding creation |
| **Bulk Email Embeddings** | 177-339 | `createBulkEmbeddingsForEmails()` | Bulk API operations |
| **Single Email Embedding** | 341-482 | `createEmbeddingForEmail()` | Single email processing |
| **CRUD - List/Delete** | 484-569 | `listEmbeddings()`, `deleteEmbedding()`, `deleteEmbeddingsForEmail[s]()` | CRUD operations |
| **Search** | 571-630 | `searchKnowledgeBase()` | Vector similarity search |
| **Hydration** | 637-770 | `hydrateKnowledgeHits()`, `fetchEmailHydrationMap()` | Result enrichment |
| **Helper Fetch** | 772-836 | `fetchEmailsWithoutEmbeddings()`, `countEmailsWithoutEmbeddings()` | Backfill queries |
| **Pause Helper** | 838-841 | `pauseBetweenBackfillBatches()` | Rate limiting |
| **Email Composer** | 843-950 | `composeEmailEmbeddingContent()`, `composeEmailEmbeddingContentWithAttachments()` | Content composition |
| **Chunking** | 952-983 | `chunkContentForEmbedding()` | Text chunking |
| **TTL/Stats** | 985-1085 | `cleanupOldEmbeddings()`, `getEmbeddingStats()`, `bulkDeleteEmbeddingsByEmailIds()` | Retention management |
| **Contact Embeddings** | 1128-1371 | `createEmbeddingForContact()`, `composeContactEmbeddingContent()`, `deleteEmbeddingsForContact()` | Contact operations |

### Method Dependencies

```
KnowledgeBaseService
    │
    ├── backfillEmailEmbeddingsForTenant()
    │   ├── fetchEmailsWithoutEmbeddings() ─── [raw SQL query]
    │   ├── composeEmailEmbeddingContent()
    │   ├── emailEmbeddingQueue.enqueue()
    │   ├── countEmailsWithoutEmbeddings() ─── [raw SQL query]
    │   └── pauseBetweenBackfillBatches()
    │
    ├── createBulkEmbeddingsForEmails()
    │   ├── embeddingsService.hasEmbeddingForEmail() ─── [indexed lookup]
    │   ├── composeEmailEmbeddingContentWithAttachments()
    │   ├── chunkContentForEmbedding()
    │   ├── deleteEmbeddingsForEmail()
    │   ├── mistralService.generateBulkEmbeddings()
    │   └── embeddingsService.saveEmbedding()
    │
    ├── createEmbeddingForEmail()
    │   ├── embeddingsService.hasEmbeddingForEmail()
    │   ├── composeEmailEmbeddingContentWithAttachments()
    │   ├── chunkContentForEmbedding()
    │   ├── deleteEmbeddingsForEmail()
    │   ├── mistralService.createMistralClient()
    │   ├── mistralService.generateBulkEmbeddings() / generateEmbedding()
    │   └── embeddingsService.saveEmbedding()
    │
    ├── searchKnowledgeBase()
    │   ├── composeEmailEmbeddingContent() ─── [for emailId-based search]
    │   ├── mistralService.createMistralClient()
    │   ├── mistralService.generateEmbedding()
    │   ├── embeddingsService.findSimilarContent() ─── [pgvector search]
    │   └── hydrateKnowledgeHits()
    │       └── fetchEmailHydrationMap() ─── [Prisma query]
    │
    └── createEmbeddingForContact()
        ├── embeddingsService.hasEmbeddingForContact()
        ├── composeContactEmbeddingContent()
        ├── chunkContentForEmbedding()
        ├── deleteEmbeddingsForContact()
        ├── mistralService.createMistralClient()
        ├── mistralService.generateBulkEmbeddings() / generateEmbedding()
        └── embeddingsService.saveEmbedding()
```

### External Dependencies

| Dependency | Type | Used For |
|------------|------|----------|
| `PrismaService` | Injected | Raw SQL queries, CRUD operations |
| `MistralService` | Injected | Embedding generation |
| `EmbeddingsService` | Injected | Vector storage/search |
| `EmailEmbeddingQueueService` | Injected (forwardRef) | Queue job creation |
| `ConfigService` | Injected | Configuration |
| `HtmlContentExtractor` | Static import | HTML parsing |

## Architecture Patterns

### Pattern 1: Facade Delegation (PROVEN IN PHASES 3-6)

```typescript
// NEW: Extracted sub-services
@Injectable()
export class EmbeddingComposerService {
  composeEmailContent(email: EmailContentInput): string | null { /* ... */ }
  composeContactContent(contact: ContactContentInput): string { /* ... */ }
  chunkContent(content: string, maxChars: number): ChunkResult[] { /* ... */ }
}

@Injectable()
export class EmbeddingCrudService {
  listEmbeddings(tenantId: string, params: ListParams): Promise<ListResult> { /* ... */ }
  deleteEmbedding(tenantId: string, embeddingId: string): Promise<void> { /* ... */ }
  deleteEmbeddingsForEmail(tenantId: string, emailId: string): Promise<number> { /* ... */ }
  deleteEmbeddingsForContact(tenantId: string, contactId: string): Promise<number> { /* ... */ }
  bulkDeleteByEmailIds(tenantId: string, emailIds: string[]): Promise<number> { /* ... */ }
  bulkDeleteByContactIds(tenantId: string, contactIds: string[]): Promise<number> { /* ... */ }
}

@Injectable()
export class EmbeddingSearchService {
  search(options: SearchOptions): Promise<SearchResult> { /* ... */ }
  hydrateHits(matches: EmbeddingMatch[], tenantId: string): Promise<KnowledgeBaseSearchHit[]> { /* ... */ }
}

@Injectable()
export class EmbeddingBackfillService {
  backfillForTenant(tenantId: string, options: BackfillOptions): Promise<BackfillResult> { /* ... */ }
  countEmailsWithoutEmbeddings(tenantId: string, includeDeleted: boolean): Promise<number> { /* ... */ }
  cleanupOldEmbeddings(tenantId?: string, retentionDays?: number): Promise<number> { /* ... */ }
  getStats(tenantId: string): Promise<EmbeddingStats> { /* ... */ }
}

// REFACTORED: Thin facade (~250 lines)
@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly composer: EmbeddingComposerService,
    private readonly crud: EmbeddingCrudService,
    private readonly search: EmbeddingSearchService,
    private readonly backfill: EmbeddingBackfillService,
    // ... other deps for create methods
  ) {}

  // Facade methods delegate to sub-services
  async searchKnowledgeBase(options: SearchOptions) {
    return this.search.search(options);
  }

  // Creation methods stay in facade (orchestrate multiple sub-services)
  async createEmbeddingForEmail(options: CreateEmailOptions): Promise<boolean> {
    // Orchestrates: composer → crud (delete existing) → mistral → embeddingsService
  }
}
```

### Pattern 2: DI Ordering (PROVEN IN PHASES 3-5)

Sub-services MUST come before facade in the module's providers array:

```typescript
@Module({
  providers: [
    // Sub-services FIRST (no circular deps)
    EmbeddingComposerService,
    EmbeddingCrudService,
    EmbeddingSearchService,
    EmbeddingBackfillService,
    // Facade LAST (depends on sub-services)
    KnowledgeBaseService,
  ],
  exports: [KnowledgeBaseService], // Only export facade
})
```

### Pattern 3: Multi-Tenant Isolation (CRITICAL FOR RAG)

All methods MUST include `tenantId` in queries:

```typescript
// ✅ CORRECT: Tenant isolation
await this.prisma.embedding.findMany({
  where: { tenantId, emailId },
});

// ❌ WRONG: No tenant isolation
await this.prisma.embedding.findMany({
  where: { emailId },
});
```

## Proposed Extraction Boundaries

### Service 1: EmbeddingComposerService (~200 lines)

**Extracts from:** Lines 843-983 (composer methods) + 1260-1319 (contact composer)

**Methods:**
- `composeEmailEmbeddingContent(email: EmailContentInput): string | null`
- `composeEmailEmbeddingContentWithAttachments(email, tenantId): Promise<EmailContentResult>`
- `composeContactEmbeddingContent(contact: ContactContentInput): string`
- `chunkContentForEmbedding(content: string): ChunkResult[]`

**Key behaviors to preserve:**
1. Priority: bodyHtml > bodyText > snippet (for emails)
2. HtmlContentExtractor for HTML parsing (Readability-based)
3. Italian subject prefix: "Oggetto: "
4. Chunk overlap at sentence boundaries (0.5 of maxChars)
5. Attachment metadata query (no upfront extraction)

### Service 2: EmbeddingCrudService (~200 lines)

**Extracts from:** Lines 484-569 (CRUD) + 1096-1127 (bulk delete) + 1321-1370 (contact delete)

**Methods:**
- `listEmbeddings(tenantId, params): Promise<ListResult>`
- `deleteEmbedding(tenantId, embeddingId): Promise<void>`
- `deleteEmbeddingsForEmail(tenantId, emailId): Promise<number>`
- `deleteEmbeddingsForEmails(tenantId, emailIds): Promise<number>`
- `deleteEmbeddingsForContact(tenantId, contactId): Promise<number>`
- `bulkDeleteEmbeddingsByEmailIds(tenantId, emailIds, batchSize?): Promise<number>`
- `bulkDeleteEmbeddingsByContactIds(tenantId, contactIds, batchSize?): Promise<number>`

**Key behaviors to preserve:**
1. Batch size of 50 for bulk deletes
2. Use indexed `emailId`/`contactId` fields (NOT JSONB metadata)
3. Tenant isolation in all queries

### Service 3: EmbeddingSearchService (~250 lines)

**Extracts from:** Lines 571-770 (search + hydration)

**Methods:**
- `search(options: SearchOptions): Promise<SearchResult>`
- `hydrateKnowledgeHits(matches, tenantId): Promise<KnowledgeBaseSearchHit[]>`
- (private) `fetchEmailHydrationMap(tenantId, emailIds): Promise<Map>`
- (private) `normaliseMetadata(value): Record<string, any>`
- (private) `truncateMemorySnippet(value, limit): string`
- (private) `isString(value): value is string`

**Key behaviors to preserve:**
1. Limit capped at 10 results
2. GDPR-compliant: Fetch snippet from Email table, not embedding metadata
3. Score calculation: `1 - min(max(distance, 0), 1)`
4. Hydration via JOIN on emailId (not embedding ID)

### Service 4: EmbeddingBackfillService (~250 lines)

**Extracts from:** Lines 106-169 (backfill) + 772-841 (fetch queries) + 1002-1085 (stats/cleanup)

**Methods:**
- `backfillEmailEmbeddingsForTenant(tenantId, options): Promise<BackfillResult>`
- `fetchEmailsWithoutEmbeddings(tenantId, limit, includeDeleted): Promise<Email[]>`
- `countEmailsWithoutEmbeddings(tenantId, includeDeleted): Promise<number>`
- `cleanupOldEmbeddings(tenantId?, retentionDays?): Promise<number>`
- `getEmbeddingStats(tenantId): Promise<EmbeddingStats>`
- (private) `pauseBetweenBackfillBatches(): Promise<void>`

**Key behaviors to preserve:**
1. Raw SQL with LEFT JOIN to find emails without embeddings
2. Batch size configurable (default 10, max 10)
3. 1 second pause between batches (rate limiting)
4. Default retention: 90 days
5. Use indexed `emailId` field in JOIN

### Remaining in Facade (~250 lines)

**Keeps:**
- Constructor + imports (~30 lines)
- Interfaces (~50 lines)
- `createBulkEmbeddingsForEmails()` (~160 lines) - orchestrates multiple services
- `createEmbeddingForEmail()` (~140 lines) - orchestrates multiple services
- `createEmbeddingForContact()` (~120 lines) - orchestrates multiple services

**Note:** Creation methods remain in facade because they orchestrate:
1. Composer (compose content)
2. CRUD (delete existing)
3. MistralService (generate embeddings)
4. EmbeddingsService (save)

Moving these to sub-services would create circular dependencies.

## pgvector Query Verification

### Current HNSW Index

```sql
-- Migration: 20250106_hnsw_vector_index
CREATE INDEX IF NOT EXISTS "embeddings_vector_hnsw_idx"
  ON "embeddings"
  USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### EXPLAIN Verification Pattern

**Test query to verify index usage:**

```sql
EXPLAIN ANALYZE
SELECT id, "documentName", metadata, "emailId", "contactId",
       (vector <-> '[...]'::vector) AS distance
FROM embeddings
WHERE "tenantId" = 'test-tenant'
ORDER BY vector <-> '[...]'::vector
LIMIT 5;
```

**Expected plan should show:**
```
Index Scan using embeddings_vector_hnsw_idx on embeddings
  Index Cond: ...
  Filter: (tenantId = 'test-tenant')
```

**NOT acceptable (full scan):**
```
Seq Scan on embeddings
  Filter: ...
```

### EmbeddingsService Already Optimized

From `embeddings.service.ts` line 150:
```typescript
// OPTIMIZATION: Set ef_search for better recall in production RAG
await this.prisma.$executeRaw`SET LOCAL hnsw.ef_search = 100`;
```

The CTE pattern forces tenant filtering FIRST:
```sql
WITH tenant_embeddings AS (
  SELECT "id", "documentName", "metadata", "vector", "emailId", "contactId"
  FROM "embeddings"
  WHERE "tenantId" = ${tenantId}
)
SELECT ... FROM tenant_embeddings ...
```

## Multi-Tenant Isolation Verification

### Current Indexed Fields

From `schema.prisma`:
```prisma
model Embedding {
  id             String  @default(cuid())
  tenantId       String
  emailId        String?
  contactId      String?

  @@id([id, tenantId])
  @@index([tenantId])
  @@index([emailId])
  @@index([contactId])
}
```

### Test Cases for Unit Tests

1. **Tenant A cannot see Tenant B's embeddings:**
```typescript
// Create embedding for Tenant A
await embeddingCrud.createForEmail(tenantA, emailId, ...);

// Search as Tenant B should return empty
const results = await embeddingSearch.search({ tenantId: tenantB, query: 'test' });
expect(results.items).toHaveLength(0);
```

2. **Bulk delete only affects own tenant:**
```typescript
// Create embeddings for both tenants
await embeddingCrud.createForEmail(tenantA, emailId, ...);
await embeddingCrud.createForEmail(tenantB, emailId, ...);

// Delete for Tenant A only
await embeddingCrud.bulkDeleteByEmailIds(tenantA, [emailId]);

// Tenant B's embedding still exists
const exists = await embeddingsService.hasEmbeddingForEmail(tenantB, emailId);
expect(exists).toBe(true);
```

## Don't Hand-Roll

| Problem | Already Exists | Where |
|---------|---------------|-------|
| Vector similarity search | `EmbeddingsService.findSimilarContent()` | `embeddings.service.ts` |
| Embedding generation | `MistralService.generateEmbedding/Bulk()` | `mistral.service.ts` |
| HTML content extraction | `HtmlContentExtractor` | `html-content-extractor.ts` |
| Rate limiting for Mistral | `EmailEmbeddingQueueService` | `email-embedding.queue.ts` |
| Contact embedding queue | `ContactEmbeddingQueueService` | `contact-embedding.queue.ts` |
| Query embedding cache | `QueryEmbeddingCacheService` | `query-embedding-cache.service.ts` |

**CRITICAL:** Do NOT create new embedding generation or vector search mechanisms. Use existing services.

## Common Pitfalls

### Pitfall 1: Circular Dependency with EmailEmbeddingQueueService

**What goes wrong:** KnowledgeBaseService has circular dependency with EmailEmbeddingQueueService.

**Why it happens:** Both services reference each other:
- KnowledgeBaseService calls `emailEmbeddingQueue.enqueue()`
- EmailEmbeddingQueueService calls `knowledgeBaseService.createEmbeddingForEmail()`

**How to avoid:**
- Keep using `forwardRef(() => EmailEmbeddingQueueService)` in constructor
- Do NOT move queue-related methods to extracted sub-services
- Backfill service should receive queue as constructor parameter, not direct import

**Warning signs:** NestJS circular dependency error at startup.

### Pitfall 2: Breaking GDPR-Compliant Hydration

**What goes wrong:** Search results include embedding metadata instead of fetching from source tables.

**Why it happens:** During extraction, the hydration logic gets simplified incorrectly.

**How to avoid:**
1. Keep `fetchEmailHydrationMap()` in search service
2. Verify snippet comes from `Email.snippet`, not `embedding.metadata.content`
3. Comment: "GDPR-compliant: Fetch content from Email table, not embedding metadata"

**Warning signs:** Search results show old/cached snippets instead of current email content.

### Pitfall 3: Losing Indexed Field Usage

**What goes wrong:** Queries use JSONB metadata path instead of indexed fields.

**Why it happens:** Legacy code pattern copied during extraction.

**How to avoid:**
```typescript
// ✅ CORRECT: Use indexed field
where: { tenantId, emailId }

// ❌ WRONG: JSONB path (O(n) full scan)
where: { metadata: { path: ['emailId'], equals: emailId } }
```

**Warning signs:** Slow delete operations, missing index scan in EXPLAIN.

### Pitfall 4: Attachment Metadata Query Failure

**What goes wrong:** `composeEmailEmbeddingContentWithAttachments()` fails to find attachments.

**Why it happens:** Query assumes direct emailId relation, but attachments have tenant context via email.

**How to avoid:** Keep the existing query pattern:
```typescript
where: {
  emailId: email.id,
  isInline: false,
  email: { tenantId },
}
```

### Pitfall 5: Chunking Logic Separated from Composer

**What goes wrong:** Chunk size configuration not available in composer service.

**Why it happens:** `maxCharsPerChunk` is set in constructor from ConfigService.

**How to avoid:**
1. Inject ConfigService into EmbeddingComposerService
2. Read `AI_EMBEDDING_CHUNK_SIZE` in composer constructor
3. Default: 6000 chars (safe for Mistral's 8192 token limit)

## Code Examples

### Existing Pattern: Phase 6 Facade (SyncOrchestrationService)

**Source:** `.planning/phases/06-base-sync-extraction/06-RESEARCH.md`

```typescript
@Injectable()
export class SyncMessageProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly redisLock: RedisLockService,
  ) {}

  async upsertMessage(
    driver: IEmailDriver,
    message: CanonicalMessage,
    providerId: string,
    tenantId: string,
    context: MessageProcessorContext,
  ): Promise<UpsertResult> {
    // Implementation with all race condition fixes preserved
  }
}
```

### Proposed Pattern: EmbeddingSearchService

```typescript
@Injectable()
export class EmbeddingSearchService {
  private readonly logger = new Logger(EmbeddingSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly composer: EmbeddingComposerService,
  ) {}

  /**
   * Search knowledge base using vector similarity.
   * GDPR-compliant: Results hydrated from source tables.
   */
  async search(options: KnowledgeBaseSearchOptions): Promise<SearchResult> {
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 10) : 5;
    let searchText = options.query?.trim() ?? '';

    // If no query but emailId provided, compose from email content
    if (!searchText && options.emailId) {
      const email = await this.prisma.email.findFirst({
        where: { id: options.emailId, tenantId: options.tenantId },
        select: { subject: true, snippet: true, bodyText: true, bodyHtml: true },
      });
      if (email) {
        searchText = this.composer.composeEmailEmbeddingContent(email) ?? '';
      }
    }

    if (!searchText) {
      throw new BadRequestException('Provide a query or emailId');
    }

    // Generate embedding
    const client = await this.mistralService.createMistralClient();
    const embedding = await this.mistralService.generateEmbedding(
      searchText, client, { tenantId: options.tenantId }
    );

    // Vector search
    const matches = await this.embeddingsService.findSimilarContent(
      options.tenantId, embedding, limit
    );

    // GDPR-compliant hydration from source tables
    const items = await this.hydrateKnowledgeHits(matches, options.tenantId);

    return { usedQuery: searchText, items };
  }

  /**
   * GDPR-compliant: Fetch content from Email table, not embedding metadata.
   */
  private async hydrateKnowledgeHits(
    matches: EmbeddingMatch[],
    tenantId: string,
  ): Promise<KnowledgeBaseSearchHit[]> {
    // Implementation from lines 637-709 of knowledge-base.service.ts
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSONB metadata queries for emailId | Indexed `emailId` field | 2026-01-29 | O(log n) vs O(n) lookup |
| Content stored in embeddings | Content fetched from source tables | 2026-01-29 | GDPR compliance |
| IVFFlat vector index | HNSW index | 2025-01-06 | 10-50x faster search |
| Individual embedding generation | Bulk embeddings API | 2025-12 | 50% cost savings |

## Open Questions

### 1. Should EmbeddingComposerService depend on PrismaService?

**What we know:** `composeEmailEmbeddingContentWithAttachments()` queries attachments.
**What's unclear:** Does this break single responsibility?
**Recommendation:** Yes, inject PrismaService. The attachment metadata query is integral to composition.

### 2. Should creation methods move to a separate EmbeddingCreationService?

**What we know:** Creation orchestrates composer → crud → mistral → embeddingsService.
**What's unclear:** Would this create too many services?
**Recommendation:** Keep in facade for now. Extract only if facade exceeds 350 lines after other extractions.

### 3. Line count may exceed 250 for facade

**What we know:** Creation methods are 420 lines combined.
**What's unclear:** Is this acceptable?
**Recommendation:** Yes, similar to Phase 5 where some services exceeded target (702/625/794 lines) when cohesion warranted.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:** `knowledge-base.service.ts` (1,371 lines)
- **Phase 6 patterns:** `.planning/phases/06-base-sync-extraction/06-RESEARCH.md`
- **Prisma schema:** `schema.prisma` (Embedding model with indexes)
- **EmbeddingsService:** `embeddings.service.ts` (pgvector search implementation)

### Secondary (MEDIUM confidence)
- **HNSW migration:** `20250106_hnsw_vector_index/migration.sql`
- **GDPR migration:** `20260129_embedding_content_optional/migration.sql`
- **MAILAGENT_MASTER_PLAN.md:** EXPLAIN verification patterns

## Metadata

**Confidence breakdown:**
- Extraction boundaries: HIGH - Clear functional groups identified
- pgvector patterns: HIGH - Already implemented in EmbeddingsService
- Multi-tenant isolation: HIGH - Indexed fields verified in schema
- Test patterns: MEDIUM - No existing unit tests for knowledge-base.service.ts

**Research date:** 2026-02-02
**Valid until:** 2026-02-16 (14 days - internal refactoring, stable domain)
