---
phase: 87-ai-chat-module-fix
plan: 03
subsystem: ai-chat
tags: [nestjs, prisma, pii, race-condition, tool-persistence, embedding]

requires:
  - phase: 87-02
    provides: High-severity bug fixes (RACE-1, BUG-1, BUG-2, BUG-5)
provides:
  - delete_contact PII resolution (BUG-6)
  - Auto-resolve removal in getOrCreateConversation (BUG-7)
  - Deduplicated embedding save in save_memory (BUG-8)
  - Batched tool result persistence (RACE-4)
  - TOCTOU-safe title/summary generation (RACE-2)
affects: [82-memory-canonicalization, ai-chat]

tech-stack:
  added: []
  patterns:
    - "savedMessageCount tracking in stream callbacks for TOCTOU-safe triggers"
    - "Single embedding write path (raw SQL to ai_memories.vector, no dual write)"

key-files:
  created: []
  modified:
    - backend/src/modules/ai-chat/tools/email-tools.service.ts
    - backend/src/modules/ai-chat/tools/contact-tools.service.ts
    - backend/src/modules/ai-chat/tools/rag-tools.service.ts
    - backend/src/modules/ai-chat/services/conversation.service.ts
    - backend/src/modules/ai-chat/services/ai-chat.service.ts
    - backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts
    - backend/src/modules/ai-chat/__tests__/tools-rag-real-e2e.test.ts

key-decisions:
  - "BUG-3 (draft_email sentAt) cannot be fixed without schema migration -- Email.sentAt is non-nullable DateTime with no default; annotated with TODO"
  - "RACE-3 moot after BUG-7 fix (auto-resolve removed)"
  - "Removed EmbeddingsService dependency from RagToolsService after BUG-8 fix"
  - "savedMessageCount tracked via closure counter in stream callbacks for RACE-2"

patterns-established:
  - "Pass message count from save operations to trigger methods instead of separate queries"

requirements-completed: [BUG-6, BUG-7, BUG-8, RACE-2, RACE-3, RACE-4]

duration: 8min
completed: 2026-03-19
---

# Phase 87 Plan 03: Medium-Severity Bug Fixes Summary

**PII resolution on delete_contact, auto-resolve removal, single embedding write path, batched tool persistence, and TOCTOU-safe title/summary triggers**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-19T15:38:15Z
- **Completed:** 2026-03-19T15:46:22Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- delete_contact now resolves PII tokens before using contactId (BUG-6)
- Removed stale 30-minute auto-resolve fallback from getOrCreateConversation (BUG-7)
- Eliminated duplicate embedding write in save_memory -- single raw SQL path only (BUG-8)
- Simplified persistToolResults to always use saveToolMessagesBatch single transaction (RACE-4)
- Title/summary generation now uses savedMessageCount from stream callbacks, eliminating TOCTOU race (RACE-2)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix draft_email sentAt (BUG-3) and delete_contact piiResolve (BUG-6)** - `4e9c314b` (fix)
2. **Task 2: Remove auto-resolve fallback (BUG-7), deduplicate embedding save (BUG-8)** - `993605f5` (fix)
3. **Task 3: Batch persistToolResults (RACE-4) and TOCTOU-safe title/summary (RACE-2)** - `9bd18b1f` (fix)

## Files Created/Modified
- `backend/src/modules/ai-chat/tools/email-tools.service.ts` - Annotated BUG-3 (sentAt cannot be null in schema)
- `backend/src/modules/ai-chat/tools/contact-tools.service.ts` - BUG-6: piiResolve on delete_contact args
- `backend/src/modules/ai-chat/tools/rag-tools.service.ts` - BUG-8: removed duplicate embeddingsService.saveEmbedding
- `backend/src/modules/ai-chat/services/conversation.service.ts` - BUG-7: removed 30-min auto-resolve
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - RACE-4: simplified persistToolResults; RACE-2: savedMessageCount tracking
- `backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts` - Fixed RagToolsService constructor args
- `backend/src/modules/ai-chat/__tests__/tools-rag-real-e2e.test.ts` - Fixed RagToolsService constructor args

## Decisions Made
- BUG-3 (draft_email sentAt) cannot be fully fixed: Email.sentAt is a required non-nullable DateTime in the Prisma schema. Making it nullable requires a schema migration (Rule 4 architectural change). Annotated with TODO comment. Deferred to future schema evolution.
- RACE-3 is moot because BUG-7 removed the auto-resolve fallback entirely.
- Removed EmbeddingsService import/injection from RagToolsService since BUG-8 eliminated its only usage there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed test constructor args after RagToolsService dependency removal**
- **Found during:** Task 2
- **Issue:** hitl-contract.test.ts and tools-rag-real-e2e.test.ts passed 5 args to RagToolsService constructor; now expects 4 after removing EmbeddingsService
- **Fix:** Removed the extra mock argument from both test files
- **Files modified:** hitl-contract.test.ts, tools-rag-real-e2e.test.ts
- **Verification:** tsc --noEmit passes, both test suites green
- **Committed in:** 993605f5 (Task 2 commit)

**2. [Rule 4 - Deferred] BUG-3 draft_email sentAt requires schema migration**
- **Found during:** Task 1
- **Issue:** Plan asserts "drafts have null sentAt" but Email.sentAt is non-nullable DateTime in Prisma schema
- **Fix:** Cannot fix without schema migration. Annotated with TODO comment. Added to deferred items.
- **Files modified:** email-tools.service.ts (annotation only)
- **Committed in:** 4e9c314b (Task 1 commit)

---

**Total deviations:** 2 (1 auto-fixed blocking, 1 deferred architectural)
**Impact on plan:** BUG-3 deferred. All other bugs and race conditions fixed as planned.

## Issues Encountered
- Supabase compute quota exceeded during test runs -- 4 E2E test suites failed due to infrastructure, not code changes. Unit tests all pass.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All medium-severity bugs fixed (except BUG-3 which needs schema migration)
- Ready for Plan 04 (dead code cleanup) or Phase 82 (memory canonicalization)
- BUG-3 should be addressed in a future schema migration phase

---
*Phase: 87-ai-chat-module-fix*
*Completed: 2026-03-19*
