# Phase 100: PWA Foundation - Research

**Researched:** 2026-03-23
**Domain:** Progressive Web App (service worker, web app manifest, precaching)
**Confidence:** HIGH

## Summary

Phase 100 transforms PMSync into an installable PWA by adding a web app manifest, registering a service worker for static asset precaching, and ensuring /api/* routes are completely bypassed by the SW. The project uses Next.js 16 with Pages Router, deployed on Vercel.

The decided library is Serwist (`@serwist/next`), the maintained successor to next-pwa. Serwist wraps Workbox and integrates directly with Next.js webpack to generate a precache manifest of static assets (JS, CSS, fonts). The critical challenge is that Serwist's `defaultCache` includes a NetworkFirst entry for `/api/*`, which MUST be overridden with a NetworkOnly rule placed before it -- and ideally the entire fetch handler should be bypassed for API routes to prevent any interference with httpOnly cookie auth, SSE streams, and TanStack Query caching.

**Primary recommendation:** Install `@serwist/next` + `serwist`, create a custom SW source file that overrides defaultCache to exclude ALL /api/* routes, add a static `public/manifest.json`, generate PWA icon set from existing logo, and add Vercel headers to prevent sw.js edge caching.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | User sees PMSync as installable app with correct name, icons, and theme colors on all platforms | Manifest.json with correct fields + icon set (192x192, 512x512, maskable) from existing Logo.png/SVG |
| FOUND-02 | Service worker registers on first visit and precaches static assets (JS, CSS, fonts) | @serwist/next withSerwistInit wraps next.config.js, auto-generates precache manifest from webpack build |
| FOUND-03 | Service worker updates correctly on new deploys (no stale SW via Vercel edge caching) | vercel.json Cache-Control header for /sw.js: `public, max-age=0, must-revalidate` |
| FOUND-04 | SW never intercepts /api/* requests (preserves httpOnly cookie auth, TQ caching, SSE streaming) | Custom runtimeCaching array: NetworkOnly for /api/* BEFORE defaultCache spread; also navigateFallbackDenylist |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @serwist/next | 9.5.7 | Next.js SW integration (webpack plugin + registration) | Decided in STATE.md; successor to next-pwa, Workbox-based, actively maintained |
| serwist | 9.5.7 | SW runtime (precaching, routing, strategies) | Peer dependency of @serwist/next |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | - | Manifest is static JSON, icons are pre-generated assets |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @serwist/next | next-pwa | next-pwa is abandoned, no Next.js 16 support |
| @serwist/next | vite-plugin-pwa | Not compatible with Next.js webpack build |
| Static manifest.json | App Router manifest.ts | Project uses Pages Router, not App Router |

**Installation:**
```bash
cd frontend
npm i @serwist/next
npm i -D serwist
```

**Version verification:** `@serwist/next` and `serwist` are both at 9.5.7 (verified via npm registry 2026-03-23).

## Architecture Patterns

### Recommended File Structure
```
frontend/
├── public/
│   ├── manifest.json          # Static web app manifest (Pages Router)
│   ├── icons/
│   │   ├── icon-192x192.png   # Standard PWA icon
│   │   ├── icon-512x512.png   # Splash/install icon
│   │   ├── icon-maskable-192x192.png  # Android adaptive icon
│   │   └── icon-maskable-512x512.png  # Android adaptive icon
│   └── favicon.svg            # Already exists
├── sw.ts                      # Service worker source (compiled to public/sw.js)
├── next.config.js             # Wrapped with withSerwistInit
└── vercel.json                # Cache-Control for sw.js
```

### Pattern 1: next.config.js Wrapping with withSerwistInit
**What:** Serwist wraps the Next.js config to inject webpack plugin that generates the precache manifest at build time.
**When to use:** Always -- this is the integration point.
**Example:**
```javascript
// next.config.js
const withSerwistInit = require('@serwist/next').default;

const withSerwist = withSerwistInit({
  swSrc: 'sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  reloadOnOnline: false, // We handle this ourselves in Phase 101
});

// Chain with existing withBundleAnalyzer
module.exports = withSerwist(withBundleAnalyzer(nextConfig));
```

### Pattern 2: Custom Service Worker with API Route Bypass
**What:** SW source file that uses Serwist runtime but overrides defaultCache to completely exclude /api/* routes.
**When to use:** Always -- FOUND-04 requires /api/* bypass.
**Example:**
```typescript
// sw.ts
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, NetworkOnly } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Filter out any /api/* entries from defaultCache, then prepend NetworkOnly
const apiBypassRule = {
  urlPattern: /^\/api\/.*/,
  handler: new NetworkOnly(),
  method: 'GET' as const,
};

// Remove the defaultCache /api/ NetworkFirst entry, replace with full bypass
const filteredCache = defaultCache.filter(
  (entry) => {
    // Remove entries that match /api/ pattern
    if (typeof entry.urlPattern === 'object' && 'source' in entry.urlPattern) {
      return !String(entry.urlPattern.source).includes('api');
    }
    return true;
  }
);

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [apiBypassRule, ...filteredCache],
});

serwist.addEventListeners();
```

### Pattern 3: Static manifest.json (Pages Router)
**What:** Web app manifest as a static file in public/ (not dynamic App Router manifest.ts).
**When to use:** Always -- project uses Pages Router.
**Example:**
```json
{
  "name": "PMSync",
  "short_name": "PMSync",
  "description": "Professional AI Mail Client",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0c1017",
  "theme_color": "#55cae5",
  "orientation": "any",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### Pattern 4: Manifest and Apple Meta Tags in _document.tsx
**What:** Link to manifest and add apple-specific meta tags in the document head.
**When to use:** Pages Router requires manual `<link>` and `<meta>` tags.
**Example:**
```tsx
// pages/_document.tsx - additions to <Head>
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#55cae5" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="PMSync" />
<link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
```

### Pattern 5: Vercel Cache Headers for sw.js
**What:** Prevent Vercel CDN from caching sw.js so deploys trigger SW updates.
**When to use:** Always on Vercel deployments.
**Example:**
```json
// frontend/vercel.json - add to headers array
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    },
    {
      "source": "/swe-worker-*.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    }
  ]
}
```

### Anti-Patterns to Avoid
- **Using `purpose: "any maskable"` on a single icon:** Separate icons should be provided for `any` and `maskable` purposes. Combining them causes the "any" context to display the icon with maskable safe-zone padding, looking too small.
- **Letting defaultCache handle /api/ routes:** The default includes NetworkFirst for /api/, which caches API responses in the SW. This breaks httpOnly cookie auth and corrupts SSE streams.
- **SW registration in development:** Serwist should be disabled in dev mode to avoid stale cache during development.
- **Not adding sw.js to .gitignore:** The sw.js is generated at build time and should not be committed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Precache manifest generation | Manual list of assets | Serwist webpack plugin (`withSerwistInit`) | Webpack knows all chunk hashes; manual lists go stale immediately |
| SW registration + update lifecycle | Custom registration script | `@serwist/next` auto-registration (`register: true`) | Handles updatefound, statechange, and navigator.serviceWorker correctly |
| Cache versioning | Manual cache names with version strings | Serwist precache revision hashing | Content-hash based, automatically invalidates changed assets |
| Icon generation | Manual Photoshop/Figma exports | CLI tool (e.g., `sharp` or `@nickvdh/pwa-icon-generator`) or manual resize from Logo.png | Need exact sizes (192, 512) with and without maskable padding |

**Key insight:** Serwist/Workbox handles the entire SW lifecycle (install, activate, fetch routing, precache cleanup). The only custom code needed is the API bypass configuration and the manifest.

## Common Pitfalls

### Pitfall 1: defaultCache Caches API Routes
**What goes wrong:** SW intercepts /api/* requests, caches responses with NetworkFirst. httpOnly cookies may not be forwarded correctly, SSE streams get corrupted, TanStack Query cache gets stale data from SW cache.
**Why it happens:** Serwist's `defaultCache` includes a catch-all NetworkFirst rule for `/api/` routes.
**How to avoid:** Place a NetworkOnly rule for `/api/.*` BEFORE spreading defaultCache. Also add `/api/` to `navigateFallbackDenylist`.
**Warning signs:** 401 errors on API calls, SSE connections failing, stale data in UI.

### Pitfall 2: Vercel Edge Caches sw.js
**What goes wrong:** After deployment, browsers get stale sw.js from Vercel CDN. New service worker is not detected for hours/days.
**Why it happens:** Vercel CDN applies default Cache-Control to static assets in public/.
**How to avoid:** Add explicit `Cache-Control: public, max-age=0, must-revalidate` header for /sw.js in vercel.json.
**Warning signs:** Users report app "stuck" on old version after deploy.

### Pitfall 3: TypeScript Config Conflicts with WebWorker Types
**What goes wrong:** Adding `"webworker"` to the main tsconfig.json `lib` array causes type conflicts (e.g., `fetch` return types, `self` type).
**Why it happens:** WebWorker and DOM type definitions conflict.
**How to avoid:** Create a separate `tsconfig.sw.json` for the SW file, or rely on `@serwist/next/typings` which handles the SW types via a `declare global` block in the SW source file itself. The main tsconfig only needs `"@serwist/next/typings"` in `types`.
**Warning signs:** Type errors in non-SW files about `ServiceWorkerGlobalScope` or conflicting `fetch` signatures.

### Pitfall 4: Missing Apple-Specific Meta Tags
**What goes wrong:** iOS Safari doesn't read manifest.json fully. App added to home screen shows no icon, wrong name, or no splash screen.
**Why it happens:** iOS has historically poor manifest support and relies on `<meta>` and `<link>` tags.
**How to avoid:** Add `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, and `apple-touch-icon` tags to `_document.tsx`.
**Warning signs:** App works on Android/desktop but looks broken on iOS home screen.

### Pitfall 5: SW Registration Blocks First Paint
**What goes wrong:** Service worker registration and precaching delays initial page load.
**Why it happens:** SW install event downloads all precached assets on first visit.
**How to avoid:** Serwist's `register: true` defers registration until after page load by default. Do NOT manually call `navigator.serviceWorker.register()` in a blocking way.
**Warning signs:** Lighthouse shows "Time to Interactive" regression after adding SW.

### Pitfall 6: next.config.js Chain Order
**What goes wrong:** Serwist wrapper doesn't see the correct config because it's applied in the wrong order with other wrappers (bundle analyzer).
**Why it happens:** Next.js config wrappers are composed functions; order matters.
**How to avoid:** Apply withSerwist as the outermost wrapper: `withSerwist(withBundleAnalyzer(nextConfig))`.
**Warning signs:** sw.js not generated at build time, or missing precache entries.

## Code Examples

### Service Worker Source File (sw.ts)
```typescript
// Source: https://serwist.pages.dev/docs/next/getting-started
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    // CRITICAL: /api/* must use NetworkOnly to prevent any SW interception
    {
      urlPattern: /\/api\/.*/,
      handler: 'NetworkOnly',
    },
    // Spread the rest of defaultCache (excludes the /api/ NetworkFirst rule if filtered)
    ...defaultCache.filter((entry) => {
      // Defensive: skip any entry whose urlPattern string contains '/api'
      const pattern = entry.urlPattern;
      if (pattern instanceof RegExp) return !pattern.source.includes('api');
      if (typeof pattern === 'string') return !pattern.includes('/api');
      return true;
    }),
  ],
});

serwist.addEventListeners();
```

### next.config.js with Serwist Wrapper
```javascript
// Source: https://serwist.pages.dev/docs/next/getting-started
const bundleAnalyzer = require('@next/bundle-analyzer');
const withSerwistInit = require('@serwist/next').default;

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const withSerwist = withSerwistInit({
  swSrc: 'sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  reloadOnOnline: false,
  cacheOnNavigation: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... existing config
};

module.exports = withSerwist(withBundleAnalyzer(nextConfig));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| next-pwa | @serwist/next | 2024 | next-pwa is abandoned; Serwist forked and modernized it |
| Workbox CLI | Serwist/Workbox webpack plugin | 2023+ | Webpack integration auto-generates manifest from build output |
| `purpose: "any maskable"` | Separate icons per purpose | 2023+ (web.dev guidance) | Prevents incorrectly padded icons in non-maskable contexts |
| Manual SW registration | Framework-managed registration | 2024+ | @serwist/next handles registration lifecycle automatically |

**Deprecated/outdated:**
- `next-pwa`: Abandoned, no Next.js 14+ support
- `workbox-webpack-plugin` directly: Use @serwist/next which wraps it
- `GenerateSW` mode: InjectManifest (what Serwist uses via swSrc) gives more control

## Open Questions

1. **Icon generation approach**
   - What we know: Need 192x192 and 512x512 PNG icons in both regular and maskable variants. Source exists as Logo.png (223KB) and Logo PMSync.svg.
   - What's unclear: Whether to use a CLI tool for generation or manually create them. The logo's aspect ratio and safe zone suitability for maskable icons is unknown.
   - Recommendation: Manually resize Logo.png using sharp or an image tool. For maskable icons, add padding so the important content fits within the central 80% circle.

2. **defaultCache /api/ entry exact shape**
   - What we know: defaultCache includes a NetworkFirst rule that matches /api/ routes.
   - What's unclear: The exact urlPattern format (RegExp vs string vs URLPattern) used in defaultCache for the /api/ entry.
   - Recommendation: Filter conservatively by checking both RegExp source and string representation. Log the defaultCache entries during development to verify.

3. **TypeScript configuration for SW file**
   - What we know: SW files need `webworker` lib types but this conflicts with DOM types in the main tsconfig.
   - What's unclear: Whether @serwist/next 9.x handles this automatically or requires a separate tsconfig.
   - Recommendation: Add `"@serwist/next/typings"` to main tsconfig types. Use `declare global` + `declare const self` in sw.ts. Only create separate tsconfig.sw.json if type conflicts arise.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + Playwright 1.58.2 |
| Config file | frontend/jest.config.* (unit), frontend/playwright.config.ts (e2e) |
| Quick run command | `cd frontend && npx jest --passWithNoTests` |
| Full suite command | `cd frontend && npm test && npx tsc --noEmit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Manifest has correct name, icons, theme_color | unit | `cd frontend && npx jest tests/pwa/manifest.test.ts -x` | No - Wave 0 |
| FOUND-02 | SW registers and precaches static assets | e2e/manual | Lighthouse PWA audit or manual DevTools check | No - deferred to Phase 105 |
| FOUND-03 | sw.js has no-cache header on Vercel | unit | `cd frontend && npx jest tests/pwa/vercel-headers.test.ts -x` | No - Wave 0 |
| FOUND-04 | /api/* bypassed by SW | unit | `cd frontend && npx jest tests/pwa/sw-api-bypass.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit`
- **Per wave merge:** `cd frontend && npm test && npx tsc --noEmit`
- **Phase gate:** Type check green + manual DevTools SW inspection

### Wave 0 Gaps
- [ ] `frontend/__tests__/pwa/manifest.test.ts` -- validates manifest.json schema (name, icons, display, theme_color)
- [ ] `frontend/__tests__/pwa/vercel-headers.test.ts` -- validates vercel.json has Cache-Control for /sw.js
- [ ] `frontend/__tests__/pwa/sw-api-bypass.test.ts` -- validates sw.ts runtimeCaching excludes /api/* (static analysis or mock)
- [ ] Serwist package installation: `cd frontend && npm i @serwist/next && npm i -D serwist`

## Sources

### Primary (HIGH confidence)
- [Serwist official docs - Getting Started](https://serwist.pages.dev/docs/next/getting-started) - Full setup guide
- [Serwist official docs - Register Config](https://serwist.pages.dev/docs/next/configuring/register) - Registration options
- [Serwist official docs - Core API](https://serwist.pages.dev/docs/serwist/core/serwist) - Constructor options
- npm registry: @serwist/next@9.5.7, serwist@9.5.7 (verified 2026-03-23)

### Secondary (MEDIUM confidence)
- [Vite PWA Vercel Deployment Guide](https://vite-pwa-org.netlify.app/deployment/vercel) - sw.js Cache-Control headers for Vercel
- [Serwist GitHub Discussion #28](https://github.com/serwist/serwist/discussions/28) - defaultCache /api/ handling, NetworkOnly override pattern
- [web.dev PWA Manifest Guide](https://web.dev/learn/pwa/web-app-manifest) - Icon sizes, maskable purpose, manifest fields

### Tertiary (LOW confidence)
- [Chrome Service Worker Static Routing API](https://developer.chrome.com/blog/service-worker-static-routing) - Chrome 123+ feature for bypassing SW entirely for specific paths (progressive enhancement, not relied upon)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Serwist is decided in STATE.md, version verified against npm
- Architecture: HIGH - Serwist docs are clear on Pages Router setup, patterns verified
- Pitfalls: HIGH - defaultCache /api/ issue is documented in GitHub discussions, Vercel caching is well-known
- API bypass: MEDIUM - exact defaultCache entry shape needs runtime verification

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (Serwist 9.x is stable, unlikely to break)
