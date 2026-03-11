import { useEmailUIStore } from '../email-ui-store';

beforeEach(() => {
  useEmailUIStore.getState().reset();
});

describe('filter slice', () => {
  describe('setFolder', () => {
    it('sets filters.specialUse', () => {
      useEmailUIStore.getState().setFolder('SENT');
      expect(useEmailUIStore.getState().filters.specialUse).toBe('SENT');
    });

    it('clears selectedIds', () => {
      useEmailUIStore.getState().selectEmail('email-1');
      useEmailUIStore.getState().setFolder('SENT');
      expect(useEmailUIStore.getState().selectedIds.size).toBe(0);
    });

    it('clears activeEmailId', () => {
      useEmailUIStore.getState().selectEmail('email-1');
      useEmailUIStore.getState().setFolder('SENT');
      expect(useEmailUIStore.getState().activeEmailId).toBeNull();
    });
  });

  describe('setSearch', () => {
    it('sets filters.search', () => {
      useEmailUIStore.getState().setSearch('hello');
      expect(useEmailUIStore.getState().filters.search).toBe('hello');
    });

    it('sets search to undefined for empty string', () => {
      useEmailUIStore.getState().setSearch('hello');
      useEmailUIStore.getState().setSearch('');
      expect(useEmailUIStore.getState().filters.search).toBeUndefined();
    });
  });

  describe('setFilters', () => {
    it('merges into filters', () => {
      useEmailUIStore.getState().setFilters({ isRead: true });
      expect(useEmailUIStore.getState().filters.isRead).toBe(true);
      // specialUse should remain (from initial state)
      expect(useEmailUIStore.getState().filters.specialUse).toBe('INBOX');
    });
  });

  describe('clearFilters', () => {
    it('resets filters to initial state', () => {
      useEmailUIStore.getState().setFolder('SENT');
      useEmailUIStore.getState().setSearch('test');
      useEmailUIStore.getState().clearFilters();
      expect(useEmailUIStore.getState().filters.specialUse).toBe('INBOX');
      expect(useEmailUIStore.getState().filters.search).toBeUndefined();
    });

    it('clears selectedIds', () => {
      useEmailUIStore.getState().selectEmail('email-1');
      useEmailUIStore.getState().clearFilters();
      expect(useEmailUIStore.getState().selectedIds.size).toBe(0);
    });

    it('clears activeEmailId', () => {
      useEmailUIStore.getState().selectEmail('email-1');
      useEmailUIStore.getState().clearFilters();
      expect(useEmailUIStore.getState().activeEmailId).toBeNull();
    });
  });
});
