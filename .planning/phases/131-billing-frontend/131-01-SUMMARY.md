---
phase: 131-billing-frontend
plan: 01
subsystem: ui
tags: [billing, mui, typography, spacing, i18n, ui-spec]

# Dependency graph
requires:
  - phase: 131-billing-frontend
    provides: "UI-SPEC design contract (typography weights, spacing scale, copywriting rules)"
provides:
  - "All 7 billing components pass UI-SPEC audit (weights 400/600 only, 4px-multiple spacing)"
  - "BILL-01 wiring confirmed across all 4 sub-criteria (pricing table, checkout, usage, portal)"
  - "Solution-path error copy in both EN and IT locales"
affects: [133-billing-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns: ["UI-SPEC typography enforcement: only fontWeight 400 (body) and 600 (emphasis)", "UI-SPEC spacing: 4px-multiple tokens only (except CardContent p:3)"]

key-files:
  created: []
  modified:
    - frontend/components/billing/BillingPanel.tsx
    - frontend/components/billing/PricingTable.tsx
    - frontend/components/billing/SubscriptionCard.tsx
    - frontend/components/billing/UsageCard.tsx
    - frontend/components/billing/UpgradeDialog.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts

key-decisions:
  - "UsageCard fontWeight={500} prop also fixed to 400 (not in plan line items but required by must_haves)"

patterns-established:
  - "Billing UI-SPEC: fontWeight 400 for body text, 600 for emphasis -- no 500 or 700"
  - "Billing UI-SPEC: spacing tokens must be 4px multiples (1/2/4), except CardContent p:3"

requirements-completed: [BILL-01]

# Metrics
duration: 4min
completed: 2026-03-31
---

# Phase 131 Plan 01: Billing Frontend UI-SPEC Alignment Summary

**Billing components aligned to UI-SPEC (typography 400/600, 4px spacing, solution-path error copy) with all 4 BILL-01 sub-criteria wiring confirmed**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T15:31:02Z
- **Completed:** 2026-03-31T15:35:02Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Fixed all typography weight violations: fontWeight 500->400, 700->600 across 4 billing components
- Fixed all spacing violations: pt/gap/mt/p/py/mb tokens aligned to 4px-multiple scale
- Added solution-path text to billing error strings in both EN and IT locales
- Verified BILL-01a (pricing table via usePricingTable), BILL-01b (checkout via useAttachProduct + window.location redirect), BILL-01c (usage via subscription prop from useBilling), BILL-01d (portal via useOpenBillingPortal)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix UI-SPEC compliance across billing components and locale files** - `49a6899b` (fix)
2. **Task 2: Verify BILL-01 wiring and full type-check pass** - verification-only, no code changes

## Files Created/Modified
- `frontend/components/billing/BillingPanel.tsx` - Tab fontWeight 500->400, spacing fixes (pt/gap/mt/p/py)
- `frontend/components/billing/PricingTable.tsx` - Price display fontWeight 700->600
- `frontend/components/billing/SubscriptionCard.tsx` - Plan name fontWeight 700->600
- `frontend/components/billing/UsageCard.tsx` - Title/section mb:3->2, label fontWeight 500->400
- `frontend/components/billing/UpgradeDialog.tsx` - CircularProgress mb:3->2
- `frontend/locales/en.ts` - billing.errors.loadFailed/updateFailed with solution-path text
- `frontend/locales/it.ts` - billing.errors.loadFailed/updateFailed with solution-path text

## Decisions Made
- UsageCard had `fontWeight={500}` on two Typography props (lines 67, 101) not listed in the plan's line-by-line instructions but required by the must_haves constraint "only fontWeight 400 and 600". Fixed to 400.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed UsageCard fontWeight={500} prop violations**
- **Found during:** Task 1 (UI-SPEC compliance)
- **Issue:** UsageCard.tsx lines 67 and 101 had `fontWeight={500}` (prop syntax, not sx), missed by plan's line-number-based instructions
- **Fix:** Changed both `fontWeight={500}` to `fontWeight={400}` to satisfy must_haves constraint
- **Files modified:** frontend/components/billing/UsageCard.tsx
- **Verification:** grep confirms zero fontWeight 500 or 700 in billing components
- **Committed in:** 49a6899b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for must_haves compliance. No scope creep.

## Issues Encountered
- Worktree has no node_modules, causing @serwist type definition error on `tsc --noEmit` -- pre-existing infrastructure issue, not related to billing changes. Type-check from main repo passes clean.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All billing UI components pass UI-SPEC audit
- BILL-01 wiring confirmed end-to-end
- Ready for Phase 133 (billing E2E validation)

---
*Phase: 131-billing-frontend*
*Completed: 2026-03-31*
