# Email-Sync Module

**Version:** 2.0.0
**Last Updated:** 2025-12-27
**Status:** Production Ready

## Overview

The `email-sync` module provides enterprise-grade email synchronization across multiple providers (Gmail, Microsoft 365, IMAP) with real-time webhooks, distributed processing, and multi-tenant support.

### Key Features

- **Multi-Provider Support:** Gmail API, Microsoft Graph, Generic IMAP
- **Dual Sync Strategy:** Polling + Real-time Webhooks
- **Distributed Processing:** BullMQ workers with Redis-backed queues
- **Multi-Tenant Architecture:** Tenant isolation at all layers
- **Horizontal Scaling:** Supports 1000+ concurrent users
- **Resilience:** Circuit breakers, rate limiting, automatic retry

---

## Architecture

┌─────────────────────────────────────────────────────────────────────┐
│                        Email-Sync Module                             │
├─────────────────────────────────────────────────────────────────────┤
│  Controllers                                                         │
│  ├── EmailSyncController     - Sync triggers & status               │
│  ├── WebhookController       - Gmail/Microsoft webhook endpoints     │
│  └── FoldersController       - Folder CRUD operations               │
├─────────────────────────────────────────────────────────────────────┤
│  Sync Services (Provider-Specific)                                   │
│  ├── GoogleSyncService       - Gmail API synchronization            │
│  ├── MicrosoftSyncService    - Microsoft Graph synchronization      │
│  └── ImapSyncService         - Generic IMAP synchronization         │
├─────────────────────────────────────────────────────────────────────┤
│  Webhook Services (Real-time)                                        │
│  ├── GmailWebhookService     - Pub/Sub push notifications           │
│  ├── MicrosoftWebhookService - Graph change notifications           │
│  └── WebhookLifecycleService - Subscription management              │
├─────────────────────────────────────────────────────────────────────┤
│  Queue Services (BullMQ)                                             │
│  ├── QueueService            - Primary sync queue                   │
│  ├── FolderOperationsQueue   - Folder CRUD operations               │
│  ├── EmailSendQueue          - Outbound email sending               │
│  ├── ProviderSyncBackQueue   - Write-back to providers              │
│  └── BulkOperationsQueue     - Batch operations                     │
├─────────────────────────────────────────────────────────────────────┤
│  Workers (BullMQ Processors)                                         │
│  ├── SyncWorker              - Email synchronization jobs           │
│  ├── FolderOperationsWorker  - Folder management jobs               │
│  ├── EmailSendWorker         - Email sending jobs                   │
│  ├── SyncBackWorker          - Provider write-back jobs             │
│  └── BulkOperationsWorker    - Batch processing jobs                │
├─────────────────────────────────────────────────────────────────────┤
│  Drivers (Phase 2 Abstraction)                                       │
│  ├── GoogleDriver            - Gmail API wrapper                    │
│  ├── MicrosoftDriver         - Microsoft Graph wrapper              │
│  └── IMAPDriver              - Generic IMAP client                  │
└─────────────────────────────────────────────────────────────────────┘

---

## Module Components

### Controllers

| Controller | Endpoint | Description |
|------------|----------|-------------|

| `EmailSyncController` | `/api/v1/email-sync/*` | Sync triggers, status, health |
| `WebhookController` | `/webhooks/*` | Gmail Pub/Sub, Microsoft Graph notifications |
| `FoldersController` | `/api/v1/folders/*` | Folder CRUD with async queue operations |

### Sync Services

| Service | Provider | Features |
|---------|----------|----------|

| `GoogleSyncService` | Gmail | History-based incremental sync, label management |
| `MicrosoftSyncService` | Microsoft 365 | Delta sync, category management |
| `ImapSyncService` | Generic IMAP | MODSEQ-based sync, connection pooling |

### Webhook Services

| Service | Description |
|---------|-------------|

| `GmailWebhookService` | Google Pub/Sub push notifications with historyId tracking |
| `MicrosoftWebhookService` | Microsoft Graph subscriptions with clientState validation |
| `WebhookLifecycleService` | Automated subscription renewal, health monitoring |

### Queue Services

| Queue | Purpose | Priority |
|-------|---------|----------|

| `sync-queue` | Primary email synchronization | High |
| `folder-operations` | Folder create/rename/delete | Medium |
| `email-send` | Outbound email delivery | High |
| `sync-back` | Write-back changes to providers | Medium |
| `bulk-operations` | Batch label/move/delete | Low |

### Workers

| Worker | Queue | Concurrency |
|--------|-------|-------------|

| `SyncWorker` | sync-queue | 5 per instance |
| `FolderOperationsWorker` | folder-operations | 3 per instance |
| `EmailSendWorker` | email-send | 10 per instance |
| `SyncBackWorker` | sync-back | 5 per instance |
| `BulkOperationsWorker` | bulk-operations | 2 per instance |

### Email Drivers

| Driver | Provider | Protocol |
|--------|----------|----------|

| `GoogleDriver` | Gmail | REST API (googleapis) |
| `MicrosoftDriver` | Microsoft 365 | REST API (Graph) |
| `IMAPDriver` | Generic | IMAP4rev1 (imapflow) |

---

## Security Features

### Rate Limiting

- **Redis-based distributed rate limiting** (Phase 8 fix)
- Atomic Lua scripts prevent TOCTOU race conditions
- Per-provider and per-subscription limits

```typescript
// Rate limit configuration
RATE_LIMIT_WINDOW_SECONDS = 60;
RATE_LIMIT_MAX_REQUESTS = 100;
```

### Webhook Security

| Provider | Validation Method |
|----------|-------------------|

| Gmail | Pub/Sub token verification |
| Microsoft | clientState header matching |

### Distributed Locking

- Redis-backed locks via `RedisLockService`
- Prevents concurrent sync operations on same provider
- Automatic lock extension for long-running operations

---

## Scalability Features

### Horizontal Scaling

- Stateless workers (multiple instances supported)
- Redis-backed job queues (BullMQ)
- Distributed rate limiting and locking

### Queue Backpressure

```typescript
// Per-queue capacity limits
HIGH_PRIORITY: { max: 2000, maxPerProvider: 100 }
MEDIUM_PRIORITY: { max: 3000, maxPerProvider: 150 }
LOW_PRIORITY: { max: 5000, maxPerProvider: 200 }
```

### Circuit Breaker

- Per-provider circuit breaker pattern
- Automatic recovery with half-open state
- Failure threshold: 5 consecutive failures

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|

| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JOBS_ENABLED` | Enable/disable background jobs | `true` |
| `SYNC_INTERVAL_MINUTES` | Default sync interval | `15` |
| `GMAIL_PUBSUB_TOPIC` | Gmail Pub/Sub topic | Required |
| `MICROSOFT_EMAIL_WEBHOOK_URL` | Microsoft webhook callback | Auto-derived |
| `API_PUBLIC_URL` | Public API URL for webhooks | Required |

### Sync Intervals

| Priority | Interval | Activity Threshold |
|----------|----------|--------------------|

| High | 3 min | >4 emails/hour |
| Medium-High | 15 min | 2-4 emails/hour |
| Medium | 30 min | 0.5-2 emails/hour |
| Low | 2 hours | <0.5 emails/hour |
| Very Low | 6 hours | Inactive accounts |

---

## Data Flow

### Inbound Sync (Provider → Database)

Provider API → Driver → Canonical Format → BaseEmailSyncService → Prisma → Database
                                                    ↓
                                            WebSocket Event → Frontend

### Outbound Sync (Database → Provider)

User Action → API → SyncBackQueue → SyncBackWorker → Driver → Provider API
                                          ↓
                                   Update Database

### Webhook Flow

Provider Webhook → WebhookController → WebhookService → Validate → Queue Sync Job
                                              ↓
                                    Dedup + Rate Limit

---

## Canonical Types

All provider-specific data is normalized to canonical types for consistent handling:

| Type | Description |
|------|-------------|

| `CanonicalMessage` | Unified email representation |
| `CanonicalFolder` | Unified folder representation |
| `EmailAddress` | Standardized address format |
| `AttachmentMeta` | Attachment metadata |

### Folder Mapping

| Canonical | Gmail | Microsoft | IMAP |
|-----------|-------|-----------|------|

| INBOX | INBOX | inbox | INBOX |
| SENT | SENT | sentitems | Sent |
| DRAFTS | DRAFT | drafts | Drafts |
| TRASH | TRASH | deleteditems | Trash |
| SPAM | SPAM | junkemail | Junk |

---

## Error Handling

### Retry Strategy

```typescript
RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000,
  EXPONENTIAL_BASE: 2,
  JITTER_FACTOR: 0.1
}
```

### Retryable Errors

- HTTP 429 (Rate Limited)
- HTTP 500, 502, 503, 504 (Server Errors)
- Network timeouts
- Token expiration (auto-refresh)

### Non-Retryable Errors

- HTTP 400 (Bad Request)
- HTTP 401 (Unauthorized - requires re-auth)
- HTTP 403 (Forbidden)
- HTTP 404 (Not Found)

---

## Monitoring

### Health Endpoints

| Endpoint | Description |
|----------|-------------|

| `/api/v1/email-sync/health` | Module health status |
| `/api/v1/email-sync/webhooks/health` | Webhook subscription status |
| `/api/v1/email-sync/queues/stats` | Queue statistics |

### Key Metrics

- Sync job completion rate
- Webhook notification latency
- Queue depth per priority
- Provider error rates
- Rate limit hits

---

## Development

### Testing

```bash
# Run unit tests
npm run test:unit -- --grep email-sync

# Run integration tests
npm run test:integration -- --grep email-sync
```

### Adding a New Provider

1. Create driver in `drivers/<provider>/`
2. Implement `EmailDriverInterface`
3. Add sync service in `services/<provider>/`
4. Register in `DriversModule` and `EmailSyncModule`
5. Add webhook service if real-time supported

---

## Phase History

| Phase | Description | Status |
|-------|-------------|--------|

| 1 | Critical race condition fixes | ✅ Complete |
| 2 | Driver abstraction layer | ✅ Complete |
| 3 | Dead code cleanup | ✅ Complete |
| 4 | Code consolidation | ✅ Complete |
| 5 | Security hardening | ✅ Complete |
| 6 | Multi-tenant scalability | ✅ Complete |
| 7 | Phase 6 follow-ups | ✅ Complete |
| 8 | Re-audit & final fixes | ✅ Complete |

### LOC Savings

- **Duplicate code removed:** ~2,210 LOC
- **Dead code removed:** ~150 LOC
- **Total savings:** ~2,360 LOC

---

## License

Proprietary - All rights reserved.
