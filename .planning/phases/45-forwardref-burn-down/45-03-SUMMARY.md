---
phase: 45-forwardref-burn-down
plan: 03
subsystem: backend
tags: [nestjs, forwardRef, dependency-injection, domain-events, event-emitter, decoupling]

requires:
  - phase: 45-forwardref-burn-down (plans 01, 02)
    provides: DLQ/worker forwardRef removal, IEmbeddingQueueService interface token
provides:
  - Auth module fully decoupled from EmailModule (0 forwardRef)
  - EmailSync module decoupled from AiModule via domain events
  - email.module.ts reduced to exactly 1 forwardRef (EmailSyncModule)
  - Total forwardRef count reduced to 5 files (from 18 original)
  - TransactionalEmailModule (@Global) for standalone nodemailer service
  - EmailIndexedEvent domain event for cross-module embedding enqueue
  - EmailIndexedHandler in AiModule for event-driven embedding
affects: [email-sync, ai, auth, email]

tech-stack:
  added: []
  patterns:
    - "@Global() TransactionalEmailModule for standalone nodemailer service"
    - "Domain event (email.indexed) for cross-module AI embedding enqueue"
    - "EmailIndexedHandler @OnEvent pattern for decoupled embedding"

key-files:
  created:
    - backend/src/modules/email/transactional-email.module.ts
    - backend/src/modules/ai/services/email-indexed.handler.ts
    - backend/src/modules/ai/services/email-embedding-cleanup.service.ts
  modified:
    - backend/src/app.module.ts
    - backend/src/modules/auth/auth.module.ts
    - backend/src/modules/email/email.module.ts
    - backend/src/modules/email-sync/email-sync.module.ts
    - backend/src/modules/email-sync/services/sync-message-processor.service.ts
    - backend/src/modules/email-sync/services/base-email-sync.service.ts
    - backend/src/modules/email-sync/interfaces/sync-context.interface.ts
    - backend/src/common/events/email.events.ts
    - backend/src/common/events/index.ts
    - backend/src/modules/ai/ai.module.ts

key-decisions:
  - "TransactionalEmailModule as @Global() -- EmailService has zero domain dependencies, safe to share globally"
  - "Domain event (email.indexed) over interface token for EmailSync->AI -- eliminates module import entirely"
  - "Moved EmailEmbeddingCleanupService to AiModule -- it's an AI concern using KnowledgeBaseService"
  - "CalendarModule direct import in email.module.ts -- cycle broken at EmailSync edge, forwardRef unnecessary"

patterns-established:
  - "@Global() extraction for standalone services shared across many modules"
  - "EventEmitter2 domain events for cross-module decoupling (extends Phase 32 pattern)"

requirements-completed: [DEBT-02, DEBT-04]

duration: 12min
completed: 2026-03-06
---

# Phase 45 Plan 03: Module-Level forwardRef Elimination Summary

**Decoupled auth/email-sync module-level forwardRef via @Global() TransactionalEmailModule and email.indexed domain events, reducing total forwardRef to 5 files**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-06T08:48:57Z
- **Completed:** 2026-03-06T09:00:55Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- Auth module fully decoupled from EmailModule -- zero forwardRef (DEBT-04)
- EmailSync module decoupled from AiModule via email.indexed domain event (DEBT-03 partial)
- email.module.ts reduced from 2 forwardRef to exactly 1 (EmailSyncModule only) -- DEBT-02 met
- Total project forwardRef count: 5 files (down from 18 original, well under <=12 target)
- Bootstrap smoke test passes, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Decouple auth.module from EmailModule + email-sync from AiModule** - `32076d83` (feat)
2. **Task 2: Reduce email.module.ts forwardRef to <=1** - `97d7ad43` (feat)
3. **Cleanup: Remove dead EmailEmbeddingCleanupService from email-sync** - `e16de334` (chore)

## Files Created/Modified

- `backend/src/modules/email/transactional-email.module.ts` - @Global() module providing EmailService for auth/OTP/password-reset
- `backend/src/modules/ai/services/email-indexed.handler.ts` - @OnEvent handler enqueuing AI embeddings on email.indexed
- `backend/src/modules/ai/services/email-embedding-cleanup.service.ts` - Moved from email-sync (AI concern)
- `backend/src/common/events/email.events.ts` - Added EmailIndexedEvent + EmailEmbeddingCleanupRequestedEvent
- `backend/src/modules/auth/auth.module.ts` - Removed forwardRef(() => EmailModule)
- `backend/src/modules/email-sync/email-sync.module.ts` - Removed forwardRef(() => AiModule)
- `backend/src/modules/email/email.module.ts` - Replaced forwardRef(() => CalendarModule) with direct import
- `backend/src/modules/email-sync/services/sync-message-processor.service.ts` - Uses EventEmitter2 instead of embedding queue
- `backend/src/modules/email-sync/services/base-email-sync.service.ts` - Removed getEmbeddingQueue() abstract method
- `backend/src/modules/email-sync/interfaces/sync-context.interface.ts` - Removed getEmbeddingQueue from context
- `backend/src/modules/email-sync/services/gmail/google-sync.service.ts` - Removed EmailEmbeddingQueueService DI
- `backend/src/modules/email-sync/services/microsoft/microsoft-sync.service.ts` - Removed EmailEmbeddingQueueService DI
- `backend/src/modules/email-sync/services/imap/imap-sync.service.ts` - Removed EmailEmbeddingQueueService DI

## Decisions Made

1. **TransactionalEmailModule as @Global()** -- EmailService is a standalone nodemailer wrapper with zero domain dependencies. Making it global lets AuthModule use it without importing the full EmailModule, cleanly breaking the circular dependency.

2. **Domain event over interface token for EmailSync->AI** -- Unlike Plan 02's interface token approach (which still requires module import for the token provider), domain events eliminate the module import entirely. EmailSync emits `email.indexed`, AiModule's handler listens via `@OnEvent`. This is the proven Phase 32 pattern.

3. **Moved EmailEmbeddingCleanupService to AiModule** -- This service uses KnowledgeBaseService (an AI service) and has no email-sync domain logic. Moving it to AiModule is architecturally correct and eliminates a second dependency on AiModule.

4. **Direct CalendarModule import** -- CalendarModule does not import EmailModule. The transitive cycle (Email -> Calendar -> EmailSync -> Email) is already broken by the forwardRef at the EmailSync -> Email edge. No additional forwardRef needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Moved EmailEmbeddingCleanupService to AiModule**
- **Found during:** Task 1 (Part B: EmailSync -> AI decoupling)
- **Issue:** EmailEmbeddingCleanupService in email-sync.module.ts injected KnowledgeBaseService from AiModule, creating a second dependency on AiModule beyond the embedding queue
- **Fix:** Moved the file to ai/services/ and registered in AiModule providers. Updated import path for KnowledgeBaseService.
- **Files modified:** ai/ai.module.ts, ai/services/email-embedding-cleanup.service.ts (created), email-sync/email-sync.module.ts
- **Verification:** TypeScript compiles, service only referenced from its own module
- **Committed in:** 32076d83 (Task 1 commit)

**2. [Rule 1 - Bug] Updated test file for EventEmitter2 dependency**
- **Found during:** Task 1 (Part B)
- **Issue:** sync-message-processor.service.spec.ts test module lacked EventEmitter2 provider after constructor change
- **Fix:** Added EventEmitter2 mock provider and removed obsolete getEmbeddingQueue from test context objects
- **Files modified:** email-sync/services/__tests__/sync-message-processor.service.spec.ts
- **Verification:** TypeScript compiles (test structure valid)
- **Committed in:** 32076d83 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. Moving EmailEmbeddingCleanupService was required to fully remove AiModule dependency from EmailSync. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 45 complete: all 3 plans executed
- forwardRef count reduced from 18 to 5 files (72% reduction)
- All DEBT targets met: DEBT-01 (<=12), DEBT-02 (email.module <=1), DEBT-04 (auth decoupled)
- Bootstrap smoke test passes
- TypeScript compiles clean

---
*Phase: 45-forwardref-burn-down*
*Completed: 2026-03-06*
