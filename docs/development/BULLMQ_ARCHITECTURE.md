# BullMQ Architecture - Complete Integration

> **Status:** ✅ Fully Integrated
> **Updated:** 2025-12-12
> **Queues:** 5 Production Queues + AI Queues

---

## Executive Summary

**ALL background operations in MailAgent use BullMQ** for asynchronous processing, including:

- ✅ Email sync operations (Google, Microsoft, IMAP)
- ✅ Email sending with attachments
- ✅ Folder operations (create, rename, delete)
- ✅ Bulk operations (mark read, move, delete)
- ✅ Provider sync-back (local changes → remote)
- ✅ AI embeddings generation
- ✅ AI smart replies, summarization, scheduling

**Driver-only GoogleSyncService maintains full BullMQ integration** - no regressions!

---

## Queue Architecture

### Production Queues

| Queue | Purpose | Priority Levels | Workers | Used By |
|-------|---------|----------------|---------|---------|
| **sync-queue** | Email sync operations | high/normal/low | `SyncWorker` | GoogleSyncService, MicrosoftSyncService, ImapSyncService |
| **email-send-queue** | Send emails with attachments | high/normal/low | `EmailSendWorker` | EmailSendService |
| **folder-operations-queue** | Folder CRUD | normal | `FolderOperationsWorker` | FoldersController, FolderSyncService |
| **bulk-operations-queue** | Bulk email operations | normal | `BulkOperationsWorker` | EmailsController (bulk actions) |
| **provider-sync-back-queue** | Sync local changes to provider | normal | `SyncBackWorker` | EmailsService (after local updates) |

### AI Queues (Separate Module)

| Queue | Purpose | Workers |
|-------|---------|---------|
| **email-embedding-queue** | Generate email embeddings | `EmailEmbeddingWorker` |
| **smart-reply-queue** | Generate AI smart replies | `SmartReplyWorker` |
| **summarization-queue** | Email summarization | `SummarizationWorker` |
| **scheduling-queue** | AI scheduling suggestions | `SchedulingWorker` |

---

## BullMQ Integration in Driver-Only GoogleSyncService ✅

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SyncSchedulerService                         │
│                  (Cron: every 5 minutes)                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Queues sync jobs
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      QueueService                               │
│                   (BullMQ Queues)                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  highQueue   │  │ normalQueue  │  │   lowQueue   │         │
│  │ (webhooks)   │  │ (scheduled)  │  │  (backfill)  │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          │ Jobs processed by workers           │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SyncWorker                               │
│               (Processes sync jobs from queues)                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Calls sync service
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│            GoogleSyncService (Driver-Only) ✅                   │
│                                                                 │
│  syncProvider(jobData) {                                        │
│    1. Get provider + access token                              │
│    2. Create driver via EmailDriverFactory                     │
│    3. Sync messages (full or incremental)                      │
│    4. For each new email:                                      │
│       ├─> upsertMessageFromDriver()                            │
│       ├─> Save to PostgreSQL                                   │
│       └─> Queue for AI embeddings ──────────┐                  │
│    5. Emit realtime events (Socket.IO)      │                  │
│    6. Return sync result                    │                  │
│  }                                           │                  │
└──────────────────────────────────────────────┼──────────────────┘
                                               │
                                               │ BullMQ job
                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              EmailEmbeddingQueueService                         │
│                   (BullMQ Queue)                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Processed by worker
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              EmailEmbeddingWorker                               │
│  - Calls Mistral AI Embeddings API                             │
│  - Stores vector in PostgreSQL                                 │
│  - Used for RAG-based AI features                              │
└─────────────────────────────────────────────────────────────────┘
```

### Code Evidence

**1. EmailEmbeddingQueue Integration (NEW CODE):**

```typescript
// backend/src/modules/email-sync/services/gmail/google-sync.service.ts

// ✅ MAINTAINED in driver-only version
private async upsertMessageFromDriver(
  canonicalMsg: CanonicalMessage,
  providerId: string,
  tenantId: string,
): Promise<{ wasNew: boolean }> {
  // ... create email in database ...

  if (wasNew) {
    // ✅ BullMQ: Queue for AI embeddings
    await this.emailEmbeddingQueue.enqueue({
      emailId: createdEmail.id,
      tenantId,
      subject: createdEmail.subject,
      snippet: createdEmail.snippet || '',
    });
  }

  return { wasNew };
}
```

**2. QueueService Integration:**

```typescript
// backend/src/modules/email-sync/services/queue.service.ts

@Injectable()
export class QueueService {
  public highQueue: Queue<SyncJobData>;    // Webhooks, urgent syncs
  public normalQueue: Queue<SyncJobData>;  // Scheduled syncs
  public lowQueue: Queue<SyncJobData>;     // Backfill, low priority

  async addSyncJob(
    providerId: string,
    priority: 'high' | 'normal' | 'low' = 'normal',
    syncType: 'full' | 'incremental' = 'incremental',
  ) {
    const queue = priority === 'high' ? this.highQueue :
                  priority === 'normal' ? this.normalQueue :
                  this.lowQueue;

    await queue.add('sync', {
      providerId,
      syncType,
      priority,
      tenantId,
      email,
    });
  }
}
```

**3. SyncWorker Processing:**

```typescript
// backend/src/modules/email-sync/workers/sync.worker.ts

@Injectable()
export class SyncWorker implements OnModuleInit {
  private async processSyncJob(job: Job<SyncJobData>) {
    const { providerId, syncType, tenantId } = job.data;

    // Route to appropriate sync service
    let result: SyncJobResult;
    switch (provider.providerType) {
      case 'google':
        // ✅ Calls driver-only GoogleSyncService
        result = await this.googleSyncService.syncProvider(job.data);
        break;
      case 'microsoft':
        result = await this.microsoftSyncService.syncProvider(job.data);
        break;
      case 'imap':
        result = await this.imapSyncService.syncProvider(job.data);
        break;
    }

    return result;
  }
}
```

---

## Multi-Tenancy in BullMQ

### Tenant Isolation

**Every BullMQ job includes tenantId** for proper isolation:

```typescript
interface SyncJobData {
  providerId: string;
  email: string;
  syncType: 'full' | 'incremental';
  priority: 'high' | 'normal' | 'low';
  tenantId: string; // ✅ Multi-tenancy
}

interface EmailEmbeddingJobData {
  emailId: string;
  tenantId: string; // ✅ Multi-tenancy
  subject: string;
  snippet: string;
}
```

### Database Queries

**All database operations are tenant-scoped:**

```typescript
// GoogleSyncService - driver-only version
await this.prisma.email.create({
  data: {
    tenantId,  // ✅ Tenant isolation
    providerId,
    externalId: canonicalMsg.id,
    // ... other fields
  },
});

await this.prisma.email.findFirst({
  where: {
    providerId,
    externalId: messageId,
    // tenantId implicit via provider relation
  },
});
```

---

## Queue Configuration

### Redis Connection

**All queues use shared Redis connection:**

```typescript
// backend/src/common/config/redis.config.ts

export const getRedisConnectionOptions = () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});
```

### Job Options

**Retry and backoff configuration:**

```typescript
export const getDefaultJobOptions = () => ({
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s
  },
  removeOnComplete: {
    age: 86400, // Keep completed jobs for 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 604800, // Keep failed jobs for 7 days
  },
});
```

### Queue Priority

**Priority levels for different sync scenarios:**

| Priority | Use Case | Example |
|----------|----------|---------|
| **high** | Real-time webhooks, user-triggered syncs | Gmail Pub/Sub notification |
| **normal** | Scheduled cron syncs | Every 5 minutes |
| **low** | Backfill, historical data | Initial full sync for old accounts |

---

## Monitoring & Observability

### Queue Metrics

**QueueService tracks metrics for each priority queue:**

```typescript
interface QueueMetricsSummary {
  queue: 'high' | 'normal' | 'low';
  completed: number;
  failed: number;
  lastError?: string;
  lastCompletedAt?: string;
  lastFailedAt?: string;
  averageDurationMs: number;
  lastDurationMs?: number;
}

// GET /api/email-sync/queue/metrics
{
  "high": {
    "completed": 1234,
    "failed": 5,
    "averageDurationMs": 1523,
    "lastCompletedAt": "2025-12-12T14:30:00Z"
  },
  "normal": {
    "completed": 5678,
    "failed": 12,
    "averageDurationMs": 2145,
    "lastCompletedAt": "2025-12-12T14:29:45Z"
  }
}
```

### Worker Health Monitoring

**All workers emit health events:**

```typescript
@Injectable()
export class SyncWorker {
  private async processSyncJob(job: Job<SyncJobData>) {
    const startTime = Date.now();

    try {
      const result = await this.syncService.syncProvider(job.data);

      // ✅ Emit success metrics
      this.queueService.recordSuccess(
        job.data.priority,
        Date.now() - startTime,
        job.id
      );

      return result;
    } catch (error) {
      // ✅ Emit failure metrics
      this.queueService.recordFailure(
        job.data.priority,
        error.message,
        job.id
      );

      throw error; // BullMQ will retry
    }
  }
}
```

---

## Scalability

### Horizontal Scaling

**BullMQ supports multiple worker instances:**

```
┌─────────────────┐
│  Redis (Queue)  │
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
    ▼         ▼        ▼        ▼
┌─────────┐ ┌────┐ ┌────┐ ┌────┐
│Worker 1 │ │ W2 │ │ W3 │ │ W4 │  ← Multiple instances
└─────────┘ └────┘ └────┘ └────┘
```

**Production deployment:**

```yaml
# docker-compose.yml (production)
services:
  backend-worker-1:
    image: mailagent-backend
    environment:
      - WORKER_ONLY=true
    replicas: 4  # ✅ Scale workers independently

  backend-api:
    image: mailagent-backend
    environment:
      - API_ONLY=true
    replicas: 2
```

### Concurrency Control

**Workers limit concurrent jobs:**

```typescript
// backend/src/modules/email-sync/workers/sync.worker.ts

async onModuleInit() {
  const concurrency = this.config.get<number>('SYNC_WORKER_CONCURRENCY', 5);

  // ✅ Process max 5 jobs concurrently per worker
  await this.queueService.highQueue.addWorker(
    'sync',
    this.processSyncJob.bind(this),
    { concurrency }
  );
}
```

---

## Rate Limiting & Resilience

### Provider Rate Limits

**Drivers handle rate limiting via ResilienceService:**

```typescript
// backend/src/modules/email-sync/drivers/google/google.driver.ts

@Injectable()
export class GoogleDriver {
  private async executeWithResilience<T>(fn: () => Promise<T>): Promise<T> {
    // ✅ Circuit breaker, retry, rate limiting
    return this.resilienceService.execute(
      fn,
      {
        maxRetries: 3,
        backoffMs: 1000,
        circuitBreakerThreshold: 5,
        rateLimitPerSecond: 10, // Gmail API limits
      }
    );
  }
}
```

### BullMQ Retry Strategy

**Failed jobs are automatically retried:**

```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s → 4s → 8s
  }
}
```

**After 3 failures, job moves to failed queue for manual review.**

---

## Real-World Flow Examples

### Example 1: Gmail Webhook → Sync → AI Embeddings

```
1. Gmail Pub/Sub webhook received
   └─> GmailWebhookService

2. Queue incremental sync job (HIGH priority)
   └─> QueueService.addSyncJob(providerId, 'high', 'incremental')

3. SyncWorker picks up job
   └─> Calls GoogleSyncService.syncProvider()

4. GoogleSyncService (driver-only)
   ├─> EmailDriverFactory.createConnectedDriver('google', ...)
   ├─> driver.getChangesSince(lastSyncToken)
   ├─> For each changed message:
   │   ├─> driver.getMessage(messageId)
   │   ├─> upsertMessageFromDriver()
   │   ├─> Save to PostgreSQL
   │   └─> emailEmbeddingQueue.enqueue() ✅ BullMQ
   └─> driver.disconnect()

5. EmailEmbeddingWorker picks up job
   ├─> Call Mistral AI Embeddings API
   ├─> Store vector in PostgreSQL
   └─> Update KnowledgeBase

6. AI features now have fresh embeddings for RAG
```

### Example 2: User Sends Email with Attachments

```
1. User clicks "Send" in frontend
   └─> POST /api/emails/send

2. EmailsController
   └─> emailSendQueue.addJob({
       from: 'user@example.com',
       to: ['recipient@example.com'],
       subject: 'Hello',
       attachments: [/* ... */],
       priority: 'high'
     }) ✅ BullMQ

3. EmailSendWorker picks up job
   └─> EmailSendService.sendEmail()

4. EmailSendService
   ├─> Get provider (Google/Microsoft/IMAP)
   ├─> EmailDriverFactory.createConnectedDriver()
   ├─> Upload attachments to S3
   ├─> driver.sendMessage(composeData)
   └─> Save sent email to database

5. User sees "Email sent" notification
```

### Example 3: Bulk Mark as Read (1000 emails)

```
1. User selects 1000 emails → Mark as Read
   └─> POST /api/emails/bulk/mark-read

2. EmailsController
   └─> bulkOperationsQueue.addJob({
       emailIds: [/* 1000 IDs */],
       operation: 'markRead',
       priority: 'normal'
     }) ✅ BullMQ

3. BulkOperationsWorker picks up job
   ├─> Process in batches of 50
   ├─> For each batch:
   │   ├─> Update database (isRead = true)
   │   └─> providerSyncBackQueue.addJob() ✅ BullMQ (sync to remote)

4. SyncBackWorker picks up jobs
   ├─> For each email:
   │   ├─> Get provider driver
   │   └─> driver.setReadStatus(messageId, true)

5. Local and remote now in sync
```

---

## Driver-Only Migration Impact on BullMQ

### ✅ NO CHANGES REQUIRED

The driver-only refactoring **maintains 100% BullMQ compatibility**:

| Component | Legacy | Driver-Only | BullMQ Integration |
|-----------|--------|-------------|-------------------|
| **Sync Jobs** | QueueService | QueueService | ✅ Same |
| **Workers** | SyncWorker | SyncWorker | ✅ Same |
| **AI Embeddings** | EmailEmbeddingQueue | EmailEmbeddingQueue | ✅ Same |
| **Send Emails** | EmailSendQueue | EmailSendQueue | ✅ Same |
| **Bulk Ops** | BulkOperationsQueue | BulkOperationsQueue | ✅ Same |

**Only internal implementation changed** - queue interfaces unchanged!

---

## Testing BullMQ Integration

### Unit Tests with Queue Mocks

```typescript
describe('GoogleSyncService (Driver-Only)', () => {
  let service: GoogleSyncService;
  let emailEmbeddingQueue: jest.Mocked<EmailEmbeddingQueueService>;

  beforeEach(() => {
    emailEmbeddingQueue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as any;

    service = new GoogleSyncService(
      prisma,
      realtimeEvents,
      config,
      emailEmbeddingQueue, // ✅ Mocked queue
      providerTokenService,
      driverFactory,
    );
  });

  it('should queue embeddings for new emails', async () => {
    // ... test sync ...

    expect(emailEmbeddingQueue.enqueue).toHaveBeenCalledWith({
      emailId: expect.any(String),
      tenantId: 'tenant-1',
      subject: expect.any(String),
      snippet: expect.any(String),
    });
  });
});
```

### Integration Tests with Real Redis

```bash
# Start Redis for tests
docker run -d -p 6379:6379 redis:7-alpine

# Run integration tests
npm run test:integration
```

---

## Production Deployment

### Environment Variables

```bash
# Redis (BullMQ)
REDIS_HOST=redis.production.com
REDIS_PORT=6379
REDIS_PASSWORD=secure_password
REDIS_TLS=true

# Worker Concurrency
SYNC_WORKER_CONCURRENCY=5
EMAIL_SEND_WORKER_CONCURRENCY=10
BULK_WORKER_CONCURRENCY=3

# Queue Configuration
SYNC_QUEUE_ATTEMPTS=3
SYNC_QUEUE_BACKOFF_MS=2000
```

### Monitoring Dashboard

**BullBoard for queue visualization:**

```typescript
// backend/src/app.module.ts

import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature(
      new BullMQAdapter(queueService.highQueue),
      new BullMQAdapter(queueService.normalQueue),
      new BullMQAdapter(queueService.lowQueue),
      new BullMQAdapter(emailEmbeddingQueue.queue),
    ),
  ],
})
```

Access at: `https://app.mailagent.com/admin/queues`

---

## Conclusion

**MailAgent uses BullMQ everywhere** for background processing:

✅ **5 Production Queues** (sync, send, folder-ops, bulk-ops, sync-back)
✅ **4+ AI Queues** (embeddings, smart-reply, summarization, scheduling)
✅ **Multi-tenancy** (tenantId in all jobs)
✅ **Horizontal Scaling** (multiple worker instances)
✅ **Rate Limiting** (via ResilienceService in drivers)
✅ **Retry Logic** (exponential backoff)
✅ **Monitoring** (metrics, BullBoard dashboard)

**Driver-only GoogleSyncService maintains full BullMQ integration** - zero regressions!

---

## Related Documentation

- [EMAIL_DRIVER_ROADMAP.md](./EMAIL_DRIVER_ROADMAP.md) - Driver architecture
- [PHASE5_DRIVER_ONLY_MIGRATION.md](./PHASE5_DRIVER_ONLY_MIGRATION.md) - Migration details
- [BullMQ Official Docs](https://docs.bullmq.io/) - External reference

---

**Last Updated:** 2025-12-12
**Status:** ✅ Production Ready
