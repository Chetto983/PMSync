---
phase: 0143-ai-suggestions-actions
plan: 01
subsystem: api
tags: [nestjs, crm, suggestions, rule-engine, email-triage]

requires:
  - phase: 0142-ai-triage-pipeline
    provides: email triage fields (aiCategory, aiActionability, aiIntent, contactId, dealId)
provides:
  - EmailSuggestionGeneratorService with rule-based suggestion generation
  - GET /crm/suggestions/for-email/:emailId endpoint
  - Task type support in CrmSuggestionService.accept()
affects: [0143-02 frontend suggestion panel]

tech-stack:
  added: []
  patterns: [rule-engine-array pattern for declarative suggestion rules]

key-files:
  created:
    - backend/src/modules/crm/suggestion/services/email-suggestion-generator.service.ts
  modified:
    - backend/src/modules/crm/suggestion/services/crm-suggestion.service.ts
    - backend/src/modules/crm/suggestion/controllers/suggestion.controller.ts
    - backend/src/modules/crm/suggestion/suggestion.module.ts

key-decisions:
  - "Rule engine as typed array of SuggestionRule objects for declarative, extensible rule definitions"
  - "Idempotency via check-all-statuses: if any suggestion (pending/accepted/dismissed) exists for an email, skip regeneration"
  - "userId passed through accept/bulk for task creation support"

patterns-established:
  - "SuggestionRule interface: { type, condition, confidence, buildEntityData } for adding new rules"

requirements-completed: [AI-04, AI-05]

duration: 3min
completed: 2026-04-02
---

# Phase 143 Plan 01: Backend Rule Engine and Endpoints Summary

**Rule-based email suggestion generator with 4 rules (ticket/deal/task/link_contact) and for-email endpoint**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T14:05:39Z
- **Completed:** 2026-04-02T14:08:24Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments
- EmailSuggestionGeneratorService generates CrmSuggestion rows from email triage fields using 4 declarative rules
- GET /crm/suggestions/for-email/:emailId endpoint with idempotent generate-or-return behavior
- CrmSuggestionService.accept() handles type='task' creating ManualTask with proper userId/tenantId

## Task Commits

1. **Task 1: Add task type to accept() and create EmailSuggestionGeneratorService** - `724facb6` (feat)
2. **Task 2: Add endpoint and wire module** - `a888d050` (feat)

## Files Created/Modified
- `backend/src/modules/crm/suggestion/services/email-suggestion-generator.service.ts` - New service: rule engine + getOrGenerate logic (148 lines)
- `backend/src/modules/crm/suggestion/services/crm-suggestion.service.ts` - Added task case to accept(), createTask helper, userId param
- `backend/src/modules/crm/suggestion/controllers/suggestion.controller.ts` - Added for-email/:emailId endpoint, pass userId to accept/bulk
- `backend/src/modules/crm/suggestion/suggestion.module.ts` - Registered EmailSuggestionGeneratorService in providers/exports

## Decisions Made
- Rule engine uses a typed array of SuggestionRule objects rather than if/else chains for extensibility
- Idempotency check queries all statuses (not just pending) to avoid regenerating after user dismissed/accepted
- userId added as optional param to accept() and bulk() to maintain backward compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added userId to bulk() method**
- **Found during:** Task 1
- **Issue:** bulk() calls accept() internally but didn't pass userId, which would fail for task-type suggestions
- **Fix:** Added userId optional parameter to bulk() and forwarded it to accept()
- **Files modified:** crm-suggestion.service.ts, suggestion.controller.ts
- **Committed in:** 724facb6 (Task 1), a888d050 (Task 2)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical)
**Impact on plan:** Essential for correctness. No scope creep.

## Issues Encountered
None

## Known Stubs
None - all data flows are wired to real services.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend endpoint ready for frontend consumption in Plan 02
- Four suggestion types available: ticket, deal, task, link_contact
- Frontend needs to call GET /crm/suggestions/for-email/:emailId and POST :id/accept or :id/dismiss

---
*Phase: 0143-ai-suggestions-actions*
*Completed: 2026-04-02*
