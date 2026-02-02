# 07-02 Summary: Extract EmbeddingSearchService + EmbeddingBackfillService

## Completion Status: COMPLETE

### Tasks Completed

1. **EmbeddingSearchService** (398 lines)
   - `search()` - Main search entry point with query/emailId options
   - `hydrateKnowledgeHits()` - GDPR-compliant hydration from Email table
   - `composeSearchTextFromEmail()` - Compose query from email content
   - MAX_SEARCH_LIMIT = 10 results cap
   - DEFAULT_SEARCH_LIMIT = 5 results
   - Score calculation: `1 - distance` (higher = more similar)

2. **EmbeddingBackfillService** (398 lines)
   - `backfillEmailEmbeddingsForTenant()` - Main backfill orchestration
   - `fetchEmailsWithoutEmbeddings()` - Raw SQL LEFT JOIN for efficiency
   - `countEmailsWithoutEmbeddings()` - Count pending emails
   - `cleanupOldEmbeddings()` - Retention-based cleanup
   - `getEmbeddingStats()` - Age distribution statistics
   - MAX_BATCH_SIZE = 10 (rate limiting protection)
   - BATCH_PAUSE_MS = 1000 (API throttling)
   - DEFAULT_RETENTION_DAYS = 90

### Key Design Decisions

1. **GDPR Compliance**: Search results hydrated from Email table, NOT from embedding metadata (outdated content risk)

2. **Raw SQL Efficiency**: Uses Prisma raw SQL with LEFT JOIN to find emails without embeddings - much faster than separate queries

3. **Rate Limiting**: 1 second pause between batches, max 10 per batch to avoid Mistral API throttling

4. **forwardRef**: EmbeddingBackfillService uses `forwardRef(() => EmailEmbeddingQueueService)` for circular dependency

### Verification

```
Type-check: PASSED
Line counts:
- embedding-search.service.ts: 398 lines
- embedding-backfill.service.ts: 398 lines
```

### Files Created/Modified

- `backend/src/modules/ai/services/embedding-search.service.ts` (NEW)
- `backend/src/modules/ai/services/embedding-backfill.service.ts` (NEW)
- `backend/src/modules/ai/ai.module.ts` (MODIFIED - registered services)
