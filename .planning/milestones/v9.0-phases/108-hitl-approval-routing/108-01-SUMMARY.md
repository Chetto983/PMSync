---
phase: 108-hitl-approval-routing
plan: 01
subsystem: ai
tags: [hitl, needsApproval, audit, prisma, ai-sdk]

requires:
  - phase: 77-ai-sdk-hitl
    provides: "AI SDK needsApproval boolean on HIGH-risk tools"
provides:
  - "hitlSensitivity column on UserPreferences with HIGH_ONLY default"
  - "Dynamic needsApproval function variant on all email/calendar/contact tools"
  - "AuditService.logHitlDecision for HITL approval/rejection audit trail"
  - "MEDIUM-risk mutation tools gated by ALL_MUTATIONS sensitivity"
affects: [108-02, 108-03, frontend-settings, ai-chat]

tech-stack:
  added: []
  patterns:
    - "Dynamic needsApproval closures over sensitivity string"
    - "Fire-and-forget HITL audit logging in onStepFinish"

key-files:
  created:
    - "backend/src/modules/ai-chat/__tests__/hitl-sensitivity.test.ts"
  modified:
    - "backend/prisma/schema.prisma"
    - "backend/src/common/services/audit.service.ts"
    - "backend/src/modules/users/dtos/update-preferences.dto.ts"
    - "backend/src/modules/ai-chat/services/ai-chat.service.ts"
    - "backend/src/modules/ai-chat/tools/email-tools.service.ts"
    - "backend/src/modules/ai-chat/tools/calendar-tools.service.ts"
    - "backend/src/modules/ai-chat/tools/contact-tools.service.ts"
    - "backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts"
    - "backend/src/modules/audit/__tests__/audit.service.spec.ts"

key-decisions:
  - "Used PrismaService injection in AiChatService rather than accessing via ConversationService"
  - "sensitivity parameter has default value in getTools() for backward compatibility with tests"
  - "rag-tools delete_memory keeps needsApproval: true (not in scope for Phase 108)"

patterns-established:
  - "Dynamic needsApproval: HIGH-risk uses () => sensitivity !== 'NONE', MEDIUM-risk uses () => sensitivity === 'ALL_MUTATIONS'"
  - "HITL audit: logHitlDecision creates HITL:APPROVED or HITL:REJECTED records in audit_logs"

requirements-completed: [HITL-03, HITL-04]

duration: 22min
completed: 2026-03-24
---

# Phase 108 Plan 01: Backend HITL Infrastructure Summary

**Dynamic needsApproval closures per user sensitivity + HITL audit trail via logHitlDecision in AuditService**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-24T13:34:53Z
- **Completed:** 2026-03-24T13:57:22Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- hitlSensitivity column added to UserPreferences with HIGH_ONLY default
- All 6 HIGH-risk tools (send/delete/forward/reply email, delete event, delete contact) use dynamic `() => sensitivity !== 'NONE'`
- All 7 MEDIUM-risk mutation tools (archive/move/draft email, create/update event, create/update contact) use `() => sensitivity === 'ALL_MUTATIONS'`
- AuditService.logHitlDecision writes HITL:APPROVED / HITL:REJECTED to audit_logs
- onStepFinish wired to detect approval responses and fire audit logging
- 30 tests pass (6 sensitivity + 15 contract + 9 audit)

## Task Commits

1. **Task 0: Test scaffolds for HITL-03 and HITL-04** - `0b414387` (test)
2. **Task 1: Schema migration + DTO + audit method** - `d079b6ea` (feat)
3. **Task 2: Dynamic needsApproval + audit wiring** - `2f27fe23` (feat)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added hitlSensitivity column
- `backend/src/common/services/audit.service.ts` - Added LogHitlDecisionInput interface and logHitlDecision method
- `backend/src/modules/users/dtos/update-preferences.dto.ts` - Added hitlSensitivity field with enum validation
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - Injected PrismaService, loads user sensitivity, passes to createToolSet, wires HITL audit in onStepFinish
- `backend/src/modules/ai-chat/tools/email-tools.service.ts` - Dynamic needsApproval on all 9 tools (4 HIGH, 3 MEDIUM, 2 read-only)
- `backend/src/modules/ai-chat/tools/calendar-tools.service.ts` - Dynamic needsApproval on 3 tools (1 HIGH, 2 MEDIUM)
- `backend/src/modules/ai-chat/tools/contact-tools.service.ts` - Dynamic needsApproval on 3 tools (1 HIGH, 2 MEDIUM)
- `backend/src/modules/ai-chat/__tests__/hitl-sensitivity.test.ts` - 6 tests for closure logic across sensitivity levels
- `backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts` - Updated for function variant, added Phase 108 tests
- `backend/src/modules/audit/__tests__/audit.service.spec.ts` - 3 tests for logHitlDecision (HITL-04)

## Decisions Made
- Injected PrismaService directly into AiChatService rather than reaching through ConversationService private field
- Tool service getTools() uses default parameter `sensitivity = 'HIGH_ONLY'` so existing test instantiations remain valid
- Scoped needsApproval function changes to email/calendar/contact tools; rag-tools delete_memory left as boolean (out of scope)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed AiChatService constructor in 5 test files**
- **Found during:** Task 2
- **Issue:** Adding PrismaService as first constructor arg shifted positional parameters in test instantiations
- **Fix:** Added `null as any` for PrismaService in all 5 test files that construct AiChatService manually
- **Files modified:** ai-chat-e2e.test.ts, chat-ledger.test.ts, chat-pipeline-msw.test.ts, tools-rag-e2e.test.ts, tools-rag-real-e2e.test.ts
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 2f27fe23

**2. [Rule 3 - Blocking] Adjusted hitl-contract test for rag-tools out-of-scope**
- **Found during:** Task 2
- **Issue:** Test checked ALL tool files for `needsApproval: true` absence, but rag-tools delete_memory is not in scope
- **Fix:** Scoped test to only check email/calendar/contact tool files
- **Files modified:** hitl-contract.test.ts
- **Committed in:** 2f27fe23

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary to maintain type safety and test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend HITL infrastructure complete for Plan 02 (frontend settings UI for hitlSensitivity)
- Plan 03 (parent caller + approval UX) can wire into the dynamic needsApproval functions

---
*Phase: 108-hitl-approval-routing*
*Completed: 2026-03-24*
