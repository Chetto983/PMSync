import { useState, useCallback } from 'react';
import type { Folder } from '@/lib/api/folders';
import type { FolderDialogMode } from '../../FolderManagementDialog';
import type { FolderItem } from '../types';

interface UseFolderManagementOptions {
  onFoldersRefresh?: () => void;
}

interface UseFolderManagementReturn {
  // Context menu state
  contextMenuAnchor: HTMLElement | null;
  contextFolder: Folder | null;
  contextProviderId?: string;
  contextProviderEmail?: string;

  // Dialog state
  dialogOpen: boolean;
  dialogMode: FolderDialogMode;
  dialogFolder: Folder | null;
  dialogProviderId?: string;
  dialogProviderEmail?: string;
  dialogParentPath?: string;

  // Handlers
  handleFolderContextMenu: (event: React.MouseEvent<HTMLElement>, folder: FolderItem) => void;
  handleContextMenuClose: () => void;
  handleCreateFolder: (parentPath?: string) => void;
  handleCreateFolderForProvider: (providerId: string, providerEmail: string) => void;
  handleRenameFolder: (folder: Folder) => void;
  handleDeleteFolder: (folder: Folder) => void;
  handleDialogClose: () => void;
  handleDialogSuccess: () => void;
}

/**
 * Hook to manage folder CRUD operations and context menu state
 */
export function useFolderManagement({
  onFoldersRefresh,
}: UseFolderManagementOptions): UseFolderManagementReturn {
  // Context menu state
  const [contextMenuAnchor, setContextMenuAnchor] = useState<HTMLElement | null>(null);
  const [contextFolder, setContextFolder] = useState<Folder | null>(null);
  const [contextProviderId, setContextProviderId] = useState<string | undefined>();
  const [contextProviderEmail, setContextProviderEmail] = useState<string | undefined>();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<FolderDialogMode>('create');
  const [dialogFolder, setDialogFolder] = useState<Folder | null>(null);
  const [dialogProviderId, setDialogProviderId] = useState<string | undefined>();
  const [dialogProviderEmail, setDialogProviderEmail] = useState<string | undefined>();
  const [dialogParentPath, setDialogParentPath] = useState<string | undefined>();

  // Handle folder context menu
  const handleFolderContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, folder: FolderItem) => {
      setContextMenuAnchor(event.currentTarget);
      setContextFolder(folder.folderData || null);
      setContextProviderId(folder.providerId);
      setContextProviderEmail(folder.providerEmail);
    },
    []
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenuAnchor(null);
    setContextFolder(null);
  }, []);

  // Handle create folder
  const handleCreateFolder = useCallback(
    (parentPath?: string) => {
      setDialogMode('create');
      setDialogFolder(null);
      setDialogProviderId(contextProviderId);
      setDialogProviderEmail(contextProviderEmail);
      setDialogParentPath(parentPath);
      setDialogOpen(true);
    },
    [contextProviderId, contextProviderEmail]
  );

  // Handle create folder from provider header "+" button
  const handleCreateFolderForProvider = useCallback(
    (providerId: string, providerEmail: string) => {
      setDialogMode('create');
      setDialogFolder(null);
      setDialogProviderId(providerId);
      setDialogProviderEmail(providerEmail);
      setDialogParentPath(undefined);
      setDialogOpen(true);
    },
    []
  );

  // Handle rename folder
  const handleRenameFolder = useCallback(
    (folder: Folder) => {
      setDialogMode('rename');
      setDialogFolder(folder);
      setDialogProviderId(contextProviderId);
      setDialogProviderEmail(contextProviderEmail);
      setDialogParentPath(undefined);
      setDialogOpen(true);
    },
    [contextProviderId, contextProviderEmail]
  );

  // Handle delete folder
  const handleDeleteFolder = useCallback(
    (folder: Folder) => {
      setDialogMode('delete');
      setDialogFolder(folder);
      setDialogProviderId(contextProviderId);
      setDialogProviderEmail(contextProviderEmail);
      setDialogParentPath(undefined);
      setDialogOpen(true);
    },
    [contextProviderId, contextProviderEmail]
  );

  // Handle dialog close
  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setDialogFolder(null);
  }, []);

  // Handle dialog success
  const handleDialogSuccess = useCallback(() => {
    setDialogOpen(false);
    setDialogFolder(null);
    if (onFoldersRefresh) {
      onFoldersRefresh();
    }
  }, [onFoldersRefresh]);

  return {
    // Context menu state
    contextMenuAnchor,
    contextFolder,
    contextProviderId,
    contextProviderEmail,

    // Dialog state
    dialogOpen,
    dialogMode,
    dialogFolder,
    dialogProviderId,
    dialogProviderEmail,
    dialogParentPath,

    // Handlers
    handleFolderContextMenu,
    handleContextMenuClose,
    handleCreateFolder,
    handleCreateFolderForProvider,
    handleRenameFolder,
    handleDeleteFolder,
    handleDialogClose,
    handleDialogSuccess,
  };
}
