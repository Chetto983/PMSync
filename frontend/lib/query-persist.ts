import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core';
import type { AsyncStorage } from '@tanstack/query-persist-client-core';
import { get, set, del, clear, createStore } from 'idb-keyval';

const DB_NAME = 'pmsync-offline';
const STORE_NAME = 'pmsync-query-cache';

// Custom store isolates our data from default idb-keyval store
const queryStore = createStore(DB_NAME, STORE_NAME);

/** Wrap an IDB promise with a timeout so a hung database never blocks queries */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

const IDB_TIMEOUT_MS = 2000;

function createIdbStorage(): AsyncStorage {
  return {
    getItem: async (key) => {
      try {
        return await withTimeout(get(key, queryStore), IDB_TIMEOUT_MS);
      } catch {
        return undefined;
      }
    },
    setItem: async (key, value) => {
      try {
        await withTimeout(set(key, value, queryStore), IDB_TIMEOUT_MS);
      } catch {
        // Silently fail — persistence is best-effort
      }
    },
    removeItem: async (key) => {
      try {
        await withTimeout(del(key, queryStore), IDB_TIMEOUT_MS);
      } catch {
        // Silently fail
      }
    },
  };
}

export function createQueryPersister() {
  if (typeof window === 'undefined') return undefined;

  const persister = experimental_createQueryPersister({
    storage: createIdbStorage(),
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    prefix: 'tq-',
  });

  // QueryClient.defaultOptions.queries.persister expects the function, not the object
  return persister.persisterFn;
}

export async function clearPersistedQueries(): Promise<void> {
  await clear(queryStore);
}

// Export for testing
export { queryStore };
