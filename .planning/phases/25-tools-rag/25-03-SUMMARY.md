---
phase: 25-tools-rag
plan: 03
subsystem: ai
tags: [tsvector, pgvector, hybrid-search, rrf, fts, gin-index, prisma-raw-sql]

# Dependency graph
requires:
  - phase: 25-tools-rag
    plan: 01
    provides: RagToolsService with semantic_search tool using EmbeddingsService
  - phase: 25-tools-rag
    plan: 02
    provides: IntentRouterService, MemoryService, AiChatModule with tool providers
provides:
  - tsvector GENERATED STORED columns + GIN indexes on emails, unified_contacts, calendar_events
  - hybrid_email_search and hybrid_contact_search SQL functions with RRF fusion
  - HybridSearchService combining vector + FTS for emails/contacts, FTS-only for calendar
  - Upgraded semantic_search tool using HybridSearchService instead of raw EmbeddingsService
affects: [25-04, 26, 27]

# Tech tracking
tech-stack:
  added: []
  patterns: [RRF hybrid search (vector + tsvector FTS), SQL function via Prisma.$queryRaw, graceful fallback on missing migrations]

key-files:
  created:
    - backend/prisma/migrations/20260302_add_tsvector_fts/migration.sql
    - backend/prisma/migrations/20260302_add_hybrid_search_functions/migration.sql
    - backend/src/modules/ai-chat/services/hybrid-search.service.ts
    - backend/src/modules/ai-chat/__tests__/hybrid-search.test.ts
  modified:
    - backend/src/modules/ai-chat/tools/rag-tools.service.ts
    - backend/src/modules/ai-chat/ai-chat.module.ts

key-decisions:
  - "Contact table is unified_contacts (not contacts) per Prisma @@map directive"
  - "CalendarEvent uses startTime/endTime (not startDate/endDate) per actual schema"
  - "Calendar search FTS-only (no embeddings) per research recommendation for short structured data"
  - "HybridSearchService falls back gracefully to empty results when SQL functions not applied"
  - "Removed dead enrichResults method from RagToolsService after HybridSearchService took over"

patterns-established:
  - "Hybrid search pattern: SQL function with RRF fusion called via Prisma.$queryRaw"
  - "FTS-only pattern for structured short-text tables (calendar) without embedding overhead"
  - "Graceful degradation: try hybrid SQL, catch -> return empty, log warning"

requirements-completed: [RAG-01, RAG-02]

# Metrics
duration: 5min
completed: 2026-03-02
---

# Phase 25 Plan 03: Hybrid Search & RAG Summary

**PostgreSQL tsvector FTS + RRF hybrid search (vector + keyword) via SQL functions, with HybridSearchService wired into semantic_search tool**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-02T12:53:38Z
- **Completed:** 2026-03-02T12:58:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created tsvector GENERATED STORED columns with GIN indexes on emails, unified_contacts, and calendar_events
- Created hybrid_email_search and hybrid_contact_search SQL functions implementing RRF fusion (K=50)
- Built HybridSearchService (272 lines) with email/contact hybrid search and calendar FTS-only search
- Upgraded semantic_search tool to delegate to HybridSearchService, removing the old enrichResults pipeline
- Existing embedding pipeline (BullMQ, KnowledgeBase, pgvector) completely untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tsvector migrations and hybrid search SQL functions** - `99c4b88d` (feat)
2. **Task 2: Create HybridSearchService and upgrade semantic_search tool** - `1915a2cc` (feat)

## Files Created/Modified
- `backend/prisma/migrations/20260302_add_tsvector_fts/migration.sql` - tsvector columns + GIN indexes (52 lines)
- `backend/prisma/migrations/20260302_add_hybrid_search_functions/migration.sql` - hybrid_email_search + hybrid_contact_search SQL functions (109 lines)
- `backend/src/modules/ai-chat/services/hybrid-search.service.ts` - HybridSearchService with RRF search (272 lines)
- `backend/src/modules/ai-chat/__tests__/hybrid-search.test.ts` - Integration tests for hybrid search (186 lines)
- `backend/src/modules/ai-chat/tools/rag-tools.service.ts` - semantic_search now uses HybridSearchService (164 lines, down from 266)
- `backend/src/modules/ai-chat/ai-chat.module.ts` - HybridSearchService provider added

## Decisions Made
- Contact table is `unified_contacts` not `contacts` -- the plan's SQL referenced the wrong table name. Fixed per actual Prisma `@@map("unified_contacts")` directive.
- CalendarEvent uses `startTime`/`endTime` not `startDate`/`endDate` -- the plan's SQL function used wrong column names. Fixed per actual schema.
- Calendar search is FTS-only (no embeddings) per research recommendation: short structured data doesn't benefit from vector search.
- HybridSearchService falls back gracefully: when SQL functions are missing (migration not applied), it returns empty results and logs a warning instead of crashing.
- Removed dead `enrichResults` method from RagToolsService since HybridSearchService handles all result mapping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed contact table name in SQL migration**
- **Found during:** Task 1 (SQL function creation)
- **Issue:** Plan specified `contacts` table but actual Prisma mapping is `unified_contacts` (@@map("unified_contacts"))
- **Fix:** Changed all references from `contacts` to `unified_contacts` in both migration files
- **Files modified:** `backend/prisma/migrations/20260302_add_tsvector_fts/migration.sql`, `backend/prisma/migrations/20260302_add_hybrid_search_functions/migration.sql`
- **Verification:** Verified against Prisma schema @@map directives
- **Committed in:** 99c4b88d (Task 1 commit)

**2. [Rule 1 - Bug] Fixed CalendarEvent column names in plan SQL**
- **Found during:** Task 1 (SQL function template) and Task 2 (HybridSearchService)
- **Issue:** Plan's SQL used `startDate`/`endDate` but actual schema has `startTime`/`endTime`
- **Fix:** Used correct column names `startTime`/`endTime` in calendar FTS query and result types
- **Files modified:** `backend/src/modules/ai-chat/services/hybrid-search.service.ts`
- **Verification:** TypeScript compiles clean, column names match schema
- **Committed in:** 1915a2cc (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs -- wrong table/column names in plan SQL)
**Impact on plan:** Both fixes necessary for correctness. Plan's SQL templates had wrong identifiers that would cause runtime errors. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
Migrations must be applied manually to the database:
```bash
psql -f backend/prisma/migrations/20260302_add_tsvector_fts/migration.sql
psql -f backend/prisma/migrations/20260302_add_hybrid_search_functions/migration.sql
```

## Next Phase Readiness
- Hybrid search infrastructure is complete. Ready for Plan 04.
- HybridSearchService will gracefully degrade if migrations are not yet applied.
- Calendar FTS-only search is independent of the embedding pipeline.

## Self-Check: PASSED

All 6 key files verified present. Both task commits (99c4b88d, 1915a2cc) verified in git log.

---
*Phase: 25-tools-rag*
*Completed: 2026-03-02*
