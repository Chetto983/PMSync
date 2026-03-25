---
phase: 108-hitl-approval-routing
plan: 03
subsystem: ui
tags: [react, mui, toggle-button, hitl, settings, preferences]

# Dependency graph
requires:
  - phase: 108-01
    provides: backend needsApproval logic and audit logging
  - phase: 108-02
    provides: terminal state rendering for approval cards and i18n keys
provides:
  - HITL sensitivity toggle UI replacing autoApproveThreshold slider
  - hitlSensitivity field wired through state, handlers, and API types
  - NONE confirmation dialog with destructive styling
affects: [ai-chat, settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MUI Dialog for destructive confirmation gates"
    - "ToggleButtonGroup for discrete enum settings"

key-files:
  created: []
  modified:
    - frontend/components/settings/AiSettings.tsx
    - frontend/components/dashboard/settings/useSettingsState.ts
    - frontend/components/dashboard/settings/useSettingsHandlers.ts
    - frontend/components/dashboard/settings/useSettingsCopy.ts
    - frontend/components/dashboard/Settings.tsx
    - frontend/lib/api/users.ts

key-decisions:
  - "Used t.chat.hitl.* translations directly instead of copy prop for new HITL fields"
  - "Kept Chip import since it's still used for subscription badges in feature toggles"

patterns-established:
  - "Discrete enum settings use ToggleButtonGroup with confirmation dialog for destructive options"

requirements-completed: [HITL-03]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 108 Plan 03: Frontend HITL Sensitivity Toggle Summary

**3-option HITL sensitivity toggle (HIGH_ONLY/ALL_MUTATIONS/NONE) replacing percentage slider, with NONE confirmation dialog**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T14:00:16Z
- **Completed:** 2026-03-24T14:04:42Z
- **Tasks:** 3 of 3 complete (including human-verify checkpoint)
- **Files modified:** 6

## Accomplishments
- Replaced autoApproveThreshold float slider with hitlSensitivity enum toggle
- Added NONE confirmation dialog with error-colored confirm button
- Wired hitlSensitivity through API types, state, handlers, and parent component
- Removed all traces of autoApproveThreshold from modified files

## Task Commits

Each task was committed atomically:

1. **Task 1: API types + state + handlers + parent wiring** - `1fb60238` (feat)
2. **Task 2: AiSettings UI toggle + dialog + copy cleanup** - `291dfd73` (feat)
3. **Task 3: Verify HITL settings and approval flow** - human-verify APPROVED

## Files Created/Modified
- `frontend/lib/api/users.ts` - Added hitlSensitivity to UserPreferences and UpdatePreferencesData
- `frontend/components/dashboard/settings/useSettingsState.ts` - Replaced autoApproveThreshold state with hitlSensitivity
- `frontend/components/dashboard/settings/useSettingsHandlers.ts` - Replaced aiAutoApproveThreshold in save payload with hitlSensitivity
- `frontend/components/dashboard/Settings.tsx` - Updated AiSettings props to pass hitlSensitivity
- `frontend/components/settings/AiSettings.tsx` - Replaced Slider with ToggleButtonGroup + NONE Dialog
- `frontend/components/dashboard/settings/useSettingsCopy.ts` - Removed obsolete autoApproveLabel/autoApproveHint

## Decisions Made
- Used `t.chat.hitl.*` translations directly (from useTranslations hook) for the new HITL fields rather than routing through the copy prop, since the copy prop pattern is for existing settings copy and the HITL keys were added in Plan 02's i18n task
- Kept Chip in MUI imports -- still used for subscription tier badges on feature toggle rows

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored Chip import after removal**
- **Found during:** Task 2 (AiSettings UI replacement)
- **Issue:** Plan said to remove Chip import since it was part of the slider block, but Chip is used for subscription badges (Starter/Pro) on feature toggle rows
- **Fix:** Re-added Chip to MUI imports
- **Files modified:** frontend/components/settings/AiSettings.tsx
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 291dfd73 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor -- Chip import was incorrectly targeted for removal. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Human Verification

**Task 3 checkpoint APPROVED** by user on 2026-03-24. Visual verification confirmed:
1. Old slider removed
2. 3-option HITL toggle working (Solo alto rischio / Tutte le mutazioni / Nessuna)
3. Confirmation dialog appears for NONE with correct Italian text
4. Warning alert shows after confirming NONE
5. Settings save and persist after reload
6. AI Chat page loads correctly

## Next Phase Readiness
- All 3 plans for Phase 108 complete (code + verification)
- Phase 108 (hitl-approval-routing) is fully done

## Self-Check: PASSED

- Commit 1fb60238: FOUND
- Commit 291dfd73: FOUND
- SUMMARY.md: FOUND

---
*Phase: 108-hitl-approval-routing*
*Completed: 2026-03-24*
