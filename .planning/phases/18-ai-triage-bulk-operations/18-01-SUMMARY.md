---
phase: 18-ai-triage-bulk-operations
plan: 01
subsystem: ai
tags: [voltagent, labels, follow-ups, bulk-operations, hitl, nestjs]

# Dependency graph
requires:
  - phase: 17-rich-artifacts-ui
    provides: "VoltAgent tool infrastructure, ActionExecutorService pattern"
provides:
  - "TriageSuggestionService: AI label to UserLabel bridge with auto-create under 'AI Triage' parent"
  - "BulkLabelExecutor: executor for BULK_APPLY_LABELS and BULK_CREATE_FOLLOW_UPS action types"
  - "bulk_email_actions tool extended with apply_labels and create_follow_ups"
  - "AgentActionType enum: BULK_APPLY_LABELS, BULK_CREATE_FOLLOW_UPS"
affects: [18-02, 18-03]

# Tech tracking
tech-stack:
  added: []
  patterns: ["TriageSuggestionService slug-based label resolution with ConflictException retry"]

key-files:
  created:
    - backend/src/modules/ai/services/triage-suggestion.service.ts
    - backend/src/modules/ai/voltagent/services/executors/bulk-label-executor.ts
  modified:
    - backend/src/modules/ai/voltagent/interfaces/agent-action.interface.ts
    - backend/src/modules/ai/voltagent/tools/email.tools.ts
    - backend/src/modules/ai/voltagent/services/action-executor.service.ts
    - backend/src/modules/ai/voltagent/voltagent.module.ts
    - backend/src/modules/ai/voltagent/locales/en.ts
    - backend/src/modules/ai/voltagent/locales/it.ts
    - backend/src/modules/ai/voltagent/locales/index.ts
    - backend/src/modules/ai/voltagent/locales/action-summaries.ts

key-decisions:
  - "Locale strings added in Task 1 commit (deviation Rule 3: pre-commit hook requires type-check pass)"
  - "ConflictException retry in TriageSuggestionService for race condition on slug collision"
  - "forwardRef(() => LabelsModule) in VoltAgentModule to avoid circular dependency"

patterns-established:
  - "BulkLabelExecutor follows static-methods pattern from BulkEmailExecutor"
  - "TriageSuggestionService uses in-memory Map cache for triage parent ID per tenant"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-02-26
---

# Phase 18 Plan 01: Backend Bulk Label & Follow-Up Infrastructure Summary

**TriageSuggestionService bridging AI labels to UserLabels, BulkLabelExecutor for apply_labels/create_follow_ups, and extended bulk_email_actions VoltAgent tool with HITL approval**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T11:24:48Z
- **Completed:** 2026-02-26T11:33:02Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- TriageSuggestionService resolves freeform AI label strings to UserLabel IDs with auto-creation under "AI Triage" parent
- bulk_email_actions VoltAgent tool extended from 4 to 6 actions (apply_labels, create_follow_ups)
- Both new actions return requiresApproval: true with HITL payloads (MEDIUM severity)
- ActionExecutorService routes BULK_APPLY_LABELS and BULK_CREATE_FOLLOW_UPS to BulkLabelExecutor
- BulkLabelExecutor uses LabelsService.addEmailsToLabel (EmailLabel join table, NOT Email.labels String[])
- Backend locale strings added for both languages (en/it)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TriageSuggestionService and BulkLabelExecutor** - `7fed8c1e` (feat)
2. **Task 2: Extend bulk_email_actions tool and wire executors** - `d3d60d08` (feat)

## Files Created/Modified
- `backend/src/modules/ai/services/triage-suggestion.service.ts` - AI label to UserLabel bridge with auto-create under "AI Triage" parent
- `backend/src/modules/ai/voltagent/services/executors/bulk-label-executor.ts` - Static executor for BULK_APPLY_LABELS and BULK_CREATE_FOLLOW_UPS
- `backend/src/modules/ai/voltagent/interfaces/agent-action.interface.ts` - New enum values + payload interfaces
- `backend/src/modules/ai/voltagent/tools/email.tools.ts` - Extended bulk_email_actions with 2 new actions
- `backend/src/modules/ai/voltagent/services/action-executor.service.ts` - New switch cases + DI for LabelsService, TriageSuggestionService, FollowUpCrudService
- `backend/src/modules/ai/voltagent/voltagent.module.ts` - Import LabelsModule, register TriageSuggestionService
- `backend/src/modules/ai/voltagent/locales/en.ts` - bulkApplyLabelsQueued, bulkCreateFollowUpsQueued
- `backend/src/modules/ai/voltagent/locales/it.ts` - Italian translations for new actions
- `backend/src/modules/ai/voltagent/locales/index.ts` - Type definitions for new action summary keys
- `backend/src/modules/ai/voltagent/locales/action-summaries.ts` - Action summary entries for new actions

## Decisions Made
- Locale strings added in Task 1 commit instead of Task 2: pre-commit hook runs type-check, and BulkLabelExecutor references locale keys (Rule 3: blocking issue)
- ConflictException retry in TriageSuggestionService: handles race condition where two concurrent requests try to create the same label
- forwardRef(() => LabelsModule) in VoltAgentModule: avoids circular dependency since LabelsModule imports EmailModule which imports AI services
- @Optional() @Inject() for all three new services in ActionExecutorService: graceful degradation matching codebase convention

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Locale strings moved to Task 1**
- **Found during:** Task 1 commit attempt
- **Issue:** BulkLabelExecutor references `t.bulkApplyLabelsQueued` and `t.bulkCreateFollowUpsQueued` from action-summaries, but those keys were planned for Task 2. Pre-commit hook runs type-check and fails.
- **Fix:** Added all locale strings (en/it/types/action-summaries) as part of Task 1 commit.
- **Files modified:** locales/en.ts, locales/it.ts, locales/index.ts, locales/action-summaries.ts
- **Verification:** `npx tsc --noEmit --project backend/tsconfig.json` passes with zero errors
- **Committed in:** 7fed8c1e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Locale strings were cross-task dependency. Moving them to Task 1 ensures type-check passes. No scope creep.

## Issues Encountered
None beyond the locale cross-task dependency addressed above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend infrastructure complete for Plans 02 and 03
- Plan 02 (email list UI) can consume bulk_email_actions tool via the existing HITL approval flow
- Plan 03 (chat renderer) can consume the same tool results for AI-triggered label/follow-up operations

## Self-Check: PASSED

All 7 key files verified on disk. Both commits (7fed8c1e, d3d60d08) confirmed in git log.

---
*Phase: 18-ai-triage-bulk-operations*
*Completed: 2026-02-26*
