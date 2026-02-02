---
phase: 06
plan: 01
subsystem: email-sync
tags: [extraction, message-processing, race-conditions, batch-indexing]
requires: [05-04]
provides: [SyncMessageProcessorService, MessageProcessorContext]
affects: [06-02, 06-03, 06-04]
tech-stack:
  added: []
  patterns: [callback-context-pattern, deferred-injection]
key-files:
  created:
    - backend/src/modules/email-sync/services/sync-message-processor.service.ts
    - backend/src/modules/email-sync/interfaces/sync-context.interface.ts
  modified: []
decisions:
  - id: "06-01-D1"
    title: "Service exceeds 500-line target"
    choice: "Accept 794 lines for cohesion"
    reason: "Message processing logic is tightly coupled; splitting would harm maintainability (precedent from Phase 4-5)"
  - id: "06-01-D2"
    title: "Callback pattern for abstract methods"
    choice: "MessageProcessorContext with callbacks"
    reason: "Avoids circular dependencies between extracted service and child classes"
  - id: "06-01-D3"
    title: "Deferred RedisLockService injection"
    choice: "setRedisLockService() setter method"
    reason: "Matches base class pattern; allows parent to propagate lock service"
metrics:
  duration: ~7min
  completed: 2026-02-02
---

# Phase 6 Plan 01: Message Processor Extraction Summary

Extracted message processing methods from base-email-sync.service.ts (1,382 lines) into SyncMessageProcessorService.

## One-Liner

Message upsert, batch processing, and deletion with all RC-* race condition fixes preserved via callback-context pattern.

## What Was Done

### Task 1: Create sync-context.interface.ts

Created context interface with callback types:
- `MessageProcessorContext`: tenantId, providerId, userId, callback functions
- `ProcessAttachmentsCallback`: Type for attachment processing delegation
- `DeletionResult`, `UpsertResult`, `BatchResult`: Return types

### Task 2: Create SyncMessageProcessorService

Extracted from base-email-sync.service.ts:
- `parseImapExternalId()` (lines 597-638)
- `handleDeletion()` (lines 652-708)
- `upsertMessage()` (lines 725-1013)
- `processBatch()` (lines 1027-1317)

**Race Condition Fixes Preserved (17 RC-* comments):**
| Fix | Description | Location |
|-----|-------------|----------|
| RC-1 | Distributed lock key `email:upsert:${providerId}:${msg.id}` | upsertMessage |
| RC-2 | 5-minute user modification window | upsertMessage |
| RC-6 | Conditional update with userModifiedAt check | upsertMessage |
| RC-9 | Mandatory lock requirement (throws if missing) | upsertMessage |

**P11 Batch Indexing Logic Preserved (8 P11 comments):**
- 100+ email threshold for batch API
- 50% cost savings via Mistral Batch API
- Fallback to real-time queue on batch failure

**Other Fixes Preserved:**
- BUG FIX B-5: userModifiedAt pre-query
- HIGH-1 FIX: Pre-query Set for wasNew detection
- FIX CRIT-3: Error logging for AI failures
- P2002/P2034 retry logic (3 attempts, exponential backoff)

## Technical Decisions

### 1. Service Exceeds 500-Line Target (794 lines)

The extracted service is 794 lines, exceeding the 400-500 target. This is acceptable because:
- Original code was 720+ lines across these methods
- Message processing logic is tightly coupled
- Splitting would create artificial boundaries
- Precedent: EmailCrudService (720 lines), GmailMessageService (702 lines)

### 2. Callback Context Pattern

Uses `MessageProcessorContext` with callbacks instead of direct service injection:
```typescript
interface MessageProcessorContext {
  getEmbeddingQueue: () => EmailEmbeddingQueueService;
  getBatchIndexingService: () => BatchIndexingService;
  processAttachments: ProcessAttachmentsCallback;
  followUpService: FollowUpService;
  writingStyleService: WritingStyleService;
}
```

This avoids circular dependencies where the extracted service would need to call abstract methods implemented by child classes.

### 3. Deferred RedisLockService Injection

Uses setter method pattern matching base class:
```typescript
setRedisLockService(redisLock: RedisLockService): void {
  this.redisLock = redisLock;
}
```

Parent class will call this after construction to propagate the lock service.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run type-check` | PASS |
| Line count | 794 lines |
| RC-* fix comments | 17 occurrences |
| P11 batch indexing | 8 occurrences |
| Context callback pattern | Implemented |

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `sync-message-processor.service.ts` | Created | 794 |
| `sync-context.interface.ts` | Created | 73 |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 4dd6c0a0 | feat(06-01): extract SyncMessageProcessorService from base-email-sync |

## Next Phase Readiness

**Ready for Plan 06-02 (Sync Orchestration Extraction):**
- SyncMessageProcessorService available for sync orchestration to delegate to
- Context pattern established for callback-based communication
- No blockers identified

**Integration Note:**
Plan 06-04 will wire SyncMessageProcessorService into BaseEmailSyncService and update child classes to use the callback context pattern.
