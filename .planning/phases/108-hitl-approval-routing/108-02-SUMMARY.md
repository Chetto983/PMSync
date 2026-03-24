---
phase: 108-hitl-approval-routing
plan: 02
subsystem: ui
tags: [react, mui, hitl, i18n, approval-card, terminal-states]

requires:
  - phase: 108-01
    provides: HITL test scaffolds and contract tests
provides:
  - HitlApprovalCard terminal state rendering (approved/rejected)
  - HIGH_RISK_TOOLS exported set for destructive tool identification
  - FallbackToolUI destructive tool routing to terminal states
  - Complete EN/IT translation keys for HITL approval flow and settings
affects: [108-03, ai-chat, settings]

tech-stack:
  added: []
  patterns: [terminal-state-card-pattern, display-state-derivation-from-result]

key-files:
  created: []
  modified:
    - frontend/src/components/chat/HitlApprovalCard.tsx
    - frontend/src/components/chat/tool-uis/FallbackToolUI.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

key-decisions:
  - "Derive display state from result.approved field rather than tracking state internally"
  - "Extract shared ToolDetails component to avoid duplication across 3 card states"
  - "Complete tools without approval data default to approved (normal execution path)"

patterns-established:
  - "Terminal state pattern: getDisplayState() derives pending/approved/rejected from SDK status + result"
  - "HIGH_RISK_TOOLS set exported for cross-component destructive tool identification"

requirements-completed: [HITL-01, HITL-02]

duration: 5min
completed: 2026-03-24
---

# Phase 108 Plan 02: HITL Approval Card Terminal States Summary

**HitlApprovalCard renders approved/rejected terminal states with success/error styling, FallbackToolUI routes completed destructive tools to colored cards, all HITL copy translated EN+IT**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-24T13:34:56Z
- **Completed:** 2026-03-24T13:40:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- HitlApprovalCard renders 3 display states: pending (warning border), approved (success border + APPROVED chip), rejected (error border + DENIED chip)
- FallbackToolUI routes completed destructive tools through HitlApprovalWrapper for terminal state rendering
- All HITL translation keys added in EN, IT, and TypeScript type index (18 new keys each)
- Extracted shared ToolDetails component for read-only collapsible parameters across all states

## Task Commits

Each task was committed atomically:

1. **Task 1: Translation keys for terminal states and HITL copy** - `5fb5e3b5` (feat)
2. **Task 2: HitlApprovalCard terminal states + FallbackToolUI destructive styling** - `c66386b5` (feat)

**Plan metadata:** (see below)

## Files Created/Modified
- `frontend/locales/en.ts` - Added 18 HITL translation keys (terminal states, sensitivity settings, none-mode dialog)
- `frontend/locales/it.ts` - Added 18 matching Italian translation keys
- `frontend/locales/index.ts` - Added TypeScript types for all new HITL keys
- `frontend/src/components/chat/HitlApprovalCard.tsx` - Rewrote to support 3 display states, exported HIGH_RISK_TOOLS, extracted ToolDetails
- `frontend/src/components/chat/tool-uis/FallbackToolUI.tsx` - Added destructive tool routing to terminal state cards

## Decisions Made
- Derive display state from `result.approved` field rather than tracking internal component state -- simpler, works with SDK's addResult flow
- Extract shared ToolDetails component to avoid duplicating Shield icon + monospace toolName + collapsible parameters across 3 card states
- Complete tools without approval data (e.g., non-HITL execution) default to "approved" display state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing CRM account service type errors**
- **Found during:** Task 1 (commit blocked by pre-commit hook)
- **Issue:** Pre-existing `primaryEmail`/`primaryPhone` fields in account.service.ts don't exist on Prisma Contact model
- **Fix:** Replaced with correct `emails`/`phoneNumbers` fields
- **Files modified:** backend/src/modules/crm/account/services/account.service.ts
- **Verification:** `npx tsc --noEmit` passes for backend
- **Committed in:** 5fb5e3b5 (bundled with Task 1)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing CRM type error blocked all commits via pre-commit hook. Fix was minimal and correct.

## Issues Encountered
- Task 1 translations were bundled into the CRM fix commit (5fb5e3b5) because git staged them before the separate commit could be created. Functionally equivalent -- all changes are tracked.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Terminal state rendering complete, ready for Plan 03 (backend sensitivity + audit trail)
- HIGH_RISK_TOOLS export available for Plan 03 to extend with ALL_MUTATIONS support

## Self-Check: PASSED

---
*Phase: 108-hitl-approval-routing*
*Completed: 2026-03-24*
