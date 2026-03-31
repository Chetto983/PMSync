---
phase: 126-cron-to-bullmq-migration
plan: 01
subsystem: infra
tags: [bullmq, cron, nestjs, horizontal-scaling, scheduled-jobs]

requires:
  - phase: none
    provides: existing ScheduledJobsQueueService registerHandler pattern
provides:
  - "8 new ScheduledJobType enum entries for migrated cron jobs"
  - "8 new SCHEDULED_JOB_PATTERNS cron strings"
  - "4 service files migrated from @Cron decorators to BullMQ registerHandler"
affects: [horizontal-scaling, bullmq-tuning]

tech-stack:
  added: []
  patterns: ["BullMQ registerHandler pattern applied to all remaining @Cron services"]

key-files:
  created: []
  modified:
    - backend/src/common/services/scheduled-jobs.queue.ts
    - backend/src/common/services/data-cleanup.service.ts
    - backend/src/modules/ai/services/cache-prewarming.service.ts
    - backend/src/modules/crm/forecasting/forecast-refresh.cron.ts
    - backend/src/modules/crm/churn/churn-recompute.cron.ts
    - backend/src/common/services/data-cleanup.ai-chat.test.ts

key-decisions:
  - "Used string literals for cron patterns (not CronExpression enum) to match SCHEDULED_JOB_PATTERNS convention"
  - "Kept .cron.ts file suffix on CRM files per research recommendation (lower risk than renaming)"
  - "ScheduledJobsQueueService injected via @Global ScheduledJobsModule -- no module import changes needed"

patterns-established:
  - "All scheduled jobs now use BullMQ registerHandler -- zero @Cron decorators in codebase"

requirements-completed: [LEGC-04]

duration: 5min
completed: 2026-03-31
---

# Phase 126 Plan 01: Cron-to-BullMQ Migration Summary

**All 8 @Cron decorators across 4 service files replaced with BullMQ registerHandler calls for single-instance execution on Railway horizontal scaling**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T09:05:27Z
- **Completed:** 2026-03-31T09:10:50Z
- **Tasks:** 3/3
- **Files modified:** 6

## Accomplishments

### Task 1: Add 8 new ScheduledJobType entries and cron patterns
- Added 8 entries to `ScheduledJobType` enum: DATA_CLEANUP, DATA_CLEANUP_AUDIT_LOGS, DATA_CLEANUP_ACCOUNT_DELETIONS, DATA_CLEANUP_DATA_EXPORTS, CACHE_PREWARM_COMMON, CACHE_PREWARM_TENANT, FORECAST_REFRESH, CHURN_RECOMPUTE
- Added 8 matching cron patterns to `SCHEDULED_JOB_PATTERNS` with identical schedules to original @Cron values
- Commit: `79caba9e`

### Task 2: Migrate data-cleanup.service.ts and cache-prewarming.service.ts
- Removed 4 @Cron decorators from data-cleanup.service.ts, registered 4 handlers via BullMQ in onModuleInit
- Removed 2 @Cron decorators from cache-prewarming.service.ts, registered 2 handlers via BullMQ in onModuleInit
- Preserved enabled check and setTimeout initial warm-up in cache-prewarming
- Commit: `6d6b646f`

### Task 3: Migrate forecast-refresh.cron.ts and churn-recompute.cron.ts
- Removed @Cron from forecast-refresh.cron.ts, added OnModuleInit + registerHandler for FORECAST_REFRESH
- Removed @Cron from churn-recompute.cron.ts, added OnModuleInit + registerHandler for CHURN_RECOMPUTE
- File names (.cron.ts) and class names preserved per research recommendation
- Commit: `f84ffb9d`

## Verification

1. `grep -r "@Cron" backend/src/ --include="*.ts"` -- zero @Cron decorators remain (only comment references)
2. `grep -r "from '@nestjs/schedule'" backend/src/ --include="*.ts"` -- only module files (app.module.ts, email-sync.module.ts)
3. `npx tsc --noEmit` -- exits 0 (clean compile)
4. ScheduledJobType enum has 8 new entries (28 total)
5. SCHEDULED_JOB_PATTERNS has 8 new cron strings matching originals exactly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated test constructor args for DataCleanupService**
- **Found during:** Task 2
- **Issue:** `data-cleanup.ai-chat.test.ts` instantiated DataCleanupService with 1 arg; constructor now requires ScheduledJobsQueueService as 2nd param
- **Fix:** Added mock ScheduledJobsQueueService to test constructor call
- **Files modified:** backend/src/common/services/data-cleanup.ai-chat.test.ts
- **Commit:** `6d6b646f`

## Known Stubs

None -- all handlers are wired to existing method implementations.

## Self-Check: PASSED

- All 5 modified files exist on disk
- All 3 task commits verified in git log (79caba9e, 6d6b646f, f84ffb9d)
