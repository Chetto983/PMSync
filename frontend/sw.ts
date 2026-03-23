import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

// Filter out any defaultCache entries that match /api/ routes.
// Serwist's defaultCache may include rules for /api/ which
// would cache API responses and break httpOnly cookie auth + SSE streams.
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
    // CRITICAL: /api/* uses NetworkOnly to prevent ANY SW interception.
    // This MUST come before ...filteredCache to take priority.
    // Protects: httpOnly cookie auth, SSE streaming, TanStack Query caching.
    // Anchored regex (^) ensures only paths starting with /api/ are matched,
    // not arbitrary URLs that happen to contain /api/ elsewhere.
    {
      matcher: /^\/api\/.*/,
      handler: new NetworkOnly(),
    },
    ...filteredCache,
  ],
});

serwist.addEventListeners();
