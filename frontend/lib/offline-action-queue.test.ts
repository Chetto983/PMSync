import { set, del, clear } from 'idb-keyval';
import {
  enqueueAction,
  getAllActions,
  removeAction,
  clearActionQueue,
  isExpired,
  TTL_MS,
  MAX_QUEUE_SIZE,
  type QueuedAction,
} from './offline-action-queue';

jest.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    createStore: jest.fn(() => 'mock-store'),
    get: jest.fn((key: string) => Promise.resolve(store.get(key))),
    set: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      store.clear();
      return Promise.resolve();
    }),
    keys: jest.fn(() => Promise.resolve([...store.keys()])),
    __store: store,
  };
});

// Access the backing store for test setup
const mockStore = (jest.requireMock('idb-keyval') as { __store: Map<string, unknown> }).__store;

const mockUUID = jest.fn();
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: mockUUID },
  writable: true,
});

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  mockUUID.mockReturnValue('test-uuid-1');
});

describe('offline-action-queue', () => {
  describe('enqueueAction', () => {
    it('stores an action and returns an id', async () => {
      const id = await enqueueAction({
        type: 'update-email',
        emailId: 'email-1',
        dto: { isRead: true },
      });

      expect(id).toBe('test-uuid-1');
      expect(set).toHaveBeenCalledWith(
        'test-uuid-1',
        expect.objectContaining({
          id: 'test-uuid-1',
          type: 'update-email',
          emailId: 'email-1',
          dto: { isRead: true },
        }),
        'mock-store'
      );
    });

    it('deduplicates same emailId by merging dto and updating queuedAt', async () => {
      // Pre-populate store with existing action
      const existing: QueuedAction = {
        id: 'existing-id',
        type: 'update-email',
        emailId: 'email-1',
        dto: { isRead: true },
        queuedAt: 1000,
      };
      mockStore.set('existing-id', existing);

      const id = await enqueueAction({
        type: 'update-email',
        emailId: 'email-1',
        dto: { isStarred: true },
      });

      expect(id).toBe('existing-id');
      expect(set).toHaveBeenCalledWith(
        'existing-id',
        expect.objectContaining({
          id: 'existing-id',
          dto: { isRead: true, isStarred: true },
        }),
        'mock-store'
      );
      // queuedAt should be refreshed (not 1000)
      const storedAction = mockStore.get('existing-id') as QueuedAction;
      expect(storedAction.queuedAt).toBeGreaterThan(1000);
    });

    it('removes oldest action when at MAX_QUEUE_SIZE', async () => {
      // Fill store to capacity
      for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
        const action: QueuedAction = {
          id: `action-${i}`,
          type: 'update-email',
          emailId: `email-${i}`,
          dto: {},
          queuedAt: i * 1000,
        };
        mockStore.set(`action-${i}`, action);
      }

      mockUUID.mockReturnValue('new-action-id');
      await enqueueAction({
        type: 'update-email',
        emailId: 'email-new',
        dto: { isRead: true },
      });

      // Oldest action (queuedAt: 0) should be deleted
      expect(del).toHaveBeenCalledWith('action-0', 'mock-store');
      // New action should be stored
      expect(mockStore.has('new-action-id')).toBe(true);
    });
  });

  describe('getAllActions', () => {
    it('returns actions sorted by queuedAt', async () => {
      const action1: QueuedAction = {
        id: 'a',
        type: 'update-email',
        emailId: 'e1',
        dto: {},
        queuedAt: 3000,
      };
      const action2: QueuedAction = {
        id: 'b',
        type: 'update-email',
        emailId: 'e2',
        dto: {},
        queuedAt: 1000,
      };
      const action3: QueuedAction = {
        id: 'c',
        type: 'update-email',
        emailId: 'e3',
        dto: {},
        queuedAt: 2000,
      };
      mockStore.set('a', action1);
      mockStore.set('b', action2);
      mockStore.set('c', action3);

      const result = await getAllActions();

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('b'); // queuedAt: 1000
      expect(result[1].id).toBe('c'); // queuedAt: 2000
      expect(result[2].id).toBe('a'); // queuedAt: 3000
    });
  });

  describe('removeAction', () => {
    it('deletes an action by id', async () => {
      mockStore.set('action-1', { id: 'action-1' });

      await removeAction('action-1');

      expect(del).toHaveBeenCalledWith('action-1', 'mock-store');
    });
  });

  describe('clearActionQueue', () => {
    it('clears all entries', async () => {
      mockStore.set('a', {});
      mockStore.set('b', {});

      await clearActionQueue();

      expect(clear).toHaveBeenCalledWith('mock-store');
    });
  });

  describe('isExpired', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns true for actions older than 30 minutes', () => {
      jest.setSystemTime(TTL_MS + 1000);

      const action: QueuedAction = {
        id: '1',
        type: 'update-email',
        emailId: 'e1',
        dto: {},
        queuedAt: 0,
      };

      expect(isExpired(action)).toBe(true);
    });

    it('returns false for recent actions', () => {
      jest.setSystemTime(1000);

      const action: QueuedAction = {
        id: '1',
        type: 'update-email',
        emailId: 'e1',
        dto: {},
        queuedAt: 500,
      };

      expect(isExpired(action)).toBe(false);
    });
  });

  describe('crypto.randomUUID', () => {
    it('is called for new entries', async () => {
      mockUUID.mockReturnValue('generated-uuid');

      await enqueueAction({
        type: 'update-email',
        emailId: 'email-x',
        dto: {},
      });

      expect(mockUUID).toHaveBeenCalled();
      expect(mockStore.has('generated-uuid')).toBe(true);
    });
  });
});
