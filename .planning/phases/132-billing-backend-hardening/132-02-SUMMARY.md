---
phase: 132-billing-backend-hardening
plan: 02
subsystem: payments
tags: [subscription, billing, lifecycle, email, sendgrid, prisma]

requires:
  - phase: 132-01
    provides: "Autumn webhook service, cost protection, billing alert foundation"
provides:
  - "cancelAt period-end enforcement in daily lifecycle check"
  - "Real email delivery for billing alerts via SendGrid"
affects: [133-billing-e2e-validation]

tech-stack:
  added: []
  patterns: ["cancelAt expiry check pattern for subscription lifecycle"]

key-files:
  created: []
  modified:
    - "backend/src/modules/subscription/services/subscription-lifecycle.service.ts"
    - "backend/src/modules/subscription/services/billing-alert.service.ts"
    - "backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts"

key-decisions:
  - "Used EmailService (@Global TransactionalEmailModule) instead of EmailSendService for billing alerts -- EmailSendService requires ProviderConfig DB lookup which doesn't exist for system emails"

patterns-established:
  - "cancelAt expiry: query ACTIVE + cancelAt <= now + plan != FREE, then updatePlan(FREE) + updateStatus(CANCELED)"
  - "System transactional emails: use @Global EmailService (SendGrid), not EmailSendService (provider-bound)"

requirements-completed: [BILL-04]

duration: 5min
completed: 2026-04-01
---

# Phase 132 Plan 02: Billing Backend Hardening Summary

**cancelAt period-end enforcement in daily lifecycle check + real SendGrid email delivery for billing alerts**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-01T10:58:58Z
- **Completed:** 2026-04-01T11:04:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Daily expiry check now catches subscriptions where cancelAt has passed and downgrades them to FREE/CANCELED
- BillingAlertService sends real payment failure notification emails via SendGrid instead of logging stubs
- 4 new integration tests for cancelAt handling (past, future, null, return type)
- No circular dependencies introduced

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cancelAt expiry check (TDD RED)** - `3b026dda` (test)
2. **Task 1: Add cancelAt expiry check (TDD GREEN)** - `ba3711ed` (feat)
3. **Task 2: Wire BillingAlertService to real email** - `a4a3b82a` (feat)

## Files Created/Modified
- `backend/src/modules/subscription/services/subscription-lifecycle.service.ts` - Added checkCancelledSubscriptions private method, updated runExpiryCheck return type
- `backend/src/modules/subscription/services/billing-alert.service.ts` - Replaced log-only stub with real EmailService.sendEmail calls, removed DEBT comment
- `backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts` - Added 4 cancelAt integration tests

## Decisions Made
- Used EmailService (from @Global TransactionalEmailModule / SendGrid) instead of plan-specified EmailSendService. EmailSendService.queueSend requires a real ProviderConfig DB record (tenantId + providerId lookup), which doesn't exist for system-level billing alerts. EmailService sends directly via SendGrid API without provider dependencies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used EmailService instead of EmailSendService**
- **Found during:** Task 2 (Wire BillingAlertService)
- **Issue:** Plan specified EmailSendService.queueSend with tenantId:'system' and providerId:'system', but queueSend calls getActiveEmailProvider which requires a real ProviderConfig DB record. No such 'system' provider exists.
- **Fix:** Used EmailService from @Global TransactionalEmailModule instead. It sends via SendGrid HTTP API directly, which is the correct path for system transactional emails (same as OTP, password reset).
- **Files modified:** backend/src/modules/subscription/services/billing-alert.service.ts
- **Verification:** npx tsc --noEmit passes, no circular dependencies
- **Committed in:** a4a3b82a

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary correction -- EmailSendService would have thrown NotFoundException at runtime. EmailService achieves the same goal (real email delivery) via the correct infrastructure path.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Billing backend hardening complete (132-01 + 132-02)
- Ready for Phase 133 billing E2E validation
- cancelAt enforcement and real email alerts are in place for end-to-end testing

---
*Phase: 132-billing-backend-hardening*
*Completed: 2026-04-01*
