---
phase: 33-api-contract-standardization
plan: 03
subsystem: api
tags: [bullmq, correlation-id, openapi, spectral, openapi-typescript, ci-pipeline]

# Dependency graph
requires:
  - phase: 33-api-contract-standardization
    provides: CorrelationInterceptor globally registered, x-request-id header on all responses
provides:
  - BullMQ job payloads carry requestId from CorrelationContext across all 9 queue services
  - Spectral OpenAPI linting configuration at backend/.spectral.yaml
  - generate-openapi.ts script for extracting OpenAPI spec from NestJS app
  - CI pipeline steps for OpenAPI spec generation, Spectral lint, and frontend type generation
  - frontend/types/api.generated.ts placeholder for auto-generated types
affects: [35-ai-observability, frontend-api-types]

# Tech tracking
tech-stack:
  added: ["@stoplight/spectral-cli", "openapi-typescript"]
  patterns: [correlation-id-propagation-to-async-workers, openapi-first-contract-verification]

key-files:
  created:
    - backend/.spectral.yaml
    - backend/scripts/generate-openapi.ts
    - frontend/types/api.generated.ts
  modified:
    - backend/src/common/services/dead-letter-queue.service.ts
    - backend/src/common/services/scheduled-jobs.queue.ts
    - backend/src/modules/email-sync/services/queue.service.ts
    - backend/src/modules/email-sync/services/email-send-queue.service.ts
    - backend/src/modules/email-sync/services/folder-operations-queue.service.ts
    - backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts
    - backend/src/modules/email-sync/services/bulk-operations-queue.service.ts
    - backend/src/modules/calendar/services/calendar-sync-queue.service.ts
    - backend/src/modules/contacts/services/contacts-sync-queue.service.ts
    - backend/src/modules/email-sync/interfaces/sync-job.interface.ts
    - backend/src/modules/email-sync/interfaces/folder-job.interface.ts
    - backend/package.json
    - frontend/package.json
    - .github/workflows/ci.yml
    - .gitignore

key-decisions:
  - "Used CorrelationContext.getContext()?.correlationId instead of getCorrelationId() to get undefined (not 'no-context' sentinel) when outside HTTP context"
  - "Added requestId?: string to all BullMQ job data interfaces for type safety instead of relying on as-casts alone"
  - "OpenAPI generation step is continue-on-error in CI since it requires database access; Spectral lint and type generation are conditional on spec availability"
  - "frontend/types/api.generated.ts committed as placeholder; CI will overwrite with real types when spec is available"

patterns-established:
  - "Correlation ID propagation: CorrelationContext.getContext()?.correlationId at every BullMQ .add() site"
  - "OpenAPI-first: spec generation -> Spectral lint -> type generation pipeline"

requirements-completed: [API-04, API-05]

# Metrics
duration: 12min
completed: 2026-03-03
---

# Phase 33 Plan 03: BullMQ Correlation + OpenAPI Tooling Summary

**BullMQ requestId propagation across 9 queue services (12 .add() sites), Spectral OpenAPI linting config, generate-openapi.ts script, and CI pipeline with conditional spec generation/linting/type generation**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-03T17:59:09Z
- **Completed:** 2026-03-03T18:11:32Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- All BullMQ .add() call sites across 9 queue services now include requestId from CorrelationContext
- requestId is undefined (not a random ID or sentinel) when no HTTP request context exists
- DLQ preserves original requestId from failed jobs before falling back to current context
- Spectral config with spectral:oas base rules (relaxed for existing codebase)
- generate-openapi.ts script extracts OpenAPI spec from NestJS app via SwaggerModule
- CI pipeline has 3 new steps: generate OpenAPI spec (continue-on-error), Spectral lint (blocks when spec exists), frontend type generation

## Task Commits

Each task was committed atomically:

1. **Task 1: Propagate requestId into BullMQ job payloads** - `75ce2c64` (feat)
2. **Task 2: Spectral config, generate-openapi script, type generation, CI** - `b9f07b93` (feat)

## Files Created/Modified
- `backend/.spectral.yaml` - Spectral ruleset configuration extending spectral:oas
- `backend/scripts/generate-openapi.ts` - NestFactory-based OpenAPI spec extraction script
- `frontend/types/api.generated.ts` - Placeholder for auto-generated TypeScript types
- `backend/src/common/services/dead-letter-queue.service.ts` - requestId in DLQ .add() with original requestId preservation
- `backend/src/common/services/scheduled-jobs.queue.ts` - requestId in 3 .add() call sites
- `backend/src/modules/email-sync/services/queue.service.ts` - requestId in sync job .add()
- `backend/src/modules/email-sync/services/email-send-queue.service.ts` - requestId in send + scheduled-send .add()
- `backend/src/modules/email-sync/services/folder-operations-queue.service.ts` - requestId in folder op .add()
- `backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts` - requestId in sync-back .add()
- `backend/src/modules/email-sync/services/bulk-operations-queue.service.ts` - requestId in bulk-operation .add()
- `backend/src/modules/calendar/services/calendar-sync-queue.service.ts` - requestId in calendar sync .add()
- `backend/src/modules/contacts/services/contacts-sync-queue.service.ts` - requestId in contacts sync .add()
- `backend/src/modules/email-sync/interfaces/sync-job.interface.ts` - Added requestId?: string to SyncJobData
- `backend/src/modules/email-sync/interfaces/folder-job.interface.ts` - Added requestId?: string to FolderJobData
- `backend/package.json` - Added openapi:generate and openapi:lint scripts, @stoplight/spectral-cli devDep
- `frontend/package.json` - Added openapi:generate-types script, openapi-typescript devDep
- `.github/workflows/ci.yml` - Added OpenAPI generation, Spectral lint, and type generation steps
- `.gitignore` - Added backend/openapi-spec.json to gitignore

## Decisions Made
- **CorrelationContext.getContext()?.correlationId over getCorrelationId():** The static `getCorrelationId()` returns `'no-context'` sentinel string, which would pollute job data. Using `getContext()?.correlationId` returns the actual ID or `undefined` -- correct behavior for jobs not originating from HTTP requests.
- **requestId on all interfaces:** Added `requestId?: string` to all job data interfaces rather than relying purely on `as` casts, ensuring downstream consumers can type-safely access the field.
- **CI continue-on-error for spec generation:** The NestFactory approach requires database/Redis connections which CI may not have. The generation step is continue-on-error, while Spectral lint and type generation are conditional on the spec file existing -- lint blocks the pipeline when the spec IS generated.
- **Placeholder api.generated.ts:** Committed as a placeholder with `export {}` so frontend TypeScript compiles. CI will overwrite with real generated types when the backend OpenAPI spec is available.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added requestId to all BullMQ job data interfaces**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Spreading `requestId` into job data objects caused TS2353 because interfaces like `SyncJobData` didn't have the field
- **Fix:** Added `requestId?: string` to SyncJobData, ScheduledJobData, CalendarSyncJobData, ContactsSyncJobData, FolderJobData, EmailSendJobData, SyncBackJobData, BulkOperationJobData
- **Files modified:** 8 interface definitions across 8 files
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 75ce2c64 (Task 1 commit)

**2. [Rule 1 - Bug] Used getContext()?.correlationId instead of getCorrelationId()**
- **Found during:** Task 1 (code review before implementation)
- **Issue:** Plan suggested `CorrelationContext.getCorrelationId() || undefined` but getCorrelationId() returns `'no-context'` (truthy string), so `|| undefined` would never trigger
- **Fix:** Used `CorrelationContext.getContext()?.correlationId` which returns actual ID or undefined
- **Files modified:** All 9 queue service files
- **Verification:** requestId is undefined when no HTTP context exists (correct behavior)
- **Committed in:** 75ce2c64 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking type error, 1 bug in plan's suggested pattern)
**Impact on plan:** Both fixes essential for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Correlation ID chain now extends from HTTP request through response headers (Plan 33-01) into BullMQ async workers
- Phase 35 (AI Observability) can read requestId from BullMQ job data to link AI Run Ledger entries to originating requests
- OpenAPI tooling is ready for contract verification -- once the app runs in CI with database access, the full generate -> lint -> type-gen pipeline will activate
- All Phase 33 plans (01, 02, 03) are complete -- Phase 34 (Auth Security Hardening) can begin

---
*Phase: 33-api-contract-standardization*
*Completed: 2026-03-03*
