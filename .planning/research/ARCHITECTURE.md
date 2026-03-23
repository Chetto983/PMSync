# Architecture Patterns: PWA Integration into PMSync

**Domain:** PWA for existing Next.js 16 email client
**Researched:** 2026-03-23
**Confidence:** HIGH (official Next.js docs + Serwist docs + Workbox patterns verified)

## Recommended Architecture

### Architecture Overview

PMSync is a **Pages Router** app (not App Router). All pages live under `pages/`, the entry point is `pages/_app.tsx`, and API proxy lives at `pages/api/v1/[...path].ts`. The PWA layer must integrate without migrating to App Router.

The PWA adds three new layers that sit **alongside** existing code:

1. **Service Worker** (sw.ts) -- a separate execution context running in the browser, outside React
2. **PWA Shell** (manifest, meta tags, install prompt) -- wired into `_document.tsx` and `_app.tsx`
3. **Offline/Sync Bridge** (hooks + IndexedDB queue) -- connects SW capabilities to TanStack Query and Zustand

```
+---------------------------------------------------+
|                  Browser Tab                       |
|  +---------------------------------------------+  |
|  |  Next.js Pages Router (_app.tsx)             |  |
|  |  +--------+ +-----------+ +---------------+ |  |
|  |  |TanStack| |  Zustand  | |  Socket.IO    | |  |
|  |  | Query  | | UI Stores | |  WebSocket    | |  |
|  |  +---+----+ +-----+-----+ +-------+-------+ |  |
|  |      |             |               |          |  |
|  |      v             v               v          |  |
|  |  [useOfflineStatus] [usePWAInstall]           |  |
|  |  [useBackgroundSync] [usePushSubscription]    |  |
|  +-----+-------------------+---------------------+  |
|        |                   |                         |
|  +-----v-------------------v-----+                   |
|  |  navigator.serviceWorker      |  <-- postMessage  |
|  +-------------------------------+       bridge       |
+---------------------------------------------------+
         |
+--------v------------------------------------------+
|  Service Worker (sw.js, generated from sw.ts)     |
|  +--------------------------------------------+   |
|  | Serwist core (precache + runtime cache)    |   |
|  +--------------------------------------------+   |
|  | Custom handlers:                           |   |
|  |   - API cache (NetworkFirst for /api/v1/)  |   |
|  |   - Push event listener                    |   |
|  |   - Background sync (IndexedDB queue)      |   |
|  |   - Offline fallback page                  |   |
|  +--------------------------------------------+   |
+---------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `sw.ts` (Service Worker source) | Precaching, runtime caching, push handling, background sync, offline fallback | Browser Cache API, IndexedDB, Push API |
| `@serwist/next` (build plugin) | Wraps next.config.js, generates precache manifest, compiles sw.ts to public/sw.js | Webpack/Turbopack build pipeline |
| `public/manifest.json` | PWA metadata (name, icons, display mode, theme color) | Browser install flow |
| `_document.tsx` additions | Manifest link, apple-touch-icon, theme-color meta | Browser PWA detection |
| `_app.tsx` additions | SW registration, online/offline state provider | Service Worker API |
| `useOfflineStatus` hook | Tracks navigator.onLine + SW message channel | `_app.tsx`, email components |
| `usePWAInstall` hook | Captures beforeinstallprompt, provides install(), tracks standalone mode | Install prompt component |
| `usePushSubscription` hook | Subscribe/unsubscribe push, sends PushSubscription to backend | Push API, backend API |
| `useBackgroundSync` hook | Queues failed mutations to IndexedDB, registers SW sync events | IndexedDB, SW sync API |
| `OfflineBanner` component | Shows "You are offline" bar when disconnected | `useOfflineStatus` |
| `InstallPromptBanner` component | Install CTA for Android/desktop, iOS instructions | `usePWAInstall` |
| `PushSettingsPanel` component | Push notification toggle in settings | `usePushSubscription` |
| `OfflineFallbackPage` (pages/~offline.tsx) | Shown when navigating to uncached route while offline | Service Worker fallback |

### Data Flow

#### Normal Flow (Online)

No change. TanStack Query fetches from `/api/v1/*` proxy, which forwards to NestJS backend. Service worker intercepts but uses **NetworkFirst** strategy -- network response is served and cached simultaneously.

#### Offline Read Flow

1. User navigates to inbox while offline
2. Service Worker intercepts `/api/v1/emails?folder=INBOX` request
3. NetworkFirst strategy fails network, falls back to cached response
4. TanStack Query receives cached response (stale data, but functional)
5. `useOfflineStatus` sets `isOffline: true`
6. UI shows `OfflineBanner` and disables mutation buttons (compose, send)

#### Offline Action Queue Flow (Background Sync)

1. User marks email as read while offline
2. Mutation hook calls API, service worker intercepts the failing request
3. SW stores request payload in IndexedDB action queue
4. SW registers a `sync` event tag (e.g., `pmsync-action-sync`)
5. When connectivity returns, browser fires `sync` event
6. SW replays queued actions from IndexedDB to backend
7. SW posts message to client via `postMessage` channel
8. `useBackgroundSync` hook receives message, invalidates relevant TanStack Query keys

#### Push Notification Flow (Frontend Only -- v8.0 Scope)

1. User enables push in Settings
2. `usePushSubscription` calls `registration.pushManager.subscribe()` with VAPID key
3. Hook sends PushSubscription JSON to backend endpoint (new: `POST /api/v1/push/subscribe`)
4. Backend stores subscription (future milestone sends push via web-push)
5. SW listens for `push` event, shows notification
6. On `notificationclick`, SW opens app to relevant URL

## Integration Points with Existing Architecture

### 1. next.config.js -- Serwist Build Plugin

**What changes:** Wrap existing config with `withSerwist()`.

```javascript
// next.config.js
const withSerwistInit = require('@serwist/next').default;
const bundleAnalyzer = require('@next/bundle-analyzer');

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

const withSerwist = withSerwistInit({
  swSrc: 'service-worker/sw.ts',
  swDest: 'public/sw.js',
  additionalPrecacheEntries: [{ url: '/~offline', revision: process.env.VERCEL_GIT_COMMIT_SHA || 'dev' }],
  disable: process.env.NODE_ENV === 'development', // disable in dev to avoid caching issues
});

const nextConfig = { /* existing config */ };

module.exports = withBundleAnalyzer(withSerwist(nextConfig));
```

**Impact:** Adds service worker compilation step to build. No runtime changes to existing pages.

### 2. pages/_document.tsx -- Manifest and Meta Tags

**What changes:** Add manifest link, apple-touch-icon, theme-color.

```tsx
<Head>
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180x180.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="theme-color" content="#0e9aa7" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)" />
</Head>
```

**Impact:** Static meta additions only. No behavioral change.

### 3. pages/_app.tsx -- Service Worker Registration and Online Status

**What changes:** Add SW registration effect and offline status context.

The service worker registration should happen in `_app.tsx` because:
- It runs once for all page transitions (singleton pattern, same as WebSocket)
- It needs to run after hydration (client-side only)
- Pages Router does not have `app/sw.ts` auto-registration

```tsx
// In _app.tsx, add to PrivateRouteGate or a new PWAProvider
useEffect(() => {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
}, []);
```

If using Serwist with `register: true`, this is handled automatically by the injected registration code.

**Impact:** One new useEffect. No change to existing providers or rendering.

### 4. TanStack Query -- networkMode: 'offlineFirst'

**What changes:** Set `networkMode: 'offlineFirst'` globally in QueryClient config.

```typescript
// lib/query-client.ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',  // NEW: let SW serve cached responses
      staleTime: 5 * 60 * 1000,    // existing: 5min
      gcTime: 30 * 60 * 1000,      // existing: 30min
      retry: 1,                     // existing
    },
    mutations: {
      networkMode: 'offlineFirst',  // NEW: attempt mutation, SW handles failure
    },
  },
});
```

**Why `offlineFirst`:** The service worker intercepts all `/api/v1/*` requests. With `offlineFirst`, TanStack Query always fires the request (letting SW decide the caching strategy), rather than pausing queries when `navigator.onLine` is false. This avoids the synchronization gap where TanStack Query thinks it is offline but the SW has a cached response ready.

**Impact:** One config line change. All existing queries behave identically when online. When offline, queries that have cached SW responses will resolve from cache instead of hanging.

### 5. Service Worker Caching Strategies

The service worker uses different strategies per resource type:

| Resource Pattern | Strategy | Rationale |
|-----------------|----------|-----------|
| `/_next/static/**` | **Precache** (build-time) | Immutable hashed assets, always cached |
| `/icons/**`, `/favicon.*` | **CacheFirst** (30 days) | Rarely change, serve fast |
| `/api/v1/emails*` (GET) | **NetworkFirst** (5min timeout) | Fresh data preferred, cache fallback when offline |
| `/api/v1/folders*` (GET) | **StaleWhileRevalidate** | Folder structure changes infrequently |
| `/api/v1/contacts*` (GET) | **StaleWhileRevalidate** | Contact data changes infrequently |
| `/api/v1/calendar*` (GET) | **NetworkFirst** (5min timeout) | Calendar needs freshness |
| `/api/v1/*` (POST/PUT/DELETE) | **NetworkOnly** + **BackgroundSync** | Mutations must hit server; queue if offline |
| `/api/v1/ai/**` | **NetworkOnly** | AI/SSE streams cannot be cached |
| Navigation (HTML) | **NetworkFirst** + offline fallback | Serve app shell, fallback to `/~offline` |

### 6. Socket.IO -- No Direct Integration

**The service worker does NOT intercept WebSocket connections.** Service workers only intercept HTTP fetch requests. Socket.IO's WebSocket transport bypasses the SW entirely.

However, two coordination points exist:

1. **Online/Offline transition:** When `useOfflineStatus` detects reconnection, it should call `websocketClient.connect()` if disconnected. The existing `useWebSocket` hook already handles reconnection via Socket.IO's built-in reconnection, so no change needed here.

2. **Background sync completion:** When the SW replays queued actions, it should `postMessage` the client. The client-side handler should call `queryClient.invalidateQueries()` for affected keys (e.g., `emailKeys.all`). This is similar to how `useEmailRealtime` already invalidates on `sync:status` events.

### 7. Zustand -- Minimal Changes

Zustand stores (`email-ui-store`, `sync-store`, etc.) are UI-only state. They do not need service worker integration.

One new piece of state: `isOffline` could live in an existing store or a dedicated context. Recommendation: use a lightweight React context (`OfflineStatusContext`) rather than a Zustand store, because:
- It is a single boolean derived from browser API events
- It does not need persistence
- It does not need Zustand devtools

### 8. Vercel Deployment -- Headers and Caching

**vercel.json additions:**

```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" },
        { "key": "Service-Worker-Allowed", "value": "/" }
      ]
    },
    {
      "source": "/manifest.json",
      "headers": [
        { "key": "Content-Type", "value": "application/manifest+json" }
      ]
    }
  ]
}
```

**Why this matters on Vercel:**
- Vercel's Edge CDN aggressively caches static assets. The service worker file MUST NOT be cached by Vercel's CDN (or updates will never propagate).
- `Service-Worker-Allowed: /` ensures the SW scope covers the entire app even though `sw.js` is served from root.
- Vercel serves static files from `public/` with immutable cache headers by default. The explicit `max-age=0` for `sw.js` overrides this.

### 9. Icons and Manifest

**New files in `public/`:**

```
public/
  manifest.json
  icons/
    icon-72x72.png
    icon-96x96.png
    icon-128x128.png
    icon-144x144.png
    icon-152x152.png
    icon-192x192.png
    icon-384x384.png
    icon-512x512.png
    apple-touch-icon-180x180.png
    maskable-icon-512x512.png
```

Generate from existing `Logo PMSync.svg` using a favicon generator tool.

### 10. Offline Fallback Page

**New file: `pages/~offline.tsx`**

A minimal page rendered when the user navigates to an uncached route while offline. Uses MUI components for consistency. No API calls. Shows:
- PMSync logo
- "You are offline" message
- "Return to inbox" button (links to cached `/dashboard/email`)

The tilde prefix (`~offline`) avoids collision with any future route and follows Serwist convention.

## Patterns to Follow

### Pattern 1: SW-to-Client Message Bridge

**What:** Service worker communicates cache/sync events to the React app via `postMessage`.

**When:** After background sync completes, after push notification received, after cache update.

```typescript
// In service worker (sw.ts)
async function notifyClients(type: string, payload: unknown) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type, payload });
  }
}

// In React hook
useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'SYNC_COMPLETE') {
      queryClient.invalidateQueries({ queryKey: emailKeys.all });
    }
  };
  navigator.serviceWorker?.addEventListener('message', handler);
  return () => navigator.serviceWorker?.removeEventListener('message', handler);
}, [queryClient]);
```

### Pattern 2: Action Queue with IndexedDB

**What:** Failed mutations are stored in IndexedDB and replayed on reconnection.

**When:** User performs mark-read, archive, or star/flag while offline.

**Scoped actions (v8.0):**
- `PATCH /api/v1/emails/:id` (mark read/unread, star/flag)
- `PUT /api/v1/emails/:id/archive`
- `PUT /api/v1/emails/:id/move`

**NOT queued (too complex for v8.0):**
- Send email (compose requires attachment handling)
- Delete email (irreversible, needs confirmation)
- AI chat (SSE stream, no caching model)

```typescript
// In service worker
interface QueuedAction {
  id: string;
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  timestamp: number;
}

// Store in IndexedDB 'pmsync-action-queue' object store
// Replay in FIFO order on sync event
```

### Pattern 3: Offline-Aware Mutation Hooks

**What:** Existing mutation hooks gain offline awareness via a wrapper.

**When:** Any mutation that should queue offline.

```typescript
// Pattern for mutation hooks
function useMarkAsRead() {
  const { isOffline } = useOfflineStatus();

  return useMutation({
    mutationFn: (emailId: string) => emailsApi.markAsRead(emailId),
    onMutate: async (emailId) => {
      // Optimistic update (already exists in codebase)
      // Works identically online and offline
    },
    onError: (error, emailId, context) => {
      if (isOffline) {
        // Don't rollback -- SW queued the action
        // Show toast: "Action queued, will sync when online"
        return;
      }
      // Online error: rollback as usual
    },
  });
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Caching API Mutations

**What:** Caching POST/PUT/DELETE responses in the service worker.

**Why bad:** Mutation responses are not idempotent. Replaying a cached mutation response gives stale data and may cause the client to believe an action succeeded when it did not.

**Instead:** Use NetworkOnly for mutations + Background Sync for retry.

### Anti-Pattern 2: Running TanStack QueryClient Inside Service Worker

**What:** Creating a QueryClient instance in the service worker to share cache.

**Why bad:** Service workers run in a separate thread with no DOM access. TanStack Query is designed for React components. Running it in a SW creates two disconnected cache layers with synchronization nightmares.

**Instead:** Let TanStack Query manage in-memory cache. Let the SW manage HTTP cache. Use `networkMode: 'offlineFirst'` so TQ defers to SW.

### Anti-Pattern 3: Caching SSE/AI Chat Streams

**What:** Attempting to cache the AI chat SSE endpoint (`/api/v1/ai/chat`).

**Why bad:** SSE is a long-lived connection. Caching makes no sense -- each response is unique and streamed. The service worker would need to buffer the entire stream and it would serve stale AI responses.

**Instead:** Mark all `/api/v1/ai/**` routes as NetworkOnly. Show "AI chat requires internet" when offline.

### Anti-Pattern 4: Overly Aggressive Precaching

**What:** Precaching all pages and API responses at install time.

**Why bad:** The email inbox can be hundreds of MB. Precaching it wastes bandwidth and storage. Also, precached API responses become stale immediately.

**Instead:** Precache only the app shell (JS/CSS bundles, offline fallback page, icons). Runtime-cache API responses on first access.

### Anti-Pattern 5: Disabling SW in Development with Conditional Registration

**What:** Using `if (process.env.NODE_ENV === 'production')` inside `_app.tsx` to conditionally register.

**Why bad:** Makes the SW untestable in development. Stale SW from a previous build can persist.

**Instead:** Use Serwist's `disable: true` option in next.config.js for development. This prevents SW compilation entirely. For local testing, use `next build && next start`.

## New Components Inventory

### Files to Create (New)

| File | Type | Purpose |
|------|------|---------|
| `service-worker/sw.ts` | Service Worker source | Core SW with Serwist, caching strategies, push, sync |
| `service-worker/cache-strategies.ts` | SW module | Runtime caching route definitions |
| `service-worker/background-sync.ts` | SW module | IndexedDB queue + sync event handler |
| `service-worker/push-handler.ts` | SW module | Push event listener + notification display |
| `public/manifest.json` | Static | Web app manifest |
| `public/icons/*.png` | Static | App icons for all platforms |
| `pages/~offline.tsx` | Page | Offline fallback page |
| `hooks/use-offline-status.ts` | React hook | Online/offline detection |
| `hooks/use-pwa-install.ts` | React hook | Install prompt capture + iOS detection |
| `hooks/use-push-subscription.ts` | React hook | Push subscription management |
| `hooks/use-background-sync.ts` | React hook | Listens for SW sync completion messages |
| `components/common/OfflineBanner.tsx` | Component | "You are offline" indicator bar |
| `components/common/InstallPromptBanner.tsx` | Component | PWA install CTA |
| `components/settings/PushSettingsPanel.tsx` | Component | Push notification toggle |
| `lib/context/offline-context.tsx` | Context | OfflineStatusProvider wrapping app |

### Files to Modify (Existing)

| File | Change |
|------|--------|
| `next.config.js` | Wrap with `withSerwist()` |
| `pages/_document.tsx` | Add manifest link, apple-touch-icon, theme-color meta |
| `pages/_app.tsx` | Add `OfflineStatusProvider`, import SW registration |
| `lib/query-client.ts` | Add `networkMode: 'offlineFirst'` |
| `frontend/vercel.json` | Add sw.js and manifest.json headers |
| `frontend/tsconfig.json` | Add `@serwist/next/typings` to types, `WebWorker` to lib |
| `frontend/.gitignore` | Add `public/sw.js`, `public/sw.js.map` |
| `frontend/lighthouserc.js` | Add PWA category assertion |

## Build Order (Dependency-Driven)

Based on component dependencies, the build order should be:

### Phase 1: Foundation (No Dependencies)

1. **Manifest + Icons** -- Generate icons, create `manifest.json`, update `_document.tsx`
2. **Serwist setup** -- Install packages, configure `next.config.js`, create minimal `sw.ts` with precache only
3. **TypeScript config** -- Add SW types to tsconfig
4. **Vercel headers** -- Update `vercel.json`
5. **`.gitignore`** -- Exclude generated SW files

**Validation:** `npm run build` succeeds, service worker registered in production build, Lighthouse PWA audit passes installability checks.

### Phase 2: Offline Shell (Depends on Phase 1)

6. **Offline fallback page** (`pages/~offline.tsx`)
7. **Runtime caching strategies** in SW (API routes, static assets)
8. **`useOfflineStatus` hook** + `OfflineStatusProvider`
9. **`OfflineBanner` component**
10. **TanStack Query `networkMode: 'offlineFirst'`**

**Validation:** Disconnect network in DevTools, navigate app, see cached inbox data, see offline banner, uncached routes show offline page.

### Phase 3: Install Experience (Depends on Phase 1)

11. **`usePWAInstall` hook** (beforeinstallprompt + iOS detection)
12. **`InstallPromptBanner` component**

**Validation:** In Chrome mobile emulation, install prompt appears. On iOS Safari, instructions shown.

### Phase 4: Background Sync (Depends on Phase 2)

13. **IndexedDB action queue** in SW
14. **Background sync handler** in SW
15. **`useBackgroundSync` hook** (message listener)
16. **Integrate with existing mutation hooks** (mark read, archive, star)

**Validation:** Go offline, mark email as read, reconnect, verify action synced to backend.

### Phase 5: Push Infrastructure (Depends on Phase 1)

17. **Push event handler** in SW
18. **VAPID key generation** + env vars
19. **`usePushSubscription` hook**
20. **`PushSettingsPanel` component** in settings
21. **Backend endpoint stub** (`POST /api/v1/push/subscribe`) -- minimal, stores subscription

**Validation:** Subscribe to push, send test notification via DevTools, notification appears.

### Phase 6: Polish and Testing

22. **Lighthouse CI** -- Add PWA category to `lighthouserc.js`
23. **E2E tests** -- Playwright tests for install, offline, push
24. **Cache size management** -- Set max entries/age for runtime caches

## Scalability Considerations

| Concern | At 100 Users | At 10K Users | At 1M Users |
|---------|--------------|--------------|-------------|
| SW cache size | No issue, ~50MB per user | Monitor via Storage Manager API | Add cache eviction (max 500 entries per cache, 7-day expiry) |
| Background sync queue | Rare, 1-2 actions | Add queue size limit (50 actions max) | Add queue TTL (1 hour), dedup same-resource actions |
| Push subscriptions (backend) | Store in DB column | Dedicated PushSubscription table | Consider push service (OneSignal) or partition table |
| Manifest/Icon bandwidth | Negligible | Negligible | Use CDN (Vercel already does this) |

## Sources

- [Next.js Official PWA Guide](https://nextjs.org/docs/app/guides/progressive-web-apps) -- HIGH confidence, official docs (last updated 2026-02-11)
- [Serwist Getting Started](https://serwist.pages.dev/docs/next/getting-started) -- HIGH confidence, library docs
- [TanStack Query Network Mode](https://tanstack.com/query/v4/docs/react/guides/network-mode) -- HIGH confidence, official docs
- [Offline React Query (TkDodo)](https://tkdodo.eu/blog/offline-react-query) -- HIGH confidence, maintainer blog
- [TanStack Query + Service Worker Discussion #8034](https://github.com/TanStack/query/discussions/8034) -- MEDIUM confidence, community discussion
- [Workbox Caching Strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview/) -- HIGH confidence, Chrome docs
- [MDN Background Sync](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) -- HIGH confidence, MDN
- [Socket.IO Offline Behavior](https://socket.io/docs/v3/client-offline-behavior/) -- HIGH confidence, official docs
- [Background Sync Browser Support (Progressier)](https://progressier.com/pwa-capabilities/background-sync) -- MEDIUM confidence, third-party reference
