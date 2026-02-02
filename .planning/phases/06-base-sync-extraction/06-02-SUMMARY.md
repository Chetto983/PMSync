---
phase: 06-base-sync-extraction
plan: 02
subsystem: email-sync
tags: [sync-orchestration, token-management, oauth, full-sync, incremental-sync]

dependency_graph:
  requires:
    - 06-01 (SyncMessageProcessorService)
  provides:
    - SyncTokenService (token lifecycle management)
    - SyncOrchestrationService (full/incremental sync orchestration)
  affects:
    - 06-03 (hook and lifecycle extraction)
    - 06-04 (base class refactor to facade)

tech_stack:
  added: []
  patterns:
    - Callback pattern for driver credentials/creation
    - Composition over inheritance
    - Service extraction for testability

file_tracking:
  key_files:
    created:
      - backend/src/modules/email-sync/services/sync-token.service.ts
      - backend/src/modules/email-sync/services/sync-orchestration.service.ts
    modified: []

decisions:
  - id: "06-02-01"
    decision: "SyncTokenService uses callback pattern for getDriverCredentials and createDriver"
    rationale: "Avoids circular dependency with provider-specific services"
  - id: "06-02-02"
    decision: "SyncOrchestrationService slightly exceeds 300-line target (327 lines)"
    rationale: "All fix comments and logic preserved; cohesion over arbitrary limits"
  - id: "06-02-03"
    decision: "IncrementalHookResult allows provider-specific skip logic"
    rationale: "Microsoft needs to detect expired delta tokens and force full sync"

metrics:
  duration: "~6 min"
  completed: "2026-02-02"
---

# Phase 6 Plan 2: Sync Orchestration Extraction Summary

**One-liner:** Token lifecycle service (119 lines) + sync orchestration service (327 lines) with all CRIT-3/FOLDER-FIX/DEDUP-FIX comments preserved.

## What Was Built

### SyncTokenService (119 lines)
Token lifecycle management extracted from base-email-sync.service.ts:

| Method | Lines | Source | Responsibility |
|--------|-------|--------|----------------|
| `isTokenExpiringSoon()` | ~10 | 247-254 | Check if token expires within 2-minute threshold |
| `refreshDriverIfNeeded()` | ~45 | 260-298 | Graceful driver swap (disconnect old, create new) |

**Key behaviors preserved:**
- CRIT-3 FIX: 2-minute threshold (TOKEN_REFRESH_THRESHOLD_MS = 120000ms)
- Callback pattern for getDriverCredentials and createDriver
- Error handling: throws on refresh failure (FIX Phase 1.3)

### SyncOrchestrationService (327 lines)
Full and incremental sync orchestration:

| Method | Lines | Source | Responsibility |
|--------|-------|--------|----------------|
| `executeFullSync()` | ~120 | 331-446 | Multi-folder sync with deduplication |
| `executeIncrementalSync()` | ~90 | 453-552 | Delta sync with token refresh |

**Key behaviors preserved:**
- FOLDER-FIX: Syncs all 5 folders (INBOX, SENT, DRAFTS, TRASH, ARCHIVE)
- DEDUP-FIX: Cross-folder deduplication via processedExternalIds Set
- CRIT-3 FIX: Mid-sync token refresh (every batch in full sync, every 50 changes in incremental)
- Provider-specific hook for incremental changes (MS delta token expiration)

## Commits

| Commit | Type | Files | Description |
|--------|------|-------|-------------|
| b9c2c6aa | feat | sync-token.service.ts | Extract SyncTokenService (119 lines) |
| a94f8e8e | feat | sync-orchestration.service.ts | Extract SyncOrchestrationService (327 lines) |

## Verification Results

| Check | Result |
|-------|--------|
| `npm run type-check` | PASSED |
| SyncTokenService line count | 119 (target: 80-120) |
| SyncOrchestrationService line count | 327 (target: 200-300, +9%) |
| CRIT-3 comments in token service | 7 (target: 4+) |
| Fix comments in orchestration | 17 (target: 5+) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 06-01 dependency not declared**
- **Found during:** Initial plan parse
- **Issue:** 06-02 imports SyncMessageProcessorService from 06-01 but `depends_on: []` was empty
- **Verification:** Confirmed 06-01 was already completed (commit 4dd6c0a0)
- **Resolution:** No action needed - dependency already satisfied

### Plan Adjustments

**SyncOrchestrationService exceeds line target:**
- Target: 200-300 lines
- Actual: 327 lines (+9%)
- Reason: Full preservation of all fix comments and logging
- Decision: Acceptable variance; cohesion over arbitrary limits

## Integration Status

Services are extracted but NOT yet wired to base class. Integration deferred to 06-04.

**Current state:**
```
base-email-sync.service.ts (1382 lines, unchanged)
  |-- syncFullWithDriver() [DUPLICATE - will delegate to SyncOrchestrationService]
  |-- syncIncrementalWithDriver() [DUPLICATE - will delegate to SyncOrchestrationService]
  |-- isTokenExpiringSoon() [DUPLICATE - will delegate to SyncTokenService]
  |-- refreshDriverIfNeeded() [DUPLICATE - will delegate to SyncTokenService]

sync-orchestration.service.ts (327 lines, NEW)
  |-- executeFullSync()
  |-- executeIncrementalSync()
  |-- [uses] SyncMessageProcessorService
  |-- [uses] SyncTokenService

sync-token.service.ts (119 lines, NEW)
  |-- isTokenExpiringSoon()
  |-- refreshDriverIfNeeded()
```

## Next Phase Readiness

**Prerequisites for 06-03 (Hook Extraction):**
- [x] SyncMessageProcessorService exists (06-01)
- [x] SyncTokenService exists (06-02)
- [x] SyncOrchestrationService exists (06-02)
- [ ] Base class still has duplicate methods (expected - cleaned in 06-04)

**No blockers identified.**
