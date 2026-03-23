import { clearOfflineData } from './logout-cleanup';

// Mock query-persist
const mockClearPersistedQueries = jest.fn().mockResolvedValue(undefined);
jest.mock('./query-persist', () => ({
  clearPersistedQueries: () => mockClearPersistedQueries(),
}));

// Mock offline-action-queue
const mockClearActionQueue = jest.fn().mockResolvedValue(undefined);
jest.mock('./offline-action-queue', () => ({
  clearActionQueue: () => mockClearActionQueue(),
}));

// Mock query-client
const mockClear = jest.fn();
const mockGetQueryClient = jest.fn(() => ({ clear: mockClear }));
jest.mock('./query-client', () => ({
  getQueryClient: () => mockGetQueryClient(),
}));

describe('clearOfflineData', () => {
  let mockCachesKeys: jest.Mock;
  let mockCachesDelete: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCachesKeys = jest.fn().mockResolvedValue(['cache-1', 'cache-2']);
    mockCachesDelete = jest.fn().mockResolvedValue(true);
    // Set up global caches mock
    Object.defineProperty(window, 'caches', {
      value: { keys: mockCachesKeys, delete: mockCachesDelete },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Clean up caches mock
    delete (window as unknown as Record<string, unknown>).caches;
  });

  it('calls clearPersistedQueries to clear IndexedDB', async () => {
    await clearOfflineData();
    expect(mockClearPersistedQueries).toHaveBeenCalledTimes(1);
  });

  it('calls clearActionQueue to clear offline action queue', async () => {
    await clearOfflineData();
    expect(mockClearActionQueue).toHaveBeenCalledTimes(1);
  });

  it('clears all Service Worker caches', async () => {
    await clearOfflineData();
    expect(mockCachesKeys).toHaveBeenCalledTimes(1);
    expect(mockCachesDelete).toHaveBeenCalledTimes(2);
    expect(mockCachesDelete).toHaveBeenCalledWith('cache-1');
    expect(mockCachesDelete).toHaveBeenCalledWith('cache-2');
  });

  it('calls getQueryClient().clear() to clear in-memory cache', async () => {
    await clearOfflineData();
    expect(mockGetQueryClient).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('completes without error when caches API is unavailable', async () => {
    delete (window as unknown as Record<string, unknown>).caches;
    await expect(clearOfflineData()).resolves.toBeUndefined();
    expect(mockClearPersistedQueries).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('awaits all cleanup steps (no fire-and-forget)', async () => {
    const callOrder: string[] = [];

    mockClearPersistedQueries.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push('indexeddb');
    });
    mockClearActionQueue.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push('action-queue');
    });
    mockCachesKeys.mockResolvedValue(['c1']);
    mockCachesDelete.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push('sw-cache');
      return true;
    });
    mockClear.mockImplementation(() => {
      callOrder.push('query-cache');
    });

    await clearOfflineData();

    expect(callOrder).toEqual(['indexeddb', 'action-queue', 'sw-cache', 'query-cache']);
  });
});
