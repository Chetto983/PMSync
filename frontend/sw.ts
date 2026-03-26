import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis & {
  clients: {
    matchAll(options?: { type?: string; includeUncontrolled?: boolean }): Promise<(WindowClient | { postMessage(message: unknown): void })[]>;
    openWindow(url: string): Promise<WindowClient | null>;
  };
  registration: ServiceWorkerRegistration;
  skipWaiting(): void;
};

interface WindowClient {
  postMessage(message: unknown): void;
  focus(): Promise<WindowClient>;
  navigate(url: string): Promise<WindowClient | null>;
}

// Web Push types (not included in default tsconfig lib)
interface PushEvent extends Event {
  readonly data: { json(): unknown; text(): string } | null;
  waitUntil(promise: Promise<unknown>): void;
}

interface NotificationEvent extends Event {
  readonly notification: Notification & { data: unknown };
  waitUntil(promise: Promise<unknown>): void;
}

const excludedDefaultCacheNames = new Set([
  'apis',
  'next-data',
  'pages-rsc-prefetch',
  'pages-rsc',
  'pages',
  'others',
  'static-data-assets',
]);

// Serwist's Next.js default cache list includes generic NetworkFirst rules for
// HTML, RSC, and JSON responses. Those are too broad for this app: they can
// intercept auth redirects and dashboard navigations, then throw `no-response`
// when the network request fails before anything has been cached.
//
// Keep only the safe static-asset rules from defaultCache and handle auth/API,
// Next data, and document navigations explicitly below.
const filteredCache = defaultCache.filter((entry) => {
  const pattern = entry.matcher;
  if (pattern instanceof RegExp && pattern.source.includes('api')) return false;
  if (typeof pattern === 'string' && pattern.includes('/api')) return false;

  const cacheName = (entry.handler as { cacheName?: string } | undefined)?.cacheName;
  if (cacheName && excludedDefaultCacheNames.has(cacheName)) {
    return false;
  }

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
    // CRITICAL: /_next/data/* must bypass SW cache.
    // Next.js Pages Router uses these for client-side navigation (getServerSideProps).
    // Caching them causes stale page data and broken navigation transitions.
    {
      matcher: /^\/_next\/data\/.*/,
      handler: new NetworkOnly(),
    },
    // Navigation requests (HTML pages) use NetworkOnly.
    // Dynamic pages (e.g. /dashboard/*) are never precached, so NetworkFirst
    // throws "no-response" when the network is unavailable and cache is empty.
    // Let the browser handle navigation directly; the offline fallback below
    // catches failures at the Serwist level.
    {
      matcher({ request }) {
        return request.mode === 'navigate';
      },
      handler: new NetworkOnly(),
    },
    ...filteredCache,
  ],
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

// BackgroundSync progressive enhancement (Chromium-only)
// SW cannot make authenticated API calls (httpOnly cookies),
// so relay to active client page to replay from main thread.
self.addEventListener('sync', (event: Event & { tag?: string; waitUntil?: (p: Promise<unknown>) => void }) => {
  if (event.tag === 'replay-email-actions' && event.waitUntil) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: false }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'replay-email-actions' });
        }
      })
    );
  }
});

// Push notification handler (PUSH-02)
self.addEventListener('push', (evt: Event) => {
  const event = evt as PushEvent;
  if (!event.data) return;
  const raw = event.data.text();
  console.log('[SW:push] raw payload:', raw);
  const data = JSON.parse(raw) as {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    renotify?: boolean;
    data?: { url: string };
  };
  const resolvedUrl = data.data?.url || '/';
  console.log('[SW:push] resolved url:', resolvedUrl);
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192x192.png',
      badge: data.badge || '/icons/icon-192x192.png',
      tag: data.tag,
      renotify: data.renotify ?? false,
      data: { url: resolvedUrl },
    } as NotificationOptions)
  );
});

// Notification click handler -- deep-link to relevant view (PUSH-03)
self.addEventListener('notificationclick', (evt: Event) => {
  const event = evt as NotificationEvent;
  event.notification.close();
  const notifData = event.notification.data;
  console.log('[SW:notificationclick] notification.data:', JSON.stringify(notifData));
  const url = (notifData as { url?: string })?.url || '/';
  console.log('[SW:notificationclick] navigating to:', url);
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window' })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            console.log('[SW:notificationclick] focusing existing client, navigate:', url);
            (client as WindowClient).focus();
            (client as WindowClient).navigate(url);
            return;
          }
        }
        console.log('[SW:notificationclick] no client, openWindow:', url);
        return self.clients.openWindow(url);
      })
  );
});

// Force immediate activation — never leave an old SW running.
// clientsClaim (above) takes over existing tabs; skipWaiting here
// ensures the new SW activates as soon as it's installed, without
// waiting for the user to close all tabs or click "update".
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Also accept explicit SKIP_WAITING messages from the update snackbar.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

serwist.addEventListeners();
