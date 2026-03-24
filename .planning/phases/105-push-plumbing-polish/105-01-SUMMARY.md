---
phase: 105-push-plumbing-polish
plan: 01
subsystem: push, pwa
tags: [web-push, service-worker, push-api, vapid, prisma, nestjs, react-hook]

requires:
  - phase: 104-offline-action-queue
    provides: SW sync handler pattern, module-level state hooks
provides:
  - PushSubscription Prisma model with tenant-scoped endpoints
  - POST/DELETE /api/v1/push/subscribe backend endpoints
  - usePushSubscription hook with feature detection and lifecycle
  - pushApi frontend module wrapping push endpoints
  - SW push event handler showing notifications
  - SW notificationclick handler for deep-linking
  - Push + update translations (EN + IT)
affects: [105-02-PLAN]

tech-stack:
  added: [web-push]
  patterns: [useSyncExternalStore for push state, iOS standalone guard for push support]

key-files:
  created:
    - backend/src/modules/push/push.module.ts
    - backend/src/modules/push/push.controller.ts
    - backend/src/modules/push/push.service.ts
    - backend/src/modules/push/dto/push-subscription.dto.ts
    - frontend/hooks/use-push-subscription.ts
    - frontend/hooks/__tests__/use-push-subscription.test.ts
    - frontend/lib/api/push.ts
  modified:
    - backend/prisma/schema.prisma
    - backend/src/app.module.ts
    - frontend/sw.ts
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

key-decisions:
  - "Follow useSyncExternalStore pattern from use-install-prompt.ts for push state management"
  - "iOS push support requires standalone mode detection (non-standalone iOS Safari cannot do push)"
  - "PushSubscription model uses tenantId+endpoint unique constraint for multi-tenant upsert"
  - "SW push/notificationclick use Event cast pattern (same as sync handler) for type safety"

patterns-established:
  - "Push feature detection: isPushSupported() guards PushManager + Notification + iOS standalone"
  - "Push API module pattern: pushApi.subscribe/unsubscribe wrapping apiClient"

requirements-completed: [PUSH-01, PUSH-02, PUSH-03, PUSH-04]

duration: 12min
completed: 2026-03-24
---

# Phase 105 Plan 01: Push Plumbing Summary

**Backend push subscription module with Prisma model + REST endpoints, frontend usePushSubscription hook with iOS feature detection, SW push/notificationclick handlers, and push API module**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-24T07:50:37Z
- **Completed:** 2026-03-24T08:02:16Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Backend PushSubscription Prisma model with tenant-scoped unique constraint and POST/DELETE endpoints
- Frontend usePushSubscription hook using useSyncExternalStore with iOS standalone detection
- SW push event handler displaying notifications with app icon and notificationclick deep-linking
- Push API module, 7 unit tests, and EN/IT translations for push + update sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend push subscription module** - `3daf511b` (feat)
2. **Task 2: Frontend push hook + API module + SW handlers + translations** - `a2e996e9` (feat)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added PushSubscription model with tenantId+endpoint unique constraint
- `backend/src/modules/push/push.module.ts` - Push NestJS module
- `backend/src/modules/push/push.controller.ts` - POST/DELETE /push/subscribe endpoints
- `backend/src/modules/push/push.service.ts` - Upsert subscribe, deleteMany unsubscribe
- `backend/src/modules/push/dto/push-subscription.dto.ts` - Validated DTOs
- `backend/src/app.module.ts` - Registered PushModule
- `frontend/hooks/use-push-subscription.ts` - Push subscription lifecycle hook
- `frontend/hooks/__tests__/use-push-subscription.test.ts` - 7 unit tests
- `frontend/lib/api/push.ts` - Push API module
- `frontend/sw.ts` - Push + notificationclick event handlers
- `frontend/locales/en.ts` - Push + update translations
- `frontend/locales/it.ts` - Push + update translations (Italian)
- `frontend/locales/index.ts` - Expanded pwa type with push and update

## Decisions Made
- Followed useSyncExternalStore pattern from use-install-prompt.ts for referential stability
- iOS push requires standalone mode -- non-standalone iOS Safari returns isSupported=false
- PushSubscription model uses (tenantId, endpoint) unique constraint for multi-tenant upsert
- SW event handlers use Event cast pattern (consistent with existing sync handler)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed SW type declarations for PushEvent and NotificationEvent**
- **Found during:** Task 2 (SW handlers)
- **Issue:** PushEvent and NotificationEvent types not available in tsconfig lib target
- **Fix:** Added local interface declarations and used Event cast pattern (same as existing sync handler)
- **Files modified:** frontend/sw.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** a2e996e9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type declaration fix was necessary for compilation. No scope creep.

## Issues Encountered
None beyond the type declaration fix documented above.

## User Setup Required
VAPID keys needed for Web Push API. Environment variables:
- `VAPID_PUBLIC_KEY` - Generated via `npx web-push generate-vapid-keys` (backend)
- `VAPID_PRIVATE_KEY` - Generated via `npx web-push generate-vapid-keys` (backend)
- `VAPID_SUBJECT` - `mailto:admin@pmsync.local` or production email
- `NEXT_PUBLIC_VAPID_KEY` - Same value as VAPID_PUBLIC_KEY (frontend)

## Next Phase Readiness
- Push plumbing complete, ready for Plan 02 (UI toggle component)
- usePushSubscription hook exports all state and actions needed by PushToggle component

---
*Phase: 105-push-plumbing-polish*
*Completed: 2026-03-24*
