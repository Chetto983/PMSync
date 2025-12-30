import { create } from 'zustand';
import type { Folder, Provider } from '@/lib/api/folders';

interface FolderCounts {
  totalCount: number;
  unreadCount: number;
  folderName?: string;
  providerId?: string;
}

interface FolderState {
  countsByFolderId: Record<string, FolderCounts>;
  foldersByProvider: Record<string, Folder[]>;
  providersById: Record<string, Provider>;
  updateFolderCounts: (
    providerId: string,
    folderId: string,
    counts: { totalCount: number; unreadCount: number; folderName?: string },
  ) => void;
  setFoldersData: (providers: Provider[], foldersByProvider: Record<string, Folder[]>) => void;
  upsertFolder: (folder: Partial<Folder> & { id: string; providerId: string; name: string; path: string }) => void;
  renameFolder: (folderId: string, newName: string) => void;
  deleteFolder: (folderId: string) => void;
  reset: () => void;
}

export const useFoldersStore = create<FolderState>((set) => ({
  countsByFolderId: {},
  foldersByProvider: {},
  providersById: {},

  updateFolderCounts: (providerId, folderId, counts) =>
    set((state) => ({
      countsByFolderId: {
        ...state.countsByFolderId,
        [`${providerId}:${folderId}`]: {
          totalCount: counts.totalCount,
          unreadCount: counts.unreadCount,
          folderName: counts.folderName,
          providerId,
        },
      },
    })),

  setFoldersData: (providers, foldersByProvider) =>
    set(() => {
      const providersById = providers.reduce<Record<string, Provider>>((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});
      return { foldersByProvider, providersById };
    }),

  upsertFolder: (folder) =>
    set((state) => {
      const current = state.foldersByProvider[folder.providerId] || [];
      const existingIndex = current.findIndex((f) => f.id === folder.id);
      const nextFolder: Folder = {
        id: folder.id,
        tenantId: folder.tenantId || '',
        providerId: folder.providerId,
        name: folder.name,
        path: folder.path,
        delimiter: folder.delimiter || '/',
        level: folder.level ?? 0,
        isSelectable: folder.isSelectable ?? true,
        specialUse: folder.specialUse,
        isSystem: folder.isSystem ?? !!folder.specialUse, // Fallback: treat as system if specialUse is set
        attributes: folder.attributes || [],
        totalCount: folder.totalCount ?? 0,
        unreadCount: folder.unreadCount ?? 0,
        recentCount: folder.recentCount ?? 0,
        unseenCount: folder.unseenCount ?? 0,
        uidValidity: folder.uidValidity,
        uidNext: folder.uidNext,
        lastSyncedAt: folder.lastSyncedAt,
        createdAt: folder.createdAt || new Date().toISOString(),
        updatedAt: folder.updatedAt || new Date().toISOString(),
        parentId: folder.parentId,
      };

      const updated = [...current];
      if (existingIndex >= 0) {
        updated[existingIndex] = nextFolder;
      } else {
        updated.unshift(nextFolder);
      }

      return {
        foldersByProvider: {
          ...state.foldersByProvider,
          [folder.providerId]: updated,
        },
      };
    }),

  renameFolder: (folderId, newName) =>
    set((state) => {
      const next: Record<string, Folder[]> = {};
      Object.entries(state.foldersByProvider).forEach(([providerId, list]) => {
        next[providerId] = list.map((f) =>
          f.id === folderId
            ? {
                ...f,
                name: newName,
                updatedAt: new Date().toISOString(),
              }
            : f,
        );
      });
      return { foldersByProvider: next };
    }),

  deleteFolder: (folderId) =>
    set((state) => {
      const next: Record<string, Folder[]> = {};
      Object.entries(state.foldersByProvider).forEach(([providerId, list]) => {
        next[providerId] = list.filter((f) => f.id !== folderId);
      });
      return { foldersByProvider: next };
    }),

  reset: () =>
    set({
      countsByFolderId: {},
      foldersByProvider: {},
      providersById: {},
    }),
}));
