---
phase: 95-dead-code-cleanup
plan: 05
subsystem: ui
tags: [i18n, react, locales, cleanup]

requires:
  - phase: 95-dead-code-cleanup-04
    provides: "Initial i18n wiring for chat tool UIs"
provides:
  - "Complete i18n coverage for FollowUpToolUI (5 locale keys)"
  - "CLN-02 fully satisfied (zero hardcoded English strings in tool UIs)"
affects: []

tech-stack:
  added: []
  patterns: ["tu?.key ?? 'fallback' interpolation with .replace() for parameterized locale strings"]

key-files:
  created: []
  modified:
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
    - frontend/src/components/chat/tool-uis/FollowUpToolUI.tsx

key-decisions:
  - "No new decisions - followed plan as specified"

patterns-established:
  - "Parameterized i18n fallback: (tu?.key ?? 'Fallback: {param}').replace('{param}', value)"

requirements-completed: [CLN-02]

duration: 2min
completed: 2026-03-21
---

# Phase 95 Plan 05: FollowUpToolUI i18n Gap Closure Summary

**Replaced 5 hardcoded English strings in FollowUpToolUI.tsx with i18n locale keys, closing the final CLN-02 gap**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T15:15:28Z
- **Completed:** 2026-03-21T15:17:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added 5 new locale keys (fromLabel, loadingFollowUps, failedToLoadFollowUps, followUpsTitle, noFollowUpsFound) to en.ts, it.ts, and index.ts
- Wired all 5 keys into FollowUpToolUI.tsx using tu?.key fallback pattern
- CLN-02 requirement fully satisfied -- zero hardcoded English-only strings remain in chat tool UIs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 5 locale keys to en.ts, it.ts, and index.ts** - `9594a9c2` (feat)
2. **Task 2: Wire locale keys into FollowUpToolUI.tsx** - `cb890e8c` (fix)

## Files Created/Modified
- `frontend/locales/en.ts` - Added 5 new keys in ai.toolUi section
- `frontend/locales/it.ts` - Added Italian translations for 5 new keys
- `frontend/locales/index.ts` - Added type definitions for 5 new keys
- `frontend/src/components/chat/tool-uis/FollowUpToolUI.tsx` - Replaced 5 hardcoded strings with locale key references

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 95 (dead-code-cleanup) is fully complete -- all 5 plans executed
- All CLN requirements satisfied
- Ready for next milestone phase if applicable

---
*Phase: 95-dead-code-cleanup*
*Completed: 2026-03-21*

## Self-Check: PASSED
- All 4 modified files exist on disk
- Both task commits (9594a9c2, cb890e8c) verified in git log
- SUMMARY.md created successfully
