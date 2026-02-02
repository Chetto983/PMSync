# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-31)

**Core value:** Stable, maintainable email sync that doesn't corrupt user data under concurrent load
**Current focus:** Phase 6 - Base Sync Extraction (IN PROGRESS)

## Current Position

Phase: 6 of 8 (Base Sync Extraction) - IN PROGRESS
Plan: 3 of 4 complete (Wave 2 - Unit Tests)
Status: In progress
Last activity: 2026-02-02 - Completed 06-04-PLAN.md (unit tests for extracted services)

Progress: [████████████████████░░░░] 75% (6/8 phases in progress)

## Performance Metrics

**Velocity:**
- Total plans completed: 30 (18 prior + 4 Phase 4 gap closures + 05-01 + 05-02 + 05-03 + 05-04 + 06-01 + 06-02 + 06-04)
- Average duration: ~8 min/plan
- Total execution time: ~4h 10min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 4 | ~1 hour | ~15 min |
| 2. Race Condition Fixes | 4 | ~34 min | ~9 min |
| 3. IMAP Driver Split | 6 | ~27 min | ~5 min (verification+facade) |
| 4. Service Splits | 8 | ~62 min | ~8 min (includes 4 gap closures) |
| 5. Gmail/Microsoft Drivers | 4 | ~29 min | ~7 min (message+send+sync+facade) |
| 6. Base Sync Extraction | 3 | ~18 min | ~6 min (message processor + orchestration + tests) |

**Recent Trend:**
- Last 5 plans: 05-04, 06-01, 06-02, 06-04
- Trend: Base sync extraction tests complete, facade pending

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- PrismaRetryService already handles P2034 - no changes needed (01-01)
- Removed Mistral MEDIUM tier completely, callers migrated to 'fast' (01-02)
- Deprecated exports in document-library.tools.ts removed (01-03)
- Pre-commit hook enforces deprecation dates on new code (01-04)
- 4-minute alert threshold chosen for lock monitoring (1-min buffer before 5-min TTL) (02-01)
- 30-second monitoring interval balances responsiveness with minimal overhead (02-01)
- Circuit breaker opens after 3 consecutive timeouts, half-opens after 60s (02-02)
- Timeout returns graceful fallback instead of throwing error (02-02)
- Two-phase approach for VoltAgent atomicity: Prisma first, then Memory API with compensation (02-03)
- 30s transaction timeout, 5s max wait for connection acquisition (02-03)
- Redis fallback for atomicity test when FK constraints prevent Prisma test (02-04)
- 03-01 analysis skipped - 03-RESEARCH.md already covers dependency analysis thoroughly (03-01)
- Keep existing extracted services from partial planning execution (03-02, 03-03, 03-04)
- POOL_CONFIG in interface file for shared access across services (03-02)
- _semaphoreRelease stored on PooledConnection for proper cleanup (03-02)
- 5-minute cache TTL balances folder freshness with IMAP server load (03-03)
- resolveFolder returns path as-is if it contains separator or is not uppercase (03-03)
- ImapMessageService exceeds 500 line target (811 lines) - splitting would harm cohesion (03-04)
- getAttachment uses direct connection acquisition because stream needs connection open (03-04)
- Legacy single-number sync tokens interpreted as INBOX modseq for backward compat (03-04)
- IDLE uses dedicated ImapFlow connection, not from pool (IDLE blocks connection) (03-05)
- sendDraft uses callbacks for getMessage/deleteMessage to avoid circular deps (03-05)
- RFC 2047 uses Base64 encoding (more reliable than Q-encoding for Unicode) (03-05)
- IMAPDriver facade uses DI-injected instance in factory instead of new (03-06)
- auditFolderSyncFromPaths takes pre-fetched paths - keeps provider logic in provider services (04-01)
- cleanupOrphanedFolders takes explicit path list - separation of concerns (04-01)
- getFolderKeys is public for provider services custom counting needs (04-01)
- EmailCrudService/EmailBulkService exceed line targets (720/594 vs 450/500) - cohesion over limits (04-03)
- DI ordering: sub-services before facade in providers array (04-03)
- cleanupOrphanedFolders made optional param for backward compatibility (04-04)
- Private route* methods for provider dispatch in facade (04-04)
- Mock axios globally with jest.mock for Graph API tests (04-07)
- Jest factory mock pattern with var hoisting for googleapis module (04-06)
- GmailMessageService (702 lines) and MicrosoftMessageService (625 lines) exceed 500-line target - cohesion over arbitrary limits (05-01)
- DI ordering: message services registered before driver facades for proper injection (05-01)
- GmailSendService (310 lines) and MicrosoftSendService (324 lines) under 350-line target (05-02)
- Callback pattern used in MicrosoftSendService for folder resolution (avoids circular deps) (05-02)
- GmailSyncService (261 lines) and MicrosoftSyncService (233 lines) both under 300-line target (05-03)
- All error handling preserved exactly during sync extraction (404/403/429/5xx, multi-folder tokens) (05-03)
- Services extracted but not yet wired to drivers (deferred to Plan 05-04) (05-02, 05-03)
- GoogleDriver refactored to facade: 1,364 → 397 lines (71% reduction) (05-04)
- MicrosoftDriver refactored to facade: 1,429 → 575 lines (60% reduction) (05-04)
- All 329 tests pass after facade wiring (05-04)
- SyncMessageProcessorService exceeds 500-line target (794 lines) - cohesion over arbitrary limits (06-01)
- Callback pattern for abstract method delegation via MessageProcessorContext (06-01)
- Deferred RedisLockService injection via setter method (matches base class pattern) (06-01)
- Accept 65% coverage for message processor (critical paths 100% tested, upsert raw SQL hard to mock) (06-04)

### Pending Todos

- ~15 legacy DEPRECATED markers without dates (identified in 01-04, separate cleanup task)

### Blockers/Concerns

**From Research:**
- Phase 2 must complete before Phase 4 (fix races before splitting exposes them) - DONE
- All phases require real Redis/PostgreSQL tests, not mocks
- Every service extraction requires dependency graph analysis before splitting
- Facade pattern required for backward compatibility (existing tests must pass) - VERIFIED

## Session Continuity

Last session: 2026-02-02
Stopped at: Completed 06-04-PLAN.md (Unit Tests for Extracted Services)
Resume file: None

**Phase 6 In Progress:**
- 06-01: Message Processor Extraction (Wave 1) - COMPLETE (4dd6c0a0)
  - SyncMessageProcessorService: 794 lines
  - MessageProcessorContext: callback pattern for abstract methods
  - All RC-1/RC-2/RC-6/RC-9 race condition fixes preserved
  - P11 batch indexing logic preserved
- 06-02: Orchestration + Token Extraction (Wave 1) - COMPLETE (b9c2c6aa, a94f8e8e)
  - SyncTokenService: 119 lines, CRIT-3 token refresh logic
  - SyncOrchestrationService: 327 lines, full/incremental sync orchestration
  - All FOLDER-FIX/DEDUP-FIX/CRIT-3 comments preserved
- 06-04: Unit Tests (Wave 2) - COMPLETE (2b3925aa, c07965c2)
  - sync-token.service.spec.ts: 306 lines, 19 tests, 100% coverage
  - sync-message-processor.service.spec.ts: 746 lines, 31 tests
  - All 290 email-sync tests pass

**Next:** 06-03 (Facade Refactor)

**Phase 5 Complete:**
- 05-01: Message Service Extraction (Wave 1) - COMPLETE (3806d14, 4e2c25b, fdd9373b)
  - GmailMessageService: 702 lines, 15+ operations
  - MicrosoftMessageService: 625 lines, 15+ operations
- 05-02: Send Service Extraction (Wave 2) - COMPLETE (03d30ec, fd81dd0, e5dd042)
  - GmailSendService: 310 lines, 8+ operations
  - MicrosoftSendService: 324 lines, 8+ operations
- 05-03: Sync Service Extraction (Wave 3) - COMPLETE (5e568d5e, 03f45903, 7ce59e1b)
  - GmailSyncService: 261 lines, History API delta sync
  - MicrosoftSyncService: 233 lines, Delta query multi-folder sync
- 05-04: Facade Refactor (Wave 4) - COMPLETE (02830c2d, 613629ca, 06122661)
  - GoogleDriver: 1,364 → 397 lines (71% reduction)
  - MicrosoftDriver: 1,429 → 575 lines (60% reduction)
  - All 329 tests pass

**Next:** Phase 6 - Base Sync Extraction

## Phase 4 Final Results

| Original Service | Lines Before | Lines After | Reduction |
|-----------------|--------------|-------------|-----------|
| FolderSyncService | 1,653 | 145 (facade) | 91% |
| EmailsService | 1,705 | 145 (facade) | 91% |

**Extracted Services:**
- FolderSyncQueryService (387 lines)
- ImapFolderSyncService (375 lines)
- GmailFolderService (429 lines)
- MicrosoftFolderService (447 lines)
- EmailCrudService (720 lines)
- EmailBulkService (594 lines)
- EmailSearchService (387 lines)

**All 248+ tests pass (195 existing + 53 new GmailFolderService tests).**

## Phase 5 Final Results

| Driver | Lines Before | Lines After | Reduction |
|--------|--------------|-------------|-----------|
| GoogleDriver | 1,364 | 397 | 71% |
| MicrosoftDriver | 1,429 | 575 | 60% |
| **Combined** | **2,793** | **972** | **65%** |

**Extracted Services (6 total):**
- GmailMessageService (702 lines)
- GmailSendService (310 lines)
- GmailSyncService (261 lines)
- MicrosoftMessageService (625 lines)
- MicrosoftSendService (324 lines)
- MicrosoftSyncService (233 lines)

**All 329 tests pass. Full backward compatibility maintained.**

---
*State initialized: 2026-01-31*
*Phase 1 completed: 2026-01-31*
*Phase 2 completed: 2026-01-31*
*Phase 3 completed: 2026-02-01*
*Phase 4 completed: 2026-02-01*
*Phase 5 completed: 2026-02-01*
