---
phase: 95-dead-code-cleanup
plan: 04
subsystem: ui
tags: [i18n, react, localization, cleanup]

# Dependency graph
requires:
  - phase: 95-dead-code-cleanup/03
    provides: "Initial i18n sweep for chat tool UIs"
provides:
  - "Full i18n coverage for EmailContentToolUI, EmailSearchToolUI, FollowUpToolUI"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: ["Pass tu locale object as prop to subcomponents that lack useTranslations access"]

key-files:
  created: []
  modified:
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
    - frontend/src/components/chat/tool-uis/EmailContentToolUI.tsx
    - frontend/src/components/chat/tool-uis/EmailSearchToolUI.tsx
    - frontend/src/components/chat/tool-uis/FollowUpToolUI.tsx

key-decisions:
  - "Pass tu prop to subcomponents rather than adding useTranslations() in each, keeping hook calls minimal"

patterns-established:
  - "Locale fallback pattern: tu?.key ?? 'English fallback' for optional toolUi keys"

requirements-completed: [CLN-02]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 95 Plan 04: i18n Gap Closure for Chat Tool UIs Summary

**Added 4 missing locale keys (noSubject, to, failedToLoad, noEmailContent) and wired them into 3 chat tool UI components to close CLN-02 gap**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T13:33:30Z
- **Completed:** 2026-03-21T13:37:28Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added noSubject, to, failedToLoad, noEmailContent locale keys to en.ts, it.ts, and index.ts type definition
- Replaced all hardcoded English strings in EmailContentToolUI.tsx with tu locale key references
- Replaced hardcoded '(no subject)' in EmailSearchToolUI.tsx and FollowUpToolUI.tsx with tu?.noSubject
- CLN-02 requirement fully satisfied

## Task Commits

Each task was committed atomically:

1. **Task 1: Add missing locale keys to en.ts, it.ts, and index.ts** - `f186ad17` (feat) -- included in user's bulk commit
2. **Task 2: Wire locale keys into EmailContentToolUI, EmailSearchToolUI, and FollowUpToolUI** - `aaef6992` (fix)

## Files Created/Modified
- `frontend/locales/en.ts` - Added 4 new ai.toolUi keys
- `frontend/locales/it.ts` - Added 4 Italian translations for new keys
- `frontend/locales/index.ts` - Added 4 optional string type definitions for new keys
- `frontend/src/components/chat/tool-uis/EmailContentToolUI.tsx` - Replaced 5 hardcoded strings with locale key references
- `frontend/src/components/chat/tool-uis/EmailSearchToolUI.tsx` - Replaced 1 hardcoded string with locale key reference
- `frontend/src/components/chat/tool-uis/FollowUpToolUI.tsx` - Added useTranslations hook, replaced 1 hardcoded string

## Decisions Made
- Passed tu locale object as prop to subcomponents (EmailCard, EmailRow, FollowUpRow) rather than adding separate useTranslations() calls in each, keeping hook usage minimal and consistent

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed type error for tu prop in EmailCard**
- **Found during:** Task 2
- **Issue:** `tu` from `t.ai.toolUi` is typed as optional (`| undefined`), but EmailCard required non-optional `Record<string, string | undefined>`
- **Fix:** Changed `<EmailCard email={email} tu={tu} />` to `<EmailCard email={email} tu={tu ?? {}} />`
- **Files modified:** frontend/src/components/chat/tool-uis/EmailContentToolUI.tsx
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** aaef6992 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary type safety fix. No scope creep.

## Issues Encountered
- Task 1 locale key additions were included in user's prior bulk commit (f186ad17) before the plan executor committed them separately. No rework needed since the keys were present.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 95 dead-code-cleanup is now fully complete with all gaps closed
- CLN-02 requirement satisfied: zero hardcoded English strings in chat tool UIs

---
*Phase: 95-dead-code-cleanup*
*Completed: 2026-03-21*
