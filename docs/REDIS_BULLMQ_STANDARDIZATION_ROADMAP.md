# Redis & BullMQ Standardization Roadmap

**Last Updated**: 2025-12-08
**Status**: Phase 1-5 COMPLETE

## 1. Executive Summary

This document provides a comprehensive audit of all Redis and BullMQ usage across the MailAgent backend, with a standardization roadmap to ensure consistent configuration, improved maintainability, and scalability for 10,000+ users.

### Goals
- Centralize all Redis/BullMQ configuration in `common/config/`
- Standardize queue presets (attempts, backoff, retention)
- Standardize worker presets (concurrency, lock duration, rate limiting)
- Add queue integration to modules that need background processing
- Implement observability and monitoring

## 2. Current State Audit

### 2.1. Redis/BullMQ File Inventory

| File | Type | Config Source | Status |
|------|------|---------------|--------|
| **AI Module** |
| `ai/services/email-embedding.queue.ts` | Queue | ✅ Centralized | Complete |
| `ai/services/query-embedding-cache.service.ts` | Redis Direct | ✅ Centralized | Complete |
| `ai/services/feedback-queue.service.ts` | Queue | ✅ Centralized | Complete |
| `ai/voltagent/services/ai-queue.service.ts` | Queue | ✅ Centralized | Complete |
| `workers/ai.worker.ts` | Worker (standalone) | ✅ Centralized | Complete |
| **Email-Sync Module** |
| `email-sync/services/queue.service.ts` | Queue | ✅ Centralized | Complete |
| `email-sync/services/folder-operations-queue.service.ts` | Queue | ✅ Centralized | Complete |
| `email-sync/services/email-send-queue.service.ts` | Queue | ✅ Centralized | Complete |
| `email-sync/services/provider-sync-back-queue.service.ts` | Queue | ✅ Centralized | Complete |
| `email-sync/services/bulk-operations-queue.service.ts` | Queue | ✅ Centralized | Complete |
| `email-sync/workers/sync.worker.ts` | Worker | ✅ Centralized | Complete |
| `email-sync/workers/folder-operations.worker.ts` | Worker | ✅ Centralized | Complete |
| **Contacts Module** |
| `contacts/services/contacts-sync-queue.service.ts` | Queue | ✅ Centralized | Complete |
| `contacts/workers/contacts-sync.worker.ts` | Worker | ✅ Centralized | Complete |
| **Common Services** |
| `common/services/dead-letter-queue.service.ts` | Queue | ✅ Centralized | Complete |
| `common/services/cache.service.ts` | Redis Direct | ❌ Different Client | Needs Review |
| **Calendar Module** |
| `calendar/services/calendar-sync-queue.service.ts` | Queue | ✅ Centralized | Complete |
| `calendar/workers/calendar-sync.worker.ts` | Worker | ✅ Centralized | Complete |
| `calendar/services/google-calendar-sync.service.ts` | Sync Service | N/A | Integrated |
| `calendar/services/microsoft-calendar-sync.service.ts` | Sync Service | N/A | Integrated |

### 2.2. Configuration Status Summary

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Configuration Status                          │
├─────────────────────────────────────────────────────────────────┤
│  ✅ Using Centralized Config: 18 files                           │
│  ✅ Calendar Queue:           Complete (new services added)      │
│  ✅ Observability:            Prometheus + Grafana configured    │
├─────────────────────────────────────────────────────────────────┤
│  Progress: 100% Complete - All Phases Done                      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3. Centralized Config Location

**File**: `backend/src/common/config/queue.config.ts`

**Exports**:
- `QUEUE_PRESETS` - Job options by priority/type
- `WORKER_PRESETS` - Worker options by use case
- `QUEUE_NAMES` - Centralized queue name registry
- `getDefaultJobOptions(preset)` - Get job options for a preset
- `getWorkerOptions(preset)` - Get worker options for a preset
- `getRedisConnectionOptions()` - Re-exported from configuration.ts

**Current Presets**:

| Queue Preset | Attempts | Backoff | Use Case |
|--------------|----------|---------|----------|
| `HIGH` | 5 | 2s exponential | User-facing operations |
| `NORMAL` | 3 | 5s exponential | Background operations |
| `LOW` | 2 | 10s exponential | Bulk/batch operations |
| `AI_EMBEDDING` | 6 | 1s exponential | AI/embedding operations |
| `CALENDAR_SYNC` | 3 | 5s exponential | Calendar sync operations |
| `EMAIL_SYNC` | 3 | 5s exponential | Email sync operations |
| `FOLDER_OPS` | 3 | 2s exponential | Folder operations |
| `CONTACTS_SYNC` | 3 | 5s exponential | Contacts sync operations |

| Worker Preset | Concurrency | Lock Duration | Use Case |
|---------------|-------------|---------------|----------|
| `DEFAULT` | 5 | 30s | General purpose |
| `HIGH_THROUGHPUT` | 10 | 30s | Fast operations |
| `RATE_LIMITED` | 1 | 180s | API rate-limited ops |
| `EMAIL_SYNC` | 3 | 120s | Email sync workers |
| `AI_EMBEDDING` | 1 | 180s | AI/embedding workers |
| `CONTACTS_SYNC` | 3 | 120s | Contacts sync workers |

## 3. Queue Names Registry

**File**: `backend/src/common/config/queue.config.ts`

```typescript
export const QUEUE_NAMES = {
  // Email sync queues
  EMAIL_SYNC_HIGH: 'email-sync-high',
  EMAIL_SYNC_NORMAL: 'email-sync-normal',
  EMAIL_SYNC_LOW: 'email-sync-low',

  // Folder operations
  FOLDER_OPERATIONS: 'folder-operations',

  // AI/Embedding queues
  EMAIL_EMBEDDING: 'email-embedding',

  // Contacts sync queues
  CONTACTS_SYNC_HIGH: 'contacts-sync-high',
  CONTACTS_SYNC_NORMAL: 'contacts-sync-normal',
  CONTACTS_SYNC_LOW: 'contacts-sync-low',

  // Dead letter queue
  DEAD_LETTER: 'dead-letter-queue',

  // Email send and sync-back queues
  EMAIL_SEND: 'email-send',
  PROVIDER_SYNC_BACK: 'provider-sync-back',
  BULK_OPERATIONS: 'bulk-operations',
  FEEDBACK: 'feedback',

  // TODO: Add these
  CALENDAR_SYNC: 'calendar-sync',
  WEBHOOK_PROCESSING: 'webhook-processing',
  DRAFT_OPERATIONS: 'draft-operations',
} as const;
```

## 4. Standardization Roadmap

### Phase 1: Infrastructure Setup ✅ COMPLETED

| Task | Status | Files |
|------|--------|-------|
| Create centralized `queue.config.ts` | ✅ Done | `common/config/queue.config.ts` |
| Create barrel export `index.ts` | ✅ Done | `common/config/index.ts` |
| Define QUEUE_PRESETS | ✅ Done | 7 presets defined |
| Define WORKER_PRESETS | ✅ Done | 6 presets defined |
| Define QUEUE_NAMES | ✅ Done | 14 queue names |

### Phase 2: New Queue Services ✅ COMPLETED

| Task | Status | Files |
|------|--------|-------|
| Create `EmailSendQueueService` | ✅ Done | `email-sync/services/email-send-queue.service.ts` |
| Create `ProviderSyncBackQueueService` | ✅ Done | `email-sync/services/provider-sync-back-queue.service.ts` |
| Create `BulkOperationsQueueService` | ✅ Done | `email-sync/services/bulk-operations-queue.service.ts` |
| Create `FeedbackQueueService` | ✅ Done | `ai/services/feedback-queue.service.ts` |
| Register in modules | ✅ Done | `email-sync.module.ts`, `ai.module.ts` |

### Phase 3: Refactor Existing Services ✅ COMPLETE

| Task | Status | Files | Effort |
|------|--------|-------|--------|
| Refactor `EmailEmbeddingQueueService` | ✅ Done | `ai/services/email-embedding.queue.ts` | Small |
| Refactor `QueryEmbeddingCacheService` | ✅ Done | `ai/services/query-embedding-cache.service.ts` | Small |
| Refactor `AiQueueService` | ✅ Done | `ai/voltagent/services/ai-queue.service.ts` | Small |
| Refactor `ContactsSyncQueueService` | ✅ Done | `contacts/services/contacts-sync-queue.service.ts` | Medium |
| Refactor `ContactsSyncWorker` | ✅ Done | `contacts/workers/contacts-sync.worker.ts` | Medium |
| Refactor `QueueService` (email-sync) | ✅ Done | `email-sync/services/queue.service.ts` | Medium |
| Refactor `FolderOperationsQueueService` | ✅ Done | `email-sync/services/folder-operations-queue.service.ts` | Medium |
| Refactor `SyncWorker` | ✅ Done | `email-sync/workers/sync.worker.ts` | Medium |
| Refactor `FolderOperationsWorker` | ✅ Done | `email-sync/workers/folder-operations.worker.ts` | Small |
| Refactor `DeadLetterQueueService` | ✅ Done | `common/services/dead-letter-queue.service.ts` | Small |
| Refactor `ai.worker.ts` (standalone) | ✅ Done | `workers/ai.worker.ts` | Small |

### Phase 4: Calendar Queue Integration ✅ COMPLETE

| Task | Status | Files | Effort |
|------|--------|-------|--------|
| Create `CalendarSyncQueueService` | ✅ Done | `calendar/services/calendar-sync-queue.service.ts` | Medium |
| Create `CalendarSyncWorker` | ✅ Done | `calendar/workers/calendar-sync.worker.ts` | Medium |
| Add CALENDAR_SYNC preset | ✅ Done | `common/config/queue.config.ts` | Small |
| Update Calendar module | ✅ Done | `calendar/calendar.module.ts` | Small |
| Integrate with `GoogleCalendarSyncService` | ✅ Done | Via worker delegation | Medium |
| Integrate with `MicrosoftCalendarSyncService` | ✅ Done | Via worker delegation | Medium |

### Phase 5: Observability & Monitoring ✅ COMPLETE

| Task | Status | Files | Effort |
|------|--------|-------|--------|
| Create `QueueHealthService` | ✅ Done | `common/services/queue-health.service.ts` | Medium |
| Add `/health/queues` endpoint | ✅ Done | `health/controllers/health.controller.ts` | Small |
| Add Prometheus metrics | ✅ Done | `queue-health.service.ts`, `prometheus.yml` | Medium |
| Add Prometheus & Grafana to Docker | ✅ Done | `docker-compose.dev.yml` | Small |

## 5. File-by-File Refactoring Guide

### 5.1. queue.service.ts (email-sync)

**Current Issues**:
- Uses `getRedisConnectionOptions` from old config path
- Has own `getAttempts()`, `getBackoff()` methods
- Hardcoded queue names

**Required Changes**:
```typescript
// BEFORE
import { getRedisConnectionOptions } from '../../../config/configuration';

// AFTER
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config';

// Use QUEUE_NAMES.EMAIL_SYNC_HIGH instead of 'email-sync-high'
// Use getDefaultJobOptions('EMAIL_SYNC') instead of custom methods
```

### 5.2. sync.worker.ts

**Current Issues**:
- Uses `getRedisConnectionOptions` from old config
- Has hardcoded `WORKER_CONFIG` with concurrency values
- Doesn't use `getWorkerOptions()`

**Required Changes**:
```typescript
// BEFORE
import { getRedisConnectionOptions } from '../../../config/configuration';
private readonly WORKER_CONFIG = {
  high: { concurrency: 17 },
  ...
};

// AFTER
import {
  getRedisConnectionOptions,
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../../common/config';

// May need new preset: WORKER_PRESETS.EMAIL_SYNC_HIGH_THROUGHPUT
// For 1000+ tenant optimization, might add env var overrides
```

### 5.3. folder-operations-queue.service.ts

**Current Issues**:
- Has own `QUEUE_CONFIG` constant
- Uses hardcoded queue name `'folder-operations'`
- Doesn't use centralized presets

**Required Changes**:
```typescript
// BEFORE
private readonly QUEUE_CONFIG = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  ...
};
this.folderQueue = new Queue('folder-operations', ...);

// AFTER
import { getDefaultJobOptions, QUEUE_NAMES } from '../../../common/config';

const jobDefaults = getDefaultJobOptions('FOLDER_OPS');
this.folderQueue = new Queue(QUEUE_NAMES.FOLDER_OPERATIONS, {
  connection,
  defaultJobOptions: jobDefaults,
});
```

### 5.4. dead-letter-queue.service.ts

**Current Issues**:
- Uses `getRedisConnectionOptions` from old path
- Hardcoded queue name `'dead-letter-queue'`

**Required Changes**:
```typescript
// BEFORE
import { getRedisConnectionOptions } from '../../config/configuration';

// AFTER
import { getRedisConnectionOptions, QUEUE_NAMES } from '../config';

// Use QUEUE_NAMES.DEAD_LETTER
```

### 5.5. ai.worker.ts (standalone)

**Current Issues**:
- Standalone worker outside NestJS DI
- Uses old config import path
- Hardcoded queue name

**Required Changes**:
```typescript
// BEFORE
import { getRedisConnectionOptions } from '../config/configuration';
const aiQueue = new Queue('ai-processing', ...);

// AFTER
import { getRedisConnectionOptions, QUEUE_NAMES } from '../common/config';
const aiQueue = new Queue(QUEUE_NAMES.AI_PROCESSING, ...);
// Note: May need to add AI_PROCESSING to QUEUE_NAMES
```

## 6. Calendar Module Queue Design

### 6.1. Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Calendar Sync Architecture                    │
├─────────────────────────────────────────────────────────────────┤
│  CalendarSyncSchedulerService                                    │
│  └── schedules sync jobs every X minutes                        │
│                                                                  │
│  CalendarSyncQueueService                                        │
│  ├── highQueue (calendar-sync-high)                             │
│  ├── normalQueue (calendar-sync-normal)                         │
│  └── lowQueue (calendar-sync-low)                               │
│                                                                  │
│  CalendarSyncWorker                                              │
│  ├── processes Google calendar syncs                            │
│  └── processes Microsoft calendar syncs                         │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2. Job Data Interface

```typescript
interface CalendarSyncJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft';
  email: string;
  priority: 'high' | 'normal' | 'low';
  lastSyncedAt?: Date;
  syncToken?: string; // For incremental sync
}

interface CalendarSyncJobResult {
  success: boolean;
  providerId: string;
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  deletedEvents: number;
  syncDuration: number;
  nextSyncToken?: string;
}
```

### 6.3. Queue Configuration

```typescript
// Add to QUEUE_PRESETS
CALENDAR_SYNC: {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000, // 5s, 10s, 20s
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
},

// Add to WORKER_PRESETS
CALENDAR_SYNC: {
  concurrency: 3,
  lockDuration: 120000, // 2 minutes
  stalledInterval: 60000,
},

// Add to QUEUE_NAMES
CALENDAR_SYNC_HIGH: 'calendar-sync-high',
CALENDAR_SYNC_NORMAL: 'calendar-sync-normal',
CALENDAR_SYNC_LOW: 'calendar-sync-low',
```

## 7. Capacity Planning

### 7.1. Current Queue Distribution

| Queue | Daily Volume (est) | Peak RPS | Current Concurrency |
|-------|-------------------|----------|---------------------|
| email-sync-high | 48,000 | 5 | 17 |
| email-sync-normal | 48,000 | 5 | 10 |
| email-sync-low | 10,000 | 1 | 7 |
| contacts-sync-* | 3,000 | 0.5 | 3 |
| folder-operations | 5,000 | 1 | 5 |
| email-embedding | 10,000 | 2 | 1 |
| email-send | 10,000 | 2 | (new) |
| provider-sync-back | 50,000 | 5 | (new) |
| bulk-operations | 5,000 | 1 | (new) |
| feedback | 20,000 | 2 | (new) |
| calendar-sync-* | 3,000 | 0.5 | (planned) |
| **TOTAL** | **~212,000** | **~25** | - |

### 7.2. Redis Memory Estimate

- Jobs in queue: ~1KB per job average
- Active jobs at peak: ~1,000
- Completed jobs retained: 100 per queue × 14 queues = 1,400
- Failed jobs retained: 100-200 per queue

**Estimated Redis Memory**: 50-100MB for queues

## 8. Testing Strategy

### 8.1. Unit Tests Required

```typescript
// Example test structure
describe('QueueConfigIntegration', () => {
  it('should create queue with centralized config', async () => {
    const queue = new Queue(QUEUE_NAMES.EMAIL_SYNC_HIGH, {
      connection: getRedisConnectionOptions(),
      defaultJobOptions: getDefaultJobOptions('EMAIL_SYNC'),
    });

    expect(queue.name).toBe('email-sync-high');
    await queue.close();
  });

  it('should create worker with centralized config', async () => {
    const options = getWorkerOptions('EMAIL_SYNC');
    expect(options.concurrency).toBe(3);
    expect(options.lockDuration).toBe(120000);
  });
});
```

### 8.2. Integration Tests

- Test queue-to-worker flow for each queue type
- Test DLQ integration
- Test provider sync-back with real provider APIs (mocked)

## 9. Migration Checklist

### Phase 3 Checklist ✅ COMPLETE

- [x] `queue.service.ts`: Import from `common/config`, use `QUEUE_NAMES`, use `getDefaultJobOptions('HIGH/NORMAL/LOW')`
- [x] `sync.worker.ts`: Import from `common/config`, use `QUEUE_NAMES` (kept custom high-throughput concurrency)
- [x] `folder-operations-queue.service.ts`: Removed `QUEUE_CONFIG`, use `getDefaultJobOptions('FOLDER_OPS')`, use `QUEUE_NAMES.FOLDER_OPERATIONS`
- [x] `folder-operations.worker.ts`: Import from `common/config`, use `getWorkerOptions()`
- [x] `dead-letter-queue.service.ts`: Import from `common/config`, use `QUEUE_NAMES.DEAD_LETTER`
- [x] `ai.worker.ts`: Import from `common/config`, use `QUEUE_NAMES.AI_PROCESSING`

### Phase 4 Checklist ✅ COMPLETE

- [x] Create `CalendarSyncQueueService`
- [x] Create `CalendarSyncWorker`
- [x] Add `CALENDAR_SYNC` preset to `QUEUE_PRESETS`
- [x] Add `CALENDAR_SYNC` preset to `WORKER_PRESETS`
- [x] Add `CALENDAR_SYNC_*` to `QUEUE_NAMES`
- [x] Update `CalendarModule` providers and exports
- [x] Integrate queue with `GoogleCalendarSyncService` (via worker delegation)
- [x] Integrate queue with `MicrosoftCalendarSyncService` (via worker delegation)

### Phase 5 Checklist ✅ COMPLETE

- [x] Create `QueueHealthService` with comprehensive health checks
- [x] Add `/health/queues/all` endpoint for all queue status
- [x] Add `/health/queues/:name` endpoint for individual queue status
- [x] Add Prometheus metrics export via `exportPrometheusText()`
- [x] Update `/health/metrics` to include all-queues metrics
- [x] Add Prometheus container to `docker-compose.dev.yml`
- [x] Add Grafana container to `docker-compose.dev.yml`
- [x] Configure Prometheus scrape targets in `monitoring/prometheus.yml`
- [x] Configure Grafana datasource provisioning

## 10. References

### Internal Files
- `backend/src/common/config/queue.config.ts` - Centralized queue config
- `backend/src/common/config/index.ts` - Barrel export
- `backend/src/config/configuration.ts` - Core Redis config (source)

### Documentation
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)
- [NestJS Bull Module](https://docs.nestjs.com/techniques/queues)

---

## Appendix A: Complete File List

### Files Using Centralized Config ✅ (All Complete)

1. `backend/src/modules/ai/services/email-embedding.queue.ts`
2. `backend/src/modules/ai/services/query-embedding-cache.service.ts`
3. `backend/src/modules/ai/services/feedback-queue.service.ts`
4. `backend/src/modules/ai/voltagent/services/ai-queue.service.ts`
5. `backend/src/modules/contacts/services/contacts-sync-queue.service.ts`
6. `backend/src/modules/contacts/workers/contacts-sync.worker.ts`
7. `backend/src/modules/email-sync/services/email-send-queue.service.ts`
8. `backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts`
9. `backend/src/modules/email-sync/services/bulk-operations-queue.service.ts`
10. `backend/src/modules/email-sync/services/queue.service.ts`
11. `backend/src/modules/email-sync/services/folder-operations-queue.service.ts`
12. `backend/src/modules/email-sync/workers/sync.worker.ts`
13. `backend/src/modules/email-sync/workers/folder-operations.worker.ts`
14. `backend/src/common/services/dead-letter-queue.service.ts`
15. `backend/src/workers/ai.worker.ts`
16. `backend/src/modules/calendar/services/calendar-sync-queue.service.ts`
17. `backend/src/modules/calendar/workers/calendar-sync.worker.ts`
18. `backend/src/common/services/queue-health.service.ts`

### Observability Infrastructure ✅

1. `monitoring/prometheus.yml` - Prometheus scrape configuration
2. `monitoring/grafana/provisioning/datasources/prometheus.yml` - Grafana datasource
3. `docker-compose.dev.yml` - Prometheus & Grafana containers
