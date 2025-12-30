/**
 * Folder Management Components and Utilities
 *
 * Components, hooks, and utilities for creating, renaming, and managing email folders.
 */

// Components
export { FolderDialog } from './FolderDialog';
export { FolderContextMenu } from './FolderContextMenu';
export { FolderDeleteDialog } from './FolderDeleteDialog';

// Hooks
export { useFolderManagement, FOLDER_ORDER } from './useFolderManagement';

// Utilities
export {
  FOLDER_ICONS,
  DEFAULT_FOLDER_ICON,
  getFolderIcon,
  getSpecialFolderIcon,
  canModifyFolder,
  defaultFolderSort,
  sortFoldersByOrder,
  createFolderLabelGetter,
  type FolderTranslations,
} from './folder-utils';
