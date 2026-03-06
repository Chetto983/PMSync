---
phase: 49-zero-circular-dependencies
plan: 02
subsystem: backend
tags: [circular-dependencies, madge, refactoring, embedding, locales, types]

# Dependency graph
requires:
  - phase: 45-forwardref-burndown
    provides: module-level forwardRef elimination that exposed remaining circular chains
provides:
  - Self-contained embedding-queue.interface.ts with inline types (zero imports from ai/services)
  - Locale types.ts file breaking barrel re-export triangle
  - 6 fewer madge circular dependency chains (Clusters C and D)
affects: [49-zero-circular-dependencies]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-interface-types, type-extraction-file]

key-files:
  created:
    - backend/src/modules/ai/locales/types.ts
  modified:
    - backend/src/common/interfaces/embedding-queue.interface.ts
    - backend/src/common/interfaces/index.ts
    - backend/src/modules/ai/services/email-embedding.queue.ts
    - backend/src/modules/ai/services/knowledge-base.service.ts
    - backend/src/modules/ai/locales/index.ts
    - backend/src/modules/ai/locales/en.ts
    - backend/src/modules/ai/locales/it.ts

key-decisions:
  - "Inline EmailEmbeddingJob and CreateEmailEmbeddingOptions in interface file rather than creating a separate types file"
  - "Re-export types from original service files for backward compatibility"
  - "Create locales/types.ts with zero imports as single source of truth for all VoltAgent translation interfaces"

patterns-established:
  - "Inline interface types: When an interface file imports types from services it provides interfaces for, define types inline to break the cycle"
  - "Type extraction file: When barrel re-exports create cycles with type imports, extract types to a dedicated zero-import file"

requirements-completed: [DEBT-08]

# Metrics
duration: 7min
completed: 2026-03-06
---

# Phase 49 Plan 02: Embedding Interface & Locale Type Extraction Summary

**Inline types in embedding-queue.interface.ts and extract locale types to types.ts, eliminating 6 madge circular dependency chains (Clusters C and D)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-06T09:34:29Z
- **Completed:** 2026-03-06T09:41:07Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Eliminated Cluster C cycles (#3-5) by inlining EmailEmbeddingJob and CreateEmailEmbeddingOptions in embedding-queue.interface.ts
- Eliminated Cluster D cycles (#6-7) by extracting all VoltAgent translation interfaces to locales/types.ts
- Preserved full backward compatibility via re-exports in original files
- madge --circular reports zero cycles for all modified files

## Task Commits

Each task was committed atomically:

1. **Task 1: Inline types in embedding-queue.interface.ts** - `b225a1c5` (refactor)
2. **Task 2: Extract locale types to break barrel re-export cycle** - `f7ed6667` (refactor)

## Files Created/Modified
- `backend/src/common/interfaces/embedding-queue.interface.ts` - Inline EmailEmbeddingJob and CreateEmailEmbeddingOptions, remove imports from ai/services
- `backend/src/common/interfaces/index.ts` - Re-export new inline types from barrel
- `backend/src/modules/ai/services/email-embedding.queue.ts` - Remove local interface, re-export from interface file
- `backend/src/modules/ai/services/knowledge-base.service.ts` - Remove local interface, re-export from interface file
- `backend/src/modules/ai/locales/types.ts` - NEW: All VoltAgent translation interfaces (zero imports)
- `backend/src/modules/ai/locales/index.ts` - Remove all type definitions, re-export from types.ts
- `backend/src/modules/ai/locales/en.ts` - Import VoltAgentTranslations from types.ts instead of index.ts
- `backend/src/modules/ai/locales/it.ts` - Import VoltAgentTranslations from types.ts instead of index.ts

## Decisions Made
- Inline types in interface file rather than creating a separate types file for embedding cluster (simpler, keeps interface self-contained)
- Re-export types from original service files so no downstream consumer changes needed
- Create locales/types.ts with zero imports as the canonical source of all translation type definitions
- action-summaries.ts unchanged (already defines its own SupportedLocale, no cycle)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-commit hook race condition on Task 1 commit (git lock conflict) - commit succeeded despite error output

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 6 of 14 madge cycles eliminated
- Plans 01 and 03 handle the remaining 8 cycles
- All backward compatibility preserved

## Self-Check: PASSED

All 8 files verified present. Both commit hashes (b225a1c5, f7ed6667) found in git log.

---
*Phase: 49-zero-circular-dependencies*
*Completed: 2026-03-06*
