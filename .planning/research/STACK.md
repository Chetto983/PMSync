# Technology Stack: PWA Features

**Project:** PMSync v8.0 Progressive Web App
**Researched:** 2026-03-23
**Overall confidence:** HIGH

## Recommended Stack

### Service Worker & Offline Caching

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@serwist/next` | ^9.5.4 | Next.js service worker integration | Official Next.js docs recommend Serwist for offline support. Successor to abandoned next-pwa. Wraps Workbox with Next.js-aware precaching, route matching, and build integration. 26K+ weekly downloads, actively maintained. |
| `serwist` | ^9.5.7 | Core service worker toolkit (dev dep) | Required peer — provides Workbox-based caching strategies (StaleWhileRevalidate, CacheFirst, NetworkFirst), precache manifest injection, and background sync primitives. |

### Turbopack Compatibility

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@serwist/turbopack` | ^9.5.6 | Turbopack dev mode support (dev dep) | Next.js 16 defaults to Turbopack. @serwist/next requires webpack for builds, but @serwist/turbopack enables `next dev --turbopack` without losing service worker DX. Build still uses webpack via `next build`. No script changes needed for dev. |
| `esbuild` | (already in node_modules) | SW bundling for Turbopack mode | Required by @serwist/turbopack to compile the service worker file during Turbopack dev. Check if already a transitive dep before adding explicitly. |

### Push Notifications (Frontend Plumbing Only)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `web-push` | ^3.6.7 | VAPID key generation (dev dep, CLI only) | Needed once to run `web-push generate-vapid-keys`. Not a runtime dependency for this milestone (no backend push trigger). Keys go into `.env`. Official Next.js PWA guide uses this exact approach. |

### Offline Data Storage

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `idb-keyval` | ^6.2.1 | IndexedDB key-value store for offline cache | 295-573 bytes brotli'd. PMSync needs simple key-value caching (inbox list, read email bodies), not full database queries. `idb-keyval` is the right abstraction — localStorage API familiarity, IndexedDB persistence, zero config. Upgrade path to `idb` if needs grow. By Jake Archibald (Chrome team). |

### Web App Manifest

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js built-in | ^16.1.6 (existing) | `app/manifest.ts` file convention | Next.js App Router has native support for `app/manifest.ts` that generates `/manifest.webmanifest`. No library needed. TypeScript-typed via `MetadataRoute.Manifest`. Already in our stack. |

### Install Prompt

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| No library needed | N/A | `beforeinstallprompt` browser API + manual iOS detection | The install prompt is a browser API, not a library concern. Capture `beforeinstallprompt` event for Chrome/Edge/Android. For iOS Safari, detect UA and show manual "Add to Home Screen" instructions. Official Next.js guide confirms this approach. |

## What NOT to Add

| Anti-Recommendation | Why Not |
|---------------------|---------|
| `next-pwa` (shadowwalker) | Abandoned. Last meaningful update 2022. Does not support Next.js 14+, let alone 16. |
| `@ducanh2912/next-pwa` | Fork that maintained next-pwa for a while, but Serwist has surpassed it in ecosystem adoption and is the officially-referenced solution in Next.js docs. |
| `next-pwa-pack` | Too new, too little community adoption. Unnecessary abstraction over what Serwist already handles cleanly. |
| `workbox-*` (direct) | Serwist wraps Workbox. Using Workbox directly means manual webpack plugin config, no Next.js-aware precaching, and duplicating what @serwist/next provides out of the box. |
| `dexie` or `idb` (full) | Overkill. PMSync is not building an offline-first database. We need to cache a read-only snapshot of inbox data and email bodies. Key-value storage is sufficient. |
| `localforage` | Legacy choice. Larger bundle, polyfills no longer needed (IndexedDB support is universal). idb-keyval is smaller and more modern. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| SW integration | @serwist/next | Manual Workbox | Serwist handles Next.js build output precaching, App Router route matching, and SW lifecycle. Manual Workbox requires recreating all of this. |
| SW integration | @serwist/next | No SW library (raw SW) | Next.js official guide shows raw `public/sw.js` for push only. But offline caching with precache manifests, runtime caching strategies, and cache versioning is too much boilerplate to hand-roll. |
| Offline storage | idb-keyval | idb (full) | idb gives full IndexedDB API access (cursors, indexes, ranges). We don't need that — just get/set for cached email data. |
| Offline storage | idb-keyval | Cache API only | Cache API is great for HTTP responses but awkward for storing processed/transformed data (parsed email objects). idb-keyval stores arbitrary JS objects. |
| Push notifications | web-push (CLI) | vapidkeys.com | Web tool works but `web-push generate-vapid-keys` is reproducible, scriptable, and doesn't send keys through a third-party website. |

## Integration Points with Existing Stack

### TanStack Query + Offline Caching
TanStack Query already has `gcTime: 30min` and `staleTime: 5min`. For offline reading:
- Service worker caches API responses (runtime caching with NetworkFirst strategy)
- TanStack Query reads from its in-memory cache first (instant)
- If memory cache is empty + offline, SW intercepts fetch and returns cached response
- `idb-keyval` stores inbox snapshot for cold-start offline (SW populates Cache API, TanStack Query hydrates from cached responses)

### Zustand + Offline State
- Add a `pwa` slice to Zustand store: `isOnline`, `isInstalled`, `isStandalone`, `pendingActions[]`
- Background sync queue stored in `idb-keyval`, Zustand holds in-memory mirror
- On reconnect, flush pending actions queue via Background Sync API (or manual retry fallback)

### MUI + Install Prompt
- Install prompt banner as MUI `Snackbar` or `Alert` component
- iOS instructions as MUI `Dialog` with step-by-step
- Push notification toggle in Settings page using MUI `Switch`

### Vercel Deployment Constraints
- Service worker file (`/sw.js`) must be in `public/` output — Serwist handles this via `swDest: "public/sw.js"`
- SW headers: Vercel serves static files from `public/` with correct Content-Type. Add `Cache-Control: no-cache, no-store, must-revalidate` for `sw.js` via `next.config.js` headers or `vercel.json`
- Manifest served from `app/manifest.ts` — Next.js handles Content-Type automatically
- HTTPS guaranteed on Vercel (required for SW registration)
- No server-side SW registration needed — all client-side

### Build Configuration Impact
- `next.config.js` wraps existing config with `withSerwist()` from `@serwist/next`
- Build uses webpack (Serwist requirement). Since current config already uses webpack (no `--turbopack` in build script), no change needed for `npm run build`.
- Dev mode: `@serwist/turbopack` allows keeping `next dev --turbopack` (if used). If PMSync uses `next dev` without turbopack flag, no issue — webpack is the default fallback.
- Current `next.config.js` uses `withBundleAnalyzer` wrapper. Serwist wraps around it: `withSerwist(withBundleAnalyzer(nextConfig))`

## Installation

```bash
# Runtime dependencies
npm install @serwist/next idb-keyval

# Dev dependencies
npm install -D serwist @serwist/turbopack

# One-time VAPID key generation (global install, run once)
npx web-push generate-vapid-keys
```

## Configuration Files Needed

| File | Purpose |
|------|---------|
| `app/manifest.ts` | Web app manifest (Next.js convention) |
| `app/sw.ts` | Service worker source (Serwist compiles to `public/sw.js`) |
| `next.config.js` | Add `withSerwist()` wrapper |
| `tsconfig.json` | Add `"@serwist/next/typings"` and `"webworker"` lib |
| `.gitignore` | Add `public/sw*` and `public/swe-worker*` |
| `.env` | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |

## Sources

- [Next.js Official PWA Guide](https://nextjs.org/docs/app/guides/progressive-web-apps) — HIGH confidence, official docs (v16.2.1, updated 2026-02-11)
- [Serwist Getting Started](https://serwist.pages.dev/docs/next/getting-started) — HIGH confidence, official docs
- [@serwist/next on npm](https://www.npmjs.com/package/@serwist/next) — v9.5.4, published 2026-03-22
- [serwist on npm](https://www.npmjs.com/package/serwist) — v9.5.7, published 2026-03-19
- [@serwist/turbopack on npm](https://www.npmjs.com/package/@serwist/turbopack) — v9.5.6
- [idb-keyval on GitHub](https://github.com/jakearchibald/idb-keyval) — ~600 bytes, promise-based IndexedDB
- [web-push on npm](https://www.npmjs.com/package/web-push) — VAPID key generation
- [Workbox Background Sync](https://developer.chrome.com/docs/workbox/retrying-requests-when-back-online/) — Queue + retry pattern for offline actions
- [MDN Background Sync API](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) — Browser support ~70%, fallback needed for Safari
