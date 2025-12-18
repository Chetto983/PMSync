import type { Folder } from '@/lib/api/folders';

/**
 * Folder item with provider info
 */
export interface FolderItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  color?: string;
  providerId?: string;
  providerEmail?: string;
  specialUse?: string;
  /** Folder path for folder operations */
  path?: string;
  /** Full folder data for context menu operations */
  folderData?: Folder;
}

/**
 * Group of folders by provider
 */
export interface FolderGroup {
  providerId: string;
  providerEmail: string;
  folders: FolderItem[];
}

/**
 * Smart filter definition
 */
export interface SmartFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  color?: string;
}

/**
 * Props for EmailSidebar component
 */
export interface EmailSidebarProps {
  /** Folders grouped by provider */
  folderGroups: FolderGroup[];

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
  smartFilters?: SmartFilter[];

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
