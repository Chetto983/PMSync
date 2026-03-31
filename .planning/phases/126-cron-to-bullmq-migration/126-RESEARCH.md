# Phase 126: Cron-to-BullMQ Migration - Research

**Researched:** 2026-03-31
**Domain:** NestJS scheduled jobs migration (@Cron -> BullMQ repeatable jobs)
**Confidence:** HIGH

## Summary

The project already has a mature BullMQ scheduled jobs infrastructure (`ScheduledJobsQueueService`) with 18+ services already migrated to the `registerHandler` pattern. Four files still use `@Cron` decorators from `@nestjs/schedule`, totaling 8 cron-decorated methods. The migration is mechanical: remove `@Cron` decorators, add new `ScheduledJobType` enum entries, register handlers via `onModuleInit`, and add cron patterns to `SCHEDULED_JOB_PATTERNS`.

The existing infrastructure handles everything: repeatable job registration, single-instance execution via BullMQ's built-in deduplication, graceful shutdown, and job monitoring. No new libraries or architectural changes are needed.

**Primary recommendation:** Follow the exact pattern used by `LogRotationService`, `TelegramSchedulerService`, and 16 other services -- inject `ScheduledJobsQueueService`, call `registerHandler()` in `onModuleInit`, add enum values and cron patterns.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEGC-04 | All @Cron decorators migrated to BullMQ repeatable jobs (single-instance execution guaranteed) | 8 @Cron decorators found across 4 files; existing ScheduledJobsQueueService pattern handles all requirements; BullMQ repeatable jobs guarantee single-instance execution natively |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Post-Edit Validation:** After EVERY file edit, run `cd backend && npx tsc --noEmit` (type-check). Fix issues before moving on.
- **FOLLOW EXISTING PATTERNS.** Never invent new approaches when codebase patterns exist.
- **SCOPE CONTROL.** Do exactly what was asked. Never add unrequested features.
- **Multi-tenant rule:** Every query MUST include `tenantId`.
- **Max 500 lines per file.** No exceptions.
- **TRACE THE CHAIN.** Before wiring anything: Module > Provider > Import > Usage.

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | 5.71.0 | Job queue with repeatable jobs | Already used for 18+ scheduled jobs in the project |
| ioredis | (dep of bullmq) | Redis connection | Shared connection via `getSharedRedisConnection()` |

### Being Removed
| Library | Version | Purpose | Action |
|---------|---------|---------|--------|
| @nestjs/schedule | 6.1.1 | Cron decorators | Remove `@Cron` usage; keep package only if `ScheduleModule.forRoot()` is still needed by other decorators (check: it is NOT -- remove entirely) |

**Installation:** No new packages. Potentially remove `@nestjs/schedule` if no other decorators remain after migration.

## Architecture Patterns

### Existing Pattern (FOLLOW THIS EXACTLY)

The project has a well-established pattern for BullMQ scheduled jobs. Every migrated service follows this structure:

```typescript
// Source: backend/src/common/services/log-rotation.service.ts (canonical example)
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../common/services/scheduled-jobs.queue';

@Injectable()
export class MyService implements OnModuleInit {
  constructor(private readonly scheduledJobsQueue: ScheduledJobsQueueService) {}

  async onModuleInit() {
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.MY_JOB_TYPE,
      async () => this.myMethod(),
    );
  }

  async myMethod(): Promise<void> {
    // actual work
  }
}
```

### Migration Checklist Per File

1. Add new `ScheduledJobType` enum entries in `scheduled-jobs.queue.ts`
2. Add cron patterns to `SCHEDULED_JOB_PATTERNS` in `scheduled-jobs.queue.ts`
3. In the service file: remove `@Cron` import and decorators
4. Add `ScheduledJobsQueueService` injection + `implements OnModuleInit`
5. Call `registerHandler()` in `onModuleInit()`
6. Verify module imports (ScheduledJobsModule is `@Global`, so no explicit import needed)

### Anti-Patterns to Avoid
- **Creating new queues/workers for these jobs:** Use the existing `ScheduledJobsQueueService` -- it already has a dedicated queue and worker.
- **Using `@nestjs/bullmq` module registration:** The project uses raw `bullmq` with manual queue/worker creation, NOT the `@nestjs/bullmq` module.
- **Keeping ScheduleModule.forRoot():** After migration, remove it from `app.module.ts` and `email-sync.module.ts` if no `@Cron`/`@Interval`/`@Timeout` decorators remain.

## Inventory of @Cron Decorators to Migrate

### File 1: `backend/src/common/services/data-cleanup.service.ts` (4 decorators)

| Method | Schedule | Description |
|--------|----------|-------------|
| `cleanupExpiredData()` | `0 3 * * *` (daily 3 AM) | Main data cleanup (feedback, sessions, AI memories, etc.) |
| `cleanupOldAuditLogs()` | `0 4 * * 0` (Sunday 4 AM) | Audit log 3-year retention |
| `purgeExpiredAccountDeletions()` | `0 2 * * *` (daily 2 AM) | GDPR Art. 17 account purge |
| `cleanupExpiredDataExports()` | `30 3 * * *` (daily 3:30 AM) | GDPR Art. 20 export cleanup |

**Module:** `ScheduledJobsModule` (already provides `DataCleanupService` -- simplest wiring)

### File 2: `backend/src/modules/ai/services/cache-prewarming.service.ts` (2 decorators)

| Method | Schedule | Description |
|--------|----------|-------------|
| `warmCommonQueries()` | `0 6 * * *` (daily 6 AM) | Warm embedding cache per tenant |
| `warmTenantQueries()` | `0 */4 * * *` (every 4 hours) | Tenant-specific query warming |

**Module:** `AiModule` (already has access to `ScheduledJobsQueueService` since it's `@Global`)

### File 3: `backend/src/modules/crm/forecasting/forecast-refresh.cron.ts` (1 decorator)

| Method | Schedule | Description |
|--------|----------|-------------|
| `refreshAllForecasts()` | `0 2 * * 0` (Sunday 2 AM) | Weekly forecast snapshot refresh |

**Module:** `ForecastingModule`

### File 4: `backend/src/modules/crm/churn/churn-recompute.cron.ts` (1 decorator)

| Method | Schedule | Description |
|--------|----------|-------------|
| `recomputeAll()` | `0 3 * * 0` (Sunday 3 AM) | Weekly churn probability recompute |

**Module:** `ChurnModule`

### New ScheduledJobType Entries Required

```typescript
// Add to ScheduledJobType enum:
DATA_CLEANUP = 'data-cleanup',
DATA_CLEANUP_AUDIT_LOGS = 'data-cleanup-audit-logs',
DATA_CLEANUP_ACCOUNT_DELETIONS = 'data-cleanup-account-deletions',
DATA_CLEANUP_DATA_EXPORTS = 'data-cleanup-data-exports',
CACHE_PREWARM_COMMON = 'cache-prewarm-common',
CACHE_PREWARM_TENANT = 'cache-prewarm-tenant',
FORECAST_REFRESH = 'forecast-refresh',
CHURN_RECOMPUTE = 'churn-recompute',
```

### New SCHEDULED_JOB_PATTERNS Entries Required

```typescript
[ScheduledJobType.DATA_CLEANUP]: '0 3 * * *',
[ScheduledJobType.DATA_CLEANUP_AUDIT_LOGS]: '0 4 * * 0',
[ScheduledJobType.DATA_CLEANUP_ACCOUNT_DELETIONS]: '0 2 * * *',
[ScheduledJobType.DATA_CLEANUP_DATA_EXPORTS]: '30 3 * * *',
[ScheduledJobType.CACHE_PREWARM_COMMON]: '0 6 * * *',
[ScheduledJobType.CACHE_PREWARM_TENANT]: '0 */4 * * *',
[ScheduledJobType.FORECAST_REFRESH]: '0 2 * * 0',
[ScheduledJobType.CHURN_RECOMPUTE]: '0 3 * * 0',
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distributed cron locking | Redis-based distributed locks for cron | BullMQ repeatable jobs | BullMQ guarantees single execution natively; RedisLockService exists but is unnecessary for this |
| Job scheduling framework | Custom scheduler | `ScheduledJobsQueueService` | Already built, battle-tested with 18+ jobs |
| Job monitoring | Custom logging | Existing worker event handlers | `completed`, `failed`, `stalled` events already wired |

## Common Pitfalls

### Pitfall 1: Forgetting to remove ScheduleModule.forRoot()
**What goes wrong:** After removing all `@Cron` decorators, `ScheduleModule` continues to be imported unnecessarily, adding overhead.
**Why it happens:** Two files import it (`app.module.ts` line 62, `email-sync.module.ts` line 73). Easy to forget.
**How to avoid:** After confirming zero `@Cron`/`@Interval`/`@Timeout` decorators remain, remove `ScheduleModule.forRoot()` from both module files and uninstall `@nestjs/schedule`.
**Warning signs:** `grep -r "@nestjs/schedule" backend/src/` returns any results after migration.

### Pitfall 2: CronExpression vs string pattern mismatch
**What goes wrong:** `CronExpression.EVERY_4_HOURS` (from `@nestjs/schedule`) is `0 */4 * * *`. When migrating, you must use the string equivalent.
**Why it happens:** `CronExpression` enum won't exist after removing `@nestjs/schedule`.
**How to avoid:** Convert `CronExpression.EVERY_4_HOURS` to literal `'0 */4 * * *'` in the patterns map.

### Pitfall 3: DataCleanupService is in ScheduledJobsModule
**What goes wrong:** `DataCleanupService` is both a provider in `ScheduledJobsModule` AND the module that needs `ScheduledJobsQueueService`. This is fine because they're in the same module -- but be aware of circular dependency if refactoring.
**How to avoid:** Keep `DataCleanupService` in `ScheduledJobsModule` and inject `ScheduledJobsQueueService` directly (same module, no import needed).

### Pitfall 4: CRM cron files have `.cron.ts` suffix
**What goes wrong:** `forecast-refresh.cron.ts` and `churn-recompute.cron.ts` are dedicated cron files. After migration, the file name is misleading.
**How to avoid:** Either rename to `.service.ts` (preferred for consistency) or convert the class to register its handler via `onModuleInit` and keep the file name (less preferred but lower risk).

### Pitfall 5: Duplicate job registration on hot reload
**What goes wrong:** During development, NestJS hot reload calls `onModuleInit` again, potentially double-registering handlers.
**Why it happens:** BullMQ repeatable jobs are idempotent by job key, but handlers map would log warnings.
**How to avoid:** The existing `registerHandler` already handles this with a `warn` log and replacement. No action needed -- just awareness.

### Pitfall 6: Schedule conflict -- forecast-refresh and purgeExpiredAccountDeletions both at 2 AM
**What goes wrong:** Both `FORECAST_REFRESH` (`0 2 * * 0`) and `DATA_CLEANUP_ACCOUNT_DELETIONS` (`0 2 * * *`) fire at 2 AM. On Sundays they overlap.
**Why it happens:** This already exists in current `@Cron` setup.
**How to avoid:** This is not a new issue. BullMQ worker processes one job at a time (concurrency: 1), so they'll queue sequentially. Keep existing schedules to avoid behavior change.

## Code Examples

### Example 1: DataCleanupService migration pattern
```typescript
// Source: Derived from existing log-rotation.service.ts pattern
// backend/src/common/services/data-cleanup.service.ts (after migration)

import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
// REMOVED: import { Cron } from '@nestjs/schedule';
import { ScheduledJobsQueueService, ScheduledJobType } from './scheduled-jobs.queue';
import { PrismaService } from '../../prisma/prisma.service';
// ... other imports unchanged

@Injectable()
export class DataCleanupService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
    @Optional() @Inject(AccountDeletionService)
    private readonly accountDeletionService?: AccountDeletionService,
    @Optional() @Inject(DataExportService)
    private readonly dataExportService?: DataExportService,
  ) {}

  onModuleInit() {
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.DATA_CLEANUP,
      async () => { await this.cleanupExpiredData(); },
    );
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.DATA_CLEANUP_AUDIT_LOGS,
      async () => { await this.cleanupOldAuditLogs(); },
    );
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.DATA_CLEANUP_ACCOUNT_DELETIONS,
      async () => { await this.purgeExpiredAccountDeletions(); },
    );
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.DATA_CLEANUP_DATA_EXPORTS,
      async () => { await this.cleanupExpiredDataExports(); },
    );
    this.logger.log('Data cleanup handlers registered with BullMQ scheduler');
  }

  // Methods stay the same, just remove @Cron decorators
  async cleanupExpiredData(): Promise<CleanupResult> { /* unchanged */ }
  async cleanupOldAuditLogs(): Promise<number> { /* unchanged */ }
  // ... etc
}
```

### Example 2: CRM cron file migration (ForecastRefreshCron)
```typescript
// backend/src/modules/crm/forecasting/forecast-refresh.cron.ts (after migration)
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// REMOVED: import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledJobsQueueService, ScheduledJobType } from '../../../common/services/scheduled-jobs.queue';
import { PrismaService } from '../../../prisma/prisma.service';
import { ForecastService } from './forecast.service';

@Injectable()
export class ForecastRefreshCron implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly forecastService: ForecastService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
  ) {}

  onModuleInit() {
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.FORECAST_REFRESH,
      async () => this.refreshAllForecasts(),
    );
  }

  // Method unchanged, just @Cron decorator removed
  async refreshAllForecasts(): Promise<void> { /* unchanged */ }
}
```

## Post-Migration Cleanup

After all 8 decorators are migrated:

1. **Remove `@nestjs/schedule` imports from all files** (grep confirms zero references)
2. **Remove `ScheduleModule.forRoot()` from:**
   - `backend/src/app.module.ts` (line 62)
   - `backend/src/modules/email-sync/email-sync.module.ts` (line 73)
3. **Uninstall package:** `npm uninstall @nestjs/schedule`
4. **Verify:** `grep -r "@nestjs/schedule" backend/src/` returns nothing
5. **Verify:** `grep -r "@Cron" backend/src/` returns nothing

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | TypeScript compiler (tsc --noEmit) + grep verification |
| Config file | backend/tsconfig.json |
| Quick run command | `cd backend && npx tsc --noEmit` |
| Full suite command | `cd backend && npx tsc --noEmit && grep -r "@Cron" src/ && echo "FAIL: @Cron found" \|\| echo "PASS"` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEGC-04a | Zero @Cron decorators remain | grep audit | `grep -r "@Cron" backend/src/` (expect empty) | N/A (grep) |
| LEGC-04b | All jobs registered as BullMQ repeatable | code review | Check `ScheduledJobType` enum has 8 new entries | N/A (code review) |
| LEGC-04c | Schedules preserved identically | code review | Compare `SCHEDULED_JOB_PATTERNS` values to original `@Cron` strings | N/A (code review) |
| LEGC-04d | TypeScript compiles | unit | `cd backend && npx tsc --noEmit` | tsconfig.json exists |
| LEGC-04e | @nestjs/schedule removed | grep audit | `grep -r "@nestjs/schedule" backend/src/` (expect empty) | N/A (grep) |
| LEGC-04f | No duplicate execution | manual | Run two instances, check BullMQ logs | Manual verification |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit`
- **Per wave merge:** Full grep audit + type check
- **Phase gate:** All 5 automated checks pass

### Wave 0 Gaps
None -- existing test infrastructure (tsc + grep) covers all phase requirements.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis | BullMQ repeatable jobs | Assumed (existing jobs work) | -- | -- |
| bullmq | Job scheduling | Yes | 5.71.0 | -- |
| @nestjs/schedule | Being removed | Yes | 6.1.1 | -- |

No missing dependencies.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `backend/src/common/services/scheduled-jobs.queue.ts` -- existing BullMQ scheduled jobs infrastructure
- Codebase inspection: `backend/src/common/services/log-rotation.service.ts` -- canonical migration pattern
- Codebase inspection: 18 files already using `registerHandler()` pattern
- Codebase grep: 8 `@Cron` decorators across 4 files confirmed

### Secondary (MEDIUM confidence)
- BullMQ repeatable jobs guarantee single-instance execution via Redis atomic operations (well-documented BullMQ behavior)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, versions verified via `npm ls`
- Architecture: HIGH - 18+ services already follow the exact pattern being applied
- Pitfalls: HIGH - derived from actual codebase inspection, not theoretical

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable -- no version changes expected)
