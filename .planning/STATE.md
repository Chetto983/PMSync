# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-31)

**Core value:** Stable, maintainable email sync that doesn't corrupt user data under concurrent load
**Current focus:** Phase 4 - Service Splits (In Progress)

## Current Position

Phase: 4 of 8 (Service Splits)
Plan: 1 of 4 complete (wave 1 parallel execution in progress)
Status: Executing Wave 1 (04-01, 04-02, 04-03 in parallel)
Last activity: 2026-02-01 - Completed 04-01-SUMMARY.md

Progress: [============        ] 60%

## Performance Metrics

**Velocity:**
- Total plans completed: 15 (14 prior + 04-01)
- Average duration: ~9 min/plan
- Total execution time: ~2h 30min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 4 | ~1 hour | ~15 min |
| 2. Race Condition Fixes | 4 | ~34 min | ~9 min |
| 3. IMAP Driver Split | 6 | ~27 min | ~5 min (verification+facade) |
| 4. Service Splits | 1 (in progress) | ~12 min | ~12 min |

**Recent Trend:**
- Last 5 plans: 03-04, 03-05, 03-06, 04-01, (04-02, 04-03 parallel)
- Trend: Parallel wave execution for independent plans

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

### Pending Todos

- ~15 legacy DEPRECATED markers without dates (identified in 01-04, separate cleanup task)

### Blockers/Concerns

**From Research:**
- Phase 2 must complete before Phase 4 (fix races before splitting exposes them) - DONE
- All phases require real Redis/PostgreSQL tests, not mocks
- Every service extraction requires dependency graph analysis before splitting
- Facade pattern required for backward compatibility (existing tests must pass) - VERIFIED

## Session Continuity

Last session: 2026-02-01
Stopped at: Completed 04-01-PLAN.md
Resume file: None - wave 1 parallel execution in progress

**Phase 4 Progress:**
- 04-01: FolderSyncQueryService - COMPLETE (eb08298)
- 04-02: ImapFolderSyncService - IN PROGRESS (parallel)
- 04-03: GmailFolderSyncService - IN PROGRESS (parallel)
- 04-04: FolderSyncService Facade - Depends on 04-01, 04-02, 04-03

**Next:** Complete 04-02, 04-03 (parallel), then 04-04 (facade)

---
*State initialized: 2026-01-31*
*Phase 1 completed: 2026-01-31*
*Phase 2 completed: 2026-01-31*
*Phase 3 completed: 2026-02-01*
*Phase 4 plan 01 completed: 2026-02-01*
