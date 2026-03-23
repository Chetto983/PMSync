# Phase 103: Offline Email Reading - Research

**Researched:** 2026-03-23
**Domain:** TanStack Query persistence to IndexedDB, Service Worker cache cleanup on sign-out
**Confidence:** HIGH

## Summary

Phase 103 requires two capabilities: (1) persisting TanStack Query email data to IndexedDB so users can read emails offline after app restart, and (2) clearing all persisted data and SW caches on sign-out to prevent data leaks between sessions.

The project already uses TanStack Query v5 (`@tanstack/react-query@5.91.2`) with a well-structured query key hierarchy (`emailKeys` factory) and a singleton `QueryClient` with `staleTime: 1min`, `gcTime: 5min` defaults. The `experimental_createPersister` API from `@tanstack/query-persist-client-core` is the correct tool: it persists each query individually to IndexedDB via `idb-keyval`, restores lazily on first use, and respects `staleTime`/`gcTime` semantics. This aligns with the locked decision in STATE.md. The sign-out cleanup requires clearing both the IndexedDB store and all SW caches (`caches.keys()` + `caches.delete()`), plus calling `queryClient.clear()`.

**Primary recommendation:** Use `experimental_createPersister` with `idb-keyval` for per-query IndexedDB persistence, scoped to email queries only via `filters` option. Wire cleanup into the existing `handleLogout` flow in `Header.tsx`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OFFL-03 | User can read recently-synced inbox emails after closing and reopening app without network (TanStack Query persist to IndexedDB) | `experimental_createPersister` + `idb-keyval` persists email list and detail queries to IndexedDB; lazy restore on cold start shows cached data without network |
| SYNC-04 | All IndexedDB data and SW caches cleared on user sign-out (security) | `idb-keyval.clear(store)` + `caches.keys()`/`caches.delete()` + `queryClient.clear()` in sign-out handler |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/query-persist-client-core` | 5.95.0 | Persistence engine for TQ queries | Official TanStack persistence API; `experimental_createPersister` persists per-query (not whole client) |
| `idb-keyval` | 6.2.2 | IndexedDB key-value wrapper | 1KB, zero-config, structured clone (no serialize overhead), used in TQ official examples |

### Already Installed (no changes needed)
| Library | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-query` | 5.91.2 | Query client with email query hooks |
| `@serwist/next` | (installed) | Service worker compilation |
| `better-auth` | (installed) | Auth client with `signOut()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `experimental_createPersister` | `PersistQueryClientProvider` (whole-client persist) | Whole-client serializes ALL queries into one blob; per-query is more efficient, avoids persisting non-email data |
| `idb-keyval` | `idb` (full IndexedDB wrapper) | `idb` is overkill for key-value; `idb-keyval` is 1KB and matches TQ's `AsyncStorage` interface exactly |
| `idb-keyval` | `localForage` | localForage is 8KB+ with driver fallbacks; unnecessary since IndexedDB support is universal in target browsers |

**Installation:**
```bash
cd frontend && npm install @tanstack/query-persist-client-core idb-keyval
```

## Architecture Patterns

### Recommended File Structure
```
frontend/
  lib/
    query-client.tsx          # MODIFY: add persister to QueryClient defaults
    query-persist.ts          # NEW: idb-keyval storage adapter + persister factory
    logout-cleanup.ts         # NEW: clear IndexedDB + SW caches + QueryClient
  hooks/
    queries/
      use-emails.ts           # NO CHANGES (persister works at QueryClient level)
  components/
    layout/
      Header.tsx              # MODIFY: import and call cleanup on sign-out
```

### Pattern 1: Per-Query Persister with idb-keyval
**What:** Create an `AsyncStorage` adapter wrapping `idb-keyval` with a custom store, then pass `experimental_createPersister` to `QueryClient.defaultOptions.queries.persister`.
**When to use:** When you want lazy per-query persistence (each query persisted/restored independently).
**Example:**
```typescript
// frontend/lib/query-persist.ts
import { experimental_createPersister } from '@tanstack/query-persist-client-core';
import type { AsyncStorage } from '@tanstack/query-persist-client-core';
import { get, set, del, clear, createStore } from 'idb-keyval';

const STORE_NAME = 'pmsync-query-cache';
const DB_NAME = 'pmsync-offline';

// Custom store isolates our data from default idb-keyval store
const queryStore = createStore(DB_NAME, STORE_NAME);

function createIdbStorage(): AsyncStorage {
  return {
    getItem: async (key) => await get(key, queryStore),
    setItem: async (key, value) => await set(key, value, queryStore),
    removeItem: async (key) => await del(key, queryStore),
  };
}

export function createQueryPersister() {
  if (typeof window === 'undefined') return undefined;

  return experimental_createPersister({
    storage: createIdbStorage(),
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    prefix: 'tq-',
    // Only persist email-related queries (not AI chat, settings, etc.)
    filters: {
      queryKey: ['emails'],
    },
  });
}

export async function clearPersistedQueries(): Promise<void> {
  await clear(queryStore);
}
```

### Pattern 2: Sign-Out Cleanup
**What:** On sign-out, clear IndexedDB persisted queries, all SW caches, and the in-memory QueryClient.
**When to use:** Every sign-out, before redirect to login.
**Example:**
```typescript
// frontend/lib/logout-cleanup.ts
import { clearPersistedQueries } from './query-persist';
import { getQueryClient } from './query-client';

export async function clearOfflineData(): Promise<void> {
  // 1. Clear IndexedDB persisted queries
  await clearPersistedQueries();

  // 2. Clear all Service Worker caches
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  // 3. Clear in-memory query cache
  getQueryClient().clear();
}
```

### Pattern 3: Wiring Persister into Existing QueryClient
**What:** Modify `makeQueryClient()` in `query-client.tsx` to include the persister in `defaultOptions.queries`.
**When to use:** One-time setup change.
**Key consideration:** The persister must be `undefined` on server (SSR). The existing code already creates the client lazily on the browser side via `getQueryClient()`.
**Example:**
```typescript
// In lib/query-client.tsx, modify makeQueryClient():
import { createQueryPersister } from './query-persist';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 1000 * 60 * 60 * 24, // INCREASE to 24h for persistence
        retry: (failureCount, error) => shouldRetryQuery(failureCount, error, 3),
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnWindowFocus: false,
        persister: createQueryPersister(),
      },
    },
  });
}
```

### Anti-Patterns to Avoid
- **Persisting the entire QueryClient as one blob:** `PersistQueryClientProvider` serializes everything into one localStorage/IDB entry. Slow for large email datasets, persists non-email data unnecessarily.
- **Persisting mutations or AI chat queries:** Only email list/detail queries should be persisted. AI chat history is ephemeral; settings are fetched fresh.
- **Using localStorage for persistence:** Email data can be large (HTML bodies). localStorage has a 5MB limit and blocks the main thread on read/write. IndexedDB is async and has no practical size limit.
- **SW API response caching for /api/* routes:** Already explicitly blocked by `sw.ts` with `NetworkOnly` handler. Do NOT add SW caching for API routes -- it breaks httpOnly cookie auth.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB persistence for TQ | Custom IndexedDB wrapper with versioning/migration | `experimental_createPersister` + `idb-keyval` | TQ handles serialize/deserialize, maxAge expiry, stale detection; idb-keyval handles IndexedDB open/upgrade |
| Query cache serialization | Custom JSON serialization of query cache | TQ's built-in `dehydrate`/`hydrate` in persister | Handles circular refs, Date objects, undefined values correctly |
| Cache clearing on logout | Manual IDB database deletion via raw IndexedDB API | `idb-keyval.clear(store)` + `caches.keys()/delete()` | One-liner, handles edge cases (open transactions, etc.) |

## Common Pitfalls

### Pitfall 1: gcTime Too Short for Persistence
**What goes wrong:** Default `gcTime` is 5 minutes. If user closes app and reopens after 5 min, queries are garbage-collected before the persister can restore them.
**Why it happens:** `gcTime` controls when in-memory cache entries are removed. The persister respects `maxAge` separately, BUT the query must survive GC long enough to be used. On cold start, the persister restores the query -- but if `gcTime` has expired since last fetch, the restored data is immediately garbage-collected.
**How to avoid:** Increase `gcTime` to at least `maxAge` duration (24h). The persister's `maxAge` handles true expiry.
**Warning signs:** Data appears briefly then vanishes on cold offline start.

### Pitfall 2: setQueryData Not Persisted
**What goes wrong:** Optimistic updates via `queryClient.setQueryData()` are NOT persisted by `experimental_createPersister`. Only data from `queryFn` execution is persisted.
**Why it happens:** The persister hooks into `queryFn` completion, not `setQueryData`.
**How to avoid:** This is acceptable for read-only offline. Email data from the server IS persisted (it comes from `queryFn`). Optimistic updates from mutations are transient anyway.
**Warning signs:** None for this phase -- becomes relevant in Phase 104 (offline actions).

### Pitfall 3: SSR Persister Crash
**What goes wrong:** `idb-keyval` accesses `indexedDB` which doesn't exist on the server. Importing at module level crashes SSR.
**Why it happens:** Next.js Pages Router runs `_app.tsx` on both server and client.
**How to avoid:** Guard persister creation with `typeof window === 'undefined'` check. Return `undefined` for server -- TQ handles `undefined` persister gracefully.
**Warning signs:** `ReferenceError: indexedDB is not defined` during SSR.

### Pitfall 4: Stale Offline Data Without Visual Indicator
**What goes wrong:** User opens app offline, sees 24h-old email list, assumes it's current.
**Why it happens:** No visual cue that data is from cache.
**How to avoid:** When offline (detected via existing `useOnlineStatus` hook from Phase 101), show a subtle indicator that data may be stale. The existing offline banner from OFFL-02 already covers this.
**Warning signs:** User confusion about email freshness.

### Pitfall 5: Sign-Out Data Leak
**What goes wrong:** User signs out but IndexedDB retains email data. Next user on shared device can see previous user's emails.
**Why it happens:** `authClient.signOut()` only clears auth cookies/session, not application caches.
**How to avoid:** Call `clearOfflineData()` BEFORE `authClient.signOut()` in the logout handler. Order matters: clear data first, then destroy session.
**Warning signs:** After sign-out + sign-in as different user, old emails briefly visible.

## Code Examples

### Existing Sign-Out Flow (Header.tsx lines 66-70)
```typescript
const handleLogout = async () => {
  setAnchorEl(null);
  await authClient.signOut();
  await router.replace('/auth/login');
};
```
This needs modification to call `clearOfflineData()` before `signOut()`.

### Existing QueryClient (lib/query-client.tsx)
```typescript
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000, // <-- needs increase to 24h
        // ... persister will be added here
      },
    },
  });
}
```

### Email Query Keys (already well-structured)
```typescript
emailKeys.all        // ['emails']
emailKeys.list()     // ['emails', 'list']
emailKeys.detail(id) // ['emails', 'detail', id]
```
The persister's `filters: { queryKey: ['emails'] }` will match all of these.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PersistQueryClientProvider` (whole-client blob) | `experimental_createPersister` (per-query) | TQ v5.x (2024) | Better performance, selective persistence, lazy restore |
| `createSyncStoragePersister` (localStorage) | `createAsyncStoragePersister` or `experimental_createPersister` with `idb-keyval` | TQ v5.x | Sync persister deprecated; IndexedDB is async, larger capacity |
| SW API response caching | Client-side TQ persistence to IndexedDB | Project decision | SW cannot intercept /api/* due to httpOnly cookie auth |

## Open Questions

1. **gcTime increase scope**
   - What we know: `gcTime` must be >= `maxAge` for persistence to work across cold starts. Currently 5min default, email queries override to 30min.
   - What's unclear: Increasing global `gcTime` to 24h means ALL queries (not just email) stay in memory longer. This increases memory usage.
   - Recommendation: Set `gcTime: 24h` only on persisted queries (email list/detail options), NOT globally. Override in `emailsListOptions()` and `emailDetailOptions()`.

2. **Which email queries to persist**
   - What we know: Email list (inbox) and email detail (body) are needed for offline reading.
   - What's unclear: Should threads, conversations, search results, stats also persist?
   - Recommendation: Persist `emailKeys.list()` (inbox), `emailKeys.detail()` (bodies), and `emailKeys.threads()` (thread view). Skip search, stats, drafts (low offline value).

3. **IndexedDB storage quota**
   - What we know: IndexedDB typically allows 50-80% of available disk space (origin-based).
   - What's unclear: How much data typical email caches consume.
   - Recommendation: Not a concern for Phase 103. Email HTML bodies are typically 10-100KB each. Even 1000 emails = ~100MB, well within quota.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + jsdom (frontend/jest.config.js) |
| Config file | `frontend/jest.config.js` |
| Quick run command | `cd frontend && npx jest --testPathPattern="query-persist\|logout-cleanup" --no-coverage` |
| Full suite command | `cd frontend && npx jest --no-coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFFL-03 | Persister created with correct idb-keyval storage config | unit | `cd frontend && npx jest lib/query-persist.test.ts --no-coverage -x` | Wave 0 |
| OFFL-03 | QueryClient includes persister in browser env | unit | `cd frontend && npx jest lib/query-client.test.ts --no-coverage -x` | Wave 0 |
| SYNC-04 | clearOfflineData clears IDB store, SW caches, and query cache | unit | `cd frontend && npx jest lib/logout-cleanup.test.ts --no-coverage -x` | Wave 0 |
| SYNC-04 | handleLogout calls clearOfflineData before signOut | unit | `cd frontend && npx jest components/layout/Header.test.tsx --no-coverage -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx jest --testPathPattern="query-persist|logout-cleanup" --no-coverage`
- **Per wave merge:** `cd frontend && npx jest --no-coverage`
- **Phase gate:** Full suite green + manual offline test (open app, go offline, reopen, verify emails visible)

### Wave 0 Gaps
- [ ] `frontend/lib/query-persist.test.ts` -- covers OFFL-03 persister creation
- [ ] `frontend/lib/logout-cleanup.test.ts` -- covers SYNC-04 cleanup
- [ ] Mock setup for `indexedDB` and `caches` APIs in jsdom (jsdom lacks both)

## Sources

### Primary (HIGH confidence)
- [TanStack Query v5 experimental_createQueryPersister docs](https://tanstack.com/query/v5/docs/react/plugins/createPersister) - API shape, options, filters
- [TanStack Query v5 persistQueryClient docs](https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient) - Whole-client alternative (rejected)
- [idb-keyval GitHub](https://github.com/jakearchibald/idb-keyval) - API: get, set, del, clear, createStore
- Existing codebase: `frontend/lib/query-client.tsx`, `frontend/hooks/queries/use-emails.ts`, `frontend/sw.ts`, `frontend/components/layout/Header.tsx`

### Secondary (MEDIUM confidence)
- [TanStack Query Discussion #6213](https://github.com/TanStack/query/discussions/6213) - Working example of idb-keyval + experimental_createPersister
- [MDN CacheStorage.delete()](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage/delete) - SW cache clearing API
- npm registry: `@tanstack/query-persist-client-core@5.95.0`, `idb-keyval@6.2.2`

### Tertiary (LOW confidence)
- None. All findings verified against official docs or codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official TQ packages, verified versions on npm, codebase already uses TQ v5
- Architecture: HIGH - Pattern directly from TQ official docs + existing codebase structure is clear
- Pitfalls: HIGH - gcTime/maxAge interaction documented in TQ docs; SSR guard is standard Next.js pattern; sign-out cleanup is straightforward Web API

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable APIs, no breaking changes expected)
