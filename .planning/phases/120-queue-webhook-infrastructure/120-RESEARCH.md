# Phase 120: Queue & Webhook Infrastructure - Research

**Researched:** 2026-03-30
**Domain:** BullMQ queue health, Gmail Pub/Sub, Microsoft Graph webhooks, Prometheus metrics
**Confidence:** HIGH

## Summary

Phase 120 is a **validation-only** phase. All infrastructure code already exists: BullMQ queues with health monitoring, Prometheus metrics collection, Gmail Pub/Sub webhook lifecycle, Microsoft Graph subscription lifecycle, and a webhook health endpoint. The work is to **verify** these systems function correctly against live providers and fix any bugs found in-place.

The codebase has a mature queue infrastructure with centralized configuration (`queue.config.ts`), a comprehensive health service (`QueueHealthService`), Prometheus metrics via `prom-client` + `QueueMetricsCollector`, and provider-specific webhook services with distributed locking, deduplication, and renewal. The "7 BullMQ queues" in INFRA-01 refers to the email-sync operational queues: `email-sync-high`, `email-sync-normal`, `email-sync-low`, `email-send`, `provider-sync-back`, `bulk-operations`, and `folder-operations`.

**Primary recommendation:** Write a validation script (`scripts/validate-queue-webhook-infra.mjs`) following the existing pattern (CDP-based, using `validation-helpers.mjs`) that hits the health endpoints, verifies queue status, tests pause/resume, and checks webhook subscription lifecycle. Fix any bugs discovered in-place.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | All 7 BullMQ queues report healthy status with correct metrics | `GET /health/queues/all` returns status for all queues via `QueueHealthService.getHealthStatus()`. Prometheus gauge `bullmq_queue_depth` populated by `QueueMetricsCollector` every 15s. The 7 email queues: email-sync-high/normal/low, email-send, provider-sync-back, bulk-operations, folder-operations. |
| INFRA-02 | Queue pause/resume works without data loss | BullMQ `Queue.pause()` / `Queue.resume()` are native APIs. Test by pausing a queue, adding jobs, resuming, then verifying all jobs process. `QueueHealthService.getQueueStatus()` reports `paused` flag. |
| INFRA-03 | Gmail Pub/Sub subscription create and renew lifecycle works | `GmailWebhookService.createSubscription()` calls `gmail.users.watch()`, stores in `WebhookSubscription` table. `renewExpiringSubscriptions()` finds subscriptions expiring within 24h and re-creates them. Triggered by BullMQ scheduled job `WEBHOOK_RENEWAL` every 6 hours. |
| INFRA-04 | Microsoft Graph subscription create and renew lifecycle works | `MicrosoftWebhookService.createSubscription()` POSTs to Graph API `/subscriptions`, stores with `clientState`. `renewSubscription()` PATCHes expiration. Expired subscriptions are recreated via `recreateSubscription()`. Max expiry: 4230 minutes (~3 days). |
| INFRA-05 | Webhook health endpoint reports accurate status | `GET /webhooks/health` returns Gmail and Microsoft stats (active, expiring, errors). `WebhookLifecycleService.getHealthStatus()` provides aggregated view with issues list. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Post-Edit Validation:** After EVERY file edit, run `cd backend && npx tsc --noEmit` (backend) or `cd frontend && npx tsc --noEmit` (frontend)
- **Multi-tenant rule:** Every query MUST include `tenantId`
- **SCOPE CONTROL:** Do exactly what was asked. Never add unrequested features
- **FOLLOW EXISTING PATTERNS:** Never invent new approaches when codebase patterns exist
- **Max 500 lines per file**
- **Never save working files to root** -- use `scripts/` for validation scripts
- **Bugs found during validation get fixed in-place** (from STATE.md decisions)

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| bullmq | ^5.67.3 | Job queue framework | All 7 email queues + scheduled jobs |
| ioredis | ^5.9.3 | Redis client for BullMQ | Shared connection via `getSharedRedisConnection()` |
| googleapis | ^171.4.0 | Gmail Pub/Sub watch API | `gmail.users.watch()` / `gmail.users.stop()` |
| axios | (installed) | Microsoft Graph API calls | Subscription CRUD |
| prom-client | (installed) | Prometheus metrics | Via `@willsoto/nestjs-prometheus` |

No new packages needed. This is a validation phase.

## Architecture Patterns

### Queue Infrastructure Layout
```
backend/src/
  common/
    config/queue.config.ts          # QUEUE_NAMES, QUEUE_PRESETS, WORKER_PRESETS
    services/queue-health.service.ts # QueueHealthService - monitors ALL queues
    metrics/queue-metrics.collector.ts # QueueMetricsCollector - bullmq_queue_depth gauge
    workers/base.worker.ts           # BaseWorker - auto-pause on error threshold
  modules/
    email-sync/
      services/queue.service.ts      # QueueService - email-sync-high/normal/low
      services/email-send-queue.service.ts
      services/provider-sync-back-queue.service.ts
      services/bulk-operations-queue.service.ts
      services/folder-operations-queue.service.ts
      services/gmail-webhook.service.ts
      services/microsoft-webhook.service.ts
      services/webhook-lifecycle.service.ts
      controllers/webhook.controller.ts
    health/
      controllers/health.controller.ts  # /health/queues/all, /health/workers
```

### The 7 Email-Operational BullMQ Queues
| Queue Name | Service | Preset | Workers |
|------------|---------|--------|---------|
| `email-sync-high` | QueueService | HIGH | sync.worker.ts |
| `email-sync-normal` | QueueService | NORMAL | sync.worker.ts |
| `email-sync-low` | QueueService | LOW | sync.worker.ts |
| `email-send` | EmailSendQueueService | HIGH | email-send.worker.ts |
| `provider-sync-back` | ProviderSyncBackQueueService | NORMAL | sync-back.worker.ts |
| `bulk-operations` | BulkOperationsQueueService | NORMAL | bulk-operations.worker.ts |
| `folder-operations` | FolderOperationsQueueService | FOLDER_OPS | folder-operations.worker.ts |

### Health Endpoints (Existing)
| Endpoint | Returns | Source |
|----------|---------|--------|
| `GET /health` | System health (db, redis, mistral, queue summary) | HealthService |
| `GET /health/queues` | Email-sync queue metrics only | HealthService |
| `GET /health/queues/all` | All queues: waiting/active/completed/failed/delayed/paused | QueueHealthService |
| `GET /health/queues/:name` | Single queue status | QueueHealthService |
| `GET /health/workers` | Worker health (auto-pause, error counts) | BaseWorker.getAll() |
| `GET /webhooks/health` | Gmail + Microsoft webhook stats | WebhookController |

### Webhook Lifecycle
- **Gmail Pub/Sub:** `gmail.users.watch()` creates subscription. Expiry: ~7 days. Renewed by `WEBHOOK_RENEWAL` scheduled job (every 6h). Notifications arrive at `POST /webhooks/gmail/push`.
- **Microsoft Graph:** `POST /subscriptions` creates subscription. Max expiry: 4230 min (~3 days). Renewed via `PATCH /subscriptions/{id}`. Expired subs recreated (cannot renew after expiry). Notifications at `POST /webhooks/microsoft/notifications`. Validation handshake via `?validationToken=` query param.
- **Lifecycle service:** `WebhookLifecycleService` handles renewal, deep check (3 AM), cleanup (weekly). Uses distributed Redis locks. Auto-creates webhooks for new providers.
- **Scheduled jobs:** WEBHOOK_RENEWAL (every 6h), WEBHOOK_DEEP_CHECK (daily 3 AM), WEBHOOK_CLEANUP (weekly Sunday 4 AM).

### Validation Script Pattern
All previous phases use the same pattern:
```javascript
// scripts/validate-*.mjs
import { connectCDP, getAuthCookies, getCsrfToken, apiGet, report } from './lib/validation-helpers.mjs';

async function main() {
  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  // Run validation checks via API calls
  const results = [];
  results.push(/* check results */);

  const exitCode = report('Phase Name', results);
  await browser.close();
  process.exit(exitCode);
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Queue health monitoring | Custom Redis introspection | `QueueHealthService.getHealthStatus()` | Already monitors all queues via QUEUE_NAMES registry |
| Prometheus metrics | Manual metric collection | `QueueMetricsCollector` + `bullmq_queue_depth` gauge | Already collects every 15s |
| Queue pause/resume | Custom worker stop/start | BullMQ native `Queue.pause()` / `Queue.resume()` | Atomic, handles active jobs correctly |
| Webhook stats | Manual DB queries | `BaseWebhookService.getStats()` + `WebhookLifecycleService.getHealthStatus()` | Consolidates all provider stats |
| Validation scripting | New test framework | Existing `validation-helpers.mjs` CDP pattern | All 8 previous phases use it |

## Common Pitfalls

### Pitfall 1: QueueHealthService monitors ALL queues, not just email ones
**What goes wrong:** INFRA-01 says "all 7 BullMQ queues" but `QueueHealthService` initializes queues for ALL `QUEUE_NAMES` entries (30+). Validation must filter to the 7 email-operational queues.
**How to avoid:** When validating INFRA-01, check that the 7 specific email queues appear in the health response and report healthy. Don't fail if other queues (CRM, contacts, calendar) have issues.

### Pitfall 2: Queue pause test must not disrupt live processing
**What goes wrong:** Pausing a live queue during validation could delay real user emails.
**How to avoid:** Use the `low` priority queue for pause/resume testing (least impact). Add a job with a known ID, pause, add another job, resume, verify both complete. Keep the pause window short (<5 seconds).

### Pitfall 3: Gmail watch requires valid Google Cloud Pub/Sub setup
**What goes wrong:** `gmail.users.watch()` fails if GOOGLE_PUBSUB_TOPIC is not configured or the Pub/Sub topic doesn't grant the Gmail service account push permissions.
**How to avoid:** First check that GOOGLE_PUBSUB_TOPIC env var is set. If not, the test should report "SKIPPED (no Pub/Sub topic configured)" rather than FAIL. Same for GMAIL_CLIENT_ID/SECRET.

### Pitfall 4: Microsoft Graph subscription requires publicly accessible webhook URL
**What goes wrong:** Microsoft validates the webhook URL during subscription creation by sending a POST with `?validationToken=`. If the URL is not publicly accessible (localhost), creation fails.
**How to avoid:** Check API_PUBLIC_URL or MICROSOFT_EMAIL_WEBHOOK_URL config. If pointing to localhost, skip the live creation test and only validate existing subscriptions in the DB.

### Pitfall 5: Webhook health endpoint is @Public() but still needs tenant bypass
**What goes wrong:** Webhook health calls Prisma queries without tenant context, hitting tenant scoping middleware.
**How to avoid:** The existing code already uses `withoutTenantScopingAsync()` in the health endpoint. Verify this works correctly in the validation.

### Pitfall 6: BullMQ pause() is per-worker, not per-queue
**What goes wrong:** `Queue.pause()` pauses the queue for all workers, but if the worker hasn't registered against that queue yet, the pause flag is just metadata.
**How to avoid:** Use `queue.isPaused()` to verify pause took effect, then add a job and check it remains in `waiting` state (not picked up). After resume, verify the job transitions to `active`/`completed`.

## Code Examples

### Checking queue health via API
```javascript
// From validation script
const healthRes = await apiGet(context, '/health/queues/all', cookies);
// Returns: { status: 'healthy'|'degraded'|'unhealthy', queues: [...], summary: {...} }

const emailQueues = ['email-sync-high', 'email-sync-normal', 'email-sync-low',
  'email-send', 'provider-sync-back', 'bulk-operations', 'folder-operations'];

for (const queueName of emailQueues) {
  const queueStatus = healthRes.queues.find(q => q.name === queueName);
  assert(queueStatus, `Queue ${queueName} found in health response`);
  assert(!queueStatus.paused, `Queue ${queueName} is not paused`);
}
```

### Checking webhook health via API
```javascript
const webhookHealth = await apiGet(context, '/webhooks/health', cookies);
// Returns: { status: 'ok', gmail: { activeSubscriptions, ... }, microsoft: { activeSubscriptions, ... } }
```

### Checking Prometheus metrics
```javascript
// The /metrics endpoint (prom-client) exposes bullmq_queue_depth gauge
const metricsRes = await apiGet(context, '/metrics', cookies);
// Text format includes: bullmq_queue_depth{queue="email-sync-high",state="waiting"} 0
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js validation scripts (mjs) + Playwright CDP |
| Config file | `scripts/lib/validation-helpers.mjs` |
| Quick run command | `node scripts/validate-queue-webhook-infra.mjs --quick` |
| Full suite command | `node scripts/validate-queue-webhook-infra.mjs` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | All 7 queues healthy with metrics | integration | `node scripts/validate-queue-webhook-infra.mjs --check=queues` | No -- Wave 0 |
| INFRA-02 | Queue pause/resume without data loss | integration | `node scripts/validate-queue-webhook-infra.mjs --check=pause-resume` | No -- Wave 0 |
| INFRA-03 | Gmail Pub/Sub lifecycle | integration | `node scripts/validate-queue-webhook-infra.mjs --check=gmail` | No -- Wave 0 |
| INFRA-04 | Microsoft Graph lifecycle | integration | `node scripts/validate-queue-webhook-infra.mjs --check=microsoft` | No -- Wave 0 |
| INFRA-05 | Webhook health accuracy | integration | `node scripts/validate-queue-webhook-infra.mjs --check=webhook-health` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `node scripts/validate-queue-webhook-infra.mjs --quick`
- **Per wave merge:** `node scripts/validate-queue-webhook-infra.mjs`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/validate-queue-webhook-infra.mjs` -- main orchestrator
- [ ] `scripts/lib/validate-queue-health.mjs` -- INFRA-01, INFRA-02 checks
- [ ] `scripts/lib/validate-webhook-lifecycle.mjs` -- INFRA-03, INFRA-04, INFRA-05 checks

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis | BullMQ queues | Assumed (Railway) | -- | None (blocking) |
| PostgreSQL | WebhookSubscription table | Assumed (Railway) | -- | None (blocking) |
| Google Pub/Sub | INFRA-03 | Depends on GOOGLE_PUBSUB_TOPIC env var | -- | Skip test with warning |
| Microsoft Graph API | INFRA-04 | Depends on active Microsoft provider | -- | Skip test with warning |
| Edge CDP (port 9222) | Validation scripts | Required for running scripts | -- | Cannot validate without |

**Missing dependencies with no fallback:**
- Redis and PostgreSQL must be running (production on Railway)

**Missing dependencies with fallback:**
- Gmail Pub/Sub: if topic not configured, skip INFRA-03 live creation and only validate existing subscriptions
- Microsoft Graph: if no Microsoft provider exists, skip INFRA-04 live creation and validate existing only

## Open Questions

1. **Which 7 queues does INFRA-01 mean?**
   - What we know: QUEUE_NAMES has 30+ entries. The requirement says "All 7 BullMQ queues."
   - Best interpretation: The 7 email-operational queues (email-sync-high/normal/low, email-send, provider-sync-back, bulk-operations, folder-operations) which are the core email pipeline.
   - Recommendation: Validate these 7 specifically, report on all others as informational.

2. **Can pause/resume be tested safely in production?**
   - What we know: Pausing a queue stops all workers from picking up new jobs.
   - What's unclear: Whether this is safe to do on a live system with real emails.
   - Recommendation: Use the `low` priority queue (least traffic), keep pause duration under 5 seconds, add a synthetic test job to verify behavior.

## Sources

### Primary (HIGH confidence)
- `backend/src/common/config/queue.config.ts` -- QUEUE_NAMES registry, all presets
- `backend/src/common/services/queue-health.service.ts` -- QueueHealthService full implementation
- `backend/src/common/metrics/queue-metrics.collector.ts` -- Prometheus gauge collector
- `backend/src/modules/email-sync/services/gmail-webhook.service.ts` -- Gmail watch/renew/cancel
- `backend/src/modules/email-sync/services/microsoft-webhook.service.ts` -- Microsoft subscription CRUD
- `backend/src/modules/email-sync/services/webhook-lifecycle.service.ts` -- Renewal orchestration
- `backend/src/modules/email-sync/controllers/webhook.controller.ts` -- Webhook endpoints
- `backend/src/modules/health/controllers/health.controller.ts` -- Health endpoints
- `backend/prisma/schema.prisma` -- WebhookSubscription model

### Secondary (MEDIUM confidence)
- Existing validation scripts (validate-webhook-sync.mjs, validate-folder-ops.mjs) -- pattern reference

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed, versions verified from package.json
- Architecture: HIGH -- full codebase audit of all relevant files
- Pitfalls: HIGH -- derived from reading actual implementation code and known constraints

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable infrastructure, no fast-moving dependencies)
