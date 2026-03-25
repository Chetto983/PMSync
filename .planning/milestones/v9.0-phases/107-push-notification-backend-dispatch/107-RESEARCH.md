# Phase 107: Push Notification Backend Dispatch - Research

**Researched:** 2026-03-24
**Domain:** Web Push (RFC 8030), BullMQ job queues, NestJS event-driven architecture
**Confidence:** HIGH

## Summary

Phase 107 connects the existing push subscription infrastructure (already built: PushSubscription model, subscribe/unsubscribe endpoints, frontend hook) to actual notification dispatch. The core work is: (1) a BullMQ-backed dispatch worker that calls `web-push.sendNotification()`, (2) an event handler that listens to `email.indexed` / `email.synced` events and enqueues push jobs, (3) stale subscription cleanup on 410/404 responses, (4) per-category push preferences in UserPreferences, (5) thread-level notification grouping with deduplication, and (6) service worker `push` + `notificationclick` handlers.

The project already has `web-push@3.6.7` installed, `BullMQ@5.71.0` with a mature queue config system (`QUEUE_PRESETS`, `QUEUE_NAMES`, shared Redis connection), the `PushSubscription` Prisma model with tenant scoping, and the `EmailIndexedEvent` domain event pattern. This phase follows the exact same pattern as `EmailIndexedHandler` (Phase 45-03).

**Primary recommendation:** Add a `PushDispatchHandler` that listens to `email.indexed`, checks user push preferences, and enqueues a BullMQ job. A `PushDispatchWorker` processes the job by calling `web-push.sendNotification()` for each subscription, deleting stale ones on 410/404. Thread grouping uses a Redis key with short TTL to deduplicate.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PUSH-01 | User receives push notification when a new email arrives | `EmailIndexedEvent` already fires on new email sync. Add `PushDispatchHandler` listener + `PushDispatchWorker` that calls `web-push.sendNotification()` |
| PUSH-02 | Push dispatch routes through BullMQ queue (not inline) | Add `PUSH_DISPATCH` to `QUEUE_NAMES`, use `HIGH` preset. Worker processes jobs asynchronously |
| PUSH-03 | Stale subscriptions deleted on web-push 410/404 response | `web-push.sendNotification()` rejects with `statusCode` on error. Check 410/404 and delete from `push_subscriptions` |
| PUSH-04 | Multi-device delivery | Query all `PushSubscription` records for `(tenantId, userId)` and fan out one job per subscription |
| PUSH-05 | Per-category push preferences (email, calendar, AI) | Add 3 boolean fields to `UserPreferences` schema + DTO. New endpoint `PATCH /push/preferences`. Frontend category toggles |
| PUSH-06 | Click notification opens specific email thread | Service worker `notificationclick` handler reads `data.url` and calls `clients.openWindow()`. Payload includes `/mail/{emailId}` URL |
| PUSH-07 | Thread grouping with count | Redis key `push:thread:{tenantId}:{userId}:{threadId}` with 60s TTL. If key exists, increment count and skip dispatch until TTL expires, then send grouped notification |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| web-push | 3.6.7 | VAPID-signed push dispatch | Already installed. Standard Node.js web push library |
| bullmq | 5.71.0 | Async job queue for push dispatch | Already used across 15+ queues in the project |
| @nestjs/event-emitter | (installed) | Domain event wiring | Already used for `EmailIndexedEvent` pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | (installed) | Thread dedup TTL keys | For PUSH-07 grouping window |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| web-push | Firebase Cloud Messaging | Explicitly out of scope per REQUIREMENTS.md |
| Redis TTL dedup | BullMQ delayed job | Redis TTL is simpler, no extra job lifecycle |

**Installation:** No new packages needed. Everything is already installed.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/modules/push/
  push.module.ts           # Extended: import BullMQ, EventEmitter
  push.controller.ts       # Extended: add PATCH /push/preferences
  push.service.ts          # Extended: add sendToUser(), deleteStale(), getPreferences()
  push-dispatch.handler.ts # NEW: @OnEvent('email.indexed') -> enqueue BullMQ job
  push-dispatch.worker.ts  # NEW: BullMQ worker -> web-push.sendNotification()
  dto/
    push-subscription.dto.ts    # Existing
    push-preferences.dto.ts     # NEW: { pushEmail, pushCalendar, pushAi }

frontend/public/sw.js          # Extended: add 'push' and 'notificationclick' handlers
frontend/components/dashboard/settings/NotificationSettings.tsx  # Extended: category toggles
frontend/lib/api/push.ts       # Extended: add preferences endpoints
```

### Pattern 1: Event-Driven Push Dispatch (follows EmailIndexedHandler)
**What:** Domain event listener enqueues a BullMQ job instead of sending push inline
**When to use:** Always for push dispatch (PUSH-02 requirement)
**Example:**
```typescript
// Source: existing pattern in backend/src/modules/ai/services/email-indexed.handler.ts
@Injectable()
export class PushDispatchHandler {
  constructor(
    @InjectQueue(QUEUE_NAMES.PUSH_DISPATCH)
    private readonly pushQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(EmailIndexedEvent.eventName)
  async handleEmailIndexed(event: EmailIndexedEvent): Promise<void> {
    // Look up userId from providerId
    // Check user push preferences (pushEmail must be true)
    // Enqueue job with payload: { tenantId, userId, category, emailData }
    await this.pushQueue.add('push-email', {
      tenantId: event.tenantId,
      emailId: event.emailId,
      subject: event.subject,
      from: event.from,
      threadId: /* from email record */,
    });
  }
}
```

### Pattern 2: Stale Subscription Cleanup
**What:** On `sendNotification` failure with 410/404, delete the subscription
**When to use:** Every `sendNotification` call
**Example:**
```typescript
// Source: web-push library error handling pattern
try {
  await webpush.sendNotification(subscription, payload);
} catch (error: any) {
  if (error.statusCode === 410 || error.statusCode === 404) {
    // Subscription expired or revoked
    await this.prisma.pushSubscription.delete({
      where: { id: subscription.id },
    });
    this.logger.log(`Deleted stale subscription ${subscription.endpoint}`);
  } else {
    this.logger.error(`Push failed: ${error.statusCode} ${error.body}`);
    throw error; // Let BullMQ retry
  }
}
```

### Pattern 3: Thread Grouping via Redis TTL (PUSH-07)
**What:** Use a Redis key with short TTL to accumulate thread emails before sending
**When to use:** When multiple emails arrive in the same thread within a short window
**Example:**
```typescript
const dedupKey = `push:thread:${tenantId}:${userId}:${threadId}`;
const count = await redis.incr(dedupKey);
if (count === 1) {
  await redis.expire(dedupKey, 60); // 60-second window
  // Schedule delayed job to send grouped notification after window
  await this.pushQueue.add('push-email-grouped', payload, {
    delay: 60_000, // Wait for grouping window
    jobId: dedupKey, // Prevent duplicate delayed jobs
  });
} else {
  // Update the pending job's count (or just let the worker re-query)
  await redis.set(dedupKey, String(count), 'KEEPTTL');
}
```

### Anti-Patterns to Avoid
- **Inline push in event handler:** Never call `webpush.sendNotification()` directly in the `@OnEvent` handler. Always go through BullMQ (PUSH-02).
- **Querying without tenantId:** Every push subscription query MUST include `tenantId` (multi-tenant rule from CLAUDE.md).
- **Ignoring iOS standalone check:** The frontend hook already handles this, but the service worker must not assume push is always available.
- **Hardcoding VAPID keys:** Use `ConfigService` to load `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from environment.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Push protocol | Custom HTTP/2 push | `web-push` library | Handles VAPID signing, encryption, all browser vendor endpoints |
| Job queuing | Custom Redis queue | BullMQ via `QUEUE_NAMES.PUSH_DISPATCH` | Retries, backoff, dead letter, monitoring already configured |
| Deduplication | Custom dedup service | Redis INCR + EXPIRE | Atomic, simple, self-cleaning |
| Service worker | Custom SW from scratch | Extend existing serwist-based sw.js | Already handles caching, precaching; just add push handlers |

**Key insight:** The entire infrastructure is already built. This phase is wiring, not building.

## Common Pitfalls

### Pitfall 1: VAPID Key Mismatch
**What goes wrong:** Frontend uses `NEXT_PUBLIC_VAPID_KEY` for `pushManager.subscribe()`, backend uses `VAPID_PRIVATE_KEY` for `sendNotification()`. If these aren't from the same keypair, every push fails with 403.
**Why it happens:** Keys generated separately or env vars misconfigured.
**How to avoid:** Generate once with `web-push generate-vapid-keys`, set both env vars from the same pair. Verify in Railway env.
**Warning signs:** All push sends fail with 403 Forbidden.

### Pitfall 2: withoutTenantScopingAsync in Event Handlers
**What goes wrong:** `@OnEvent` handlers run outside HTTP request context, so AsyncLocalStorage tenant context is not set. Prisma queries fail.
**Why it happens:** NestJS event emitter dispatches asynchronously.
**How to avoid:** Wrap handler body in `withoutTenantScopingAsync()`, same pattern as `ProviderEventHandlerService`.
**Warning signs:** "Tenant context not found" errors in push handler logs.

### Pitfall 3: Service Worker Update Cycle
**What goes wrong:** Updated service worker with push handler doesn't activate until all tabs are closed and reopened.
**Why it happens:** Service worker lifecycle (install -> waiting -> activate).
**How to avoid:** The existing serwist SW likely has `skipWaiting()` + `clientsClaim()`. Verify this. If not, add them.
**Warning signs:** Push handler works on fresh install but not for existing users until they close all tabs.

### Pitfall 4: Thread Grouping Race Condition
**What goes wrong:** Two emails in the same thread arrive simultaneously, both check Redis before either writes, producing two notifications.
**Why it happens:** Non-atomic check-then-act.
**How to avoid:** Use `INCR` (atomic) instead of `GET` + `SET`. The first caller gets `1`, all others get `>1`.
**Warning signs:** Duplicate grouped notifications.

### Pitfall 5: Push Payload Size Limit
**What goes wrong:** Notification payload exceeds browser limits (varies: ~4KB for most browsers).
**Why it happens:** Including full email body or long subjects.
**How to avoid:** Truncate subject to 120 chars (per UI-SPEC). Only include: title, body, icon, url, tag. Keep payload under 3KB.
**Warning signs:** Silent push failures with no error code.

### Pitfall 6: Missing userId Lookup from EmailIndexedEvent
**What goes wrong:** `EmailIndexedEvent` has `tenantId` and `providerId` but NOT `userId`. You need to look up which user owns the provider.
**Why it happens:** The event was designed for embedding, not user-facing notifications.
**How to avoid:** Query `ProviderConfig` to get `userId` from `providerId`, or query all users in the tenant (for shared mailboxes).
**Warning signs:** Push jobs fail because userId is null.

## Code Examples

### web-push Configuration
```typescript
// Source: web-push npm documentation
import * as webpush from 'web-push';

// In module onModuleInit or provider factory
webpush.setVapidDetails(
  'mailto:admin@pmsync.local',  // Contact email
  configService.get('VAPID_PUBLIC_KEY'),
  configService.get('VAPID_PRIVATE_KEY'),
);
```

### Push Notification Payload Structure
```typescript
// Per UI-SPEC copywriting contract
interface PushPayload {
  title: string;    // "New email from {senderName}" or "{count} new emails in '{threadSubject}'"
  body: string;     // Subject truncated to 120 chars
  icon: string;     // App icon path
  badge: string;    // Badge icon path
  tag: string;      // threadId for grouping (browser-level dedup)
  data: {
    url: string;    // "/mail/{emailId}" for PUSH-06 click navigation
  };
}
```

### Service Worker Push Handler
```javascript
// In frontend/public/sw.js (appended to existing serwist bundle)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icon-192x192.png',
      badge: payload.badge || '/icon-72x72.png',
      tag: payload.tag,          // Browser groups by tag
      renotify: true,            // Vibrate even if tag matches
      data: payload.data,        // { url: '/mail/xxx' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new tab
      return clients.openWindow(url);
    })
  );
});
```

### Prisma Schema Addition for Push Preferences
```prisma
// Add to UserPreferences model
pushEmailEnabled    Boolean  @default(true)
pushCalendarEnabled Boolean  @default(true)
pushAiEnabled       Boolean  @default(true)
```

### Queue Configuration Addition
```typescript
// Add to QUEUE_NAMES in queue.config.ts
PUSH_DISPATCH: 'push-dispatch',

// Use HIGH preset: 5 attempts, 2s exponential backoff
// Push is user-facing, latency matters
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Firebase Cloud Messaging | Web Push API (RFC 8030) via web-push | 2020+ | No vendor lock-in, works on all modern browsers |
| Inline notification dispatch | BullMQ queued dispatch | Project standard | Resilient, retryable, non-blocking |
| Global on/off push toggle | Per-category preferences | This phase | Users control what notifications they receive |

**Deprecated/outdated:**
- Google Cloud Messaging (GCM): Replaced by FCM, which itself is unnecessary when using web-push directly
- `webpush.setGCMAPIKey()`: Not needed when using VAPID authentication

## Open Questions

1. **Service Worker Build Integration**
   - What we know: `sw.js` is a minified serwist bundle (53KB). Push handlers need to be appended.
   - What's unclear: Whether serwist config already supports custom push event handlers, or if we need to add them to the serwist config source.
   - Recommendation: Check `serwist.config.ts` or `next.config.ts` for SW configuration. If serwist supports `additionalPrecacheEntries` or custom event injection, use that. Otherwise, create a separate `push-sw.js` that the main SW imports.

2. **Provider -> User Mapping**
   - What we know: `EmailIndexedEvent` has `providerId` but not `userId`.
   - What's unclear: Whether `ProviderConfig` has a direct `userId` field or needs a join.
   - Recommendation: Check `ProviderConfig` schema. If it has `userId`, query directly. If not, query via tenant membership.

3. **VAPID Keys in Railway**
   - What we know: STATE.md flags "VAPID_PRIVATE_KEY in Railway backend environment" as a blocker.
   - What's unclear: Whether VAPID keys have been generated and deployed.
   - Recommendation: Phase plan should include a Wave 0 task to verify VAPID env vars exist.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern=push --forceExit` |
| Full suite command | `cd backend && npx jest --forceExit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUSH-01 | Push sent on new email event | unit | `npx jest src/modules/push/push-dispatch.handler.spec.ts -x` | No - Wave 0 |
| PUSH-02 | Dispatch goes through BullMQ | unit | `npx jest src/modules/push/push-dispatch.worker.spec.ts -x` | No - Wave 0 |
| PUSH-03 | Stale sub deleted on 410/404 | unit | `npx jest src/modules/push/push.service.spec.ts -x` | No - Wave 0 |
| PUSH-04 | Multi-device fan-out | unit | `npx jest src/modules/push/push.service.spec.ts -x` | No - Wave 0 |
| PUSH-05 | Category preferences CRUD | unit | `npx jest src/modules/push/push.controller.spec.ts -x` | No - Wave 0 |
| PUSH-06 | SW notificationclick navigation | manual-only | Browser-only API (service worker) | N/A |
| PUSH-07 | Thread grouping dedup | unit | `npx jest src/modules/push/push-dispatch.handler.spec.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern=push --forceExit`
- **Per wave merge:** `cd backend && npx jest --forceExit`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/push/push-dispatch.handler.spec.ts` -- covers PUSH-01, PUSH-07
- [ ] `backend/src/modules/push/push-dispatch.worker.spec.ts` -- covers PUSH-02, PUSH-03
- [ ] `backend/src/modules/push/push.service.spec.ts` -- covers PUSH-03, PUSH-04
- [ ] `backend/src/modules/push/push.controller.spec.ts` -- covers PUSH-05

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `backend/src/modules/push/` (existing controller, service, module, Prisma model)
- Codebase inspection: `backend/src/common/config/queue.config.ts` (QUEUE_NAMES, QUEUE_PRESETS)
- Codebase inspection: `backend/src/common/events/email.events.ts` (EmailIndexedEvent, EmailSyncedEvent)
- Codebase inspection: `backend/src/modules/ai/services/email-indexed.handler.ts` (event handler pattern)
- Codebase inspection: `backend/src/modules/email-sync/services/sync-message-processor.service.ts` (event emission)
- Codebase inspection: `frontend/hooks/use-push-subscription.ts` (existing frontend push hook)
- Codebase inspection: `frontend/components/dashboard/settings/NotificationSettings.tsx` (existing UI)
- `npm ls web-push` -> 3.6.7, `npm ls bullmq` -> 5.71.0

### Secondary (MEDIUM confidence)
- [web.dev: Sending messages with web push libraries](https://web.dev/articles/sending-messages-with-web-push-libraries) - push dispatch patterns
- [Pushpad: Web Push errors explained](https://pushpad.xyz/blog/web-push-errors-explained-with-http-status-codes) - 410/404 handling

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and in use
- Architecture: HIGH - follows exact existing patterns (EmailIndexedHandler, queue.config.ts)
- Pitfalls: HIGH - derived from codebase inspection (tenant scoping, event context, payload limits)

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, no moving targets)
