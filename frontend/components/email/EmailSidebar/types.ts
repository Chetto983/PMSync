// =============================================================================
// FOLDER TYPES - Re-exported from unified source
// =============================================================================
// IMPORTANT: All folder types are now in @/lib/api/folders
// This file re-exports them for backwards compatibility.
// New code should import directly from @/lib/api/folders.
// =============================================================================

export type {
  FolderItem,
  FolderGroup,
  SmartFilter,
  Folder,
  FolderIdType,
  ParsedFolderId,
} from '@/lib/api/folders';

export { FOLDER_PREFIXES, parseFolderId } from '@/lib/api/folders';

/**
 * Props for EmailSidebar component
 */
export interface EmailSidebarProps {
  /** Folders grouped by provider */
  folderGroups: import('@/lib/api/folders').FolderGroup[];

  /** Currently selected folder ID */
  selectedFolderId?: string | null;

  /** Callback when a folder is selected */
  onFolderSelect: (folderId: string) => void;

  /** Loading state */
  loading?: boolean;

  /** Show compose button */
  showComposeButton?: boolean;

  /** Custom compose button handler */
  onCompose?: () => void;

  /** Smart filters to display */
  smartFilters?: import('@/lib/api/folders').SmartFilter[];

  /** Show smart filters section */
  showSmartFilters?: boolean;

  /** Show labels section */
  showLabels?: boolean;

  /** Callback to open label manager */
  onManageLabels?: () => void;

  /** Whether an email is currently being dragged (for drop zone visuals) */
  isEmailDragging?: boolean;

  /** Callback to refresh folders after CRUD operations */
  onFoldersRefresh?: () => void;
}
