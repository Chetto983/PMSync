import { useSyncStore } from './sync-store';

const initialState = { lastStatus: null };

beforeEach(() => {
  useSyncStore.setState(initialState);
});

describe('useSyncStore', () => {
  describe('setStatus', () => {
    it('stores the provided status', () => {
      const status = {
        providerId: 'p1',
        status: 'completed' as const,
        timestamp: '2026-03-11T10:00:00Z',
      };
      useSyncStore.getState().setStatus(status);
      expect(useSyncStore.getState().lastStatus).toEqual(status);
    });

    it('overwrites previous status', () => {
      const s1 = { providerId: 'p1', status: 'started' as const, timestamp: '2026-03-11T10:00:00Z' };
      const s2 = { providerId: 'p1', status: 'completed' as const, timestamp: '2026-03-11T10:01:00Z' };
      useSyncStore.getState().setStatus(s1);
      useSyncStore.getState().setStatus(s2);
      expect(useSyncStore.getState().lastStatus).toEqual(s2);
    });
  });

  describe('clear', () => {
    it('resets lastStatus to null', () => {
      const status = {
        providerId: 'p1',
        status: 'failed' as const,
        timestamp: '2026-03-11T10:00:00Z',
        error: 'network error',
      };
      useSyncStore.getState().setStatus(status);
      useSyncStore.getState().clear();
      expect(useSyncStore.getState().lastStatus).toBeNull();
    });
  });
});
