---
phase: 106-tiered-rate-limiting
plan: 02
subsystem: api
tags: [rate-limiting, nestjs, throttler, decorators, security]

requires:
  - phase: 106-01
    provides: RateTierDecorator, UserThrottlerGuard with tier-aware filtering
provides:
  - Every write endpoint has explicit @RateTier decorator
  - Zero @Throttle({default}) decorators remain in codebase
  - Audit test prevents regression to default key usage
affects: [all-controllers, rate-limiting]

tech-stack:
  added: []
  patterns: ["@RateTierDecorator on every write endpoint for explicit tier assignment"]

key-files:
  created:
    - backend/src/__tests__/rate-tier-audit.spec.ts
  modified:
    - backend/src/modules/email/controllers/email-actions.controller.ts
    - backend/src/modules/email/controllers/email-calendar-invite.controller.ts
    - backend/src/modules/email/controllers/folders.controller.ts
    - backend/src/modules/calendar/controllers/calendar.controller.ts
    - backend/src/modules/contacts/controllers/contacts.controller.ts
    - backend/src/modules/telegram/controllers/telegram-settings.controller.ts
    - backend/src/modules/telegram/controllers/telegram-webhook.controller.ts
    - backend/src/modules/health/controllers/health.controller.ts
    - backend/src/modules/ai/controllers/ai-health.controller.ts
    - backend/src/common/auth/csrf-token.controller.ts
    - backend/src/modules/labels/controllers/labels.controller.ts
    - backend/src/modules/users/controllers/users.controller.ts
    - backend/src/modules/providers/controllers/providers.controller.ts
    - backend/src/modules/reminder/controllers/reminder.controller.ts
    - backend/src/modules/ai/controllers/ai.controller.ts
    - backend/src/modules/ai-chat/controllers/ai-chat.controller.ts
    - backend/src/modules/push/push.controller.ts
    - backend/src/modules/subscription/controllers/subscription.controller.ts
    - backend/src/modules/compliance/controllers/consent.controller.ts
    - backend/src/modules/compliance/controllers/data-export.controller.ts
    - backend/src/modules/compliance/controllers/data-deletion.controller.ts

key-decisions:
  - "calendar-invite respond/cancel endpoints classified as 'send' tier since they send emails"
  - "Push unsubscribe (DELETE /subscribe) classified as safe-write not destructive-write since it only removes a subscription"
  - "Compliance GDPR endpoints all classified as destructive-write for extra protection"
  - "GET-only controllers (health, ai-health, csrf-token) have no decorator -- guard auto-assigns read tier"
  - "Folder metadata GET endpoint @Throttle removed -- guard auto-assigns read tier"

patterns-established:
  - "@RateTierDecorator('send') for all email-sending endpoints"
  - "@RateTierDecorator('destructive-write') for all delete/cleanup/compliance endpoints"
  - "@RateTierDecorator('safe-write') for create/update/sync endpoints"
  - "No decorator needed on GET endpoints -- guard auto-assigns read tier"

requirements-completed: [RATE-02]

duration: 20min
completed: 2026-03-24
---

# Phase 106 Plan 02: Controller Tier Audit Summary

**Replaced all 18 @Throttle({default}) decorators with tier-aware @RateTier, added explicit tier to 100+ undecorated write endpoints, created regression audit test**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-24T10:11:39Z
- **Completed:** 2026-03-24T10:31:20Z
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments
- Eliminated all @Throttle({default:...}) decorators that didn't match any configured throttler name
- Added @RateTierDecorator to 121 write endpoints across 21 controllers with correct tier classification
- Created regression audit test that verifies no default key @Throttle usage exists
- Removed orphaned @Throttle imports from 3 GET-only controllers

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace all @Throttle({default}) with @RateTier** - `387d3a19` (feat)
2. **Task 2: Add @RateTier to undecorated write endpoints + audit test** - `32063d9d` (feat)

## Files Created/Modified
- `backend/src/__tests__/rate-tier-audit.spec.ts` - Regression test: no @Throttle default key, no orphaned imports
- `backend/src/modules/email/controllers/email-actions.controller.ts` - 3x send + 5x safe-write + 5x destructive-write
- `backend/src/modules/email/controllers/email-calendar-invite.controller.ts` - 3x send (send invite, respond, cancel)
- `backend/src/modules/email/controllers/folders.controller.ts` - 5x safe-write + 2x destructive-write
- `backend/src/modules/calendar/controllers/calendar.controller.ts` - 4x safe-write + 2x destructive-write
- `backend/src/modules/contacts/controllers/contacts.controller.ts` - 8x safe-write + 3x destructive-write
- `backend/src/modules/labels/controllers/labels.controller.ts` - 4x safe-write + 2x destructive-write
- `backend/src/modules/users/controllers/users.controller.ts` - 4x safe-write + 3x destructive-write
- `backend/src/modules/providers/controllers/providers.controller.ts` - 8x safe-write + 1x destructive-write
- `backend/src/modules/ai/controllers/ai.controller.ts` - 14x safe-write + 1x destructive-write
- `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` - 2x safe-write + 2x destructive-write
- `backend/src/modules/reminder/controllers/reminder.controller.ts` - 3x safe-write + 1x destructive-write
- `backend/src/modules/push/push.controller.ts` - 2x safe-write
- `backend/src/modules/subscription/controllers/subscription.controller.ts` - 1x destructive-write
- `backend/src/modules/compliance/controllers/*.controller.ts` - 3x destructive-write
- `backend/src/modules/telegram/controllers/*.controller.ts` - 2x safe-write + 2x destructive-write
- `backend/src/modules/health/controllers/health.controller.ts` - Removed @Throttle (guard auto-assigns)
- `backend/src/modules/ai/controllers/ai-health.controller.ts` - Removed @Throttle (guard auto-assigns)
- `backend/src/common/auth/csrf-token.controller.ts` - Removed @Throttle (guard auto-assigns)

## Decisions Made
- Calendar invite respond/cancel classified as 'send' tier since they send emails via SMTP
- Push unsubscribe (DELETE) classified as safe-write since it's a benign removal
- All GDPR compliance endpoints classified as destructive-write for max protection
- GET-only controllers need no decorator -- guard auto-assigns read tier at 300/min

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed audit test file location**
- **Found during:** Task 2
- **Issue:** Plan specified `backend/tests/rate-tier-audit.spec.ts` but `backend/test/*` is gitignored and the jest config matches `src/**/*.spec.ts`
- **Fix:** Placed test at `backend/src/__tests__/rate-tier-audit.spec.ts` and fixed path resolution
- **Files modified:** backend/src/__tests__/rate-tier-audit.spec.ts
- **Verification:** Test passes, file committed

**2. [Rule 2 - Missing Critical] Added @RateTier to additional undecorated endpoints**
- **Found during:** Task 2
- **Issue:** Plan listed specific endpoints but many more write endpoints existed without decorators (calendar CRUD, contacts CRUD, folder sync/cleanup, email fetch-archived, maintenance, retention)
- **Fix:** Added @RateTierDecorator to all discovered undecorated write endpoints
- **Files modified:** Multiple controllers
- **Verification:** 121 total @RateTierDecorator usages across controllers

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes necessary for completeness. No scope creep -- all additions serve the plan's stated goal.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All rate limiting infrastructure complete (guard + decorators + audit test)
- Phase 106 fully done -- ready for next milestone phase

---
*Phase: 106-tiered-rate-limiting*
*Completed: 2026-03-24*
