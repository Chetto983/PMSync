import { clearPersistedQueries } from './query-persist';
import { getQueryClient } from './query-client';

/**
 * Clear all offline data on sign-out.
 * MUST be called BEFORE authClient.signOut() to prevent data leak window.
 *
 * Clears:
 * 1. IndexedDB persisted TQ queries (idb-keyval store)
 * 2. All Service Worker caches (precache + runtime)
 * 3. In-memory TanStack Query cache
 */
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
