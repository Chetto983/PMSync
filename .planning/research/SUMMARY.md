# Project Research Summary

**Project:** PMSync v8.0 Progressive Web App
**Domain:** PWA layer added to existing Next.js 16 AI email client
**Researched:** 2026-03-23
**Confidence:** HIGH

## Executive Summary

PMSync v8.0 adds a PWA layer to a fully-shipped AI email client. The milestone is frontend-only — no backend push triggers ship this cycle. The recommended approach centers on `@serwist/next` for service worker integration (the officially-referenced Next.js solution, successor to the abandoned next-pwa), `idb-keyval` for lightweight IndexedDB key-value storage, and browser-native APIs for install prompts and push subscription plumbing. All six core PWA features (manifest, service worker, offline fallback, app shell caching, install prompt, push frontend) are well-documented with high-confidence sources. Stack additions are minimal: two runtime packages and two dev dependencies on top of what already exists.

The single most important architectural constraint is this: **the service worker must not intercept API requests.** This is where the two research documents diverge in a meaningful way. ARCHITECTURE.md proposed NetworkFirst caching for `/api/v1/emails*`; PITFALLS.md argues the opposite with three critical-severity justifications — httpOnly cookie credential stripping (P1), double-caching conflict with TanStack Query (P2), and SSE stream corruption for AI chat (P3). The PITFALLS position is adopted here as the authoritative stance. PMSync's auth model (httpOnly cookies with no Authorization header fallback) makes any SW-intercepted API fetch a silent 401 generator. TanStack Query already caches API responses with intelligent mutation-driven invalidation. The service worker's role should be limited to: static asset caching, offline fallback page, push event handling, and SW update notification. Offline email reading — the highest-value differentiator — is achievable through TanStack Query's `persistQueryClient` with IndexedDB, keeping a single authoritative cache layer.

The key execution risk is scope creep inside the service worker. Background sync for offline mutations is achievable but requires careful session expiry handling (the better-auth session may have expired while the device was offline for hours), must exclude irreversible actions (delete, send), and must treat the `online` event as the primary fallback path rather than the BackgroundSync API, which has no Safari support. A secondary risk is the Pages Router / App Router distinction: STACK.md references `app/manifest.ts` (an App Router convention) but PMSync uses Pages Router. The manifest must be a static `public/manifest.json` or an API route — this must be resolved before Phase 1 implementation begins.

## Key Findings

### Recommended Stack

The stack is minimal and well-justified. `@serwist/next` v9.5.4 handles the service worker compilation pipeline for Next.js Pages Router, including precache manifest generation and Turbopack dev-mode compatibility via `@serwist/turbopack`. It is the library the Next.js official docs reference for offline support (updated 2026-02-11). `idb-keyval` (~600 bytes brotli'd) provides IndexedDB key-value storage for the offline action queue and inbox snapshot caching — the correct abstraction for PMSync's needs (simple get/set, not relational queries). Web app manifest is handled via a static `public/manifest.json` (Pages Router). VAPID key generation is a one-time CLI operation via `web-push generate-vapid-keys`.

**Core technologies:**
- `@serwist/next` ^9.5.4: Service worker compilation and precaching — official Next.js recommendation, actively maintained (npm publish 2026-03-22)
- `serwist` ^9.5.7: Core Workbox-based caching strategies (dev dep peer)
- `@serwist/turbopack` ^9.5.6: Turbopack dev mode support (dev dep) — Next.js 16 defaults to Turbopack in dev
- `idb-keyval` ^6.2.1: IndexedDB key-value store for offline queue — 600 bytes brotli, by Chrome team member, zero config
- `public/manifest.json` (static): Web app manifest for Pages Router — no library needed

**What NOT to add:** `next-pwa` (abandoned 2022), `@ducanh2912/next-pwa`, `localforage`, `dexie`, raw Workbox without Serwist, `TanStack Query persistQueryClient` in v8.0 (defer to v8.x when cold-start latency is a measurable problem).

### Expected Features

All features in scope are P1. The milestone has a tight boundary with no P2 work in v8.0.

**Must have (table stakes):**
- Web App Manifest with full icon set — required for installability on all platforms
- Service worker registration — prerequisite for all PWA capabilities
- Offline fallback page (`pages/~offline.tsx`) — branded page instead of Chrome dinosaur
- App shell caching — JS/CSS/fonts load from cache for instant app open
- Install prompt UX — Android/desktop via `beforeinstallprompt`, iOS via manual "Add to Home Screen" instructions (no API available on iOS)
- Standalone display theming — manifest `theme_color`/`background_color` matching PMSync teal brand

**Should have (differentiators):**
- Offline email reading — cached inbox readable without network (highest-value, most complex)
- Push notification frontend plumbing — VAPID subscription, SW push handler, settings toggle (backend triggers deferred)
- Background sync for queued offline mutations — mark read, archive, star queue via idb-keyval, replay on reconnect
- SW update notification — "New version available" MUI Snackbar with user-triggered skipWaiting
- Online/offline indicator — MUI Alert bar when disconnected, Zustand `isOnline` state

**Defer (v8.x+):**
- TanStack Query `persistQueryClient` bridge to IndexedDB — add when cold-start latency becomes measurable
- Notification action buttons (Reply, Archive) — requires backend push triggers (v9+)
- Badge API unread count — Chrome/Android only, low priority
- Full offline compose-and-send — SMTP queue and attachment handling, explicitly out of scope per PROJECT.md

### Architecture Approach

PMSync is a **Pages Router** app (`pages/`, `pages/_app.tsx`, `pages/_document.tsx`). The PWA adds three layers alongside existing code: (1) a service worker (`service-worker/sw.ts` compiled to `public/sw.js`) handling static asset caching, push, and update messaging; (2) a PWA shell layer wired into `_document.tsx` (manifest link, meta tags) and `_app.tsx` (SW registration, online status provider); and (3) an offline/sync bridge via React hooks and idb-keyval connecting SW capabilities to the existing TanStack Query and Zustand stack. The `next.config.js` wraps existing config as `withBundleAnalyzer(withSerwist(nextConfig))`. TanStack Query gets `networkMode: 'offlineFirst'` globally so it always fires requests and lets the SW serve cached static responses, rather than pausing queries on `navigator.onLine === false`.

**Major components:**
1. `service-worker/sw.ts` — Serwist core with static asset precaching; **explicitly excludes all `/api/*` interception** to preserve httpOnly cookie auth
2. PWA hooks (`useOfflineStatus`, `usePWAInstall`, `usePushSubscription`, `useBackgroundSync`) — connects browser APIs to React components
3. `lib/context/offline-context.tsx` — lightweight React context (not Zustand) for `isOffline` boolean derived from browser events; no persistence needed
4. `pages/~offline.tsx` — minimal branded offline fallback with no API calls, MUI components only
5. Offline mutation wrappers — extend existing optimistic update patterns; on `isOffline` error, skip rollback and show "will sync when reconnected" toast

**Caching strategy matrix:**

| Resource | Strategy | Rationale |
|---|---|---|
| `/_next/static/**` | CacheFirst (runtime, maxEntries limit) | Immutable hashed assets; limit entries to prevent storage bloat across deploys |
| `/icons/**`, `/favicon.*` | CacheFirst 30 days | Rarely change |
| `/api/v1/**` (all methods) | **NetworkOnly, never cached** | httpOnly cookie auth constraint + TanStack Query owns API caching |
| `/api/v1/ai/**` | NetworkOnly | SSE streams incompatible with SW caching |
| Navigation HTML | NetworkFirst + `/~offline` fallback | App shell served fresh, offline page as safety net |

### Critical Pitfalls

1. **SW strips httpOnly cookies from re-issued API requests** — Never call `event.respondWith()` for `/api/*` requests. Return without calling it to let the browser handle natively with full credential context. This is a W3C spec behavior, not a bug — SW-initiated fetches do not automatically include cookies. Manifests as intermittent 401s after SW activation.

2. **Double caching conflict between SW and TanStack Query** — TanStack Query owns API response caching with mutation-driven invalidation. If the SW also caches API responses, `queryClient.invalidateQueries()` after a mutation triggers a refetch that the SW intercepts and serves stale data from. Result: mark-read appears to undo itself. Fix: SW caches only static assets, never API responses.

3. **SSE AI chat stream corruption** — SW fetch handlers that don't explicitly skip streaming responses will buffer or corrupt the AI chat stream. Passthrough rule: if `request.headers.get('accept')?.includes('text/event-stream')` or URL starts with `/api/`, return without calling `event.respondWith()`.

4. **Vercel caches sw.js at edge with immutable headers** — `public/sw.js` has a fixed filename and gets CDN-cached. Users get stuck on stale service workers indefinitely. Mitigation: explicit `Cache-Control: no-cache, no-store, must-revalidate` header for `/sw.js` in `next.config.js` headers config AND `updateViaCache: 'none'` in SW registration call. Set this before first deployment.

5. **Background sync queue loses auth context on session expiry** — better-auth sessions expire. Queued offline actions replayed hours later may 401 silently. Mitigation: 30-minute queue TTL (discard older actions with user notification), exclude irreversible actions (delete, send) entirely, implement `online` event fallback as the primary replay mechanism rather than the BackgroundSync API.

## Implications for Roadmap

The feature dependency tree (from FEATURES.md) and the build order (from ARCHITECTURE.md) map cleanly to a 6-phase structure. Each phase is independently deployable and testable.

### Phase 1: PWA Foundation
**Rationale:** Manifest, service worker registration, and icons are prerequisites for every other phase. Zero-risk, fully-documented steps. Must ship first.
**Delivers:** Installable app shell — passes Lighthouse PWA installability audit; SW registered and serving precached static assets
**Addresses:** `public/manifest.json`, icon set (192, 512, maskable, iOS 180), Serwist build plugin config, `_document.tsx` meta tags, `_app.tsx` SW registration, `vercel.json` / `next.config.js` `sw.js` cache headers, `.gitignore` for generated SW files, TypeScript `WebWorker` lib config
**Avoids:** P4 (Vercel sw.js caching) — explicit no-cache headers configured from day one; P14 (multiple SW registrations) — single registration point in `_app.tsx`
**Research flag:** No additional research needed. Fully covered by official Next.js PWA guide and Serwist docs. One implementation decision to resolve: Pages Router uses `public/manifest.json` (not `app/manifest.ts`).

### Phase 2: Offline Shell
**Rationale:** Depends on Phase 1 SW. Establishes the offline detection layer and caching patterns that all subsequent phases build on. Validates the no-API-caching architectural decision.
**Delivers:** App opens offline from home screen; cached static assets load instantly; uncached routes show branded fallback; offline banner visible
**Uses:** Serwist CacheFirst for static assets with maxEntries eviction, NetworkFirst for navigation, explicit NetworkOnly passthrough for all `/api/*`
**Implements:** `pages/~offline.tsx`, `lib/context/offline-context.tsx`, `useOfflineStatus` hook, `OfflineBanner` MUI component, TanStack Query `networkMode: 'offlineFirst'`
**Avoids:** P2 (double caching) — SW routes configured to never touch `/api/*`; P3 (SSE interception) — explicit passthrough rule in SW fetch handler
**Research flag:** No additional research needed.

### Phase 3: Install Experience
**Rationale:** Depends on Phase 1 manifest only. No dependency on offline caching layer — can be developed in parallel with Phase 2 but logically follows it in delivery.
**Delivers:** Install prompt for Android/desktop Chrome; iOS manual "Add to Home Screen" instructions; "already installed" detection hides prompt in standalone mode
**Uses:** `beforeinstallprompt` browser API, `window.matchMedia('(display-mode: standalone)')`, iOS UA detection
**Implements:** `usePWAInstall` hook, `InstallPromptBanner` MUI Snackbar/Dialog component
**Avoids:** P8 (iOS limitations) — three explicit code paths: Android/desktop (`beforeinstallprompt`), iOS home screen (partial push support), iOS browser (no install API at all)
**Research flag:** No additional research needed.

### Phase 4: Offline Email Reading
**Rationale:** Depends on Phase 2 offline shell (online detection context needed for UI coherence). This is the highest-value differentiator. Implementation path: TanStack Query `persistQueryClient` with IndexedDB — NOT SW API response caching — to avoid the double-caching pitfall while still surviving app restart offline.
**Delivers:** User can read recently-synced emails after closing and reopening the app without network; inbox metadata and email bodies survive app close
**Uses:** `idb-keyval` for inbox snapshot storage; TanStack Query `experimental_createPersister` (v5) or `@tanstack/query-persist-client-core` for IndexedDB hydration
**Implements:** IndexedDB persistence layer for TQ cache; stale-while-rehydrate pattern on cold start
**Avoids:** P1 (cookie stripping) — zero SW API interception; P2 (double caching) — single cache authority via TanStack Query + IndexedDB
**Research flag:** NEEDS RESEARCH BEFORE IMPLEMENTATION. Verify `experimental_createPersister` API in TanStack Query v5 works with existing config (`staleTime: 5min`, `gcTime: 30min`, `retry: 1`). Critical question: does persisted cache get invalidated correctly after mutations, or does stale IndexedDB data rehydrate on top of fresh in-memory state? Check TanStack Query v5 changelog and any open issues before writing code.

### Phase 5: Background Sync
**Rationale:** Depends on Phase 2 (offline detection) and Phase 4 (established offline UI patterns). Most complex phase. Requires careful scoping of which actions are safe to queue.
**Delivers:** Mark read, archive, star while offline; actions queue in idb-keyval and replay on reconnect; user informed of queued/synced state
**Uses:** `idb-keyval` FIFO action queue; `online` event as primary replay trigger (BackgroundSync API as progressive enhancement for Chromium only, ~70% support); `postMessage` bridge from SW to TQ `invalidateQueries` after replay
**Implements:** `useBackgroundSync` hook, SW sync event handler and `online` event fallback, offline-aware mutation hook wrappers (no rollback on offline error), 30-minute queue TTL
**Avoids:** P6 (auth expiry) — TTL limit on queue; P8 (no Safari BackgroundSync) — `online` event fallback is the primary path, not the fallback
**Research flag:** NEEDS RESEARCH. Treat BackgroundSync API as a Chromium-only progressive enhancement. Confirm current Safari status — assume zero support and build accordingly. Also verify the `postMessage` -> TQ invalidation pattern works correctly when SW replays actions before the React app has fully hydrated.

### Phase 6: Push Notification Plumbing + Polish
**Rationale:** SW registration (Phase 1) is the only prerequisite. Push is self-contained and frontend-only in v8.0. Polish items (SW update notification, Lighthouse PWA audit) are low-risk and can be developed alongside push.
**Delivers:** Users can opt into push notifications; PushSubscription stored in backend for future use; Lighthouse PWA audit green; "New version available" snackbar on deploy
**Uses:** `PushManager.subscribe()` with VAPID public key, `push` and `notificationclick` SW event handlers
**Implements:** `usePushSubscription` hook, `PushSettingsPanel` in settings (MUI Switch), `POST /api/v1/push/subscribe` NestJS endpoint stub, SW update notification via `registration.waiting` detection and user-triggered `skipWaiting`, Lighthouse PWA category in `lighthouserc.js`
**Avoids:** P8 (iOS push limitations) — gate subscription UI behind `'PushManager' in window` AND `window.matchMedia('(display-mode: standalone)').matches` check; P9 (users stuck on old SW) — skipWaiting only on user confirmation via postMessage, never unconditionally in install handler
**Research flag:** NEEDS SCHEMA CHECK. Confirm Prisma schema can store PushSubscription JSON before writing the NestJS endpoint. Check existing `User` or `Tenant` model — if no `pushSubscriptions` relation exists, a migration is needed and this may scope into a backend task.

### Phase Ordering Rationale

- Phase 1 is a hard prerequisite: no SW = no installability, no push, no offline, nothing
- Phase 2 before Phase 4: offline reading UI needs the `isOffline` context and the established caching architecture to be correct
- Phase 3 is independent after Phase 1: install prompt has no dependency on caching layer, can be shipped separately
- Phase 4 before Phase 5: background sync's "don't rollback on offline mutation" pattern assumes the offline reading layer exists so UI state remains coherent
- Phase 6 last: push and polish are self-contained with no downstream dependencies

### Research Flags

**Needs deeper research before implementation:**
- **Phase 4 (Offline Email Reading):** TanStack Query v5 `experimental_createPersister` / `persistQueryClient` — compatibility with existing config, mutation invalidation behavior, IndexedDB hydration ordering
- **Phase 5 (Background Sync):** Current Safari/iOS BackgroundSync API support status — assume none, build `online` event as primary path; verify Chrome's minimum-engagement heuristic for sync event registration
- **Phase 6 (Push backend stub):** Check Prisma schema before writing NestJS endpoint — `PushSubscription` storage may require a new model and migration

**Standard patterns, skip research-phase:**
- **Phase 1 (Foundation):** Fully covered by official Next.js PWA guide and Serwist docs
- **Phase 2 (Offline Shell):** Workbox caching strategies are extensively documented; NetworkOnly for API is a clear decision
- **Phase 3 (Install Experience):** `beforeinstallprompt` and iOS detection are stable browser APIs with no ambiguity

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations sourced from official Next.js docs and library maintainer docs. Serwist npm versions confirmed current (published 2026-03-22). idb-keyval by Chrome team member, battle-tested. |
| Features | HIGH | Feature scope is tightly bounded (frontend-only v8.0). Dependency tree is unambiguous. All features are established PWA standards with multi-source documentation. |
| Architecture | HIGH | Official docs and Workbox patterns. One internal conflict (ARCHITECTURE.md vs PITFALLS.md on API caching) resolved: no SW API interception. Pages Router distinction identified and flagged. |
| Pitfalls | HIGH | 4 of 5 critical pitfalls sourced from W3C specs, official Next.js docs, or TanStack Query maintainer issues. Moderate pitfall on session expiry is MEDIUM confidence — PMSync-specific auth config not externally benchmarked. |

**Overall confidence:** HIGH

### Gaps to Address

- **Pages Router vs App Router manifest convention:** STACK.md referenced `app/manifest.ts` (App Router). PMSync uses Pages Router. Use `public/manifest.json` (static file) instead. Resolve before writing any Phase 1 code.

- **Serwist Pages Router compatibility:** PITFALLS.md (P15) notes Serwist has open issues with Next.js 15+ App Router. Pages Router compatibility is not explicitly confirmed. Verify Serwist v9.5.x works correctly with `pages/` directory before committing. Manual `public/sw.js` (from official Next.js guide) is the fallback.

- **CORS and cross-origin credential flow:** PMSync frontend on Vercel calls backend API on Railway (different origin). SW fetch passthroughs for `/api/*` must ensure the browser's `credentials: 'include'` behavior is preserved. Verify CORS headers on the Railway backend allow credentials for the Vercel domain — this is a deployment concern, not a code concern, but it must be confirmed before offline testing.

- **Cache-on-logout:** When the user signs out, idb-keyval inbox data and any SW cache entries for static assets that include user-specific content must be cleared. The existing sign-out flow (better-auth) needs to trigger `idb-keyval.clear()` and potentially `caches.delete()`. Implement this in Phase 2 or Phase 4 — do not defer to v8.x.

- **Icon asset generation:** Full icon set (72, 96, 128, 144, 152, 192, 384, 512, maskable-512, iOS-180) must be generated from `Logo PMSync.svg`. Requires a favicon generator tool. Not a code problem but a gating dependency for Phase 1.

## Sources

### Primary (HIGH confidence)
- [Next.js Official PWA Guide](https://nextjs.org/docs/app/guides/progressive-web-apps) — installability, SW registration, manifest, offline patterns (updated 2026-02-11)
- [Serwist Getting Started](https://serwist.pages.dev/docs/next/getting-started) — build plugin config, SW compilation, Turbopack support
- [TanStack Query Network Mode](https://tanstack.com/query/v4/docs/react/guides/network-mode) — `offlineFirst` mode behavior and rationale
- [TkDodo: Offline React Query](https://tkdodo.eu/blog/offline-react-query) — TQ maintainer on offline patterns and SW integration
- [Workbox Caching Strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview/) — CacheFirst, NetworkFirst, StaleWhileRevalidate
- [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) — platform requirements
- [MDN: Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) — BackgroundSync, push
- [W3C ServiceWorker Issue #837](https://github.com/w3c/ServiceWorker/issues/837) — httpOnly cookie credential stripping in SW
- [W3C ServiceWorker Issue #885](https://github.com/w3c/ServiceWorker/issues/885) — EventSource/SSE bypass requirement

### Secondary (MEDIUM confidence)
- [TanStack Query Issue #7897](https://github.com/TanStack/query/issues/7897) — SW + TQ double-caching conflict
- [TanStack Query Discussion #8034](https://github.com/TanStack/query/discussions/8034) — maintainer confirmation of no built-in SW integration
- [next-pwa Issue #323](https://github.com/shadowwalker/next-pwa/issues/323) — middleware blocking SW files pattern
- [PWA iOS Limitations 2026 (MagicBell)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — iOS Safari PWA API support status
- [Socket.IO Offline Behavior](https://socket.io/docs/v3/client-offline-behavior/) — WebSocket not intercepted by SW

### Tertiary (LOW confidence — validate before implementation)
- [Background Sync Browser Support (Progressier)](https://progressier.com/pwa-capabilities/background-sync) — ~70% support figure; verify against current browser release data before Phase 5

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
