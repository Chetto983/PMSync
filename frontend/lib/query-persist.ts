import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core';
import type { AsyncStorage } from '@tanstack/query-persist-client-core';
import { get, set, del, clear, createStore } from 'idb-keyval';

const DB_NAME = 'pmsync-offline';
const STORE_NAME = 'pmsync-query-cache';

// Custom store isolates our data from default idb-keyval store
const queryStore = createStore(DB_NAME, STORE_NAME);

function createIdbStorage(): AsyncStorage {
  return {
    getItem: async (key) => await get(key, queryStore),
    setItem: async (key, value) => await set(key, value, queryStore),
    removeItem: async (key) => await del(key, queryStore),
  };
}

/** Only persist queries whose first key segment is in this set */
const PERSIST_PREFIXES = new Set(['emails', 'folders']);

export function createQueryPersister() {
  if (typeof window === 'undefined') return undefined;

  const persister = experimental_createQueryPersister({
    storage: createIdbStorage(),
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    prefix: 'tq-',
    filters: {
      predicate: (query) => {
        const first = query.queryKey[0];
        return typeof first === 'string' && PERSIST_PREFIXES.has(first);
      },
    },
  });

  // QueryClient.defaultOptions.queries.persister expects the function, not the object
  return persister.persisterFn;
}

export async function clearPersistedQueries(): Promise<void> {
  await clear(queryStore);
}

// Export for testing
export { queryStore };
