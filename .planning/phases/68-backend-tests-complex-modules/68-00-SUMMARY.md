---
phase: 68-backend-tests-complex-modules
plan: "00"
subsystem: test-helpers
tags: [testing, factories, cleanup, prisma, calendar, contacts, subscriptions]
dependency_graph:
  requires: []
  provides: [createTestCalendarEvent, createTestContact, createTestProviderAccount, createTestSubscription, Phase68-cleanup]
  affects: [68-01, 68-02, 68-03, 68-04, 68-05]
tech_stack:
  added: []
  patterns: [factory-nextId-uniqueness, prisma-enum-typed-factories]
key_files:
  created: []
  modified:
    - backend/test/helpers/factories.ts
    - backend/test/helpers/cleanup.ts
decisions:
  - "Used SubscriptionPlan/SubscriptionStatus Prisma enums directly instead of casting as any — avoids silent type drift"
  - "createTestProviderAccount uses tokenExpiresAt sentinel check (undefined vs null) to allow explicit null override for expired-token tests"
  - "cleanup.ts Phase 68 tables ordered before users/tenants, matching Phase 67 convention for FK intent signaling"
metrics:
  duration: 5min
  completed_date: "2026-03-11T18:22:13Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 68 Plan 00: Test Helper Factories and Cleanup Extension Summary

**One-liner:** Four typed Prisma factory functions (CalendarEvent, Contact, ProviderConfig, Subscription) added to factories.ts; cleanup.ts TRUNCATE list extended with nine Phase 68 tables.

## What Was Built

Extended shared test helpers to support all Phase 68 integration test modules.

### factories.ts additions

- `createTestCalendarEvent(tenantId, providerId, overrides)` — inserts a `CalendarEvent` row with unique `externalId` and `calendarId` via `nextId()`; requires an existing `ProviderConfig` row (FK constraint).
- `createTestContact(tenantId, overrides)` — inserts a `Contact` row into `unified_contacts`; `emails` field typed as `Prisma.InputJsonValue` cast.
- `createTestProviderAccount(tenantId, userId, overrides)` — inserts a `ProviderConfig` row; `tokenExpiresAt` defaults to now+1h but accepts `null` (via undefined-sentinel check) to simulate expired tokens.
- `createTestSubscription(tenantId, overrides)` — inserts a `Subscription` row; uses `SubscriptionPlan.FREE` and `SubscriptionStatus.ACTIVE` enums; `usageResetAt` defaults to first day of next month. Unique constraint on `tenantId` — callers must use fresh tenants.

### cleanup.ts additions

Nine new tables added before `users`/`tenants`:
`calendar_event_attachments`, `calendar_events`, `calendar_sync_states`, `calendar_preferences`, `webhook_subscriptions`, `unified_contacts`, `provider_contacts`, `provider_configs`, `subscriptions`

## Deviations from Plan

### Auto-improved (within task scope)

**[Rule 2 - Missing Correctness] Used typed Prisma enums instead of `any` cast for Subscription**
- **Found during:** Task 1
- **Issue:** Plan specified casting `plan` and `status` as `any`; but `SubscriptionPlan` and `SubscriptionStatus` enums exist in the generated Prisma client.
- **Fix:** Imported and used the actual enum types. Factory signature now accepts `SubscriptionPlan` and `SubscriptionStatus` instead of `any` — prevents callers from passing invalid string literals.
- **Files modified:** `backend/test/helpers/factories.ts`
- **Commit:** 986bfb80

**[Rule 3 - Blocking Issue] cleanup.ts had partial Phase 68 changes from a linter/previous write**
- **Found during:** Task 2
- **Issue:** File was modified after initial read — partial table list already present but missing `unified_contacts`, `provider_contacts`, `subscriptions`.
- **Fix:** Rewrote file with complete, correct TRUNCATE list via Write tool.
- **Files modified:** `backend/test/helpers/cleanup.ts`
- **Commit:** 4337f744

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 986bfb80 | feat(68-00): add four Phase 68 factory functions to factories.ts |
| Task 2 | 4337f744 | feat(68-00): extend cleanup.ts TRUNCATE list with Phase 68 tables |

## Self-Check: PASSED

- FOUND: `backend/test/helpers/factories.ts`
- FOUND: `backend/test/helpers/cleanup.ts`
- FOUND commit: `986bfb80` (Task 1)
- FOUND commit: `4337f744` (Task 2)
