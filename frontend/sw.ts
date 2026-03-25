import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkFirst, NetworkOnly, Serwist } from 'serwist';

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
    // Navigation requests (HTML pages) use NetworkFirst to avoid "no-response"
    // errors when dynamic pages aren't in the precache manifest.
    {
      matcher({ request }) {
        return request.mode === 'navigate';
      },
      handler: new NetworkFirst({ networkTimeoutSeconds: 5 }),
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
  const data = event.data.json() as {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    renotify?: boolean;
    data?: { url: string };
  };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192x192.png',
      badge: data.badge || '/icons/icon-192x192.png',
      tag: data.tag,
      renotify: data.renotify ?? false,
      data: { url: data.data?.url || '/' },
    } as NotificationOptions)
  );
});

// Notification click handler -- deep-link to relevant view (PUSH-03)
self.addEventListener('notificationclick', (evt: Event) => {
  const event = evt as NotificationEvent;
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window' })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            (client as WindowClient).focus();
            (client as WindowClient).navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// PLSH-01: Allow controlled SW updates via snackbar
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

serwist.addEventListeners();
