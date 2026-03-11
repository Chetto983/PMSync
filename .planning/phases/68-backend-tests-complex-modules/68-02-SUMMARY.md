---
phase: 68-backend-tests-complex-modules
plan: "02"
subsystem: testing
tags: [jest, prisma, redis, ioredis, bullmq, nestjs, contacts, crm]

requires:
  - phase: 66-test-infrastructure
    provides: "Test helpers: getTestPrismaClient, cleanupTestData, factory functions"
  - phase: 68-00
    provides: "Research findings: contacts module architecture, test patterns for BullMQ workers"

provides:
  - "ContactSyncService tests: lock acquire/release/contention, google/microsoft delegation, tenant scoping"
  - "RelationshipScoreService tests: real DB scoring math, recency/reciprocity scores, cross-tenant isolation"
  - "ContactsCacheService tests: real Redis set/get/invalidate, distributed lock acquire/contention/release"
  - "GoogleContactsWebhookService tests: handleNotification, pollForChanges interval gate"
  - "ContactsSyncWorker tests: processJob() google/microsoft delegation, error guards, DLQ on last attempt"

affects:
  - "68-03 onwards: contacts test patterns reusable for other BullMQ worker specs"
  - "Phase 71: E2E tests that exercise contacts sync flow"

tech-stack:
  added: []
  patterns:
    - "Protected method test via (worker as any).processJob(mockJob) cast"
    - "Real Redis injection: service['redis'] = testRedis bypasses onModuleInit"
    - "Per-factory tracked cleanup with targeted deleteMany before cleanupTestData() safety net"
    - "acquireSyncLock returns boolean (false = lock held), NOT rejection"

key-files:
  created:
    - backend/src/modules/contacts/services/__tests__/contact-sync.service.spec.ts
    - backend/src/modules/contacts/services/__tests__/relationship-score.service.spec.ts
    - backend/src/modules/contacts/services/__tests__/contacts-cache.service.spec.ts
    - backend/src/modules/contacts/services/__tests__/google-contacts-webhook.service.spec.ts
    - backend/src/modules/contacts/workers/__tests__/contacts-sync.worker.spec.ts
  modified: []

key-decisions:
  - "acquireSyncLock returns boolean not rejection — ContactSyncService returns 0 when lock=false, does not throw"
  - "QUEUE_PRESETS.CONTACTS_SYNC.attempts = 3; last-attempt test uses attemptsMade = MAX_ATTEMPTS - 1 = 2"
  - "GoogleContactsWebhookService.handleNotification does not check polling interval (only pollForChanges does)"
  - "ContactsCacheService flushdb() is safe in afterAll — Redis only spec, no shared DB rows"
  - "Workers __tests__ directory created under contacts/workers/ (did not exist)"

patterns-established:
  - "BullMQ worker processJob() test: do NOT call onModuleInit() to avoid Redis startup"
  - "Real Redis in cache tests: inject after construction via service['redis'] = testRedis"
  - "Contact cleanup order: providerConfig > user > tenant (FK cascade order)"

requirements-completed: [BTEST-02]

duration: 25min
completed: 2026-03-11
---

# Phase 68 Plan 02: Contacts Module Tests Summary

**Five spec files covering ContactSyncService, RelationshipScoreService, ContactsCacheService, GoogleContactsWebhookService, and ContactsSyncWorker — 29 tests proving sync lock flow, CRM scoring math on real DB, distributed Redis locking, polling interval gate, and BullMQ worker DLQ/alert paths**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-11T19:10:00Z
- **Completed:** 2026-03-11T19:35:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- ContactSyncService: proven lock acquire/release/contention paths and provider-scoped tenant guard using real DB provider rows
- RelationshipScoreService: real PostgreSQL rows prove recency decay, reciprocity scoring, and cross-tenant isolation
- ContactsCacheService: real Redis proves distributed lock NX behavior — second acquire returns false, release restores lock
- GoogleContactsWebhookService: handleNotification enqueues high-priority job; pollForChanges respects 5-minute interval gate
- ContactsSyncWorker: processJob() google/microsoft delegation, PROVIDER_NOT_FOUND/NOT_SUPPORTED guards, DLQ+alert only on last attempt

## Task Commits

1. **Task 1: ContactSyncService and RelationshipScoreService tests** - `c4f70e7d` (test)
2. **Task 2: ContactsCacheService and GoogleContactsWebhookService tests** - `cc04bd8c` (test)
3. **Task 3: ContactsSyncWorker processJob() tests** - `ddfa9ea4` (test)

## Files Created/Modified
- `backend/src/modules/contacts/services/__tests__/contact-sync.service.spec.ts` - 5 tests: lock paths, provider delegation, tenant guard
- `backend/src/modules/contacts/services/__tests__/relationship-score.service.spec.ts` - 6 tests: empty return, interaction shape, frequency, reciprocity, recency, cross-tenant
- `backend/src/modules/contacts/services/__tests__/contacts-cache.service.spec.ts` - 7 tests: set/get/invalidate, lock acquire/contention/release, isAvailable
- `backend/src/modules/contacts/services/__tests__/google-contacts-webhook.service.spec.ts` - 4 tests: handleNotification success/no-subscription, pollForChanges old/recent lastPollAt
- `backend/src/modules/contacts/workers/__tests__/contacts-sync.worker.spec.ts` - 6 tests: google/microsoft success, supportsContacts=false guard, not-found, DLQ on last attempt, no-DLQ on retry

## Decisions Made
- `acquireSyncLock` returns `boolean` not a rejection — ContactSyncService returns 0 when lock already held, and the plan's "mockRejectedValueOnce" instruction was wrong; corrected to use `mockResolvedValueOnce(false)` to match source behavior
- `QUEUE_PRESETS.CONTACTS_SYNC.attempts = 3`; last-attempt test uses `attemptsMade = 2` (MAX_ATTEMPTS - 1)
- `GoogleContactsWebhookService.handleNotification` does NOT check polling interval — only `pollForChanges` does; test plan description was inaccurate but source was followed
- `ContactsCacheService` Redis injection pattern: `service['redis'] = testRedis` bypasses `onModuleInit` cleanly
- Workers `__tests__` directory did not exist — created as part of Task 3

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's lock contention test used wrong mock method**
- **Found during:** Task 1 (ContactSyncService tests)
- **Issue:** Plan specified `mockContactsCache.acquireSyncLock.mockRejectedValueOnce(...)` but source code uses boolean return (true/false), not rejections
- **Fix:** Used `mockResolvedValueOnce(false)` to simulate lock contention; asserted `result === 0` not exception
- **Files modified:** contact-sync.service.spec.ts
- **Verification:** Test passes; service returns 0 and skips google.syncContacts call
- **Committed in:** c4f70e7d

**2. [Rule 1 - Bug] Import path for QUEUE_PRESETS in worker spec was wrong**
- **Found during:** Task 3 (ContactsSyncWorker tests)
- **Issue:** Plan template showed `../../../../../common/config` (5 levels up) but from `workers/__tests__/` it is 4 levels to `src/`
- **Fix:** Corrected to `../../../../common/config`
- **Files modified:** contacts-sync.worker.spec.ts
- **Verification:** Module resolved; tests pass
- **Committed in:** ddfa9ea4

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs in plan instructions)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- Neon DB advisory lock timeout (`P1002`) on globalSetup — transient Neon pooler contention; resolved by retrying
- Parallel Jest execution (without `--runInBand`) causes FK violations when one spec's `cleanupTestData()` truncates tenants while another spec runs concurrently — resolved with `--runInBand` for multi-spec runs; individual specs pass in any mode

## Next Phase Readiness
- All 5 contacts spec files pass: 29 tests, 0 failures
- TypeScript compiles clean
- Pattern for BullMQ worker testing established (protected processJob cast, no onModuleInit)
- Ready for Phase 68-03 (ProviderConfigService and ImapService tests)

## Self-Check: PASSED

Files exist:
- backend/src/modules/contacts/services/__tests__/contact-sync.service.spec.ts ✓
- backend/src/modules/contacts/services/__tests__/relationship-score.service.spec.ts ✓
- backend/src/modules/contacts/services/__tests__/contacts-cache.service.spec.ts ✓
- backend/src/modules/contacts/services/__tests__/google-contacts-webhook.service.spec.ts ✓
- backend/src/modules/contacts/workers/__tests__/contacts-sync.worker.spec.ts ✓

Commits exist:
- c4f70e7d ✓
- cc04bd8c ✓
- ddfa9ea4 ✓

---
*Phase: 68-backend-tests-complex-modules*
*Completed: 2026-03-11*
