import { useFoldersStore } from './folders-store';
import type { Folder, Provider } from '@/lib/api/folders';

const makeProvider = (overrides: Partial<Provider> = {}): Provider => ({
  id: 'p1',
  tenantId: 't1',
  email: 'test@example.com',
  name: 'Test Provider',
  ...overrides,
} as Provider);

const makeFolder = (overrides: Partial<Folder> = {}): Folder => ({
  id: 'f1',
  tenantId: 't1',
  providerId: 'p1',
  name: 'Inbox',
  path: 'INBOX',
  delimiter: '/',
  level: 0,
  isSelectable: true,
  isSystem: false,
  attributes: [],
  totalCount: 0,
  unreadCount: 0,
  recentCount: 0,
  unseenCount: 0,
  createdAt: '2026-03-11T00:00:00Z',
  updatedAt: '2026-03-11T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  useFoldersStore.getState().reset();
});

describe('useFoldersStore', () => {
  describe('setFoldersData', () => {
    it('builds providersById map from providers array', () => {
      const provider = makeProvider({ id: 'p1' });
      useFoldersStore.getState().setFoldersData([provider], {});
      expect(useFoldersStore.getState().providersById['p1']).toEqual(provider);
    });

    it('sets foldersByProvider from argument', () => {
      const folders = [makeFolder({ id: 'f1', providerId: 'p1' })];
      useFoldersStore.getState().setFoldersData([makeProvider()], { p1: folders });
      expect(useFoldersStore.getState().foldersByProvider['p1']).toHaveLength(1);
    });
  });

  describe('updateFolderCounts', () => {
    it('stores counts keyed as providerId:folderId', () => {
      useFoldersStore.getState().updateFolderCounts('p1', 'f1', { totalCount: 10, unreadCount: 2 });
      const counts = useFoldersStore.getState().countsByFolderId['p1:f1'];
      expect(counts.totalCount).toBe(10);
      expect(counts.unreadCount).toBe(2);
    });
  });

  describe('upsertFolder', () => {
    it('inserts new folder into foldersByProvider', () => {
      useFoldersStore.getState().upsertFolder({
        id: 'f1',
        providerId: 'p1',
        name: 'Inbox',
        path: 'INBOX',
      });
      expect(useFoldersStore.getState().foldersByProvider['p1']).toHaveLength(1);
    });

    it('updates existing folder in place', () => {
      useFoldersStore.getState().upsertFolder({
        id: 'f1',
        providerId: 'p1',
        name: 'Inbox',
        path: 'INBOX',
      });
      useFoldersStore.getState().upsertFolder({
        id: 'f1',
        providerId: 'p1',
        name: 'Inbox Updated',
        path: 'INBOX',
      });
      const folders = useFoldersStore.getState().foldersByProvider['p1'];
      expect(folders).toHaveLength(1);
      expect(folders[0].name).toBe('Inbox Updated');
    });
  });

  describe('renameFolder', () => {
    it('updates folder name in foldersByProvider', () => {
      useFoldersStore.getState().setFoldersData(
        [makeProvider()],
        { p1: [makeFolder({ id: 'f1', name: 'Inbox' })] },
      );
      useFoldersStore.getState().renameFolder('f1', 'Archive');
      expect(useFoldersStore.getState().foldersByProvider['p1'][0].name).toBe('Archive');
    });
  });

  describe('deleteFolder', () => {
    it('removes folder from foldersByProvider', () => {
      useFoldersStore.getState().setFoldersData(
        [makeProvider()],
        { p1: [makeFolder({ id: 'f1' })] },
      );
      useFoldersStore.getState().deleteFolder('f1');
      expect(useFoldersStore.getState().foldersByProvider['p1']).toHaveLength(0);
    });
  });

  describe('setSyncing', () => {
    it('adds providerId to syncingProviders Set when true', () => {
      useFoldersStore.getState().setSyncing('p1', true);
      expect(useFoldersStore.getState().syncingProviders.has('p1')).toBe(true);
    });

    it('removes providerId from syncingProviders Set when false', () => {
      useFoldersStore.getState().setSyncing('p1', true);
      useFoldersStore.getState().setSyncing('p1', false);
      expect(useFoldersStore.getState().syncingProviders.has('p1')).toBe(false);
    });
  });

  describe('setLastSync', () => {
    it('stores timestamp in lastSyncByProvider', () => {
      useFoldersStore.getState().setLastSync('p1', '2026-03-11T10:00:00Z');
      expect(useFoldersStore.getState().lastSyncByProvider['p1']).toBe('2026-03-11T10:00:00Z');
    });
  });
});
