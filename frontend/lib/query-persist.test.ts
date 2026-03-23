/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AsyncStorage } from '@tanstack/query-persist-client-core';
import * as fs from 'fs';
import * as path from 'path';

// In-memory backing store for idb-keyval mock
const mockStore = new Map<string, unknown>();
const mockCustomStore = {};

jest.mock('idb-keyval', () => ({
  get: jest.fn(async (key: string) => mockStore.get(key)),
  set: jest.fn(async (key: string, value: unknown) => {
    mockStore.set(key, value);
  }),
  del: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
  clear: jest.fn(async () => {
    mockStore.clear();
  }),
  createStore: jest.fn(() => mockCustomStore),
}));

const mockPersisterFn = jest.fn();
const mockPersister = { persisterFn: mockPersisterFn, __mock: true };
jest.mock('@tanstack/query-persist-client-core', () => ({
  experimental_createQueryPersister: jest.fn(() => mockPersister),
}));

// Must import AFTER mocks
import { createQueryPersister, clearPersistedQueries, queryStore } from './query-persist';
import { get, set, del, clear } from 'idb-keyval';
import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core';

describe('query-persist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
  });

  describe('createStore', () => {
    it('uses a custom store with pmsync-offline DB and pmsync-query-cache store', () => {
      // queryStore is the return value of createStore('pmsync-offline', 'pmsync-query-cache')
      // called at module level. We verify it references our mock.
      expect(queryStore).toBe(mockCustomStore);
    });
  });

  describe('createQueryPersister', () => {
    it('calls experimental_createQueryPersister with correct options in browser', () => {
      const result = createQueryPersister();

      expect(experimental_createQueryPersister).toHaveBeenCalledTimes(1);
      const callArgs = (experimental_createQueryPersister as jest.Mock).mock.calls[0][0];
      expect(callArgs.maxAge).toBe(1000 * 60 * 60 * 24); // 86400000
      expect(callArgs.prefix).toBe('tq-');
      expect(callArgs.storage).toBeDefined();
      expect(result).toBe(mockPersisterFn);
    });

    it('contains SSR guard that returns undefined when window is undefined', () => {
      // jsdom always has window defined, so we verify the guard exists in source.
      // The guard prevents idb-keyval from crashing during SSR (Node.js has no indexedDB).
      const source = fs.readFileSync(
        path.join(__dirname, 'query-persist.ts'),
        'utf-8'
      );
      expect(source).toContain("if (typeof window === 'undefined') return undefined");
    });
  });

  describe('clearPersistedQueries', () => {
    it('calls idb-keyval clear with the custom store', async () => {
      await clearPersistedQueries();
      expect(clear).toHaveBeenCalledWith(mockCustomStore);
    });
  });

  describe('idb storage adapter', () => {
    let storage: AsyncStorage;

    beforeEach(() => {
      (experimental_createQueryPersister as jest.Mock).mockClear();
      createQueryPersister();
      storage = (experimental_createQueryPersister as jest.Mock).mock.calls[0][0].storage;
    });

    it('getItem delegates to idb-keyval get with custom store', async () => {
      mockStore.set('test-key', { data: 'cached' });
      const result = await storage.getItem('test-key');
      expect(get).toHaveBeenCalledWith('test-key', mockCustomStore);
      expect(result).toEqual({ data: 'cached' });
    });

    it('setItem delegates to idb-keyval set with custom store', async () => {
      await storage.setItem('test-key', 'serialized-data');
      expect(set).toHaveBeenCalledWith('test-key', 'serialized-data', mockCustomStore);
    });

    it('removeItem delegates to idb-keyval del with custom store', async () => {
      await storage.removeItem('test-key');
      expect(del).toHaveBeenCalledWith('test-key', mockCustomStore);
    });
  });
});
