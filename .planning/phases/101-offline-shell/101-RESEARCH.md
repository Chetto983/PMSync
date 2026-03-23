# Phase 101: Offline Shell - Research

**Researched:** 2026-03-23
**Domain:** PWA offline fallback, online/offline detection, app shell caching
**Confidence:** HIGH

## Summary

Phase 101 adds three offline capabilities to PMSync: (1) a branded offline fallback page served by the service worker when navigating to an uncached route without network, (2) a visible online/offline banner that appears when connection drops and disappears when restored, and (3) ensuring the app shell (sidebar, header, layout chrome) loads from cache for instant offline startup.

The project already has a working Serwist service worker (sw.ts) with precaching of static assets and `cacheOnNavigation: true`. The SW uses Serwist 9.x with `matcher`-based routing (not `urlPattern`). The key addition is the Serwist `fallbacks` configuration in sw.ts plus `additionalPrecacheEntries` in next.config.js for the offline page, and a custom React hook + MUI banner component for online/offline detection.

**Primary recommendation:** Create a static HTML offline page in `public/offline.html`, add it to `additionalPrecacheEntries` in next.config.js, configure `fallbacks` in sw.ts to serve it for failed navigation requests, and build a `useOnlineStatus` hook with an MUI Alert banner in the Layout component.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OFFL-01 | User sees branded offline fallback page instead of browser error when navigating to uncached route without network | Serwist `fallbacks` config + `additionalPrecacheEntries` for static HTML page in public/ |
| OFFL-02 | User sees online/offline indicator banner when connection drops or restores | Custom `useOnlineStatus` hook using `navigator.onLine` + `online`/`offline` events, MUI Alert banner in Layout |
| OFFL-04 | App shell (navigation, layout) loads from cache for instant startup even without network | Already partially handled by Serwist precaching (JS/CSS/fonts) + `cacheOnNavigation: true`; needs verification that Layout/Sidebar/Header chunks are in precache manifest |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| serwist | 9.5.7 | SW runtime with fallbacks support | Already installed; provides `fallbacks` config for offline page |
| @serwist/next | 9.5.7 | Next.js integration with additionalPrecacheEntries | Already installed; provides `additionalPrecacheEntries` for offline page precaching |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @mui/material | (installed) | Alert, Snackbar components for offline banner | Online/offline indicator UI |
| (no new packages) | - | - | All requirements met with existing stack |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static HTML offline page | Next.js `_offline.tsx` page | Next.js pages require SSR/hydration which conflicts with SW navigation preload; static HTML is simpler and avoids flickering bugs reported in Serwist discussions |
| Custom `useOnlineStatus` hook | npm `use-navigator-online` | 10-line hook is trivial to write; no need for dependency |
| MUI Alert banner | MUI Snackbar | Banner (persistent, top of page) is better UX for connection status than Snackbar (auto-dismissing, bottom corner) |

**Installation:**
```bash
# No new packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended File Structure
```
frontend/
├── public/
│   └── offline.html              # Static branded offline page (precached by SW)
├── sw.ts                         # Updated: add fallbacks config
├── next.config.js                # Updated: add additionalPrecacheEntries
├── hooks/
│   └── use-online-status.ts      # NEW: navigator.onLine hook
├── components/
│   └── layout/
│       └── OfflineBanner.tsx      # NEW: online/offline indicator banner
│       └── Layout.tsx             # Updated: include OfflineBanner
└── locales/
    ├── en.ts                     # Updated: offline strings
    ├── it.ts                     # Updated: offline strings
    └── index.ts                  # Updated: offline string types
```

### Pattern 1: Static HTML Offline Fallback Page
**What:** A self-contained HTML file in `public/` that renders a branded "You're offline" message without any JS framework dependencies.
**When to use:** Always for the SW fallback page. Next.js pages require hydration/SSR which creates conflicts with SW navigation preload (see Pitfall 1).
**Why static HTML:** The page must work when the browser is completely offline and no JS chunks are available. A static HTML page with inline CSS is guaranteed to render. This is the approach recommended in Serwist GitHub discussions after users reported flickering and preload cancellation errors with dynamic pages.
**Example:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PMSync - Offline</title>
  <style>
    /* Inline CSS using PMSync brand colors */
    body {
      margin: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0c1017;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container { text-align: center; max-width: 28rem; padding: 1rem; }
    h1 {
      font-size: 3rem;
      font-weight: bold;
      background: linear-gradient(135deg, #55cae5, #7c5cbf);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }
    h2 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; margin-bottom: 1.5rem; }
    button {
      background: #55cae5;
      color: #0c1017;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
      font-size: 1rem;
    }
    button:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>PMSync</h1>
    <h2>You're Offline</h2>
    <p>It looks like you've lost your internet connection. Some features may be unavailable until you're back online.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>
```

### Pattern 2: Serwist Fallbacks Configuration in sw.ts
**What:** The `fallbacks` option in the Serwist constructor specifies which cached page to serve when a runtime caching strategy fails for a navigation request.
**When to use:** Required for OFFL-01.
**Critical:** The fallbacks URL must be precached (via `additionalPrecacheEntries` in next.config.js) otherwise the SW has nothing to serve.
**Example:**
```typescript
// sw.ts additions
const serwist = new Serwist({
  // ... existing config (precacheEntries, skipWaiting, etc.)
  fallbacks: {
    entries: [
      {
        url: '/offline.html',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});
```

### Pattern 3: additionalPrecacheEntries in next.config.js
**What:** Tells the Serwist webpack plugin to include extra URLs in the precache manifest beyond the auto-discovered JS/CSS/font chunks.
**When to use:** Required for the offline fallback page -- without this, the SW has no cached copy to serve.
**Critical:** The `revision` field must change on every deploy to bust the precache. Use a build-time value like `Date.now().toString()` or a content hash.
**Example:**
```javascript
// next.config.js
const withSerwist = withSerwistInit({
  swSrc: 'sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  reloadOnOnline: false,
  cacheOnNavigation: true,
  additionalPrecacheEntries: [
    { url: '/offline.html', revision: Date.now().toString() },
  ],
});
```

### Pattern 4: useOnlineStatus Hook
**What:** A custom React hook that tracks `navigator.onLine` state and listens for `online`/`offline` window events.
**When to use:** Required for OFFL-02 (online/offline banner).
**Example:**
```typescript
// hooks/use-online-status.ts
import { useState, useEffect, useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true; // Assume online during SSR
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

### Pattern 5: Offline Banner Component
**What:** A persistent MUI Alert banner that appears at the top of the Layout when the user goes offline, and disappears when they come back online.
**When to use:** Required for OFFL-02.
**Critical:** Banner must NOT use a Snackbar (auto-dismissing). It should be persistent and visible until connection restores. Use MUI `Collapse` for smooth show/hide animation.
**Example:**
```tsx
// components/layout/OfflineBanner.tsx
import { Alert, Collapse } from '@mui/material';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useTranslations } from '@/lib/hooks/use-translations';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const t = useTranslations();

  return (
    <Collapse in={!isOnline}>
      <Alert
        severity="warning"
        icon={<WifiOff size={20} />}
        sx={{
          borderRadius: 0,
          '& .MuiAlert-message': { width: '100%', textAlign: 'center' },
        }}
      >
        {t.common?.offlineBanner || 'You are offline. Some features may be unavailable.'}
      </Alert>
    </Collapse>
  );
}
```

### Anti-Patterns to Avoid
- **Using a Next.js page (`_offline.tsx`) as the SW fallback:** Next.js pages require SSR data, hydration JS chunks, and potentially API calls. When the user is offline and navigating to an uncached route, none of these are available. This causes flickering, preload cancellation errors, and blank pages. Use static HTML instead.
- **Using Snackbar for offline status:** Snackbars auto-dismiss after a timeout. Offline status should remain visible until connection restores. Use a persistent Alert banner.
- **Polling `navigator.onLine` with setInterval:** The `online` and `offline` events fire immediately. Polling is unnecessary and wasteful.
- **Placing offline banner in `_app.tsx`:** The banner should go inside `Layout.tsx` since it's only relevant for authenticated dashboard pages. Public pages don't need it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SW fallback routing | Custom fetch event handler with fallback logic | Serwist `fallbacks` config | Serwist handles the fetch intercept, cache lookup, and fallback serving correctly |
| Offline page precaching | Manual `caches.open().put()` in SW install handler | `additionalPrecacheEntries` in withSerwistInit | Integrates with Serwist's revision-based cache management |
| Event-based online status | Custom EventTarget wrapper or polling | `useSyncExternalStore` with window online/offline events | React 18+ primitive designed exactly for this -- subscribes to external browser state |

**Key insight:** The offline shell is primarily a SERVICE WORKER configuration change (fallbacks + precache) plus a small React hook. There is no complex application logic involved.

## Common Pitfalls

### Pitfall 1: Using Next.js Pages as SW Fallback
**What goes wrong:** SW serves a Next.js page as fallback, but the page requires JS chunks, CSS, and potentially API data that aren't cached. User sees blank page or hydration error.
**Why it happens:** Developers assume any Next.js page can be precached and served offline. But Next.js pages depend on `_next/data/*.json` files and runtime JS chunks.
**How to avoid:** Use a static HTML file in `public/` for the offline fallback. It renders without any external dependencies.
**Warning signs:** Flickering offline page, "preloadResponse settled" errors in SW console, blank page after navigating offline.

### Pitfall 2: Forgetting additionalPrecacheEntries
**What goes wrong:** SW `fallbacks` config references `/offline.html` but the file isn't in the precache manifest. When the SW tries to serve the fallback, it has nothing cached and the user gets the browser's default offline error.
**Why it happens:** `fallbacks` only defines the ROUTING rule. It does NOT automatically precache the URL (changed in Serwist 9.x).
**How to avoid:** Add `{ url: '/offline.html', revision: '...' }` to `additionalPrecacheEntries` in next.config.js.
**Warning signs:** Offline fallback "works" in development (file is served directly) but fails in production (SW can't find it in cache).

### Pitfall 3: Stale Revision in additionalPrecacheEntries
**What goes wrong:** Offline page content changes but the `revision` value stays the same. Serwist skips re-caching the file because it thinks nothing changed.
**Why it happens:** Hardcoded revision string like `revision: '1'` that nobody remembers to update.
**How to avoid:** Use `Date.now().toString()` or a build-time hash as the revision. This ensures every build re-caches the offline page. The slight over-fetching is negligible for a single HTML file.
**Warning signs:** Users see an old version of the offline page after a deploy.

### Pitfall 4: navigator.onLine False Positives
**What goes wrong:** `navigator.onLine` returns `true` even when the user has no real connectivity (e.g., connected to WiFi but the router has no internet).
**Why it happens:** `navigator.onLine` only detects layer 2 connectivity (network interface up/down), not actual internet access.
**How to avoid:** Accept this limitation. `navigator.onLine` is the standard API and works correctly for the common case (airplane mode, WiFi toggled off). Actual connectivity testing (fetch heartbeat) is out of scope for this phase and would add complexity for minimal benefit.
**Warning signs:** User connected to captive portal WiFi doesn't see offline banner. This is an accepted edge case.

### Pitfall 5: Banner in Wrong Component Location
**What goes wrong:** Offline banner placed in `_app.tsx` shows on public pages (login, landing) where it's noise, or placed inside page components where it's inconsistent.
**Why it happens:** Unclear ownership of the banner component.
**How to avoid:** Place `OfflineBanner` inside `Layout.tsx` (the dashboard shell), above the `Header` component. This ensures it shows on all authenticated pages consistently.
**Warning signs:** Banner visible on login page, or only on some dashboard pages.

## Code Examples

### Complete sw.ts Update
```typescript
// Source: Serwist GitHub Discussion #159, verified against Serwist 9.5.7 API
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

const filteredCache = defaultCache.filter((entry) => {
  const pattern = entry.matcher;
  if (pattern instanceof RegExp) return !pattern.source.includes('api');
  if (typeof pattern === 'string') return !pattern.includes('/api');
  return true;
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  precacheOptions: {
    navigateFallbackDenylist: [/^\/api\//],
  },
  runtimeCaching: [
    {
      matcher: /^\/api\/.*/,
      handler: new NetworkOnly(),
    },
    ...filteredCache,
  ],
  // OFFL-01: Serve offline page when navigation fails
  fallbacks: {
    entries: [
      {
        url: '/offline.html',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
```

### Complete useOnlineStatus Hook (useSyncExternalStore)
```typescript
// Source: React 18 docs for useSyncExternalStore
// https://react.dev/reference/react/useSyncExternalStore
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workbox `offlineFallback()` recipe | Serwist `fallbacks` constructor option | Serwist 9.x (2024) | Cleaner API, integrated with constructor |
| `useState` + `useEffect` for online status | `useSyncExternalStore` | React 18 (2022) | Proper concurrent-mode-safe subscription to browser state |
| Next.js `_offline.tsx` page as fallback | Static HTML in `public/` | Community consensus 2025 | Avoids hydration/SSR conflicts with SW navigation preload |

**Deprecated/outdated:**
- `navigator.connection` API: Unreliable, not widely supported, not needed for basic online/offline detection
- Polling-based connectivity checks: Wasteful when `online`/`offline` events exist

## Open Questions

1. **Dark mode support in static offline page**
   - What we know: The offline page is static HTML with inline CSS. It cannot use the MUI theme or next-themes context.
   - What's unclear: Whether to support dark mode in the static page via `prefers-color-scheme` media query.
   - Recommendation: Use `prefers-color-scheme` media query in the inline CSS to provide both light and dark variants. The dark variant uses `#0c1017` background (already shown), the light variant uses `#f8fafc` background. This matches the user's system preference without any JS.

2. **App shell caching verification (OFFL-04)**
   - What we know: Serwist precaches all JS/CSS/font chunks via `__SW_MANIFEST`. `cacheOnNavigation: true` caches pages on visit. Together these should ensure the app shell loads from cache offline.
   - What's unclear: Whether the Layout/Sidebar/Header component chunks are included in the precache manifest or only loaded on first navigation.
   - Recommendation: After implementation, verify by building (`next build`), inspecting the generated precache manifest in sw.js, and confirming Layout chunks are present. If not, pages visited at least once will still have the shell cached via `cacheOnNavigation`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + TypeScript compiler |
| Config file | frontend/jest.config.* |
| Quick run command | `cd frontend && npx tsc --noEmit` |
| Full suite command | `cd frontend && npx tsc --noEmit && npx jest --passWithNoTests` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFFL-01 | Offline fallback page served by SW for uncached navigation | manual | DevTools > Application > SW > Offline checkbox, navigate to uncached route | N/A - manual |
| OFFL-02 | Online/offline banner shows/hides on connection change | unit | `cd frontend && npx jest __tests__/hooks/use-online-status.test.ts -x` | No - Wave 0 |
| OFFL-04 | App shell loads from cache offline | manual | DevTools > Application > SW > Offline checkbox, reload app | N/A - manual |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit`
- **Per wave merge:** `cd frontend && npx tsc --noEmit && npx jest --passWithNoTests`
- **Phase gate:** Type check green + manual DevTools offline verification

### Wave 0 Gaps
- [ ] `frontend/__tests__/hooks/use-online-status.test.ts` -- unit test for useOnlineStatus hook (mock window events)
- [ ] Offline page file: `frontend/public/offline.html`

## Sources

### Primary (HIGH confidence)
- [Serwist Core API - fallbacks](https://serwist.pages.dev/docs/serwist/core/serwist) - Constructor options including fallbacks
- [Serwist Next.js Config - additionalPrecacheEntries](https://serwist.pages.dev/docs/next/configuring/additional-precache-entries) - Precache config format
- [Serwist Next.js Config - cacheOnNavigation](https://serwist.pages.dev/docs/next/configuring/cache-on-navigation) - Page caching on navigation
- [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) - Standard hook for browser state subscription
- Existing codebase: `frontend/sw.ts`, `frontend/next.config.js`, `frontend/components/layout/Layout.tsx`

### Secondary (MEDIUM confidence)
- [Serwist GitHub Discussion #159](https://github.com/serwist/serwist/discussions/159) - Offline fallback page creation pattern
- [Serwist GitHub Discussion #174](https://github.com/serwist/serwist/discussions/174) - Static HTML vs Next.js page for fallback (recommends static HTML)
- [DEV Community - Building Offline Apps with Next.js and Serwist](https://dev.to/sukechris/building-offline-apps-with-nextjs-and-serwist-2cbj) - fallbacks config example

### Tertiary (LOW confidence)
- None -- all findings verified against official docs or GitHub discussions with maintainer responses

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new packages, all features verified in Serwist 9.5.7 docs
- Architecture: HIGH - Static HTML fallback pattern confirmed by Serwist maintainer in Discussion #174; useOnlineStatus is a trivial React primitive
- Pitfalls: HIGH - Flickering/preload issues with dynamic pages documented in multiple Serwist discussions; additionalPrecacheEntries requirement confirmed in docs
- Online/offline detection: HIGH - navigator.onLine + events is the browser standard, useSyncExternalStore is the React standard

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (Serwist 9.x is stable)
