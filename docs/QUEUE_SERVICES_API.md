# Queue Services API Reference

**Last Updated**: 2025-12-08
**Status**: Current

This document provides a comprehensive reference for all BullMQ queue services in the MailAgent backend.

---

## Overview

MailAgent uses BullMQ for asynchronous job processing across multiple domains:
- Email synchronization (Gmail, Microsoft, IMAP)
- Calendar synchronization
- Contacts synchronization
- AI/Embedding processing
- Folder operations
- Email sending and scheduling

All queues use centralized configuration from `backend/src/common/config/queue.config.ts`.

---

## Queue Registry

### QUEUE_NAMES Constant

```typescript
export const QUEUE_NAMES = {
  // Email sync - 3 priority levels
  EMAIL_SYNC_HIGH: 'email-sync-high',
  EMAIL_SYNC_NORMAL: 'email-sync-normal',
  EMAIL_SYNC_LOW: 'email-sync-low',

  // Folder operations
  FOLDER_OPERATIONS: 'folder-operations',

  // AI/Embedding
  EMAIL_EMBEDDING: 'email-embedding',
  AI_PROCESSING: 'ai-processing',

  // Contacts - 3 priority levels
  CONTACTS_SYNC_HIGH: 'contacts-sync-high',
  CONTACTS_SYNC_NORMAL: 'contacts-sync-normal',
  CONTACTS_SYNC_LOW: 'contacts-sync-low',

  // Calendar - 3 priority levels
  CALENDAR_SYNC_HIGH: 'calendar-sync-high',
  CALENDAR_SYNC_NORMAL: 'calendar-sync-normal',
  CALENDAR_SYNC_LOW: 'calendar-sync-low',

  // Dead letter queue
  DEAD_LETTER: 'dead-letter-queue',

  // Email operations
  EMAIL_SEND: 'email-send',
  PROVIDER_SYNC_BACK: 'provider-sync-back',
  BULK_OPERATIONS: 'bulk-operations',
  FEEDBACK: 'feedback',
} as const;
```

---

## Queue Presets

### Job Options Presets

| Preset | Attempts | Backoff | removeOnComplete | removeOnFail | Use Case |
|--------|----------|---------|------------------|--------------|----------|
| **HIGH** | 5 | 2s exponential | {count:100, age:3600} | {count:200} | User-facing operations |
| **NORMAL** | 3 | 5s exponential | true | {count:100} | Background operations |
| **LOW** | 2 | 10s exponential | true | true | Bulk/batch operations |
| **AI_EMBEDDING** | 6 | 1s exponential | true | {count:1000} | Rate-limited API calls |
| **EMAIL_SYNC** | 3 | 5s exponential | {count:50, age:3600} | {count:100} | Email sync jobs |
| **FOLDER_OPS** | 3 | 2s exponential | {count:100, age:3600} | {count:200} | Folder operations |
| **CONTACTS_SYNC** | 3 | 5s exponential | {count:100} | {count:100} | Contacts sync |
| **CALENDAR_SYNC** | 3 | 5s exponential | {count:100} | {count:100} | Calendar sync |

### Worker Presets

| Preset | Concurrency | Lock Duration | Stalled Interval | Rate Limiter |
|--------|-------------|---------------|------------------|--------------|
| **DEFAULT** | 5 | 30s | 15s | - |
| **HIGH_THROUGHPUT** | 10 | 30s | 15s | - |
| **RATE_LIMITED** | 1 | 180s | 90s | 2 req/sec |
| **EMAIL_SYNC** | 3 | 120s | 60s | - |
| **AI_EMBEDDING** | 1 | 180s | 90s | 2 req/sec |
| **CONTACTS_SYNC** | 3 | 120s | 60s | - |
| **CALENDAR_SYNC** | 3 | 120s | 60s | - |

---

## Queue Services Detail

### 1. Email Sync Queue Service

**Location**: `backend/src/modules/email-sync/services/queue.service.ts`

**Queues**: `email-sync-high`, `email-sync-normal`, `email-sync-low`

**Job Data Interface**:
```typescript
interface EmailSyncJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'imap';
  email: string;
  syncType: 'full' | 'delta' | 'folder';
  folderId?: string;
  priority: 'high' | 'normal' | 'low';
}
```

**Key Methods**:
- `addSyncJob(data, priority)` - Add single sync job
- `addBulkSyncJobs(jobs)` - Add multiple jobs with priority routing
- `getQueueStatus()` - Get waiting/active/delayed counts
- `pauseQueue(priority)` / `resumeQueue(priority)`
- `obliterateQueue(priority)` - Clear all jobs (dangerous)

---

### 2. Folder Operations Queue Service

**Location**: `backend/src/modules/email-sync/services/folder-operations-queue.service.ts`

**Queue**: `folder-operations`

**Job Data Interface**:
```typescript
interface FolderOperationJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'imap';
  operation: 'create' | 'rename' | 'delete';
  folderId?: string;
  folderName?: string;
  newName?: string;
  parentId?: string;
}
```

**Key Methods**:
- `addFolderOperation(data)` - Queue folder operation
- `getQueueStatus()` - Get queue metrics

**Worker**: `FolderOperationsWorker` - Processes folder mutations

---

### 3. Email Send Queue Service

**Location**: `backend/src/modules/email-sync/services/email-send-queue.service.ts`

**Queue**: `email-send`

**Job Data Interface**:
```typescript
interface EmailSendJobData {
  tenantId: string;
  providerId: string;
  emailId: string;
  scheduledAt?: Date;
  priority: 'high' | 'normal';
}
```

**Features**:
- Priority queuing (urgent vs scheduled)
- Scheduled send support
- Retry with exponential backoff
- Draft auto-save integration

---

### 4. Provider Sync-Back Queue Service

**Location**: `backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts`

**Queue**: `provider-sync-back`

**Job Data Interface**:
```typescript
interface SyncBackJobData {
  tenantId: string;
  providerId: string;
  emailId: string;
  operation: 'mark-read' | 'mark-unread' | 'star' | 'unstar' |
             'archive' | 'trash' | 'delete' | 'move' | 'label';
  targetFolderId?: string;
  labelIds?: string[];
}
```

**Features**:
- Batching of rapid changes
- Debouncing duplicate operations
- Provider rate limit handling

---

### 5. Bulk Operations Queue Service

**Location**: `backend/src/modules/email-sync/services/bulk-operations-queue.service.ts`

**Queue**: `bulk-operations`

**Supported Operations**:
- Bulk move emails
- Bulk delete emails
- Bulk archive emails
- Bulk label/unlabel

---

### 6. Email Embedding Queue Service

**Location**: `backend/src/modules/ai/services/email-embedding.queue.ts`

**Queue**: `email-embedding`

**Job Data Interface**:
```typescript
interface EmbeddingJobData {
  tenantId: string;
  emailId: string;
  content: string;
  subject: string;
  metadata?: Record<string, any>;
}
```

**Features**:
- Rate limiting for Mistral API
- Bulk embedding with deduplication
- Automatic retry on rate limit errors

**Environment Variables**:
- `EMBEDDING_BULK_SIZE` (default: 50)
- `EMBEDDING_FLUSH_MS` (default: 200)
- `EMBEDDING_CONCURRENCY` (default: 1)
- `EMBEDDING_RATE_MAX` (default: 2)

---

### 7. AI Processing Queue Service

**Location**: `backend/src/modules/ai/voltagent/services/ai-queue.service.ts`

**Queue**: `ai-processing`

**Job Data Interface**:
```typescript
interface AiJobData {
  tenantId: string;
  userId: string;
  prompt: string;
  conversationHistory?: Message[];
  conversationId?: string;
}
```

**Features**:
- Priority lanes (high/normal/low)
- Deduplication by job key
- Token bucket rate limiting

---

### 8. Calendar Sync Queue Service

**Location**: `backend/src/modules/calendar/services/calendar-sync-queue.service.ts`

**Queues**: `calendar-sync-high`, `calendar-sync-normal`, `calendar-sync-low`

**Job Data Interface**:
```typescript
interface CalendarSyncJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft';
  email: string;
  syncType: 'full' | 'incremental';
  priority: 'high' | 'normal' | 'low';
}
```

**Worker**: `CalendarSyncWorker` - Delegates to Google/Microsoft sync services

---

### 9. Contacts Sync Queue Service

**Location**: `backend/src/modules/contacts/services/contacts-sync-queue.service.ts`

**Queues**: `contacts-sync-high`, `contacts-sync-normal`, `contacts-sync-low`

**Job Data Interface**:
```typescript
interface ContactsSyncJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft';
  email: string;
  syncType: 'full' | 'incremental';
  priority: 'high' | 'normal' | 'low';
}
```

**Worker**: `ContactsSyncWorker` - Delegates to Google/Microsoft contacts services

---

### 10. Dead Letter Queue Service

**Location**: `backend/src/common/services/dead-letter-queue.service.ts`

**Queue**: `dead-letter-queue`

**Features**:
- Automatic capture of permanently failed jobs
- Failure analysis and categorization
- Manual retry with configurable options
- Retention policies (default: 30 days)
- Alert thresholds for high failure rates

**Key Methods**:
- `addToDeadLetter(jobId, queue, data, error)` - Add failed job
- `retryJob(jobId, options)` - Retry failed job
- `getStats()` - Get DLQ statistics
- `cleanOldFailures(days)` - Remove old entries

---

### 11. Feedback Queue Service

**Location**: `backend/src/modules/ai/services/feedback-queue.service.ts`

**Queue**: `feedback`

**Purpose**: Capture user feedback for model improvement

---

## Queue Health Service

**Location**: `backend/src/common/services/queue-health.service.ts`

**Endpoints**:
- `GET /health/queues` - Email sync queue metrics
- `GET /health/queues/all` - All queues health status
- `GET /health/queues/:name` - Single queue status
- `GET /health/metrics` - Prometheus-compatible metrics

**Health Status Interface**:
```typescript
interface QueueHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  redis: {
    connected: boolean;
    latencyMs: number;
    memoryUsedMB: number;
  };
  queues: QueueStatus[];
  summary: {
    totalWaiting: number;
    totalActive: number;
    totalFailed: number;
  };
}
```

---

## Monitoring & Observability

### Prometheus Metrics

Available at `/health/metrics`:

```prometheus
# Queue depth
queue_jobs_waiting{queue="email-sync-high"} 42
queue_jobs_active{queue="email-sync-high"} 3
queue_jobs_completed{queue="email-sync-high"} 15420
queue_jobs_failed{queue="email-sync-high"} 12
queue_jobs_delayed{queue="email-sync-high"} 5

# Redis health
redis_memory_used_bytes 52428800
redis_connected_clients 15
redis_latency_ms 2
```

### Docker Compose (Prometheus + Grafana)

```yaml
# docker-compose.dev.yml includes:
prometheus:
  image: prom/prometheus:latest
  ports:
    - "9090:9090"

grafana:
  image: grafana/grafana:latest
  ports:
    - "3030:3000"
```

---

## Configuration

### Environment Variables

```bash
# Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional

# Email embedding rate limiting
EMBEDDING_BULK_SIZE=50
EMBEDDING_FLUSH_MS=200
EMBEDDING_CONCURRENCY=1
EMBEDDING_RATE_MAX=2
EMBEDDING_RATE_DURATION_MS=1000

# Worker control
EMAIL_SYNC_WORKERS_ENABLED=true
AI_QUEUE_WORKER_MODE=true

# Dead letter queue
DLQ_ALERT_THRESHOLD=10
DLQ_CLEANUP_INTERVAL_MS=86400000
```

### Using Presets

```typescript
import {
  getDefaultJobOptions,
  getWorkerOptions,
  QUEUE_NAMES
} from '../common/config';

// Create queue with preset
const queue = new Queue(QUEUE_NAMES.EMAIL_SYNC_HIGH, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: getDefaultJobOptions('EMAIL_SYNC'),
});

// Create worker with preset
const worker = new Worker(QUEUE_NAMES.EMAIL_SYNC_HIGH, processor, {
  connection: getRedisConnectionOptions(),
  ...getWorkerOptions('EMAIL_SYNC'),
});
```

---

## Best Practices

### 1. Job Idempotency
Always use `jobId` for deduplication:
```typescript
await queue.add('sync', data, {
  jobId: `${providerId}-${syncType}`,
});
```

### 2. Graceful Shutdown
Drain workers before shutdown:
```typescript
async onModuleDestroy() {
  await worker.close();
  await queue.close();
}
```

### 3. Error Handling
Use DLQ for permanent failures:
```typescript
worker.on('failed', async (job, error) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await dlqService.addToDeadLetter(job.id, queueName, job.data, error);
  }
});
```

### 4. Rate Limiting
Use `AI_EMBEDDING` preset for rate-limited APIs:
```typescript
const options = getWorkerOptions('AI_EMBEDDING');
// concurrency: 1, limiter: { max: 2, duration: 1000 }
```

---

## Related Documentation

- [REDIS_BULLMQ_STANDARDIZATION_ROADMAP.md](./REDIS_BULLMQ_STANDARDIZATION_ROADMAP.md) - Queue infrastructure roadmap
- [EMAIL_EMAILSYNC_AUDIT_ROADMAP.md](./EMAIL_EMAILSYNC_AUDIT_ROADMAP.md) - Email sync implementation
- [AI_COMPREHENSIVE_ROADMAP.md](./AI_COMPREHENSIVE_ROADMAP.md) - AI queue integration
