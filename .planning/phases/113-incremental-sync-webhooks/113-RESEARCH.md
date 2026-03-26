# Phase 113: Incremental Sync & Webhooks - Research

**Researched:** 2026-03-26
**Domain:** Incremental email synchronization (delta sync) and webhook-triggered sync for Gmail, Outlook, and IMAP
**Confidence:** HIGH

## Summary

Phase 113 validates that incremental sync and webhook-triggered sync work correctly for all three providers. The entire infrastructure already exists and has been production-deployed through 10+ milestones of hardening. This phase is **validation and bug-fixing only** -- no new features need to be built.

The incremental sync pipeline is: `SyncWorker` receives `SyncJobData` with `syncType: 'incremental'` -> delegates to `{Google,Microsoft,Imap}SyncService.syncProvider()` -> `BaseEmailSyncService` checks for `lastSyncToken` in provider metadata -> `SyncOrchestrationService.executeIncrementalSync()` calls `driver.getChangesSince(lastSyncToken)` -> processes added/modified/deleted changes -> stores new sync token. The webhook pipeline is: Provider sends notification to `/webhooks/gmail/push` or `/webhooks/microsoft/notifications` -> `WebhookController` validates auth -> `{Gmail,Microsoft}WebhookService.handleNotification()` with Redis distributed lock -> queues a high-priority incremental sync job via `QueueService.addSyncJob()`.

**Primary recommendation:** Write validation scripts per provider that (1) perform a known mutation on the provider (send an email, mark as read, delete), (2) trigger incremental sync, (3) verify the local DB reflects the change. For webhooks, trigger a real provider-side change and verify the webhook fires and queues a sync. Fix bugs found in-place.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-04 | Incremental sync via Gmail history API picks up new/changed/deleted emails | `GmailSyncService.getChangesSince()` uses `users.history.list()` with `historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved']`. Handles 404 (expired historyId -> fullSyncRequired), 403 (quota), 429 (rate limit), 5xx. MAX_PAGES=25, MAX_CHANGES=10000. Token = Gmail historyId from `users.getProfile()`. |
| SYNC-05 | Incremental sync via Microsoft delta API picks up new/changed/deleted emails | `MicrosoftSyncService.getChangesSince()` uses delta query per folder (INBOX, SENT, DRAFTS, TRASH). Token = JSON map of deltaLinks. `@removed` -> deleted, else -> modified. Handles 410 Gone (expired token). `MicrosoftSyncService.onIncrementalChanges()` detects significant token changes with no changes as possible expiration. |
| SYNC-06 | Incremental sync via IMAP detects new/changed emails | `ImapMessageService.getChangesSince()` uses CONDSTORE/HIGHESTMODSEQ per folder (INBOX, SENT, DRAFTS, TRASH, ARCHIVE). Token = comma-separated `folder:modseq` pairs. Falls back to date-based search if no CONDSTORE. Multi-folder sync token parsing via `parseSyncToken()`. |
| SYNC-07 | Gmail Pub/Sub webhook triggers sync on new email arrival | `WebhookController.handleGmailPush()` -> validates JWT or webhook token -> `GmailWebhookService.handleNotification()` decodes base64 Pub/Sub data -> finds provider by email -> Redis lock per provider -> queues incremental sync (or full if historyId gap). Uses BigInt for historyId comparison. |
| SYNC-08 | Microsoft Graph webhook triggers sync on new email arrival | `WebhookController.handleMicrosoftNotification()` -> handles validation token for subscription setup -> `MicrosoftWebhookService.handleNotifications()` -> per-notification: rate limiting, Redis dedup, subscription lookup, clientState validation -> queues incremental sync. |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | 11 | Backend framework | Project stack |
| Prisma | Latest | ORM / DB queries | Project stack |
| BullMQ | Latest | Job queue for sync workers | Already used for all sync operations |
| googleapis | Latest | Gmail API client (history API, watch API, profile) | Already used by GoogleDriver |
| axios | Latest | HTTP client for MS Graph (delta queries, subscriptions) | Already used by MicrosoftDriver |
| imapflow | Latest | IMAP client (CONDSTORE, MODSEQ) | Already used by IMAPDriver |
| Playwright | Latest | E2E browser validation via Edge CDP | Existing project pattern |
| pg | Latest | Direct PostgreSQL queries in validation scripts | Existing project pattern |

### Supporting (for validation scripts)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| playwright | existing | Browser-authenticated API calls | When validation needs auth cookies from Edge CDP |
| pg (node-postgres) | existing | Direct DB comparison queries | When validation script runs outside NestJS context |

**Installation:** No new dependencies needed.

## Architecture Patterns

### Incremental Sync Flow
```
SyncSchedulerService (cron every 5 min)
  or
WebhookController (real-time push)
    |
    v
QueueService.addSyncJob({ syncType: 'incremental', priority: 'high' })
    |
    v
SyncWorker.processJob()
    |
    +-> FolderSyncService.syncProviderFolders() [with Redis lock]
    |
    +-> BaseEmailSyncService.syncProvider()
          |
          +-- checks provider.metadata.lastSyncToken
          |
          +-> SyncOrchestrationService.executeIncrementalSync()
                |
                +-> driver.getChangesSince(lastSyncToken)
                |     Gmail: users.history.list() with historyId
                |     Microsoft: delta query per folder with deltaLink
                |     IMAP: CONDSTORE MODSEQ per folder
                |
                +-> For each change:
                |     'added'/'modified' -> driver.getMessage() -> messageProcessor.upsertMessage()
                |     'deleted' -> messageProcessor.handleDeletion()
                |
                +-> Return newSyncToken (persisted to provider.metadata.lastSyncToken)
```

### Webhook Flow (Gmail)
```
Google Pub/Sub -> POST /webhooks/gmail/push
    |
    +-> JWT verification (OIDC) or webhook token
    +-> Replay detection (Redis SET NX)
    +-> GmailWebhookService.handleNotification()
          |
          +-> Decode base64 Pub/Sub data (emailAddress, historyId)
          +-> Find provider by email
          +-> Redis distributed lock per provider
          +-> BigInt historyId comparison for gap detection
          +-> Queue incremental sync (or full if gap)
          +-> Persist historyId to provider metadata
```

### Webhook Flow (Microsoft)
```
Microsoft Graph -> POST /webhooks/microsoft/notifications
    |
    +-> Validation token echo (subscription setup)
    +-> MicrosoftWebhookService.handleNotifications()
          |
          +-> Per notification:
          |     +-> Redis rate limiting (100 req/min per subscription)
          |     +-> Redis distributed dedup (subscriptionId:resourceId:changeType)
          |     +-> Subscription lookup in DB
          |     +-> Timing-safe clientState validation
          |     +-> Queue incremental sync
```

### Key Token Formats
| Provider | Token Format | Storage | Expiration Handling |
|----------|-------------|---------|---------------------|
| Gmail | historyId (bigint string) | `provider.metadata.lastSyncToken` | 404 -> fullSyncRequired |
| Microsoft | JSON map `{ INBOX: deltaLink, SENT: deltaLink, ... }` | `provider.metadata.lastSyncToken` | 410 Gone -> refresh per folder |
| IMAP | Comma-separated `folder:modseq` pairs | `provider.metadata.lastSyncToken` | Fallback to date-based search |

### Anti-Patterns to Avoid
- **Testing webhooks without a real provider push:** The webhook controller has specific auth validation (JWT, webhook token, clientState). Don't mock the controller -- test through it.
- **Assuming CONDSTORE is available:** Some IMAP servers do not support CONDSTORE. The code has a fallback to date-based search. Validation must cover both paths if the test IMAP server supports CONDSTORE.
- **Ignoring the full-sync fallback in incremental:** `BaseEmailSyncService.syncProvider()` has logic that forces a full sync when incremental returns 0 changes and folder counts look incomplete (IMAP-SYNC-FIX). This is intentional behavior, not a bug.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sync token management | Custom token tracking | Existing `SyncOrchestrationService` + `SyncTokenService` | Multi-provider token formats already handled |
| Webhook dedup | Custom dedup logic | Existing `BaseWebhookService.checkAndMarkProcessed()` + Redis | Production-tested with fallback |
| Rate limiting | Custom rate limiter | Existing `RedisRateLimiterService` | Per-subscription Redis-based |
| Distributed locking | Custom mutex | Existing `RedisLockService.withLock()` | Used throughout sync pipeline |

## Common Pitfalls

### Pitfall 1: Gmail historyId Integer Overflow
**What goes wrong:** Gmail historyId can exceed `Number.MAX_SAFE_INTEGER` (2^53-1). JavaScript number comparison loses precision.
**Why it happens:** Gmail historyId is a monotonically increasing integer that has been running since Gmail's inception.
**How to avoid:** The code already uses BigInt for comparison in `GmailWebhookService.processWebhookWithLock()`. Validation should verify this works with large historyId values.
**Warning signs:** Incorrect gap detection (webhook always triggers full sync instead of incremental).

### Pitfall 2: Microsoft Delta Token Expiration
**What goes wrong:** Microsoft delta links expire. When you call an expired delta link, you get 410 Gone.
**Why it happens:** Microsoft Graph delta tokens have a limited lifetime (varies, typically days to weeks).
**How to avoid:** `MicrosoftSyncService.getChangesSince()` catches 410/400 and refreshes the token for that folder. `MicrosoftSyncService.onIncrementalChanges()` detects token change with no results as possible expiration.
**Warning signs:** Incremental sync consistently returns 0 changes for Microsoft despite activity.

### Pitfall 3: IMAP Servers Without CONDSTORE
**What goes wrong:** `getChangesSince()` can't use MODSEQ-based change detection.
**Why it happens:** Not all IMAP servers support RFC 4551 (CONDSTORE). The code checks `mailboxStatus.highestModseq`.
**How to avoid:** Fallback to date-based search is already implemented. Validation should verify the fallback path works.
**Warning signs:** `hasCondstore = false` in logs; date-based sync returning excessive changes.

### Pitfall 4: Webhook Auth Configuration
**What goes wrong:** Gmail webhook returns 401 or silently accepts without validation.
**Why it happens:** Missing `GOOGLE_PUBSUB_AUDIENCE` env var, or missing `GOOGLE_PUBSUB_SERVICE_ACCOUNT`.
**How to avoid:** Check env vars before testing. Gmail Pub/Sub sends JWT; if GOOGLE_PUBSUB_AUDIENCE is not set, `verifyPubSubToken` returns false but the request is accepted with a warning.
**Warning signs:** Log message "Pub/Sub JWT present but GOOGLE_PUBSUB_AUDIENCE not configured".

### Pitfall 5: Microsoft Webhook Requires Public URL
**What goes wrong:** Microsoft Graph subscription creation fails because the notification URL is not reachable.
**Why it happens:** Microsoft validates the webhook URL by sending a validation token on subscription creation. The URL must be HTTPS and publicly reachable.
**How to avoid:** Ensure `API_PUBLIC_URL` or `MICROSOFT_EMAIL_WEBHOOK_URL` is configured and publicly accessible. For local testing, use a tunnel (ngrok, Cloudflare Tunnel).
**Warning signs:** Subscription creation fails with HTTP error from Graph API.

### Pitfall 6: Webhook-First Cron Suppression
**What goes wrong:** After webhook triggers sync, the cron scheduler may also trigger a redundant sync.
**Why it happens:** `SyncSchedulerService.getProvidersToSync()` excludes providers with recent webhook notifications (`WEBHOOK_STALE_THRESHOLD_MINUTES` = 10 min). If the webhook notification timestamp is not updated, cron kicks in.
**How to avoid:** Verify `WebhookSubscription.lastNotificationAt` is updated on every notification (done in `BaseWebhookService.updateSubscriptionStats()`).
**Warning signs:** Duplicate sync jobs for the same provider within minutes.

## Code Examples

### Gmail Incremental Sync Token Flow
```typescript
// Source: GmailSyncService.getChangesSince()
// 1. Get current historyId
const profile = await gmail.users.getProfile({ userId: 'me' });
const currentHistoryId = profile.data.historyId;

// 2. Fetch history changes
const history = await gmail.users.history.list({
  userId: 'me',
  startHistoryId: lastSyncToken,
  historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
  maxResults: 500,
});

// 3. Parse changes: messagesAdded, labelsAdded/Removed, messagesDeleted
// 4. Return: { changes, newSyncToken: currentHistoryId, hasMore }
```

### Microsoft Delta Query Token Flow
```typescript
// Source: MicrosoftSyncService.getChangesSince()
// Token format: JSON.stringify({ INBOX: deltaLink, SENT: deltaLink, ... })
const tokenMap = JSON.parse(syncToken);

for (const [folder, deltaLink] of Object.entries(tokenMap)) {
  const response = await client.get(deltaLink, { baseURL: '' });
  // @removed -> 'deleted', else -> 'modified'
  // @odata.deltaLink -> new token, @odata.nextLink -> hasMore
}
```

### IMAP CONDSTORE Token Flow
```typescript
// Source: ImapMessageService.getChangesSince()
// Token format: "INBOX:12345,SENT:67890,DRAFTS:11111"
const folderModSeqs = parseSyncToken(syncToken); // Map<string, bigint>

for (const canonicalFolder of SYNC_FOLDERS) {
  const status = await client.status(folderPath, { highestModseq: true });
  if (status.highestModseq > lastModSeq) {
    // Fetch messages with modseq > lastModSeq
    for await (const msg of client.fetch({ modseq: lastModSeq + 1n }, ...)) {
      changes.push({ messageId: `${folderPath}:${msg.uid}`, type: ... });
    }
  }
}
```

### Webhook Validation Pattern
```typescript
// Source: WebhookController.handleGmailPush()
// 1. Check for JWT (Google Pub/Sub sends OIDC JWT)
const jwtToken = authorizationHeader?.replace(/^Bearer\s+/i, '').trim();
if (jwtToken) {
  await gmailWebhook.verifyPubSubToken(jwtToken);
} else {
  syncAuth.validateWebhookToken(webhookToken, queryToken);
}

// 2. Replay detection
const isNew = await gmailWebhook.checkAndMarkProcessed(messageId);

// 3. Handle notification (bypasses tenant scoping - webhook has no HTTP context)
await withoutTenantScopingAsync(() => gmailWebhook.handleNotification(payload));
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Standalone validation scripts (.mjs) + Playwright E2E |
| Config file | N/A (scripts follow existing project pattern) |
| Quick run command | `node scripts/validate-incremental-sync.mjs` |
| Full suite command | `node scripts/validate-incremental-sync.mjs --all-providers` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-04 | Gmail history API incremental sync | integration | `node scripts/validate-incremental-sync.mjs --provider gmail` | Wave 0 |
| SYNC-05 | Microsoft delta API incremental sync | integration | `node scripts/validate-incremental-sync.mjs --provider microsoft` | Wave 0 |
| SYNC-06 | IMAP CONDSTORE incremental sync | integration | `node scripts/validate-incremental-sync.mjs --provider imap` | Wave 0 |
| SYNC-07 | Gmail Pub/Sub webhook triggers sync | integration | `node scripts/validate-webhook-sync.mjs --provider gmail` | Wave 0 |
| SYNC-08 | Microsoft Graph webhook triggers sync | integration | `node scripts/validate-webhook-sync.mjs --provider microsoft` | Wave 0 |

### Sampling Rate
- **Per task commit:** Run validation for the specific provider being tested
- **Per wave merge:** Run all provider validations
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/validate-incremental-sync.mjs` -- covers SYNC-04, SYNC-05, SYNC-06
- [ ] `scripts/validate-webhook-sync.mjs` -- covers SYNC-07, SYNC-08

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis | BullMQ queues, distributed locks, dedup | Must verify runtime | - | None (blocking) |
| PostgreSQL | Prisma DB | Must verify runtime | - | None (blocking) |
| Gmail test account | SYNC-04, SYNC-07 | Must verify runtime | - | Skip Gmail tests |
| Outlook test account | SYNC-05, SYNC-08 | Must verify runtime | - | Skip Outlook tests |
| IMAP test account | SYNC-06 | Must verify runtime | - | Skip IMAP tests |
| Google Pub/Sub topic | SYNC-07 | Requires GOOGLE_PUBSUB_TOPIC env var | - | Skip Gmail webhook test |
| Public webhook URL | SYNC-08 | Requires API_PUBLIC_URL or tunnel | - | Skip MS webhook test |

**Missing dependencies with no fallback:**
- Redis and PostgreSQL are required for all sync operations

**Missing dependencies with fallback:**
- Individual provider test accounts: skip specific provider tests if unavailable
- Webhook infrastructure (Pub/Sub topic, public URL): skip webhook tests, test incremental sync only

## Open Questions

1. **Google Pub/Sub Topic Configuration**
   - What we know: `GOOGLE_PUBSUB_TOPIC` env var is used. Gmail watch API needs a Cloud Pub/Sub topic.
   - What's unclear: Whether the topic is configured in the current Railway/Vercel deployment.
   - Recommendation: Check Railway env vars before attempting SYNC-07 validation.

2. **Microsoft Webhook Public URL**
   - What we know: Microsoft Graph requires HTTPS public URL for webhook creation. `MICROSOFT_EMAIL_WEBHOOK_URL` or `API_PUBLIC_URL` is used.
   - What's unclear: Whether the Railway backend has a public URL configured that Microsoft can reach.
   - Recommendation: Check Railway env vars and test subscription creation before SYNC-08 validation.

3. **IMAP CONDSTORE Availability**
   - What we know: The code handles both CONDSTORE-capable and non-CONDSTORE servers.
   - What's unclear: Whether the test IMAP server supports CONDSTORE.
   - Recommendation: Validate both paths. Check server capabilities via `onBeforeSync` log output.

## Sources

### Primary (HIGH confidence)
- Codebase analysis of `backend/src/modules/email-sync/` -- all driver implementations, services, interfaces, workers
- `GmailSyncService.getChangesSince()` -- Gmail History API implementation with full error handling
- `MicrosoftSyncService.getChangesSince()` -- Microsoft delta query with multi-folder token management
- `ImapMessageService.getChangesSince()` -- IMAP CONDSTORE with date-based fallback
- `GmailWebhookService` / `MicrosoftWebhookService` -- webhook handling with Redis dedup, rate limiting, distributed locking
- `WebhookController` -- webhook endpoint auth validation
- `SyncOrchestrationService.executeIncrementalSync()` -- change processing loop
- `BaseEmailSyncService.syncProvider()` -- incremental/full sync decision logic
- `SyncSchedulerService` -- cron scheduling with webhook-first optimization

### Secondary (MEDIUM confidence)
- Phase 112 research and validation patterns -- validation script approach proven in previous phase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies
- Architecture: HIGH - complete code review of all incremental sync and webhook code paths
- Pitfalls: HIGH - derived from actual code (error handling, edge cases in implementations)

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable codebase, validation-only phase)
