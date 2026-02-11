---
phase: 16-data-rights-legal-documents
plan: 03
subsystem: api, compliance, database
tags: [nestjs, gdpr, article-17, soft-delete, cron, prisma-cascade]

# Dependency graph
requires:
  - phase: 16-01
    provides: "ComplianceModule, LegalAcceptanceService, AuditModule patterns"
provides:
  - "AccountDeletionService with requestDeletion, cancelDeletion, purgeExpiredDeletions, hardDeleteUser"
  - "DataDeletionController with POST, GET /status, DELETE /cancel endpoints"
  - "Daily 2 AM cron in DataCleanupService for expired account purge"
affects: [16-04]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Soft-delete-then-purge with 30-day grace period", "Prisma batched transaction for atomic deactivation", "forwardRef for cross-module cron DI"]

key-files:
  created:
    - "backend/src/modules/compliance/dto/data-deletion.dto.ts"
    - "backend/src/modules/compliance/services/account-deletion.service.ts"
    - "backend/src/modules/compliance/controllers/data-deletion.controller.ts"
  modified:
    - "backend/src/modules/compliance/compliance.module.ts"
    - "backend/src/common/services/data-cleanup.service.ts"
    - "backend/src/common/services/scheduled-jobs.module.ts"

key-decisions:
  - "forwardRef ComplianceModule in ScheduledJobsModule for cross-module cron injection"
  - "@Optional() @Inject() AccountDeletionService in DataCleanupService for graceful degradation"
  - "AuditModule imported in ComplianceModule for deletion audit trail"

patterns-established:
  - "Soft-delete-then-purge: set deletedAt + deactivate, cron hard-deletes after grace period"
  - "Batched $transaction: atomic user update + session invalidation without sequential callback"

# Metrics
duration: 8min
completed: 2026-02-11
---

# Phase 16 Plan 03: Account Deletion with Grace Period Summary

**GDPR Article 17 right to erasure with 30-day soft-delete grace period, cancellation support, and daily cron purge via Prisma cascade**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-11T14:22:54Z
- **Completed:** 2026-02-11T14:30:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- AccountDeletionService: atomic soft-delete (deactivate + session invalidation), cancellation within 30 days, hard-delete via Prisma cascade
- DataDeletionController: POST request, GET /status, DELETE /cancel REST endpoints with JWT + Tenant guards
- Daily 2 AM purge cron in DataCleanupService finds and hard-deletes users past the 30-day grace period
- Audit trail captures DELETION_REQUESTED and DELETION_CANCELLED events

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AccountDeletionService with soft-delete and hard-purge logic** - `9f2d4483` (feat)
2. **Task 2: Create DataDeletionController, wire into module, add purge cron** - `1a93e354` (feat)

## Files Created/Modified
- `backend/src/modules/compliance/dto/data-deletion.dto.ts` - DeletionStatusDto and DeletionResponseDto
- `backend/src/modules/compliance/services/account-deletion.service.ts` - requestDeletion, cancelDeletion, purgeExpiredDeletions, hardDeleteUser
- `backend/src/modules/compliance/controllers/data-deletion.controller.ts` - POST, GET /status, DELETE /cancel endpoints
- `backend/src/modules/compliance/compliance.module.ts` - Wired AccountDeletionService, DataDeletionController, AuditModule
- `backend/src/common/services/data-cleanup.service.ts` - Added 2 AM purge cron for expired deletions
- `backend/src/common/services/scheduled-jobs.module.ts` - Added forwardRef ComplianceModule import for DI

## Decisions Made
- **forwardRef for cross-module cron DI:** ScheduledJobsModule (global) needs AccountDeletionService from ComplianceModule. Used forwardRef to avoid circular dependency since ComplianceModule doesn't depend on ScheduledJobsModule directly.
- **@Optional() @Inject() for graceful degradation:** DataCleanupService uses optional injection so cron skips purge if ComplianceModule is unavailable.
- **AuditModule imported in ComplianceModule:** Required for AuditService injection in AccountDeletionService (not global, needs explicit import).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added forwardRef ComplianceModule import to ScheduledJobsModule**
- **Found during:** Task 2 (wiring purge cron)
- **Issue:** DataCleanupService lives in ScheduledJobsModule (@Global). To inject AccountDeletionService from ComplianceModule, the module dependency must be declared. Plan didn't specify this cross-module wiring.
- **Fix:** Added `forwardRef(() => ComplianceModule)` to ScheduledJobsModule imports
- **Files modified:** `backend/src/common/services/scheduled-jobs.module.ts`
- **Verification:** Type-check passes, DI resolution works
- **Committed in:** `1a93e354` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for DI resolution. Without the module import, AccountDeletionService injection would silently fail. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Account deletion endpoints ready for Plan 16-04 (unit tests)
- AccountDeletionService exported from ComplianceModule for consumer use
- Purge cron registered and will run automatically once deployed

## Self-Check: PASSED

- All 6 files verified present on disk
- Commit `9f2d4483` (Task 1) verified in git log
- Commit `1a93e354` (Task 2) verified in git log
- TypeScript type-check: passed
- UsersService.deleteUserAccount(): NOT modified (verified via git diff)

---
*Phase: 16-data-rights-legal-documents*
*Completed: 2026-02-11*
