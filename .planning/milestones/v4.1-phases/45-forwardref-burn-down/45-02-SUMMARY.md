---
phase: 45-forwardref-burn-down
plan: 02
subsystem: backend
tags: [nestjs, dependency-injection, forwardRef, interfaces, symbols]

requires:
  - phase: none
    provides: none
provides:
  - IEmailEmbeddingQueue and IKnowledgeBase interfaces with Symbol-based injection tokens
  - 4 fewer forwardRef in AI embedding cluster
affects: [45-forwardref-burn-down]

tech-stack:
  added: []
  patterns: [Symbol-based DI tokens for NestJS circular dependency breaking]

key-files:
  created:
    - backend/src/common/interfaces/embedding-queue.interface.ts
  modified:
    - backend/src/common/interfaces/index.ts
    - backend/src/modules/ai/ai.module.ts
    - backend/src/modules/ai/services/knowledge-base.service.ts
    - backend/src/modules/ai/services/embedding-backfill.service.ts
    - backend/src/modules/ai/services/email-embedding.queue.ts
    - backend/src/modules/ai/services/contact-embedding.queue.ts

key-decisions:
  - "useExisting (not useClass) for token bindings -- avoids duplicate instances"

patterns-established:
  - "Symbol token + interface pattern: define in common/interfaces, bind with useExisting in module, inject with @Inject(TOKEN)"

requirements-completed: [DEBT-03]

duration: 4min
completed: 2026-03-06
---

# Phase 45 Plan 02: AI Embedding forwardRef Elimination Summary

**Eliminated 4 forwardRef in AI embedding cluster via IEmailEmbeddingQueue/IKnowledgeBase Symbol-based injection tokens**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T08:40:35Z
- **Completed:** 2026-03-06T08:44:06Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created IEmailEmbeddingQueue and IKnowledgeBase interfaces with Symbol tokens in common/interfaces
- Registered useExisting provider bindings in AiModule
- Replaced all 4 forwardRef in knowledge-base, embedding-backfill, email-embedding.queue, contact-embedding.queue
- TypeScript compiles clean with zero forwardRef in target files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create embedding interface tokens and update AI module** - `6000e0e8` (feat)
2. **Task 2: Replace 4 AI embedding forwardRef with interface injection** - `8eae1216` (refactor, co-committed with plan 01 pre-commit hook)

## Files Created/Modified
- `backend/src/common/interfaces/embedding-queue.interface.ts` - IEmailEmbeddingQueue + IKnowledgeBase interfaces and Symbol tokens
- `backend/src/common/interfaces/index.ts` - Re-exports for new interfaces
- `backend/src/modules/ai/ai.module.ts` - useExisting provider bindings for EMAIL_EMBEDDING_QUEUE and KNOWLEDGE_BASE
- `backend/src/modules/ai/services/knowledge-base.service.ts` - @Inject(EMAIL_EMBEDDING_QUEUE) replaces forwardRef
- `backend/src/modules/ai/services/embedding-backfill.service.ts` - @Inject(EMAIL_EMBEDDING_QUEUE) replaces forwardRef
- `backend/src/modules/ai/services/email-embedding.queue.ts` - @Inject(KNOWLEDGE_BASE) replaces forwardRef
- `backend/src/modules/ai/services/contact-embedding.queue.ts` - @Inject(KNOWLEDGE_BASE) replaces forwardRef

## Decisions Made
- Used `useExisting` instead of `useClass` for token provider bindings to avoid creating duplicate service instances -- the concrete classes are already registered as providers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task 2 files were swept into plan 01's commit (8eae1216) by the pre-commit hook staging all modified files. Changes are correctly committed, just under an unexpected hash.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 4 forwardRef eliminated from AI embedding cluster
- Pattern established for remaining forwardRef elimination in plan 03

---
*Phase: 45-forwardref-burn-down*
*Completed: 2026-03-06*
