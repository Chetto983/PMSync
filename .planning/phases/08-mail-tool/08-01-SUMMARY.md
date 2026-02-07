---
phase: 08-mail-tool
plan: 01
subsystem: api
tags: [prisma, voltagent, triage, aiPriority, aiSentiment, aiLabels, followUp]

# Dependency graph
requires:
  - phase: 03-auto-triage
    provides: "EmailTriageService writes aiPriority/aiSentiment/aiLabels to Email model"
provides:
  - "AI triage fields visible in all VoltAgent email listing/content tool outputs"
  - "Lightweight followUp relation on get_email_content"
  - "Composite index on (tenantId, aiPriority) for filter queries"
affects:
  - "08-02 (follow-up/deadline tools can rely on triage fields in tool outputs)"
  - "Any future tool that reads emails will have triage data available"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AI triage fields comment block in Prisma select objects"
    - "Lightweight followUp select (6 scalar fields, no JSON blobs)"

key-files:
  created: []
  modified:
    - "backend/src/modules/ai/voltagent/tools/email.tools.ts"
    - "backend/src/modules/ai/voltagent/tools/email-rlm.tools.ts"
    - "backend/src/modules/ai/voltagent/tools/insights.tools.ts"
    - "backend/prisma/schema.prisma"

key-decisions:
  - "Exclude followUp from bulk listing tools (token bloat risk)"
  - "Lightweight followUp select on get_email_content: id, status, reason, dueDate, emailType, confidence only"
  - "Do not include commitments/waitingFor/actionItems JSON in followUp select"

patterns-established:
  - "AI triage fields grouped with '// AI triage fields' comment in all select objects"

# Metrics
duration: 8min
completed: 2026-02-07
---

# Phase 08 Plan 01: Email Tool Triage Exposure Summary

**All 5 VoltAgent email listing/content tools now return aiPriority, aiSentiment, aiLabels; get_email_content adds lightweight followUp relation; schema has (tenantId, aiPriority) composite index**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-07T14:47:46Z
- **Completed:** 2026-02-07T14:56:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- All 5 email listing/content tools now expose AI triage fields (aiPriority, aiSentiment, aiLabels) so the LLM can see the data it computed
- get_email_content includes a lightweight followUp relation (6 fields, no heavy JSON blobs)
- Email model has a new composite index on (tenantId, aiPriority) for future filter-by-priority queries
- count_emails intentionally left unchanged (only counts rows, no email select)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add triage fields to email.tools.ts and insights.tools.ts selects** - `2d798e29` (feat)
2. **Task 2: Add triage fields to email-rlm.tools.ts selects with followUp** - `6288ad37` (feat)
3. **Task 3: Add @@index([tenantId, aiPriority]) to Email model** - included in `f0d24c01` (pre-commit hook auto-staged)

## Files Created/Modified
- `backend/src/modules/ai/voltagent/tools/email.tools.ts` - Added aiPriority/aiSentiment/aiLabels to 4 select objects (list_emails unread, content; search_emails RAG, text)
- `backend/src/modules/ai/voltagent/tools/email-rlm.tools.ts` - Added triage fields to 3 select objects (list_email_index RAG, text; get_email_content) plus followUp relation
- `backend/src/modules/ai/voltagent/tools/insights.tools.ts` - Added triage fields to semantic_search_emails select
- `backend/prisma/schema.prisma` - Added @@index([tenantId, aiPriority]) to Email model

## Decisions Made
- Excluded followUp relation from bulk listing tools (list_emails, search_emails, list_email_index, semantic_search_emails) to avoid token bloat -- only get_email_content (max 5 emails) includes it
- followUp select uses 6 lightweight scalar fields (id, status, reason, dueDate, emailType, confidence) -- excludes commitments, waitingFor, actionItems JSON blobs which are large and better served by the dedicated list_follow_ups tool in Plan 02
- count_emails intentionally unchanged -- it only counts rows and has no email select object

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Task 3 (schema.prisma index) was auto-staged by pre-commit hook into commit f0d24c01 instead of getting its own atomic commit. The change is correctly committed and the schema validates. This is a minor git hygiene issue with no functional impact.

## User Setup Required
None - no external service configuration required. The new index requires a Prisma migration to be applied separately (not part of this plan).

## Next Phase Readiness
- All triage fields are now visible in tool outputs, ready for Plan 02 (follow-up/deadline listing tools)
- The @@index([tenantId, aiPriority]) needs migration application before production use
- No blockers for Plan 02

---
*Phase: 08-mail-tool*
*Completed: 2026-02-07*
