# Roadmap: MailAgent Stability & Code Quality Refactor

## Overview

This roadmap transforms a working but fragile email sync system into a maintainable, testable codebase. The journey begins by extracting shared utilities and removing dead code (preventing circular dependencies during later splits), then fixes critical race conditions in folder operations (preventing data corruption), and systematically decomposes seven large service files (1,300-2,249 lines each) into focused modules under 500 lines. Each driver and service split follows the proven vertical slice pattern: extract by functional capability, maintain backward-compatible facades, and validate with real concurrency tests. The final phase proves stability under production-like stress scenarios.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Extract shared utilities, remove dead code, prevent circular dependencies
- [ ] **Phase 2: Race Condition Fixes** - Add distributed locks and monitoring to folder operations
- [ ] **Phase 3: IMAP Driver Split** - Prove vertical slice pattern on largest file (2,249 lines)
- [ ] **Phase 4: Service Splits** - Split folder-sync and emails.service by provider/responsibility
- [ ] **Phase 5: Google & Microsoft Drivers** - Replicate IMAP pattern to remaining drivers
- [ ] **Phase 6: Base Sync Extraction** - Extract sync orchestration components
- [ ] **Phase 7: AI/RAG Services** - Split knowledge-base into focused RAG services
- [ ] **Phase 8: Testing & Validation** - Comprehensive stress tests proving production stability

## Phase Details

### Phase 1: Foundation
**Goal**: Shared utilities extracted and dead code removed, enabling safe service splits without circular dependencies
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07
**Success Criteria** (what must be TRUE):
  1. Single `sanitize.utils.ts` exports LLM sanitization function used by all 3 previous call sites
  2. `PrismaRetryService` handles both P2002 (unique constraint) and P2034 (deadlock) errors with exponential backoff
  3. No deprecated Mistral MEDIUM model references exist in codebase (grep returns 0 matches)
  4. All DEPRECATED tool blocks removed from voltagent tools files (email, folder, calendar, document-library, contacts)
  5. Pre-commit hook rejects any file containing `DEPRECATED` without an associated removal date
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 01-01-PLAN.md - Consolidate sanitization utilities + verify PrismaRetryService
- [ ] 01-02-PLAN.md - Remove deprecated Mistral MEDIUM model references
- [ ] 01-03-PLAN.md - Remove deprecated tool blocks and exports
- [ ] 01-04-PLAN.md - Add deprecation prevention hook

### Phase 2: Race Condition Fixes
**Goal**: Folder operations are atomic and cannot corrupt data under concurrent load
**Depends on**: Phase 1 (needs PrismaRetryService with P2034 handling)
**Requirements**: RACE-01, RACE-02, RACE-03, RACE-04, TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Alert fires when folder sync lock held >4 minutes (RC-A1 monitoring)
  2. Concurrent folder CRUD operations (create, update, delete, rename) acquire distributed locks and never produce P2002 errors
  3. Stress test with 10 concurrent folder syncs completes without data corruption or duplicate folders
  4. VoltAgent conversation + context updates rollback together on partial failure (atomicity proven by test)
  5. LLM API calls timeout at 60 seconds with graceful partial response fallback
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 02-01: Add folder sync duration monitoring (RC-A1)
- [ ] 02-02: Add distributed locks to folder CRUD (RC-A8)
- [ ] 02-03: Wrap conversation state in transaction (atomicity)
- [ ] 02-04: Add LLM API timeout with fallback
- [ ] 02-05: Create race condition stress tests

### Phase 3: IMAP Driver Split
**Goal**: IMAP driver (2,249 lines) split into focused modules (<500 lines each) with backward-compatible facade
**Depends on**: Phase 2 (race conditions fixed before splitting exposes them)
**Requirements**: DRIV-01, DRIV-04 (facade pattern), TEST-05 (unit tests for new modules)
**Success Criteria** (what must be TRUE):
  1. `imap.driver.ts` is under 250 lines (thin facade delegating to sub-services)
  2. Each extracted service (connection-pool, folder, message, idle, send) is under 500 lines
  3. All existing IMAP sync tests pass without modification (facade preserves interface)
  4. New unit tests exist for each extracted service with >80% coverage
  5. Connection pool tested under concurrent load (10 simultaneous connections)
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 03-01: Analyze IMAP driver dependency graph
- [ ] 03-02: Extract imap-connection-pool.service.ts
- [ ] 03-03: Extract imap-folder.service.ts
- [ ] 03-04: Extract imap-message.service.ts
- [ ] 03-05: Extract imap-idle.service.ts and imap-send.service.ts
- [ ] 03-06: Create IMAP facade and migrate consumers

### Phase 4: Service Splits
**Goal**: folder-sync.service (1,629 lines) and emails.service (1,705 lines) split by provider/responsibility
**Depends on**: Phase 3 (pattern proven, race conditions fixed)
**Requirements**: SERV-01, SERV-03, SERV-05 (facade pattern), TEST-05 (unit tests)
**Success Criteria** (what must be TRUE):
  1. `folder-sync.service.ts` is under 200 lines (orchestrator delegating to provider-specific services)
  2. Each provider folder sync (IMAP, Gmail, Microsoft) is under 400 lines
  3. `emails.service.ts` split into CRUD, bulk, cleanup services each under 500 lines
  4. All existing folder and email tests pass without modification (facades preserve interfaces)
  5. New unit tests exist for each split service
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 04-01: Split folder-sync by provider
- [ ] 04-02: Create folder-db shared service
- [ ] 04-03: Split emails.service into CRUD/bulk/cleanup
- [ ] 04-04: Create service facades and migrate consumers

### Phase 5: Google & Microsoft Drivers
**Goal**: Remaining drivers split following proven IMAP pattern
**Depends on**: Phase 4 (folder-sync split complete, pattern refined)
**Requirements**: DRIV-02, DRIV-03, DRIV-04 (facade pattern), TEST-05 (unit tests)
**Success Criteria** (what must be TRUE):
  1. `google.driver.ts` (1,364 lines) split into folder, message, send, sync services (<500 lines each)
  2. `microsoft.driver.ts` (1,429 lines) split into folder, message, send, sync services (<500 lines each)
  3. Both driver facades under 250 lines each
  4. All existing Gmail and Microsoft sync tests pass without modification
  5. New unit tests exist for each extracted service
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 05-01: Split google.driver.ts into focused modules
- [ ] 05-02: Create Google driver facade
- [ ] 05-03: Split microsoft.driver.ts into focused modules
- [ ] 05-04: Create Microsoft driver facade

### Phase 6: Base Sync Extraction
**Goal**: base-email-sync.service (1,382 lines) split into sync orchestration components
**Depends on**: Phase 5 (all drivers split, sync patterns clear)
**Requirements**: SERV-02, SERV-05 (facade pattern), TEST-05 (unit tests)
**Success Criteria** (what must be TRUE):
  1. `base-email-sync.service.ts` is under 350 lines (abstract base with public API)
  2. Extracted services: sync-incremental (~400), sync-full (~300), sync-token (~200)
  3. Abstract class only depends on injected services (no circular dependencies)
  4. All existing sync tests pass without modification
  5. Token refresh logic tested in isolation
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 06-01: Analyze base-sync dependency graph
- [ ] 06-02: Extract sync-incremental and sync-full services
- [ ] 06-03: Extract sync-token service
- [ ] 06-04: Refactor abstract base and migrate consumers

### Phase 7: AI/RAG Services
**Goal**: knowledge-base.service (1,371 lines) split into focused RAG services
**Depends on**: Phase 6 (sync services stable, AI depends on email sync)
**Requirements**: SERV-04, SERV-05 (facade pattern), TEST-05 (unit tests)
**Success Criteria** (what must be TRUE):
  1. `knowledge-base.service.ts` is under 250 lines (facade delegating to sub-services)
  2. Extracted: embedding-composer (~300), embedding-crud (~250), embedding-search (~350), embedding-backfill (~200)
  3. Vector search queries verified to use pgvector index (EXPLAIN shows index scan)
  4. All existing RAG tests pass without modification
  5. Embedding CRUD operations tested with multi-tenant isolation verification
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 07-01: Analyze knowledge-base dependency graph
- [ ] 07-02: Extract embedding-composer and embedding-crud
- [ ] 07-03: Extract embedding-search and embedding-backfill
- [ ] 07-04: Create knowledge-base facade and migrate consumers

### Phase 8: Testing & Validation
**Goal**: Comprehensive stress tests prove refactored codebase is stable under production scenarios
**Depends on**: Phase 7 (all splits complete)
**Requirements**: TEST-04, TEST-06, TEST-07
**Success Criteria** (what must be TRUE):
  1. Multi-tenant concurrent sync test (10 tenants, simultaneous sync) passes with zero cross-tenant data leaks
  2. Folder rename during sync test passes without orphaned references
  3. P2034 deadlock recovery test creates actual deadlock and proves retry logic works
  4. Redis lock contention test (20 workers competing) completes without timeout
  5. Large batch operation test (1000+ emails) completes within performance baseline
  6. Token expiry mid-sync test proves OAuth refresh without data loss
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 08-01: Create multi-tenant isolation stress tests
- [ ] 08-02: Create concurrent operation stress tests
- [ ] 08-03: Create failure recovery tests (deadlock, token expiry)
- [ ] 08-04: Document test infrastructure and baseline metrics

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/4 | Planned | - |
| 2. Race Condition Fixes | 0/5 | Not started | - |
| 3. IMAP Driver Split | 0/6 | Not started | - |
| 4. Service Splits | 0/4 | Not started | - |
| 5. Google & Microsoft Drivers | 0/4 | Not started | - |
| 6. Base Sync Extraction | 0/4 | Not started | - |
| 7. AI/RAG Services | 0/4 | Not started | - |
| 8. Testing & Validation | 0/4 | Not started | - |

---
*Roadmap created: 2026-01-31*
*Depth: comprehensive (8 phases)*
*Requirements coverage: 26/26 mapped*
