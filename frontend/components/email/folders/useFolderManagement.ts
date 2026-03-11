/**
 * Shared folder management hook
 *
 * Provides common state and handlers for folder create/edit/delete operations.
 * Used by both desktop (FolderSidebar) and mobile (MobileFolderSheet) components.
 */

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFolders } from '@/hooks/queries/use-folders';
import { useFolderMetadata } from '@/hooks/queries/use-folder-metadata';
import type { Folder as FolderType } from '@/lib/api/folders';
import type { SpecialFolder } from '@/stores/email-ui-store';
import {
  FOLDER_ORDER,
  createFolderLabelGetter,
  type FolderTranslations,
} from './folder-utils';

/**
 * Hook return type
 */
export interface FolderManagementState {
  // Dialog state
  folderDialogOpen: boolean;
  createFolderProviderId: string | undefined;
  editingFolder: FolderType | null;

  // Context menu state
  folderMenuAnchor: HTMLElement | null;
  selectedFolder: FolderType | null;

  // Handlers
  openCreateDialog: (providerId: string) => void;
  openEditDialog: (folder: FolderType) => void;
  closeDialog: () => void;
  openContextMenu: (event: React.MouseEvent<HTMLElement>, folder: FolderType) => void;
  closeContextMenu: () => void;

  // Helpers
  getFolderLabel: (folder: string) => string;
  folderCounts: Partial<Record<SpecialFolder, number>>;
}

/**
 * Shared folder management hook
 *
 * Encapsulates all folder management state and handlers
 * to avoid code duplication between desktop and mobile components.
 *
 * @example
 * ```tsx
 * const {
 *   folderDialogOpen,
 *   openCreateDialog,
 *   closeDialog,
 *   getFolderLabel,
 * } = useFolderManagement();
 * ```
 */
// Folders where an unread badge is semantically meaningless.
// Trash/Sent/Drafts emails may technically be "unread" in the DB but users
// don't expect a badge there — it's noise, not signal.
const NO_BADGE_FOLDERS = new Set([
  'TRASH', 'SENT', 'DRAFTS', 'ARCHIVE', 'ALL',
  'STARRED', 'FLAGGED', 'CHAT', 'UNREAD',
]);

export function useFolderManagement(): FolderManagementState {
  const t = useTranslations() as FolderTranslations;
  const { data } = useFolders();
  const { data: metadata } = useFolderMetadata();

  // Dialog state
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [createFolderProviderId, setCreateFolderProviderId] = useState<string | undefined>();
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);

  // Context menu state
  const [folderMenuAnchor, setFolderMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderType | null>(null);

  // Create folder label getter
  const getFolderLabel = useMemo(
    () => createFolderLabelGetter(t),
    [t]
  );

  // Calculate unread counts per folder from API data.
  // Uses backend displayMapping to avoid duplication (e.g., CATEGORY_PERSONAL → INBOX).
  const folderCounts = useMemo(() => {
    const counts: Partial<Record<SpecialFolder, number>> = {};

    if (data?.foldersByProvider) {
      Object.values(data.foldersByProvider).forEach((folders) => {
        folders.forEach((folder) => {
          if (folder.specialUse) {
            const rawSpecialUse = folder.specialUse.toUpperCase();
            // Skip folders where unread badge makes no sense
            if (NO_BADGE_FOLDERS.has(rawSpecialUse)) return;
            // Map using backend displayMapping (e.g., CATEGORY_PERSONAL → INBOX)
            const displayAs = metadata?.displayMapping?.[rawSpecialUse] || rawSpecialUse;
            const specialUse = displayAs as SpecialFolder;
            counts[specialUse] = (counts[specialUse] || 0) + (folder.unreadCount || 0);
          }
        });
      });
    }

    return counts;
  }, [data, metadata]);

  // ==========================================================================
  // Dialog Handlers
  // ==========================================================================

  /**
   * Open create folder dialog for a specific provider
   */
  const openCreateDialog = useCallback((providerId: string) => {
    setEditingFolder(null);
    setCreateFolderProviderId(providerId);
    setFolderDialogOpen(true);
  }, []);

  /**
   * Open edit folder dialog
   */
  const openEditDialog = useCallback((folder: FolderType) => {
    setEditingFolder(folder);
    setCreateFolderProviderId(folder.providerId);
    setFolderDialogOpen(true);
  }, []);

  /**
   * Close folder dialog
   */
  const closeDialog = useCallback(() => {
    setFolderDialogOpen(false);
    setCreateFolderProviderId(undefined);
    setEditingFolder(null);
  }, []);

  // ==========================================================================
  // Context Menu Handlers
  // ==========================================================================

  /**
   * Open folder context menu
   */
  const openContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, folder: FolderType) => {
      event.preventDefault();
      event.stopPropagation();
      setFolderMenuAnchor(event.currentTarget);
      setSelectedFolder(folder);
    },
    []
  );

  /**
   * Close folder context menu
   */
  const closeContextMenu = useCallback(() => {
    setFolderMenuAnchor(null);
  }, []);

  return {
    // Dialog state
    folderDialogOpen,
    createFolderProviderId,
    editingFolder,

    // Context menu state
    folderMenuAnchor,
    selectedFolder,

    // Handlers
    openCreateDialog,
    openEditDialog,
    closeDialog,
    openContextMenu,
    closeContextMenu,

    // Helpers
    getFolderLabel,
    folderCounts,
  };
}

// Re-export folder order for convenience
export { FOLDER_ORDER };
