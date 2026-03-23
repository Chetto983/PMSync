# Domain Pitfalls

**Domain:** Adding PWA (service worker, offline cache, push notifications, install prompt) to an existing Next.js 16 App Router email client on Vercel
**Researched:** 2026-03-23
**System context:** PMSync v8.0 -- Next.js 16 on Vercel, httpOnly cookie auth (better-auth), TanStack Query (staleTime 5min/gcTime 30min), SSE streaming for AI chat, MUI with dark mode, no Next.js middleware file (auth via layout guards)

## Critical Pitfalls

Mistakes that cause broken auth, stale data loops, or deployment failures.

### Pitfall 1: Service Worker Fetch Interception Strips Cookie Credentials

**What goes wrong:** Service worker `fetch` events intercept all same-origin requests by default. When the service worker responds from cache or re-fetches, it may not include `credentials: 'include'` on the re-issued request. httpOnly cookies are silently dropped, and the backend returns 401. The app appears "logged out" despite having a valid session.

**Why it happens:** The Fetch API inside service workers does NOT automatically attach cookies. Unlike browser-initiated fetches where `credentials: 'same-origin'` is default, service worker fetches require explicit `credentials: 'include'` in the `RequestInit`. PMSync uses httpOnly cookies exclusively (no Authorization header), so this is the single point of failure.

**Consequences:** Every API call routed through the service worker cache-then-network strategy returns 401. Users see empty inboxes, broken AI chat, failed mutations. Worse: this only manifests after the service worker activates (not on first load), making it intermittent and hard to reproduce.

**Prevention:**
1. **Never cache API routes.** Exclude `/api/*` from all service worker routing. Let them pass through to the network with original credentials.
2. If you must intercept API fetches (e.g., for offline queue), clone the original request and preserve credentials:
   ```js
   // In sw.js fetch handler
   if (event.request.url.includes('/api/')) {
     // Pass through -- do NOT cache API responses
     return; // Let browser handle it with cookies
   }
   ```
3. Alternatively, use `navigationPreload` so the service worker doesn't block navigation requests.
4. Test explicitly: after SW activation, verify that `document.cookie` is empty (httpOnly) but API calls still return 200.

**Detection:** After deploying service worker, test: login -> close tab -> reopen -> check if API calls succeed. If they 401, the SW is stripping credentials.

**Confidence:** HIGH -- this is a well-documented spec behavior. The W3C ServiceWorker spec explicitly states cookies are not sent by default in SW-initiated fetches. The httpOnly attribute means you cannot even read cookies in SW to manually attach them.

**Sources:**
- [W3C ServiceWorker Issue #837 -- Cookie modification on intercepted fetch](https://github.com/w3c/ServiceWorker/issues/837)
- [whatwg/cookiestore Issue #37 -- httpOnly cookies in SW](https://github.com/whatwg/cookiestore/issues/37)

---

### Pitfall 2: Double Caching -- Service Worker Cache vs TanStack Query Cache

**What goes wrong:** TanStack Query already has an in-memory cache with `staleTime: 5min` and `gcTime: 30min`. If the service worker also caches API responses (e.g., with a `StaleWhileRevalidate` strategy), you get two independent, unsynchronized caching layers. After a mutation (mark email read, archive), TanStack Query invalidates its cache and refetches -- but the service worker serves the stale cached response. The UI shows the old state.

**Why it happens:** TanStack Query and the service worker cache have zero communication. TanStack Query's `queryClient.invalidateQueries()` triggers a network fetch, but the service worker's cache intercepts it before it hits the network, returning the pre-mutation data.

**Consequences:** Optimistic updates revert. "Mark as read" appears to undo itself. Archive action seems to fail. Users lose trust in the UI. Debugging is hell because the bug is intermittent (depends on SW cache timing).

**Prevention:**
1. **Do NOT cache API responses in the service worker.** Period. TanStack Query is your API cache. The service worker should only cache static assets (JS bundles, CSS, images, fonts, offline fallback HTML).
2. If offline read access is needed, use TanStack Query's `persistQueryClient` with IndexedDB (not SW cache) so there's a single source of truth.
3. Configure the service worker routing to explicitly skip API paths:
   ```js
   // Only cache static assets -- never API responses
   // /_next/static/* -- JS/CSS bundles (cache-first, immutable)
   // /icons/* -- app icons (cache-first)
   // / (HTML shell) -- network-first for navigation
   // /api/* -- NEVER cache
   ```

**Detection:** After mutation, check DevTools > Application > Cache Storage. If the old API response is in there, the SW is caching API calls.

**Confidence:** HIGH -- this is documented in [TanStack Query Issue #7897](https://github.com/TanStack/query/issues/7897) and [Discussion #8034](https://github.com/TanStack/query/discussions/8034). The maintainers confirm there is no built-in integration between TanStack Query and service worker caches.

---

### Pitfall 3: Service Worker Intercepts SSE AI Chat Stream

**What goes wrong:** The AI chat uses SSE (Server-Sent Events) via `fetch()` with `credentials: 'include'`. A service worker `fetch` handler that doesn't explicitly exclude streaming responses will attempt to cache or buffer the SSE response. This either: (a) buffers the entire stream before returning it (breaking real-time), (b) returns a cached stale response, or (c) causes the stream to hang because the SW tries to clone a ReadableStream that's being consumed.

**Why it happens:** EventSource and streaming fetch responses are fundamentally incompatible with cache-first strategies. The W3C ServiceWorker spec notes this is a known problem area -- EventSource was designed for persistent open connections, which conflicts with the request/response model of service worker fetch events.

**Consequences:** AI chat appears frozen. Tokens don't stream in real-time. Or worse: you see a previous conversation's response replayed from cache.

**Prevention:**
1. In the service worker fetch handler, detect SSE requests and pass through immediately:
   ```js
   self.addEventListener('fetch', (event) => {
     const url = new URL(event.request.url);
     // Skip SSE/streaming endpoints
     if (url.pathname.startsWith('/api/') ||
         event.request.headers.get('accept')?.includes('text/event-stream')) {
       return; // Don't call respondWith -- let browser handle natively
     }
     // ... handle other requests
   });
   ```
2. Never call `event.respondWith()` for streaming requests. Returning without calling `respondWith` tells the browser to handle the request normally.

**Detection:** Open AI chat after SW activation. If tokens don't stream character-by-character, the SW is buffering.

**Confidence:** HIGH -- [W3C ServiceWorker Issue #885](https://github.com/w3c/ServiceWorker/issues/885) explicitly discusses EventSource bypass.

---

### Pitfall 4: Vercel Deployment Caches sw.js with Immutable Headers

**What goes wrong:** Vercel's CDN aggressively caches static assets. If `sw.js` is placed in `public/` and served without explicit `Cache-Control: no-cache` headers, Vercel may cache it at the edge with a long TTL. Users get stuck on an old service worker that can't be updated, potentially serving stale content indefinitely.

**Why it happens:** Vercel treats files in `public/` as static assets and applies its default caching strategy. Unlike `_next/static/*` files (which have content hashes in filenames), `sw.js` has a fixed filename and MUST always be re-validated.

**Consequences:** Users are stuck on old app versions. The "update available" toast never fires because the browser thinks sw.js hasn't changed. In extreme cases, users must manually clear site data.

**Prevention:**
1. Add explicit headers in `next.config.js`:
   ```js
   async headers() {
     return [
       {
         source: '/sw.js',
         headers: [
           { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
           { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
         ],
       },
       {
         source: '/manifest.json',
         headers: [
           { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
         ],
       },
     ];
   },
   ```
2. Also set `updateViaCache: 'none'` in the registration call (Next.js official guide recommends this).
3. Verify with `curl -I https://your-domain.com/sw.js` after deploy -- check `Cache-Control` header.

**Detection:** Deploy a sw.js change, wait 5 minutes, hard-refresh. If the old SW is still active, Vercel is caching it.

**Confidence:** HIGH -- [Next.js official PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) explicitly recommends `no-cache, no-store, must-revalidate` for sw.js. PMSync's current `vercel.json` has no custom headers.

---

### Pitfall 5: Next.js Middleware Blocks PWA Files

**What goes wrong:** If a Next.js middleware is later added (for auth redirects, tenant switching, etc.), it may intercept requests to `/sw.js`, `/manifest.json`, and `/workbox-*.js`. The middleware could redirect unauthenticated requests to `/login`, causing the service worker registration to fail because the browser receives an HTML redirect response instead of JavaScript.

**Why it happens:** Next.js middleware runs on ALL requests by default (unless a `matcher` config excludes paths). PWA core files must be served without auth checks or redirects. The browser's service worker spec explicitly rejects service workers served via redirect.

**Consequences:** Service worker fails to register. PWA install fails. Push notifications stop working. No clear error message -- just a silent failure in the SW registration promise.

**Prevention:**
1. PMSync currently has no Next.js middleware file, which avoids this. But if middleware is ever added, the FIRST thing it must do is exclude PWA files:
   ```ts
   export function middleware(request: NextRequest) {
     const { pathname } = request.nextUrl;
     // Allow PWA core files through without auth checks
     if (pathname === '/sw.js' ||
         pathname === '/manifest.json' ||
         pathname.startsWith('/workbox-') ||
         pathname.startsWith('/icons/')) {
       return NextResponse.next();
     }
     // ... auth logic
   }
   ```
2. Alternatively, use `matcher` in the middleware config to exclude these paths.

**Detection:** Check DevTools > Application > Service Workers. If registration state shows "redundant" or fails, check Network tab for sw.js -- if it returned a 302 redirect, middleware is the culprit.

**Confidence:** HIGH -- [next-pwa Issue #323](https://github.com/shadowwalker/next-pwa/issues/323) documents this exact problem.

## Moderate Pitfalls

### Pitfall 6: Background Sync Queue Loses Auth Context

**What goes wrong:** Background sync (for offline actions like "mark read" or "archive") queues requests in IndexedDB. When the device comes back online, the service worker replays them. But if the session has expired in the meantime (better-auth sessions have idle timeout), the replayed requests fail with 401. The queued actions are silently lost.

**Why it happens:** httpOnly cookies have expiry. better-auth sessions have `cookieCache` with 300s maxAge. If the device was offline for hours, the session cookie may have expired or been invalidated server-side.

**Prevention:**
1. Implement retry-with-backoff in the sync handler. On 401, emit a client event requesting re-authentication before retrying.
2. Store the `tenantId` and action metadata in the sync queue, not the raw request. When replaying, construct a fresh authenticated request.
3. Limit the background sync window. Actions queued more than 30 minutes ago should be discarded with a user notification rather than silently failing.
4. Use the Background Sync API's `lastChance` property to detect the final retry attempt and notify the user.

**Detection:** Airplane mode for 30 min -> queue some actions -> reconnect -> check if actions were applied.

**Confidence:** MEDIUM -- the auth expiry interaction is specific to PMSync's session config, but the pattern is well-known.

---

### Pitfall 7: Precaching Next.js Hashed Bundles Bloats Cache Storage

**What goes wrong:** Next.js generates hashed JS chunks in `/_next/static/`. If you precache all of them, every deployment creates a completely new set of chunks (new hashes). Users accumulate multiple versions in Cache Storage, consuming significant device storage. On mobile, browsers may evict PWA data when storage pressure is high, breaking the offline experience.

**Why it happens:** Next.js chunk filenames change on every build. Precaching the full bundle means the old cached version is never cleaned up unless you explicitly call `caches.delete()` for old cache versions.

**Consequences:** Cache Storage grows by 2-5 MB per deployment. After 10 deploys without cleanup, users have 50 MB of stale JS. Mobile browsers may revoke storage permission entirely.

**Prevention:**
1. Use **runtime caching** (cache-first with expiration) for `/_next/static/*` instead of precaching. This caches chunks on first use and auto-expires old ones.
2. Set `maxEntries` and `maxAgeSeconds` on the cache:
   ```js
   // Runtime cache for Next.js bundles
   { urlPattern: /\/_next\/static\/.*/, handler: 'CacheFirst',
     options: { cacheName: 'next-static', expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 } } }
   ```
3. On service worker activation, delete old cache versions:
   ```js
   self.addEventListener('activate', (event) => {
     event.waitUntil(
       caches.keys().then(keys =>
         Promise.all(keys.filter(k => k !== CURRENT_CACHE).map(k => caches.delete(k)))
       )
     );
   });
   ```

**Detection:** DevTools > Application > Cache Storage. Check total size after several deploys.

**Confidence:** HIGH -- [next-pwa Discussion #64336](https://github.com/vercel/next.js/discussions/64336) documents this problem with Next.js hashed assets.

---

### Pitfall 8: iOS Safari PWA Limitations

**What goes wrong:** iOS does not support `beforeinstallprompt`. Chrome/Edge on iOS cannot install PWAs at all (WebKit restriction). Push notifications only work on iOS 16.4+ AND only when the PWA is added to the home screen (not in Safari browser). Background sync is not supported on Safari/iOS.

**Why it happens:** Apple's WebKit-only policy on iOS means all browsers use the same engine with the same limitations. Apple has been slow to adopt PWA APIs.

**Consequences:** Your install prompt, push notification subscription, and background sync features need three separate code paths: (1) Chrome/Android (full support), (2) iOS home screen (partial), (3) iOS browser (minimal). If you don't detect and adapt, users get broken UI or misleading prompts.

**Prevention:**
1. Detect platform and show appropriate UX:
   - Android/Desktop Chrome: Use `beforeinstallprompt` for native install button.
   - iOS: Show manual instructions ("Tap Share > Add to Home Screen").
   - Check `window.matchMedia('(display-mode: standalone)')` to hide install prompts when already installed.
2. For push notifications, gate the subscription UI behind both `'PushManager' in window` and `'Notification' in window` checks. On iOS in-browser (not home screen), these exist but don't work.
3. For background sync, always implement a fallback: retry queued actions on next app open using TanStack Query's `onlineManager`.

**Detection:** Test on actual iOS devices (not just simulators). Safari DevTools has limited SW debugging.

**Confidence:** HIGH -- [PWA iOS Limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) is comprehensive and current.

---

### Pitfall 9: Service Worker Update Leaves Users on Old Version

**What goes wrong:** When you deploy a new sw.js, the browser downloads it but enters a "waiting" state. The new service worker doesn't activate until ALL tabs of the app are closed. For an email client that users keep open all day, this means updates never apply.

**Why it happens:** The browser's default SW lifecycle is conservative: `install` -> `waiting` -> `activate`. The "waiting" state persists as long as any tab has the old SW controlling it.

**Consequences:** Users run stale code indefinitely. Bug fixes don't reach them. If you change API response shapes in a deploy, the old frontend code breaks against the new backend.

**Prevention:**
1. Implement an "Update Available" toast/snackbar. When `registration.waiting` is detected, show a prompt.
2. On user confirmation, send `skipWaiting()` to the waiting SW and reload:
   ```js
   // In the app
   registration.waiting.postMessage({ type: 'SKIP_WAITING' });
   // In sw.js
   self.addEventListener('message', (event) => {
     if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
   });
   ```
3. Listen for `controllerchange` to reload the page:
   ```js
   navigator.serviceWorker.addEventListener('controllerchange', () => {
     window.location.reload();
   });
   ```
4. Do NOT call `self.skipWaiting()` unconditionally in the install handler. This causes mid-session cache invalidation and can break the running app.

**Detection:** Deploy a change, observe in DevTools > Application > Service Workers that a new SW is "waiting to activate."

**Confidence:** HIGH -- this is standard SW lifecycle behavior, documented in every PWA guide.

---

### Pitfall 10: MUI Theme / Dark Mode Flash in Standalone PWA

**What goes wrong:** When the PWA launches in standalone mode (from home screen), there's no browser chrome to mask the initial render. If the theme (light/dark) is determined client-side (from localStorage or `prefers-color-scheme`), users see a white flash before the correct theme applies. This is more jarring in standalone mode than in a browser tab.

**Why it happens:** Next.js SSR renders with a default theme. The client hydrates and switches to the user's preferred theme. In browser mode, the address bar masks some of this. In standalone PWA mode, the full viewport is your app -- every frame of FOUC is visible.

**Consequences:** Unprofessional appearance. Users notice the flash every time they open the app. For a "native-like" experience, this kills the illusion.

**Prevention:**
1. Set `theme_color` in the manifest to match the dark mode background if dark mode is the primary theme.
2. Use a blocking `<script>` in `<head>` (before React hydration) that reads the theme preference and sets a CSS class on `<html>`:
   ```html
   <script>
     (function() {
       var theme = localStorage.getItem('pmsync:theme') ||
         (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
       document.documentElement.setAttribute('data-theme', theme);
     })();
   </script>
   ```
3. Set `background_color` in the manifest to your dark mode background color.

**Detection:** Install PWA, set dark mode, kill app, reopen. Watch for white flash.

**Confidence:** MEDIUM -- specific to MUI's client-side theme detection pattern.

## Minor Pitfalls

### Pitfall 11: manifest.json start_url Mismatch

**What goes wrong:** If `start_url` in the manifest doesn't match the actual authenticated landing page (e.g., it's `/` but auth redirects to `/inbox`), the PWA opens, hits a redirect, and the standalone window briefly shows the wrong page or a loading spinner.

**Prevention:** Set `start_url` to the authenticated landing page (`/inbox` or wherever users actually land). If auth is needed, the redirect chain should be minimal.

---

### Pitfall 12: CSP Blocks Service Worker Registration

**What goes wrong:** If a Content Security Policy is later added to PMSync (which it currently lacks), the `worker-src` directive must include `'self'`. Without it, the browser blocks sw.js registration silently.

**Prevention:** When adding CSP headers, include: `worker-src 'self'; connect-src 'self' https://your-api-domain.com;`

---

### Pitfall 13: Offline Fallback Page Missing Auth State

**What goes wrong:** The offline fallback page (shown when a navigation request fails and isn't cached) renders without any user context. If it has navigation elements that assume a logged-in user (sidebar, user avatar), those break or show empty states.

**Prevention:** The offline fallback page should be a minimal, self-contained HTML page with no API calls. Just a "You're offline" message with a retry button. Don't try to render the full app shell.

---

### Pitfall 14: Multiple Service Worker Registrations

**What goes wrong:** If the SW registration code runs in multiple components (e.g., both a `PushNotificationManager` and a `ServiceWorkerProvider`), or if a third-party library (Serwist, next-pwa) auto-registers while you also manually register, you get competing registrations. The browser handles this by using the last-registered scope, but the intermediate states cause race conditions.

**Prevention:** Register the service worker in exactly one place: a `ServiceWorkerProvider` component rendered once in the root layout. All other components should access the registration via context/state, never call `navigator.serviceWorker.register()` themselves.

---

### Pitfall 15: Library Choice -- Serwist vs Manual SW

**What goes wrong:** Developers reach for `@serwist/next` or `@ducanh2912/next-pwa` for convenience, then discover these libraries have compatibility issues with the latest Next.js App Router, generate opinionated precache manifests that conflict with Vercel CDN caching, and add Workbox runtime overhead.

**Why it happens:** The Next.js PWA library ecosystem is fragmented. `shadowwalker/next-pwa` is abandoned. `@ducanh2912/next-pwa` evolved into Serwist. Serwist has open issues with Next.js 15+ App Router.

**Prevention:** Follow the [official Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) which recommends a manual `public/sw.js` approach. For PMSync's scope (offline inbox cache, push notification plumbing, install prompt), a manual service worker is simpler and more debuggable than adding a library dependency. Only consider Serwist if you need complex precaching or routing strategies that would be painful to implement manually.

**Confidence:** MEDIUM -- Serwist may have improved since research date. Check current release notes before deciding.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Manifest + Icons | start_url mismatch with auth redirect (P11) | Set start_url to /inbox, test standalone launch |
| Service Worker Registration | Multiple registration points (P14), middleware blocking (P5) | Single registration point, exclude PWA files from any future middleware |
| Offline Caching Strategy | Double caching with TanStack Query (P2), bloated precache (P7) | Cache ONLY static assets in SW; TanStack Query owns API cache |
| SSE/Streaming | SW intercepts AI chat stream (P3) | Explicit passthrough for /api/* and text/event-stream |
| Cookie Auth | SW strips httpOnly cookies (P1) | Never intercept API requests in SW |
| Push Notifications | iOS limitations (P8), CSP blocks (P12) | Platform detection, worker-src in CSP |
| Install Prompt | iOS has no beforeinstallprompt (P8) | Manual instructions for iOS, beforeinstallprompt for Android/desktop |
| Background Sync | Auth expiry on queued actions (P6), no Safari support (P8) | TanStack Query onlineManager as fallback, time-limit queued actions |
| SW Updates | Users stuck on old version (P9) | "Update Available" toast with skipWaiting on confirmation |
| Standalone UX | Dark mode flash (P10) | Blocking theme script, manifest theme_color |
| Vercel Deploy | sw.js cached at edge (P4) | no-cache headers in next.config.js |

## Key Architectural Decision

**The service worker should NOT intercept API requests. Ever.** For PMSync specifically:

- httpOnly cookie auth means the SW cannot inspect or manage auth state
- TanStack Query already caches API responses in-memory with intelligent invalidation
- SSE streaming for AI chat is incompatible with SW caching
- Background sync should use IndexedDB for action queuing, not SW request replay

The SW's role should be limited to:
1. Caching static assets (JS bundles, CSS, images, fonts) for faster loads
2. Serving an offline fallback page for uncached navigation requests
3. Handling push notification `push` and `notificationclick` events
4. Communicating with the main thread for update prompts

Everything else (API caching, offline data, mutation queuing) belongs in the application layer via TanStack Query + IndexedDB.

## Sources

- [Next.js Official PWA Guide](https://nextjs.org/docs/app/guides/progressive-web-apps) -- HIGH confidence
- [W3C ServiceWorker Issue #837 -- Cookie modification](https://github.com/w3c/ServiceWorker/issues/837) -- HIGH confidence
- [W3C ServiceWorker Issue #885 -- EventSource bypass](https://github.com/w3c/ServiceWorker/issues/885) -- HIGH confidence
- [TanStack Query Issue #7897 -- SW integration](https://github.com/TanStack/query/issues/7897) -- HIGH confidence
- [TanStack Query Discussion #8034 -- Double caching](https://github.com/TanStack/query/discussions/8034) -- HIGH confidence
- [next-pwa Issue #323 -- Middleware conflict](https://github.com/shadowwalker/next-pwa/issues/323) -- HIGH confidence
- [PWA iOS Limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) -- MEDIUM confidence
- [Serwist Getting Started](https://serwist.pages.dev/docs/next/getting-started) -- MEDIUM confidence
- [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) -- HIGH confidence
- [MDN: Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) -- HIGH confidence
