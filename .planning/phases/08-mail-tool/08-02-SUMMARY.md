---
phase: 08-mail-tool
plan: 02
subsystem: ai
tags: [voltagent, zod, prisma, email-tools, triage, follow-ups]

# Dependency graph
requires:
  - phase: 08-mail-tool-01
    provides: "AI triage fields (aiPriority, aiSentiment, aiLabels) in all email tool selects"
provides:
  - "Triage filter params (priority, sentiment, label, needsFollowUp) on list_emails and list_email_index"
  - "list_follow_ups tool for querying EmailFollowUp with email context"
  - "TOOL_GROUPS.email registration for list_follow_ups"
affects: ["auto-triage-core", "follow-ups-refactor"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional where clause building for optional triage filters"
    - "Prisma relation select on composite key (EmailFollowUp -> Email)"

key-files:
  created: []
  modified:
    - "backend/src/modules/ai/voltagent/tools/email.tools.ts"
    - "backend/src/modules/ai/voltagent/tools/email-rlm.tools.ts"
    - "backend/src/modules/ai/voltagent/prompts/unified.prompt.ts"

key-decisions:
  - "Triage filters on listing tools only, not search tools (avoid confusing semantics with RAG queries)"
  - "list_follow_ups uses select (not include) for lightweight responses"
  - "Excluded commitments/waitingFor/actionItems JSON blobs from list_follow_ups (token bloat)"

patterns-established:
  - "Optional Zod filter params with conditional where clause building"
  - "Follow-up status filter with overdue = pending/reminded + past due date"

# Metrics
duration: 7min
completed: 2026-02-07
---

# Phase 08 Plan 02: Triage Filter Params and Follow-Up Listing Summary

**Triage filter parameters on list_emails/list_email_index + new list_follow_ups tool for querying EmailFollowUp with email context**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-07T14:58:56Z
- **Completed:** 2026-02-07T15:05:23Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- list_emails and list_email_index accept optional priority, sentiment, label, needsFollowUp filter params
- New list_follow_ups tool queries EmailFollowUp model with pending/reminded/overdue/all status filter
- list_follow_ups registered in TOOL_GROUPS.email, automatically available for all email-related intents
- Agent can now answer "show me urgent emails", "what needs follow-up", "any negative sentiment emails"

## Task Commits

Each task was committed atomically:

1. **Task 1: Add triage filter parameters to list_emails and list_email_index** - `e5a2cc41` (feat)
2. **Task 2: Create list_follow_ups tool in email-rlm.tools.ts** - `3295c28e` (feat)
3. **Task 3: Register list_follow_ups in TOOL_GROUPS and verify wiring** - `b307f2fb` (feat)

## Files Created/Modified
- `backend/src/modules/ai/voltagent/tools/email.tools.ts` - Added priority/sentiment/label/needsFollowUp Zod params and conditional where clause building for unread/content modes
- `backend/src/modules/ai/voltagent/tools/email-rlm.tools.ts` - Added same triage filter params to list_email_index, plus new list_follow_ups tool
- `backend/src/modules/ai/voltagent/prompts/unified.prompt.ts` - Added 'list_follow_ups' to TOOL_GROUPS.email array

## Decisions Made
- Triage filters applied to listing tools only (list_emails, list_email_index), not search tools -- search tools have their own RAG/text-based filtering and mixing with triage filters would create confusing semantics
- list_follow_ups uses `select` on email relation (not `include`) for lightweight responses -- excludes bodyText/bodyHtml entirely
- Excluded commitments, waitingFor, actionItems JSON blobs from list_follow_ups response (already decided in 08-01)
- Triage filters in list_email_index applied before mode switch so they work across all modes (unread, recent, starred, search)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 08 (Email Tool Triage Exposure) is now complete (2/2 plans)
- Agent has full triage filter and follow-up querying capabilities
- Ready for Phase 03 (Auto-Triage Core) which will generate the triage data these tools now surface

---
*Phase: 08-mail-tool*
*Completed: 2026-02-07*
