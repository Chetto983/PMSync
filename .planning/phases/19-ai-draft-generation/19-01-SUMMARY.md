---
phase: 19-ai-draft-generation
plan: 01
subsystem: ai
tags: [mistral, prisma, pii, draft-generation, nestjs, levenshtein]

# Dependency graph
requires:
  - phase: 13-pii-tokenization
    provides: PiiDetectionService for redacting PII before LLM calls
  - phase: 18-ai-triage
    provides: VoltAgentModule structure and TriageSuggestionService pattern
provides:
  - AiDraftFeedback Prisma model for tracking AI draft accept/edit/reject
  - DraftGenerationService for LLM-powered email reply draft generation
  - DraftFeedbackService for feedback recording and quality statistics
  - AiDraftController with 3 REST endpoints (generate-reply-draft, draft-feedback, draft-stats)
  - WritingStyleProfile extended with per-provider providerId and manualSamples
affects: [19-02 frontend draft wiring, 19-03 style settings, 19-04 weekly cron]

# Tech tracking
tech-stack:
  added: []
  patterns: [dedicated-controller-for-ai-feature, pii-redact-then-rehydrate, levenshtein-edit-distance]

key-files:
  created:
    - backend/src/modules/ai/voltagent/services/draft-generation.service.ts
    - backend/src/modules/ai/voltagent/services/draft-feedback.service.ts
    - backend/src/modules/ai/voltagent/controllers/ai-draft.controller.ts
  modified:
    - backend/prisma/schema.prisma
    - backend/src/modules/ai/voltagent/voltagent.module.ts
    - backend/src/modules/ai/voltagent/services/writing-style.service.ts

key-decisions:
  - "findFirst + create/update over upsert for nullable compound unique (WritingStyleProfile)"
  - "Inline language detection with Italian keyword heuristic (2+ hits = Italian)"
  - "Two-row Levenshtein optimization for O(min(m,n)) memory in edit distance"

patterns-established:
  - "Dedicated controller per AI feature domain: AiDraftController follows analytics.controller.ts pattern"
  - "PII redact-call-rehydrate pipeline: detect -> redact -> LLM call -> resolveFromMatches"

requirements-completed: [DRAFT-01]

# Metrics
duration: 7min
completed: 2026-02-26
---

# Phase 19 Plan 01: Backend Draft Generation Infrastructure Summary

**AiDraftFeedback Prisma model, DraftGenerationService with PII redaction + Mistral LLM, DraftFeedbackService with Levenshtein tracking, and 3-endpoint AiDraftController wired into VoltAgentModule**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-26T15:45:52Z
- **Completed:** 2026-02-26T15:53:31Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- AiDraftFeedback Prisma model with all 12 fields (draftBody, sentBody, action, editDistance, corrections, tone, locale, providerId) and 2 indexes
- WritingStyleProfile extended with nullable providerId for per-account styles and manualSamples field
- DraftGenerationService orchestrates email fetch, writing style prompt, language detection, PII redaction, Mistral LLM call, PII rehydration, and feedback record creation
- DraftFeedbackService records accept/edit/reject with Levenshtein edit distance ratio and aggregate quality stats
- AiDraftController with POST generate-reply-draft (consent + quota guarded), POST draft-feedback, GET draft-stats

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema + DraftGenerationService + DraftFeedbackService** - `5336d1ef` (feat)
2. **Task 2: AiDraftController + VoltAgent module wiring** - `4dab1b22` (feat)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added AiDraftFeedback model, extended WritingStyleProfile with providerId/manualSamples
- `backend/src/modules/ai/voltagent/services/draft-generation.service.ts` - NEW: Draft generation orchestration (~190 lines)
- `backend/src/modules/ai/voltagent/services/draft-feedback.service.ts` - NEW: Feedback recording + Levenshtein (~170 lines)
- `backend/src/modules/ai/voltagent/controllers/ai-draft.controller.ts` - NEW: REST controller with 3 endpoints (~120 lines)
- `backend/src/modules/ai/voltagent/voltagent.module.ts` - Wired AiDraftController, DraftGenerationService, DraftFeedbackService
- `backend/src/modules/ai/voltagent/services/writing-style.service.ts` - Updated queries for nullable providerId compound unique

## Decisions Made
- Used `findFirst + create/update` instead of `upsert` for WritingStyleProfile operations because the compound unique now includes nullable `providerId`, and Prisma upsert with nullable compound unique fields is error-prone
- Simple Italian keyword heuristic for language detection (2+ keyword matches = Italian, otherwise English) - sufficient for bilingual inbox, avoids extra LLM call
- Two-row optimized Levenshtein distance for O(min(m,n)) memory - simple and sufficient for v1, can upgrade to diff-match-patch later
- Inline `AuthenticatedRequest` interface in controller (matches existing controller pattern in codebase)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated WritingStyleService queries for new compound unique**
- **Found during:** Task 1 (Prisma schema changes)
- **Issue:** WritingStyleService used `tenantId_userId` compound unique key in `findUnique` and `upsert` calls. After adding `providerId` to the unique constraint, these broke.
- **Fix:** Changed `findUnique({ where: { tenantId_userId }})` to `findFirst({ where: { tenantId, userId, providerId: null }})` in 3 locations. Changed `upsert` to `findFirst + create/update` pattern for safer nullable compound unique handling.
- **Files modified:** `backend/src/modules/ai/voltagent/services/writing-style.service.ts`
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** `5336d1ef` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential fix -- the schema change would have broken existing WritingStyleService operations. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend API ready for frontend consumption (Plan 19-02)
- POST /api/v1/voltagent/generate-reply-draft endpoint available for ComposeDialog integration
- POST /api/v1/voltagent/draft-feedback endpoint available for send-time feedback recording
- GET /api/v1/voltagent/draft-stats endpoint available for settings panel
- Prisma migration needed before deployment (schema changes not auto-migrated)

## Self-Check: PASSED

- [x] `draft-generation.service.ts` exists
- [x] `draft-feedback.service.ts` exists
- [x] `ai-draft.controller.ts` exists
- [x] Commit `5336d1ef` (Task 1) exists
- [x] Commit `4dab1b22` (Task 2) exists
- [x] `npx prisma generate` succeeds
- [x] `npx tsc --noEmit` passes cleanly

---
*Phase: 19-ai-draft-generation*
*Completed: 2026-02-26*
