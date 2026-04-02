---
phase: 0143-ai-suggestions-actions
plan: 02
subsystem: frontend
tags: [react, mui, tanstack-query, suggestions, sidebar, email]

requires:
  - phase: 0143-01
    provides: GET /crm/suggestions/for-email/:emailId endpoint, accept/dismiss endpoints
provides:
  - EmailSuggestionCard component for rendering CRM suggestions
  - SidebarSuggestionsSection for email-scoped suggestion display
  - useEmailSuggestions query hook
  - emailId prop on EntityContextSidebar
affects: [email thread page sidebar UX]

tech-stack:
  added: []
  patterns: [extracted section component to keep files under 500 lines]

key-files:
  created:
    - frontend/components/common/EmailSuggestionCard.tsx
    - frontend/components/common/SidebarSuggestionsSection.tsx
  modified:
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
    - frontend/lib/api/crm-suggestions.ts
    - frontend/hooks/queries/crm-suggestions-keys.ts
    - frontend/hooks/queries/use-crm-suggestions.ts
    - frontend/components/common/EntityContextSidebar.tsx
    - frontend/pages/dashboard/email/thread/[threadId].tsx

key-decisions:
  - "Used existing crmSuggestions translation section for accept/dismiss/types labels instead of duplicating into crmContext"
  - "Extracted SidebarSuggestionsSection to separate file to keep EntityContextSidebar under 500 lines"
  - "Added task type to crmSuggestions.types translations for Plan 01 backend task support"

requirements-completed: [AI-04, AI-05]

duration: 5min
completed: 2026-04-02
---

# Phase 143 Plan 02: Frontend Translations, API Hook, EmailSuggestionCard, and Sidebar Integration Summary

**Email suggestion cards in contextual sidebar with accept/dismiss via query hooks and extracted section component**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T14:10:20Z
- **Completed:** 2026-04-02T14:14:58Z
- **Tasks:** 2/2
- **Files modified:** 10

## Accomplishments
- Added translation keys for suggested actions section header and task suggestion type
- Added crmSuggestionsApi.forEmail(emailId) calling GET /crm/suggestions/for-email/:emailId
- Added useEmailSuggestions(emailId) query hook with proper staleTime/gcTime/retry/enabled
- Created EmailSuggestionCard with type icon, title, reasoning, confidence bar, accept/dismiss buttons
- Created SidebarSuggestionsSection that fetches and renders pending suggestions sorted by confidence
- Integrated suggestions section into EntityContextSidebar below Active Tickets (only visible when pending suggestions exist)
- Thread page passes lastEmailId to sidebar

## Task Commits

1. **Task 1: Add translations, API method, query key, and query hook** - `89ad4c4d` (feat)
2. **Task 2: Create EmailSuggestionCard and integrate into EntityContextSidebar** - `f1962c33` (feat)

## Files Created/Modified
- `frontend/components/common/EmailSuggestionCard.tsx` - New: suggestion card with type icon, title, reasoning, confidence, accept/dismiss (118 lines)
- `frontend/components/common/SidebarSuggestionsSection.tsx` - New: extracted section fetching email suggestions and rendering cards (76 lines)
- `frontend/locales/en.ts` - Added suggestedActions, noSuggestions to crmContext; task to crmSuggestions.types
- `frontend/locales/it.ts` - Added matching Italian translations
- `frontend/locales/index.ts` - Added type definitions for new keys
- `frontend/lib/api/crm-suggestions.ts` - Added forEmail(emailId) method
- `frontend/hooks/queries/crm-suggestions-keys.ts` - Added forEmail query key factory
- `frontend/hooks/queries/use-crm-suggestions.ts` - Added emailSuggestionsOptions and useEmailSuggestions hook
- `frontend/components/common/EntityContextSidebar.tsx` - Added emailId prop, imports SidebarSuggestionsSection (484 lines)
- `frontend/pages/dashboard/email/thread/[threadId].tsx` - Added lastEmailId memo, passes to sidebar (497 lines)

## Decisions Made
- Reused existing crmSuggestions translations for accept/dismiss/confidence/types labels rather than duplicating into crmContext section
- Extracted SidebarSuggestionsSection to its own file to keep EntityContextSidebar under the 500-line limit (was 506 before compacting imports)
- Added task type to crmSuggestions.types since Plan 01 backend now generates task suggestions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added task type to crmSuggestions.types translations**
- **Found during:** Task 1
- **Issue:** Plan 01 added task suggestion type but translations only had account/deal/ticket/link
- **Fix:** Added task type to en.ts, it.ts, and index.ts crmSuggestions.types
- **Files modified:** frontend/locales/en.ts, it.ts, index.ts
- **Committed in:** 89ad4c4d (Task 1)

**2. [Rule 3 - Blocking] Compacted EntityContextSidebar imports to stay under 500 lines**
- **Found during:** Task 2
- **Issue:** Adding emailId prop and suggestions section pushed file to 506 lines
- **Fix:** Consolidated MUI and lucide-react imports to fewer lines, bringing file to 484 lines
- **Files modified:** frontend/components/common/EntityContextSidebar.tsx
- **Committed in:** f1962c33 (Task 2)

---

**Total deviations:** 2 auto-fixed (Rule 2 + Rule 3)
**Impact on plan:** Essential for completeness and CLAUDE.md compliance. No scope creep.

## Issues Encountered
None

## Known Stubs
None - all data flows are wired to real API endpoints via query hooks.

## User Setup Required
None - uses existing backend endpoints from Plan 01.

---
*Phase: 0143-ai-suggestions-actions*
*Completed: 2026-04-02*
