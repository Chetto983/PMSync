# Phase 104: Background Sync - Research

**Researched:** 2026-03-23
**Domain:** Offline mutation queuing, replay on reconnect, queue TTL with notification
**Confidence:** HIGH

## Summary

Phase 104 adds offline email actions (mark-read, archive, star) with optimistic UI, queuing to IndexedDB, automatic replay on reconnect, and TTL-based expiry with user notification. The project already has the core infrastructure from Phase 103: `idb-keyval` (6.2.2) with a custom `createStore`, `useOnlineStatus` hook (useSyncExternalStore over online/offline events), `OfflineBanner` component, and the global toast notification system (`getGlobalToast()`).

The key architectural decision is whether to use TanStack Query's built-in mutation persistence (`setMutationDefaults` + `resumePausedMutations` + `PersistQueryClientProvider`) or a custom lightweight IndexedDB action queue. After investigating TQ's mutation persistence, the custom queue approach is strongly recommended. TQ's mutation persistence has known bugs with `resumePausedMutations` (issue #5847, #6825), requires replacing the provider wrapper, and demands `setMutationDefaults` with `mutationFn` for every mutation type since functions cannot be serialized. The scope here is narrow (3 action types on existing emails) and a custom queue is simpler, more predictable, and fully testable. The existing optimistic update machinery in `useUpdateEmail` already handles the UI-side; the queue only needs to capture failed-while-offline API calls and replay them.

For the BackgroundSync API (`SyncManager.register`), browser support is Chromium-only (Chrome, Edge, Samsung Internet). Safari and Firefox have zero support. The project decision in STATE.md already specifies: "online event as primary, BackgroundSync API as Chromium-only enhancement." This means the `online` event listener is the main replay trigger, with `registration.sync.register('replay-email-actions')` as a progressive enhancement on Chromium.

**Primary recommendation:** Build a custom `OfflineActionQueue` class backed by `idb-keyval` in a dedicated IndexedDB store. Intercept mutations in `useUpdateEmail` (and bulk variants) when offline, queue them, apply optimistic updates to TQ cache. On `online` event, replay sequentially. In the SW, handle `sync` event as enhancement. Expire entries older than 30 minutes on replay attempt with toast notification.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | User can mark-read, archive, and star emails while offline -- actions queue in IndexedDB | Custom `OfflineActionQueue` backed by `idb-keyval` separate store; mutations detect offline via `navigator.onLine` and queue instead of firing API call; optimistic updates via existing `patchEmailLists`/`setQueryData` in `useUpdateEmail` |
| SYNC-02 | Queued actions replay automatically when connection restores (online event + BackgroundSync progressive enhancement) | `window.addEventListener('online', replayQueue)` as primary; `navigator.serviceWorker.ready.then(reg => reg.sync.register('replay-email-actions'))` as Chromium enhancement; SW handles `sync` event |
| SYNC-03 | Queued actions older than 30 minutes are discarded with user notification | Each queued action stores `queuedAt` timestamp; before replay, filter out entries where `Date.now() - queuedAt > 30 * 60 * 1000`; show toast via `getGlobalToast().warning()` with count of expired actions |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `idb-keyval` | 6.2.2 | IndexedDB key-value wrapper for action queue | Already used by Phase 103 for query persistence; 1KB, structured clone, `createStore` for isolation |
| `@tanstack/react-query` | 5.95.1 | Mutation hooks with optimistic updates | Already used; `useUpdateEmail` has full optimistic update machinery |
| `zustand` | 5.0.12 | Reactive queue state (pending count badge) | Already installed; lightweight store for exposing queue length to UI |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom IndexedDB queue | TQ `setMutationDefaults` + `resumePausedMutations` | TQ approach has known bugs (#5847, #6825), requires `PersistQueryClientProvider`, cannot serialize `mutationFn` -- overly complex for 3 action types |
| Custom IndexedDB queue | Workbox BackgroundSync Queue | Workbox queue operates at SW level intercepting fetch requests; project explicitly blocks SW from intercepting /api/* routes (httpOnly cookie auth) -- fundamentally incompatible |
| `idb-keyval` separate store | localStorage | Actions could exceed 5MB limit with many queued items; localStorage is synchronous and blocks main thread |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed from Phase 103
```

## Architecture Patterns

### Recommended File Structure
```
frontend/
  lib/
    offline-action-queue.ts     # NEW: OfflineActionQueue class (idb-keyval backed)
    offline-action-queue.test.ts # NEW: Unit tests
    logout-cleanup.ts           # MODIFY: add clearActionQueue() call
  hooks/
    use-offline-actions.ts      # NEW: Hook wrapping queue for React consumption
    use-offline-actions.test.ts # NEW: Unit tests
    queries/
      use-emails.ts             # MODIFY: intercept mutations when offline
  stores/
    offline-queue-store.ts      # NEW: Zustand store for queue UI state (pending count)
  sw.ts                         # MODIFY: add sync event handler
  locales/
    en.ts                       # MODIFY: add queue-related translation strings
    it.ts                       # MODIFY: add queue-related translation strings
```

### Pattern 1: OfflineActionQueue (IndexedDB-backed)
**What:** A class that manages a FIFO queue of email actions in IndexedDB, separate from the query persist store.
**When to use:** Every time a mutation fires while offline.
**Example:**
```typescript
// frontend/lib/offline-action-queue.ts
import { get, set, del, createStore, keys } from 'idb-keyval';

const DB_NAME = 'pmsync-offline';
const STORE_NAME = 'pmsync-action-queue';
const actionStore = createStore(DB_NAME, STORE_NAME);

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface QueuedAction {
  id: string;          // crypto.randomUUID()
  type: 'update-email';
  emailId: string;
  dto: Record<string, unknown>; // UpdateEmailDto fields
  queuedAt: number;    // Date.now()
}

export async function enqueueAction(action: Omit<QueuedAction, 'id' | 'queuedAt'>): Promise<string> {
  const id = crypto.randomUUID();
  const entry: QueuedAction = { ...action, id, queuedAt: Date.now() };
  await set(id, entry, actionStore);
  return id;
}

export async function getAllActions(): Promise<QueuedAction[]> {
  const allKeys = await keys(actionStore);
  const actions: QueuedAction[] = [];
  for (const key of allKeys) {
    const action = await get<QueuedAction>(key, actionStore);
    if (action) actions.push(action);
  }
  // Sort by queuedAt for FIFO replay
  return actions.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function removeAction(id: string): Promise<void> {
  await del(id, actionStore);
}

export async function clearActionQueue(): Promise<void> {
  const { clear } = await import('idb-keyval');
  await clear(actionStore);
}

export function isExpired(action: QueuedAction): boolean {
  return Date.now() - action.queuedAt > TTL_MS;
}
```

### Pattern 2: Replay Engine
**What:** On `online` event, load all queued actions, discard expired ones (with notification), replay valid ones sequentially via API calls.
**When to use:** Triggered by `online` event listener and optionally by SW `sync` event.
**Example:**
```typescript
// frontend/hooks/use-offline-actions.ts (replay logic)
import { emailsApi } from '@/lib/api/emails';
import { getAllActions, removeAction, isExpired, clearActionQueue } from '@/lib/offline-action-queue';
import { getGlobalToast, getGlobalTranslations } from '@/lib/context/toast-context';
import { getQueryClient } from '@/lib/query-client';
import { emailKeys } from '@/hooks/queries/email-keys';

export async function replayQueuedActions(): Promise<void> {
  const actions = await getAllActions();
  if (actions.length === 0) return;

  const expired = actions.filter(isExpired);
  const valid = actions.filter((a) => !isExpired(a));

  // Discard expired actions and notify user (SYNC-03)
  if (expired.length > 0) {
    for (const action of expired) {
      await removeAction(action.id);
    }
    const t = getGlobalTranslations();
    getGlobalToast().warning(
      t.offlineQueue?.expiredActions?.replace('{count}', String(expired.length))
        || `${expired.length} offline action(s) expired and were discarded.`
    );
  }

  // Replay valid actions sequentially (SYNC-02)
  for (const action of valid) {
    try {
      if (action.type === 'update-email') {
        await emailsApi.updateEmail(action.emailId, action.dto);
      }
      await removeAction(action.id);
    } catch (err) {
      // If still failing (e.g., brief connectivity), stop replay -- will retry next online event
      console.warn('[OfflineQueue] Replay failed, will retry:', err);
      break;
    }
  }

  // Refresh email data after replay
  const queryClient = getQueryClient();
  queryClient.invalidateQueries({ queryKey: emailKeys.list() });
  queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
}
```

### Pattern 3: Mutation Interception When Offline
**What:** Wrap existing mutation hooks to detect offline state and queue actions instead of firing API calls.
**When to use:** In `useUpdateEmail` onMutate -- if offline, queue and skip actual API call.
**Key decision:** Rather than replacing the entire mutation machinery, the cleanest approach is to wrap `emailsApi.updateEmail` at the API level or add offline detection in the mutation hook's `mutationFn`. The optimistic update in `onMutate` already runs BEFORE the `mutationFn`, so the UI updates instantly regardless. If offline, the `mutationFn` should queue instead of calling the API.
**Example:**
```typescript
// In useUpdateEmail mutationFn:
mutationFn: async ({ emailId, dto }: { emailId: string; dto: UpdateEmailDto }) => {
  if (!navigator.onLine) {
    await enqueueAction({ type: 'update-email', emailId, dto });
    // Return a fake response so onSuccess flows proceed
    // (optimistic data already applied in onMutate)
    return { id: emailId, ...dto } as Email;
  }
  return await emailsApi.updateEmail(emailId, dto);
},
```

### Pattern 4: BackgroundSync Progressive Enhancement (SW)
**What:** Register a `sync` tag when actions are queued; SW handles `sync` event to replay.
**When to use:** Chromium browsers only. Falls back gracefully on Safari/Firefox.
**Example:**
```typescript
// In the main thread, after enqueuing an action:
async function requestBackgroundSync(): Promise<void> {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('replay-email-actions');
    } catch {
      // SyncManager not available or denied -- silently ignore
    }
  }
}

// In sw.ts, add sync event handler:
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'replay-email-actions') {
    event.waitUntil(replayFromSW());
  }
});
```

**IMPORTANT SW constraint:** The SW cannot make authenticated API calls because httpOnly cookies are not accessible from the SW context in this project's architecture. The SW sync handler must use `postMessage` to the active client (page) to trigger replay from the main thread. If no client is active, the sync event should be ignored (actions will replay on next page load via `online` event).

### Anti-Patterns to Avoid
- **Using TQ mutation persistence for this scope:** Overly complex, known bugs, requires provider changes. Custom queue is simpler for 3 action types.
- **SW intercepting /api/* for offline queuing:** Explicitly blocked per FOUND-04 decision. Never cache or intercept API routes in the SW.
- **Replaying actions in parallel:** Must replay sequentially to preserve intent order (e.g., mark-read then archive).
- **Retrying expired actions:** Actions older than 30 min MUST be discarded, not retried. Server state may have diverged.
- **Storing entire Email objects in the queue:** Only store `{ emailId, dto }` -- minimal data needed for replay.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB access | Raw IndexedDB API with open/upgrade | `idb-keyval` with `createStore` | Already in project, handles DB creation/versioning, structured clone |
| Unique IDs for queue entries | Counter or timestamp-based IDs | `crypto.randomUUID()` | Globally unique, no collision risk, available in all target browsers |
| Online/offline detection | Manual `navigator.onLine` polling | Existing `useOnlineStatus` hook (useSyncExternalStore) | Already built in Phase 101, reactive, SSR-safe |
| User notifications | Custom notification component | Existing `getGlobalToast()` system | Already wired throughout the app, supports warning/info/error severity |
| Optimistic updates | Custom cache manipulation | Existing `patchEmailLists`/`snapshotEmailLists` in use-emails.ts | Already handles rollback on error |

## Common Pitfalls

### Pitfall 1: navigator.onLine is unreliable
**What goes wrong:** `navigator.onLine` returns `true` even when behind a captive portal or when the connection is extremely poor.
**Why it happens:** The browser only tracks L2 connectivity (WiFi/ethernet link), not actual internet reachability.
**How to avoid:** Don't rely solely on `navigator.onLine` for deciding whether to queue. Instead, catch network errors from failed API calls and queue on failure. Use `navigator.onLine === false` as a fast-path to skip the API call entirely, but also handle `catch` in `mutationFn` to queue on network error.
**Warning signs:** Actions queued despite being "online", or actions not queued despite being unreachable.

### Pitfall 2: SW sync handler cannot make authenticated requests
**What goes wrong:** SW's `sync` event handler tries to call `/api/*` endpoints but fails with 401 because httpOnly cookies are not automatically sent from SW fetch in all contexts.
**Why it happens:** The project uses httpOnly cookie auth. SW fetch behavior with cookies varies by browser.
**How to avoid:** SW sync handler should `postMessage` to the active client (page) to trigger replay from main thread context. If no client is active, skip and let the next page load handle it.
**Warning signs:** 401 errors in SW console during sync event.

### Pitfall 3: Race condition between online event and SW sync
**What goes wrong:** Both the `online` event listener and the SW `sync` event fire simultaneously, causing double-replay.
**Why it happens:** Chromium fires both events when connectivity restores.
**How to avoid:** Use a replay lock -- a simple boolean flag or `navigator.locks.request('offline-queue-replay', ...)` (Web Locks API) to ensure only one replay runs at a time.
**Warning signs:** Duplicate API calls, 409 Conflict responses, inconsistent email state.

### Pitfall 4: Optimistic update not rolled back when queue expires
**What goes wrong:** User marks email as read offline, optimistic update shows it read. 35 minutes later, action expires. Email reverts to unread on next server sync but UI still shows read.
**Why it happens:** Optimistic updates are applied immediately to TQ cache but the actual API call never happened.
**How to avoid:** When discarding expired actions, invalidate related queries to refetch from server. The `replayQueuedActions` function should always call `invalidateQueries` at the end, regardless of whether actions succeeded or expired.
**Warning signs:** UI state diverges from server state after expired actions.

### Pitfall 5: Queue grows unbounded while offline
**What goes wrong:** User performs hundreds of actions while offline, queue becomes very large.
**Why it happens:** No cap on queue size.
**How to avoid:** Set a reasonable max queue size (e.g., 100 actions). When exceeded, discard oldest and warn user. Also, deduplicate: if the same emailId+field is updated multiple times, keep only the latest.
**Warning signs:** Slow replay, IndexedDB storage pressure.

## Code Examples

### Existing Mutation Hook (useUpdateEmail) -- modification target
```typescript
// frontend/hooks/queries/use-emails.ts lines 356-411
// Currently: mutationFn calls emailsApi.updateEmail directly
// Modification: Add offline detection + queue fallback in mutationFn
// Existing onMutate optimistic update remains UNCHANGED
```

### Existing Online Status Hook
```typescript
// frontend/hooks/use-online-status.ts
// Returns boolean, reactive via useSyncExternalStore
// Use in components to show queue badge/status
```

### Existing Toast System
```typescript
// For expired action notification (SYNC-03):
import { getGlobalToast, getGlobalTranslations } from '@/lib/context/toast-context';
getGlobalToast().warning('3 offline actions expired and were discarded.');
```

### Existing Logout Cleanup
```typescript
// frontend/lib/logout-cleanup.ts
// Must add clearActionQueue() call alongside existing clearPersistedQueries()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workbox BackgroundSync Queue (SW-level) | Custom client-side queue + online event | Project decision | SW cannot intercept /api/* due to httpOnly cookies |
| TQ `persistQueryClient` for mutations | Custom IndexedDB queue | TQ v5.x issues | TQ mutation persistence has known bugs; custom is more reliable for narrow scope |
| BackgroundSync as primary | online event as primary, BackgroundSync as enhancement | Project decision (STATE.md) | Safari/Firefox have zero BackgroundSync support |

## Open Questions

1. **Bulk mutations while offline**
   - What we know: `useBulkMarkRead`, `useBulkMarkImportant`, `useBulkMoveEmails` exist with optimistic updates.
   - What's unclear: Should bulk mutations also be queued offline? The success criteria only mention "mark-read, archive, and star" which maps to single-email `useUpdateEmail` and possibly bulk variants.
   - Recommendation: Start with single-email `useUpdateEmail` only. Bulk actions while offline add complexity (larger payloads, order-dependent). Can extend later if needed.

2. **Queue deduplication strategy**
   - What we know: User might toggle star on same email 5 times while offline, creating 5 queue entries.
   - What's unclear: Should we deduplicate to keep only the last state per emailId+field?
   - Recommendation: Yes, deduplicate on enqueue. If an action for the same `emailId` with overlapping `dto` fields exists, update it rather than appending. This keeps the queue lean and avoids unnecessary API calls.

3. **SW postMessage relay reliability**
   - What we know: SW sync handler cannot make authenticated API calls directly.
   - What's unclear: If no client (page) is active when sync fires, actions are lost until next page load.
   - Recommendation: Acceptable tradeoff. The `online` event on page load will handle replay. SW sync is a Chromium-only enhancement for when the page is already open.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + jsdom (`frontend/jest.config.js`) |
| Config file | `frontend/jest.config.js` |
| Quick run command | `cd frontend && npx jest --testPathPattern="offline-action-queue\|use-offline-actions\|offline-queue-store" --no-coverage` |
| Full suite command | `cd frontend && npx jest --no-coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | enqueueAction stores action in IndexedDB | unit | `cd frontend && npx jest lib/offline-action-queue.test.ts --no-coverage -x` | Wave 0 |
| SYNC-01 | useUpdateEmail queues when navigator.onLine=false | unit | `cd frontend && npx jest hooks/queries/use-emails.test.ts --no-coverage -x` | Existing (modify) |
| SYNC-01 | Optimistic update applied even when offline | unit | `cd frontend && npx jest hooks/queries/use-emails.test.ts --no-coverage -x` | Existing (modify) |
| SYNC-02 | replayQueuedActions calls API for each valid action | unit | `cd frontend && npx jest hooks/use-offline-actions.test.ts --no-coverage -x` | Wave 0 |
| SYNC-02 | Online event triggers replay | unit | `cd frontend && npx jest hooks/use-offline-actions.test.ts --no-coverage -x` | Wave 0 |
| SYNC-03 | Expired actions discarded and toast shown | unit | `cd frontend && npx jest hooks/use-offline-actions.test.ts --no-coverage -x` | Wave 0 |
| SYNC-03 | Actions older than 30min identified by isExpired | unit | `cd frontend && npx jest lib/offline-action-queue.test.ts --no-coverage -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx jest --testPathPattern="offline-action-queue|use-offline-actions" --no-coverage`
- **Per wave merge:** `cd frontend && npx jest --no-coverage`
- **Phase gate:** Full suite green + manual test: go offline, star/unstar/mark-read, go online, verify server state

### Wave 0 Gaps
- [ ] `frontend/lib/offline-action-queue.test.ts` -- covers SYNC-01, SYNC-03 (queue CRUD + TTL)
- [ ] `frontend/hooks/use-offline-actions.test.ts` -- covers SYNC-02, SYNC-03 (replay + expiry notification)
- [ ] Mock for `idb-keyval` store in tests (already have `transformIgnorePatterns` exception for idb-keyval in jest.config.js)
- [ ] Mock for `navigator.onLine` in tests (jsdom supports this via `Object.defineProperty`)
- [ ] Mock for `crypto.randomUUID` in tests (jsdom may need polyfill)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `frontend/lib/query-persist.ts`, `frontend/hooks/queries/use-emails.ts` (optimistic update pattern), `frontend/hooks/use-online-status.ts`, `frontend/sw.ts`, `frontend/lib/logout-cleanup.ts`
- [idb-keyval GitHub](https://github.com/jakearchibald/idb-keyval) -- API: get, set, del, clear, keys, createStore
- [MDN Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) -- sync event, SyncManager
- [MDN ServiceWorkerRegistration.sync](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/sync) -- registration API

### Secondary (MEDIUM confidence)
- [TanStack Query v5 Mutations docs](https://tanstack.com/query/v5/docs/framework/react/guides/mutations) -- persist mutations, networkMode, resumePausedMutations (evaluated and rejected for this scope)
- [TanStack Query v5 Network Mode](https://tanstack.com/query/v5/docs/react/guides/network-mode) -- offlineFirst, always, online modes
- [TkDodo: Offline React Query](https://tkdodo.eu/blog/offline-react-query) -- network mode rationale
- [TanStack Query issue #5847](https://github.com/TanStack/query/issues/5847) -- resumePausedMutations bug
- [TanStack Query issue #6825](https://github.com/TanStack/query/issues/6825) -- all mutations stuck in paused state bug
- npm registry: `idb-keyval@6.2.2`, `@tanstack/react-query@5.95.1`, `zustand@5.0.12` (verified installed)

### Tertiary (LOW confidence)
- [Can I Use: Background Sync](https://caniuse.com/background-sync) -- browser support table (Chromium-only confirmed but exact percentages not verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed, no new dependencies
- Architecture: HIGH -- builds on proven Phase 103 patterns (idb-keyval store, useOnlineStatus), existing mutation hooks have full optimistic update machinery
- Pitfalls: HIGH -- authenticated SW limitation is well-understood from FOUND-04; race condition between online/sync is a known pattern; navigator.onLine unreliability is well-documented
- BackgroundSync enhancement: MEDIUM -- SW postMessage relay to client is standard but untested in this codebase; acceptable since it's a progressive enhancement

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable APIs, no breaking changes expected)
