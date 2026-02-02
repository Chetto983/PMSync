---
phase: 01-performance-foundation
plan: 03
subsystem: tech-debt
tags: [atomicity, prisma-retry, deprecation, debt-cleanup]
dependency-graph:
  requires: []
  provides: [PrismaRetryService-integration, deprecation-timeline]
  affects: [02-frontend-email]
tech-stack:
  added: []
  patterns: [service-injection, centralized-retry]
key-files:
  created: []
  modified:
    - backend/src/modules/ai/voltagent/services/ai-memory.service.ts
    - backend/src/modules/ai/voltagent/services/conversation-management.service.ts
    - backend/src/modules/email-sync/services/folder-sync-query.service.ts
    - backend/src/modules/email-sync/email-sync.module.ts
    - backend/src/modules/subscription/services/usage-tracking.service.ts
decisions:
  - id: DEBT-01-no-atomicity
    choice: Document why atomicity is NOT applicable
    reason: Services don't mix Prisma + VoltAgent Memory API
  - id: DEBT-02-prisma-retry
    choice: Use PrismaRetryService.withRetry()
    reason: Centralized P2002/P2034 handling, consistent backoff
  - id: DEBT-03-removal-date
    choice: "Remove by 2026-06-30"
    reason: Satisfies pre-commit hook, clear Q2 2026 timeline
metrics:
  duration: 15min
  completed: 2026-02-02
---

# Phase 01 Plan 03: Tech Debt Cleanup Summary

**One-liner:** ConversationAtomicityService documented as not applicable, PrismaRetryService wired to folder sync, DEPRECATED marker annotated with 2026-06-30 removal date.

## What Was Built

### Task 1: ConversationAtomicityService Analysis (DEBT-01)

**Finding:** Atomicity wrapper is NOT applicable to the identified services.

| Service | Data Store | Atomicity Needed? |
|---------|-----------|-------------------|
| ai-memory.service.ts | Prisma only (AIMemory table) | No - Prisma ACID guarantees |
| conversation-management.service.ts | VoltAgent Memory API only | No - No Prisma writes |

**Why:** ConversationAtomicityService is a saga pattern for hybrid scenarios where:
1. Prisma writes must succeed
2. Then VoltAgent Memory API call
3. Compensate Prisma if Memory fails

Neither service has this hybrid requirement. Documentation added to both files explaining when atomicity IS needed.

### Task 2: PrismaRetryService Integration (DEBT-02)

**Replaced:** ~50 lines of inline P2002/P2034 retry logic in `folder-sync-query.service.ts`

**Before:**
```typescript
let retryCount = 0;
while (true) {
  try {
    const folder = await this.prisma.folder.upsert({...});
  } catch (error) {
    if ((errorCode === 'P2002' || errorCode === 'P2034') && retryCount < MAX_UPSERT_RETRIES) {
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, 50 * retryCount));
      continue;
    }
    throw error;
  }
}
```

**After:**
```typescript
const folder = await this.prismaRetry.withRetry(
  () => this.prisma.folder.upsert({...}),
  { loggerName: 'FolderSync' }
);
```

**Benefits:**
- Consistent retry behavior across codebase
- Centralized exponential backoff algorithm
- Better logging with configurable logger name
- Easier to modify retry strategy globally

### Task 3: DEPRECATED Marker Annotation (DEBT-03)

**Updated:** `checkQuota()` in `usage-tracking.service.ts`

```typescript
/**
 * @deprecated Use CostProtectionService.canProceed() instead for subscription-aware checks.
 * Remove by 2026-06-30 - After v2.0 release when CostProtectionService is fully validated
 * @see CostProtectionService.canProceed for replacement
 */
```

**Provides:**
- IDE deprecation warnings
- Clear removal timeline (Q2 2026)
- Reference to replacement implementation
- Satisfies pre-commit hook validation

## Deviations from Plan

### [Rule 4 - Architecture Assessment] ConversationAtomicityService not wired

**Original plan:** Wire ConversationAtomicityService.withAtomicity to VoltAgent services

**Actual outcome:** After analysis, determined atomicity wrapper is NOT applicable:
- `ai-memory.service.ts` uses ONLY Prisma (no external Memory API)
- `conversation-management.service.ts` uses ONLY VoltAgent Memory API (no Prisma writes)

**Resolution:** Added documentation explaining when atomicity IS needed, preserving the service for future use cases.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 290b4daa | docs(01-03): document atomicity applicability in VoltAgent services | ai-memory.service.ts, conversation-management.service.ts |
| 5b747df5 | refactor(01-03): replace inline retry with PrismaRetryService | folder-sync-query.service.ts, email-sync.module.ts |
| 6c51d420 | docs(01-03): add removal-date to DEPRECATED marker | usage-tracking.service.ts |

## Key Insights

1. **Atomicity patterns matter:** The saga pattern (ConversationAtomicityService) is specifically for hybrid DB + API scenarios. Don't force it where not needed.

2. **Centralized retry pays off:** PrismaRetryService provides consistent behavior, better logging, and a single point to modify retry strategy.

3. **Pre-commit hooks enforce standards:** The DEPRECATED check hook caught missing removal dates, ensuring tech debt has clear timelines.

## What's Next

- Phase 01-04 through 01-06 focus on email-specific performance
- Q2 2026: Remove deprecated `checkQuota()` method
- Consider applying PrismaRetryService pattern to other inline retry logic
