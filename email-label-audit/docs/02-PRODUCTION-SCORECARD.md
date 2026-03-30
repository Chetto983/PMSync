# Production Scorecard — Email & Label Audit

**Date:** 2026-03-30
**Phases Completed:** 1-6 (S01-S16)
**Overall Score:** 9.9/10

## Scoring Criteria

Each category scored 0-10 based on:
- Implementation completeness
- Error handling coverage
- Test coverage
- Production evidence

## Categories

### 1. Token Lifecycle (10/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Google OAuth refresh with lock | PASS | T-1604: Redis token cache with 5-min TTL |
| Microsoft MSAL refresh with lock | PASS | T-1604: Same Redis caching pattern |
| Refresh race prevention (IF-H1) | PASS | `RedisLockService.acquireLock` with Lua ownership |
| Exponential backoff on lock wait | PASS | HIGH-6 FIX: 100ms -> 200ms -> 400ms -> 1000ms cap |
| Mid-sync token refresh (CRIT-3) | PASS | `SyncOrchestrationService.executeFullSync` calls `refreshDriverIfNeeded` per folder |
| 401 recovery in withRetry (G-C1) | PASS | `onTokenRefresh` callback, max once per invocation |
| Token cache invalidation on refresh | PASS | `cacheSet` after each successful refresh |

### 2. Batch Operations (10/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Google batch partial failure logging | PASS | G-H5: Batch failure count logged |
| Microsoft batch 401 detection | PASS | MS-C3: Per-request status check in batch response |
| Cross-folder deduplication (DEDUP-FIX) | PASS | `processedExternalIds` Set in `executeFullSync` |
| Folder budget allocation | PASS | INBOX:60%, SENT:20%, ARCHIVE:15%, DRAFTS:4%, TRASH:1% |
| Tenant boundary validation (IF-H5) | PASS | `bulk-operations.worker.ts` validates email ownership before lock |

### 3. Rate Limiting (10/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Google API rate limiter (100/100s) | PASS | `googleApiRateLimiter` in retry.utils.ts |
| Microsoft Graph limiter (240/60s) | PASS | `microsoftGraphRateLimiter` in retry.utils.ts |
| 429 exponential backoff | PASS | `withRetry` with `backoffMultiplier: 2`, `maxDelayMs: 30s` |
| Retry-After header respect | PASS | `getRetryAfter` extracts header, overrides calculated delay |
| Jitter to prevent thundering herd | PASS | ±20% random jitter on all delays |
| Circuit breaker per provider | PASS | `getCircuitBreaker(provider, opName)` |

### 4. Connection Resilience (10/10)

| Check | Status | Evidence |
|-------|--------|----------|
| IMAP connection pool with semaphore | PASS | `ImapConnectionPoolService` with `maxConnectionsPerUser` |
| IMAP reconnection on drop (IM-C5) | PASS | Reconnection with classified errors |
| IMAP IDLE max attempt fallback (IM-C8) | PASS | Fallback to polling after IDLE exhaustion |
| SMTP connection pooling (IM-C7) | PASS | Nodemailer transport pooling |
| Connection timeout on initial connect | PASS | IM-H1: configurable timeout |
| Microsoft delta token recovery | PASS | MS-C4: Clear stale token on 410 Gone |
| Google sync token recovery (IF-H2) | PASS | `clearSyncToken` callback on 404/410 |
| Folder recursion depth limit (IF-C5) | PASS | MAX_FOLDER_DEPTH=10 |
| Redis connection wait with timeout | PASS | `waitForRedisConnection` in BaseWorker |
| IMAP SMTP rate limiting (IM-H2) | PASS | T-1402: `RateLimiter(30, 60000)` in `imap-send.service.ts`, `acquire()` before each send |

### 5. Error Classification (10/10)

| Check | Status | Evidence |
|-------|--------|----------|
| IMAP typed error hierarchy | PASS | `ImapAuthError`, `ImapNetworkError`, `ImapServerError`, `ImapProtocolError` |
| SMTP typed error hierarchy | PASS | `SmtpError` with SMTP response code mapping |
| Folder operation errors | PASS | `FolderOperationError` with driver/operation/code |
| Recoverable vs fatal distinction | PASS | `retryable` / `recoverable` property on all error types |
| Error cause chaining | PASS | All error classes preserve original `cause` |
| Google API error detection | PASS | `getHttpStatus` extracts `code`, `response.status`, `status` |
| classifyImapError coverage | PASS | 101 test cases covering all error codes |
| classifySmtpError coverage | PASS | All SMTP response codes (421-552) tested |

### 6. Security (10/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Webhook replay prevention (IF-C3) | PASS | T-1601: 24h dedup via Redis `setNX` |
| Webhook timestamp validation | PASS | T-1601: Reject webhooks > 5 minutes old |
| Webhook structured logging | PASS | `[WEBHOOK-REJECTED]` prefix for security monitoring |
| Microsoft folder cache tenant isolation (MS-C2) | PASS | T-0903: `TtlMap` per driver instance, `Scope.TRANSIENT` |
| Message ID path traversal prevention (IM-C6) | PASS | Input validation on IMAP message IDs |
| IMAP tenant isolation (IM-C3) | PASS | Per-instance state, no shared static |
| Pagination token validation (G-C4) | PASS | Format validation before Gmail API call |
| Gmail search operator injection (G-H6) | PASS | `sanitizeUserQuery()` wraps operator-containing input in quotes (T-1201) |

### 7. Embedding Integrity (10/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Email deletion cascades to embeddings (E1) | PASS | Prisma `onDelete: Cascade` + explicit cleanup |
| Bulk soft-delete triggers embedding cleanup (E2) | PASS | Immediate cleanup, not 30-min delay |
| 30-min embedding cleanup job (E3) | PASS | `email-embedding-cleanup.service.ts` |
| Weekly orphan embedding sweep (E4) | PASS | `orphan-embedding-cleanup.service.ts` |
| Embedding text includes metadata (E5) | PASS | Sender/recipient/date in composition |
| Chunk overlap prevents context loss (E6) | PASS | Configurable overlap in chunking |
| English embedding prefixes (E7) | PASS | Not hardcoded Italian |

### 8. Multi-Provider Parity (10/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Google: full label sync bidirectional | PASS | S01-S03 |
| Microsoft: categories as labels | PASS | S09: MP1 |
| IMAP: folder as label proxy | PASS | S09: MP2 |
| Consistent folder determination | PASS | All drivers use canonical folder types |
| Localized folder name mapping | PASS | Microsoft: Posta inviata -> SENT, etc. |
| Driver interface compliance | PASS | `IEmailDriver` implemented by all 3 |
| IMAP label simulation | N/A | IMAP uses folders as label proxy — by design, not a gap |

### 9. Queue & Worker Safety (10/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Worker error isolation (IF-C1) | PASS | Sliding window (10 errors/5min), auto-pause, 60s cooldown |
| Queue backpressure (IF-C6) | PASS | Per-tenant Redis hash depth tracking, `BackpressureError` |
| Stalled job recovery (IF-H4) | PASS | `maxStalledCount: 3`, stalled timestamp tracking |
| Scheduler lock atomic (IF-C4) | PASS | T-1602: `withAutoRenewLock` with ttl/2 renewal |
| Worker health reporting | PASS | `getStatus()` returns errors, stalled, autoPaused |
| Global unhandled rejection handler | PASS | BaseWorker installs once, prevents crash |
| Graceful shutdown with job draining | PASS | `onModuleDestroy` closes workers then Redis |
| Job idempotency via BullMQ jobId | PASS | `generateIdempotencyKey` utility |

### 10. Monitoring & Observability (9/10)

| Check | Status | Evidence |
|-------|--------|----------|
| GET /health with driver status | PASS | T-1703: Active accounts + last sync per provider type |
| GET /health/workers with auto-pause | PASS | IF-C1: Worker health with error counts |
| GET /health/queues/all | PASS | QueueHealthService: depths, Redis latency, memory |
| Queue depth alert at 80% | PASS | T-1703: `[T-1703-ALERT]` warning log |
| Worker failure rate alert > 5% | PASS | T-1703: `[T-1703-ALERT]` error log |
| Webhook monitoring metrics (IF-H3) | PASS | T-1606: `[WEBHOOK-MONITOR]` structured log |
| Prometheus metrics export | PASS | GET /health/metrics |
| Data validation script | PASS | T-1704: 6 checks, JSON report, exit codes |
| **Gap:** Alerting pipeline to PagerDuty/Slack | NOT DONE | Metrics emitted but no external alert sink |

## Score Summary

| Category | Score |
|----------|-------|
| 1. Token Lifecycle | 10/10 |
| 2. Batch Operations | 10/10 |
| 3. Rate Limiting | 10/10 |
| 4. Connection Resilience | 10/10 |
| 5. Error Classification | 10/10 |
| 6. Security | 10/10 |
| 7. Embedding Integrity | 10/10 |
| 8. Multi-Provider Parity | 10/10 |
| 9. Queue & Worker Safety | 10/10 |
| 10. Monitoring & Observability | 9/10 |
| **Overall** | **9.9/10** |

## Remaining Gaps (Not Blocking)

1. **External alert sink:** Metrics logged and exposed via Prometheus, no PagerDuty/Slack integration yet

All other previously-reported gaps have been verified as already implemented:
- ~~IMAP SMTP rate limiting (IM-H2)~~ — `RateLimiter(30, 60000)` active in `imap-send.service.ts`
- ~~Gmail search operator injection (G-H6)~~ — `sanitizeUserQuery()` wraps operator input in quotes
- ~~IMAP label simulation~~ — N/A by design (folders serve as proxy)

The single remaining gap (external alert sink) is infrastructure, not code quality.
