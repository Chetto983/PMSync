# Calendar Module Refactoring Roadmap

## Overview

This roadmap outlines the systematic integration of `backend/src/common` utilities into the calendar module to eliminate code duplication, improve reliability, and ensure worker-safe operations.

**Current State**: The calendar module has grown organically with some custom implementations that duplicate common functionality. This refactoring will standardize patterns across the codebase.

**Estimated Effort**: 2-3 days (16-24 hours)

---

## Common Utilities Inventory

### Currently Used ✅

| Utility | File | Usage in Calendar |
|---------|------|-------------------|
| `getErrorMessage()` | `common/utils/error.utils.ts` | Error logging throughout |
| `getRedisConnectionOptions()` | `common/config/index.ts` | Queue initialization |
| `getDefaultJobOptions()` | `common/config/queue.config.ts` | Job configuration |
| `getWorkerOptions()` | `common/config/queue.config.ts` | Worker configuration |
| `QUEUE_NAMES` | `common/config/queue.config.ts` | Queue naming |
| `CryptoService` | `common/services/crypto.service.ts` | Token encryption |
| `RedisLockService` | `common/services/redis-lock.service.ts` | **Just Added** - Sync locking |

### Not Yet Used ❌

| Utility | File | Should Be Used For |
|---------|------|-------------------|
| `RetryService` | `common/services/retry.service.ts` | Replace `calendar/utils/retry.ts` |
| `BaseWorker` | `common/workers/base.worker.ts` | Replace custom worker boilerplate |
| `RedisRateLimiterService` | `common/services/redis-rate-limiter.service.ts` | API rate limiting |
| `DeadLetterQueueService` | `common/services/dead-letter-queue.service.ts` | Failed sync job handling |
| `AlertingService` | `common/services/alerting.service.ts` | Sync failure alerts |
| `CacheService` | `common/services/cache.service.ts` | Calendar list caching |
| `QueueHealthService` | `common/services/queue-health.service.ts` | Queue monitoring |
| `CorrelationContextService` | `common/services/correlation-context.service.ts` | Request tracing |
| `LogSanitizerService` | `common/services/log-sanitizer.service.ts` | PII protection in logs |
| `AuditService` | `common/services/audit.service.ts` | Sync operation audit trail |
| `WebhookValidationService` | `common/services/webhook-validation.service.ts` | Webhook security |

---

## Phase 1: Critical Fixes (COMPLETED)

### 1.1 Distributed Locking ✅
**Status**: Done

Added `RedisLockService` to prevent concurrent syncs:

```typescript
// abstract-calendar-sync.service.ts
async syncCalendar(providerId: string, forceFullSync = false): Promise<CalendarSyncResult> {
  return this.redisLock.withLock(
    `calendar:sync:${providerId}`,
    this.SYNC_LOCK_TTL_MS,
    async () => this.executeSyncWithinLock(providerId, forceFullSync),
  );
}
```

### 1.2 Bulk Job Duplicate Check ✅
**Status**: Done

Fixed `addBulkSyncJobs` to check all queues before adding jobs.

### 1.3 Null Safety for Token Encryption ✅
**Status**: Done

Added explicit null checks for `tokenEncryptionIv` in webhook services.

### 1.4 Transaction Timeout ✅
**Status**: Done

Reduced timeout from 60s to 30s to prevent connection pool exhaustion.

---

## Phase 2: Replace Custom Retry Logic (HIGH PRIORITY)

### 2.1 Remove Duplicate Retry Implementation

**Current Issue**: `calendar/utils/retry.ts` (~258 lines) duplicates `common/services/retry.service.ts` (~160 lines).

**Files to Modify**:
- `calendar/utils/retry.ts` - DELETE (or keep only calendar-specific extensions)
- `calendar/services/*-sync.service.ts` - Use common RetryService

**Implementation**:

```typescript
// google-calendar-sync.service.ts
import { RetryService } from '../../../common/services/retry.service';

@Injectable()
export class GoogleCalendarSyncService extends AbstractCalendarSyncService {
  constructor(
    // ... existing deps
    private readonly retryService: RetryService,
  ) {
    super(...);
  }

  protected async fetchCalendarList(accessToken: string): Promise<ProviderCalendar[]> {
    return this.retryService.withRetry(
      async () => {
        const calendar = this.createCalendarClient(accessToken);
        const calendarList = await calendar.calendarList.list();
        return this.mapCalendars(calendarList.data.items || []);
      },
      {
        maxAttempts: 3,
        loggerName: 'GoogleCalendarSync',
      }
    );
  }
}
```

**Effort**: 2-3 hours

---

## Phase 3: Migrate Worker to BaseWorker (HIGH PRIORITY)

### 3.1 Refactor CalendarSyncWorker

**Current Issue**: `calendar/workers/calendar-sync.worker.ts` (~260 lines) duplicates boilerplate from `common/workers/base.worker.ts` (~360 lines).

**Files to Modify**:
- `calendar/workers/calendar-sync.worker.ts` - Extend BaseWorker

**Implementation**:

```typescript
// calendar-sync.worker.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { BaseWorker, BaseWorkerConfig } from '../../../common/workers/base.worker';
import { PrismaService } from '../../../prisma/prisma.service';
import { GoogleCalendarSyncService } from '../services/google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from '../services/microsoft-calendar-sync.service';
import { CalendarSyncJobData, CalendarSyncJobResult } from '../services/calendar-sync-queue.service';
import { QUEUE_NAMES } from '../../../common/config';
import { getErrorMessage } from '../../../common/utils';

@Injectable()
export class CalendarSyncWorker extends BaseWorker<CalendarSyncJobData, CalendarSyncJobResult> {
  protected readonly logger = new Logger(CalendarSyncWorker.name);
  protected readonly workerName = 'calendar-sync';
  protected readonly envToggle = 'CALENDAR_SYNC_WORKERS_ENABLED';

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly googleCalendarSync: GoogleCalendarSyncService,
    private readonly microsoftCalendarSync: MicrosoftCalendarSyncService,
  ) {
    super(configService);
  }

  protected getWorkerConfig(): BaseWorkerConfig[] {
    // Return configs for all 3 priority queues
    return [
      { queueName: QUEUE_NAMES.CALENDAR_SYNC_HIGH, concurrency: 3, lockDuration: 300000 },
      { queueName: QUEUE_NAMES.CALENDAR_SYNC_NORMAL, concurrency: 5, lockDuration: 300000 },
      { queueName: QUEUE_NAMES.CALENDAR_SYNC_LOW, concurrency: 2, lockDuration: 300000 },
    ];
  }

  protected async processJob(job: Job<CalendarSyncJobData>): Promise<CalendarSyncJobResult> {
    const { providerId, providerType, email } = job.data;
    this.logger.log(`Processing calendar sync for ${email} (${providerType})`);

    const startTime = Date.now();

    // Delegate to provider-specific sync
    const result = await this.runProviderSync(job.data);

    // Update last synced timestamp
    await this.prisma.providerConfig.update({
      where: { id: providerId },
      data: { lastSyncedAt: new Date() },
    });

    return {
      success: true,
      providerId,
      eventsProcessed: result.eventsProcessed,
      newEvents: result.newEvents,
      updatedEvents: result.updatedEvents,
      deletedEvents: result.deletedEvents,
      syncDuration: Date.now() - startTime,
    };
  }

  protected formatCompletedLog(job: Job<CalendarSyncJobData>, result: CalendarSyncJobResult): string {
    return `${job.data.email}: ${result.eventsProcessed} events (${result.newEvents} new, ${result.updatedEvents} updated)`;
  }

  protected formatFailedLog(job: Job<CalendarSyncJobData> | undefined, error: Error): string {
    return `${job?.data?.email || 'unknown'} failed: ${error.message}`;
  }

  private async runProviderSync(jobData: CalendarSyncJobData) {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: jobData.providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${jobData.providerId} not found`);
    }

    switch (provider.providerType) {
      case 'google':
        return this.googleCalendarSync.syncCalendar(jobData.providerId);
      case 'microsoft':
        return this.microsoftCalendarSync.syncCalendar(jobData.providerId);
      default:
        throw new Error(`Unsupported provider type: ${provider.providerType}`);
    }
  }
}
```

**Benefits**:
- Automatic Redis connection management
- Built-in graceful shutdown with job draining
- Consistent event logging
- Stalled job detection
- `withTimeout()` utility for API calls
- `generateLockKey()` for distributed locking
- `validateProviderType()` for security

**Effort**: 2-3 hours

---

## Phase 4: Add Rate Limiting (HIGH PRIORITY)

### 4.1 Integrate Provider Rate Limiting

**Current Issue**: API calls to Google/Microsoft have no rate limiting, risking 429 errors.

**Option A**: Use `RedisLockService.checkProviderRateLimit()` (already available)

```typescript
// google-calendar-sync.service.ts
protected async fetchCalendarList(accessToken: string): Promise<ProviderCalendar[]> {
  // Check rate limit before API call
  const allowed = await this.redisLock.checkProviderRateLimit(this.providerId, 'google');
  if (!allowed) {
    throw new Error('Rate limit exceeded for Google Calendar API');
  }

  const calendar = this.createCalendarClient(accessToken);
  return calendar.calendarList.list();
}
```

**Option B**: Use `RedisRateLimiterService` for more granular control

```typescript
// calendar.module.ts
import { RedisRateLimiterService } from '../../common/services/redis-rate-limiter.service';

@Module({
  providers: [
    RedisRateLimiterService,
    // ...
  ],
})
```

```typescript
// google-calendar-sync.service.ts
constructor(
  private readonly rateLimiter: RedisRateLimiterService,
) {}

protected async fetchCalendarList(accessToken: string): Promise<ProviderCalendar[]> {
  const result = await this.rateLimiter.checkRateLimit(
    `google:calendar:${this.providerId}`,
    100,  // max requests
    60,   // per 60 seconds
  );

  if (!result.allowed) {
    throw new Error(`Rate limited. Retry after ${result.retryAfterSeconds}s`);
  }

  // Proceed with API call
}
```

**Effort**: 2-3 hours

---

## Phase 5: Dead Letter Queue Integration (MEDIUM PRIORITY)

### 5.1 Handle Permanently Failed Sync Jobs

**Current Issue**: Failed sync jobs are retried but eventually dropped with no visibility.

**Implementation**:

```typescript
// calendar-sync.worker.ts
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';

@Injectable()
export class CalendarSyncWorker extends BaseWorker<CalendarSyncJobData, CalendarSyncJobResult> {
  constructor(
    private readonly dlq: DeadLetterQueueService,
  ) {
    super(configService);
  }

  protected async processJob(job: Job<CalendarSyncJobData>): Promise<CalendarSyncJobResult> {
    try {
      return await this.executeSync(job);
    } catch (error) {
      // Check if this is the final attempt
      if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
        await this.dlq.addToDeadLetter(
          job.id!,
          job.queueName,
          job.data,
          error as Error,
          job.attemptsMade,
          { provider: job.data.providerType, email: job.data.email },
        );
      }
      throw error;
    }
  }
}
```

**Effort**: 1-2 hours

---

## Phase 6: Alerting Integration (MEDIUM PRIORITY)

### 6.1 Add Sync Failure Alerts

**Implementation**:

```typescript
// calendar-sync-queue.service.ts
import { AlertingService } from '../../../common/services/alerting.service';

@Injectable()
export class CalendarSyncQueueService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly alerting: AlertingService,
  ) {}

  private setupQueueEvents() {
    // ... existing code

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.metrics[priority].failed++;

      // Check for auth errors (critical)
      if (failedReason?.includes('401') || failedReason?.includes('unauthorized')) {
        const alert = this.alerting.checkAuthErrors(1);
        if (alert) {
          this.logger.error(`ALERT: ${alert.message}`);
        }
      }
    });
  }
}
```

**Effort**: 1-2 hours

---

## Phase 7: Caching for Calendar Lists (LOW PRIORITY)

### 7.1 Cache Calendar Metadata

**Current Issue**: Calendar list is fetched on every sync, even if unchanged.

**Implementation**:

```typescript
// abstract-calendar-sync.service.ts
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';

export abstract class AbstractCalendarSyncService {
  constructor(
    private readonly cache: CacheService,
  ) {}

  protected async getCachedCalendarList(
    providerId: string,
    accessToken: string,
  ): Promise<ProviderCalendar[]> {
    const cacheKey = `calendar:list:${providerId}`;

    // Try cache first
    const cached = await this.cache.get<ProviderCalendar[]>(cacheKey, {
      namespace: CacheNamespace.PROVIDER_TOKEN,
    });

    if (cached) {
      return cached;
    }

    // Fetch from API
    const calendars = await this.fetchCalendarList(accessToken);

    // Cache for 5 minutes
    await this.cache.set(cacheKey, calendars, {
      namespace: CacheNamespace.PROVIDER_TOKEN,
      ttl: 300,
    });

    return calendars;
  }
}
```

**Effort**: 1 hour

---

## Phase 8: Audit Trail (LOW PRIORITY)

### 8.1 Add Sync Audit Logging

**Implementation**:

```typescript
// abstract-calendar-sync.service.ts
import { AuditService } from '../../../common/services/audit.service';

export abstract class AbstractCalendarSyncService {
  constructor(
    private readonly audit: AuditService,
  ) {}

  async syncCalendar(providerId: string, forceFullSync = false): Promise<CalendarSyncResult> {
    const result = await this.redisLock.withLock(...);

    // Audit log the sync operation
    await this.audit.log({
      action: 'calendar_sync',
      providerId,
      syncType: result.syncType,
      eventsProcessed: result.eventsProcessed,
      newEvents: result.newEvents,
      updatedEvents: result.updatedEvents,
      deletedEvents: result.deletedEvents,
      duration: result.syncDuration,
    });

    return result;
  }
}
```

**Effort**: 1 hour

---

## Phase 9: Correlation Tracing (LOW PRIORITY)

### 9.1 Add Request Correlation IDs

**Implementation**:

```typescript
// calendar.controller.ts
import { CorrelationInterceptor } from '../../../common/interceptors/correlation.interceptor';

@Controller('calendar')
@UseInterceptors(CorrelationInterceptor)
export class CalendarController {
  // Requests now have correlation IDs for tracing
}
```

```typescript
// calendar-sync.worker.ts
import { CorrelationContextService } from '../../../common/services/correlation-context.service';

protected async processJob(job: Job<CalendarSyncJobData>): Promise<CalendarSyncJobResult> {
  // Set correlation ID from job metadata
  this.correlationContext.setCorrelationId(job.id || nanoid());

  try {
    return await this.executeSync(job);
  } finally {
    this.correlationContext.clear();
  }
}
```

**Effort**: 1 hour

---

## Phase 10: Queue Health Monitoring (LOW PRIORITY)

### 10.1 Add Health Check Endpoint

**Implementation**:

```typescript
// calendar.controller.ts
import { QueueHealthService } from '../../../common/services/queue-health.service';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly queueHealth: QueueHealthService,
  ) {}

  @Get('queue-health')
  async getQueueHealth() {
    return {
      high: await this.queueHealth.getQueueStats(QUEUE_NAMES.CALENDAR_SYNC_HIGH),
      normal: await this.queueHealth.getQueueStats(QUEUE_NAMES.CALENDAR_SYNC_NORMAL),
      low: await this.queueHealth.getQueueStats(QUEUE_NAMES.CALENDAR_SYNC_LOW),
    };
  }
}
```

**Effort**: 30 minutes

---

## Summary Timeline

| Phase | Priority | Effort | Status |
|-------|----------|--------|--------|
| Phase 1: Critical Fixes | Critical | 4h | ✅ DONE |
| Phase 2: Replace Retry Logic | High | 3h | Pending |
| Phase 3: Migrate to BaseWorker | High | 3h | Pending |
| Phase 4: Add Rate Limiting | High | 3h | Pending |
| Phase 5: DLQ Integration | Medium | 2h | Pending |
| Phase 6: Alerting | Medium | 2h | Pending |
| Phase 7: Calendar Caching | Low | 1h | Pending |
| Phase 8: Audit Trail | Low | 1h | Pending |
| Phase 9: Correlation Tracing | Low | 1h | Pending |
| Phase 10: Queue Health | Low | 0.5h | Pending |

**Total Remaining Effort**: ~16.5 hours

---

## Module Dependencies Update

After all phases, update `calendar.module.ts`:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { ScheduledJobsModule } from '../../common/services/scheduled-jobs.module';
import { CacheModule } from '../../common/services/cache.module';
import { RedisRateLimiterService } from '../../common/services/redis-rate-limiter.service';
import { DeadLetterQueueService } from '../../common/services/dead-letter-queue.service';
import { AlertingService } from '../../common/services/alerting.service';
import { QueueHealthService } from '../../common/services/queue-health.service';
import { AuditService } from '../../common/services/audit.service';
import { CorrelationContextService } from '../../common/services/correlation-context.service';
import { RetryService } from '../../common/services/retry.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ProvidersModule),
    RealtimeModule,
    EmailSyncModule,
    ScheduledJobsModule, // For RedisLockService (already @Global)
    CacheModule,         // For CacheService
  ],
  providers: [
    // Common services (inject as needed)
    RedisRateLimiterService,
    DeadLetterQueueService,
    AlertingService,
    QueueHealthService,
    AuditService,
    CorrelationContextService,
    RetryService,

    // Calendar services
    CalendarService,
    CalendarListService,
    CalendarEventsService,
    GoogleCalendarSyncService,
    MicrosoftCalendarSyncService,
    GoogleCalendarWebhookService,
    MicrosoftCalendarWebhookService,
    CalendarSyncQueueService,
    CalendarSyncWorker,
    IcsParserService,
    IcsGeneratorService,
    CalendarProviderFactory,
  ],
  // ...
})
export class CalendarModule {}
```

---

## Testing Checklist

After each phase:

- [ ] Run `npm run test` - All tests pass
- [ ] Run `npm run lint` - No linting errors
- [ ] Run `npm run typecheck` - No type errors
- [ ] Manual test: Sync Google calendar
- [ ] Manual test: Sync Microsoft calendar
- [ ] Manual test: Webhook notifications
- [ ] Check logs for proper correlation IDs
- [ ] Verify no duplicate sync jobs
- [ ] Verify rate limiting works
- [ ] Verify DLQ captures failures

---

## Rollback Plan

Each phase is independent and can be rolled back by:

1. Reverting the specific file changes
2. Removing new dependencies from `calendar.module.ts`
3. Restarting the service

Keep backup of original files before each phase.
