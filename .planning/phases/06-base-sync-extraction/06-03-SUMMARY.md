---
phase: 06-base-sync-extraction
plan: 03
subsystem: email-sync
tags: [facade-refactor, delegation-pattern, base-class, sync-services]

dependency_graph:
  requires:
    - 06-01 (SyncMessageProcessorService)
    - 06-02 (SyncOrchestrationService, SyncTokenService)
  provides:
    - BaseEmailSyncService facade (thin orchestrator)
    - Updated child class constructors
  affects:
    - 06-04 (final integration and tests)

tech_stack:
  added: []
  patterns:
    - Facade pattern (base class delegates to specialized services)
    - Constructor injection for extracted services
    - Context callback pattern for abstract method delegation

file_tracking:
  key_files:
    created: []
    modified:
      - backend/src/modules/email-sync/services/base-email-sync.service.ts
      - backend/src/modules/email-sync/email-sync.module.ts
      - backend/src/modules/email-sync/services/gmail/google-sync.service.ts
      - backend/src/modules/email-sync/services/microsoft/microsoft-sync.service.ts
      - backend/src/modules/email-sync/services/imap/imap-sync.service.ts

decisions:
  - id: "06-03-01"
    decision: "BaseEmailSyncService remains at 511 lines instead of target 350"
    rationale: "syncProvider() is 140+ lines and must stay in base class; delegation wrappers add necessary context building"
  - id: "06-03-02"
    decision: "Services registered in both providers and exports arrays"
    rationale: "Exports needed for potential use by other modules in future"
  - id: "06-03-03"
    decision: "Child classes receive 3 new constructor parameters"
    rationale: "DI pattern - services injected by NestJS, passed to base class"

metrics:
  duration: "~8 min"
  completed: "2026-02-02"
---

# Phase 6 Plan 3: Facade Refactor Summary

**One-liner:** BaseEmailSyncService refactored from 1,382 to 511 lines (63% reduction) delegating to extracted services with all 290 tests passing.

## What Was Built

### BaseEmailSyncService Facade

Transformed the monolithic 1,382-line abstract class into a thin orchestrator:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Line count | 1,382 | 511 | -63% |
| Sync methods | Full implementations | Delegation wrappers | Simplified |
| Message methods | Full implementations | Delegation wrappers | Simplified |
| Token methods | Full implementations | Delegation wrappers | Simplified |

**Constructor signature expanded from 5 to 8 parameters:**
```typescript
constructor(
  prisma: PrismaService,
  realtimeEvents: RealtimeEventsService,
  config: ConfigService,
  followUpService: FollowUpService,
  writingStyleService: WritingStyleService,
  // Phase 6: Extracted services
  syncOrchestration: SyncOrchestrationService,
  messageProcessor: SyncMessageProcessorService,
  tokenService: SyncTokenService,
)
```

### Delegation Methods Added

| Method | Delegates To | Purpose |
|--------|--------------|---------|
| `syncFullWithDriver()` | `syncOrchestration.executeFullSync()` | Full sync orchestration |
| `syncIncrementalWithDriver()` | `syncOrchestration.executeIncrementalSync()` | Incremental sync |
| `upsertMessageFromDriver()` | `messageProcessor.upsertMessage()` | Single message upsert |
| `processMessagesBatch()` | `messageProcessor.processBatch()` | Batch processing |
| `handleMessageDeletion()` | `messageProcessor.handleDeletion()` | Delete handling |
| `isTokenExpiringSoon()` | `tokenService.isTokenExpiringSoon()` | Token check |
| `refreshDriverIfNeeded()` | `tokenService.refreshDriverIfNeeded()` | Token refresh |

### Child Class Updates

All three sync services updated with new constructor parameters:

| Service | Lines Changed | Pattern |
|---------|--------------|---------|
| GoogleSyncService | +15 | Added 3 service params, expanded super() call |
| MicrosoftSyncService | +15 | Added 3 service params, expanded super() call |
| ImapSyncService | +15 | Added 3 service params, expanded super() call |

### Module Registration

`email-sync.module.ts` updated with:
- 3 new imports for extracted services
- Services added to providers array (before sync services for DI ordering)
- Services added to exports array

## Technical Decisions

### 1. Base Class Exceeds 350-Line Target (511 lines)

Target was 350 lines, actual is 511. This is acceptable because:

- `syncProvider()` method alone is ~140 lines (main entry point, must stay)
- Helper method `buildMessageProcessorContext()` needed for context creation
- Delegation wrappers add type-safe context building
- Still achieved 63% reduction (1,382 -> 511)

### 2. Services in Both Providers and Exports

Registered extracted services in both arrays for flexibility:
```typescript
providers: [
  SyncTokenService,
  SyncMessageProcessorService,
  SyncOrchestrationService,
  // ...
],
exports: [
  // ...
  SyncMessageProcessorService,
  SyncOrchestrationService,
  SyncTokenService,
]
```

### 3. Context Building Pattern

Added `buildMessageProcessorContext()` helper to construct context with callbacks:
```typescript
private buildMessageProcessorContext(
  tenantId: string,
  providerId: string,
  userId?: string,
): MessageProcessorContext {
  return {
    tenantId,
    providerId,
    userId,
    getEmbeddingQueue: () => this.getEmbeddingQueue(),
    getBatchIndexingService: () => this.getBatchIndexingService(),
    processAttachments: (...) => this.processAttachmentsForMessage(...),
    followUpService: this.followUpService,
    writingStyleService: this.writingStyleService,
  };
}
```

## Commits

| Commit | Type | Files | Description |
|--------|------|-------|-------------|
| d63c94bc | feat | 5 files | Refactor BaseEmailSyncService to facade, update child classes |

## Verification Results

| Check | Result |
|-------|--------|
| `npm run type-check` | PASSED |
| Line count | 511 lines (target: 350, acceptable variance) |
| Email-sync tests | 290 passed |
| Key link patterns | All 3 verified |
| Child class constructors | All 3 updated |
| Module registration | Providers + exports |

## Deviations from Plan

### Plan Adjustments

**BaseEmailSyncService exceeds line target:**
- Target: 350 lines
- Actual: 511 lines (+46%)
- Reason: syncProvider() must stay, delegation wrappers need context building
- Decision: Acceptable - still achieved 63% overall reduction

## Next Phase Readiness

**Prerequisites for 06-04 (Final Integration):**
- [x] SyncMessageProcessorService created (06-01)
- [x] SyncOrchestrationService created (06-02)
- [x] SyncTokenService created (06-02)
- [x] BaseEmailSyncService refactored to facade (06-03)
- [x] All child classes updated (06-03)
- [x] Module registration complete (06-03)
- [x] All 290 email-sync tests pass

**No blockers identified.**
