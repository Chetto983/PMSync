import { apiClient } from '../api-client';

// EmailListParams type - will be re-added with email API rebuild
export interface EmailListParams {
  page?: number;
  limit?: number;
  providerId?: string;
  folder?: string;
  specialUse?: string;
  isRead?: boolean;
  isStarred?: boolean;
  isFlagged?: boolean;
  isImportant?: boolean;
  hasAttachments?: boolean;
  search?: string;
  labelIds?: string[];
  startDate?: string;
  endDate?: string;
  excludeTrashSpam?: boolean;
}

// =============================================================================
// FOLDER ID PREFIXES - Used to identify folder types from their ID
// =============================================================================

export const FOLDER_PREFIXES = {
  SMART: 'smart:',
  AGGREGATE: 'all:',
  LABEL: 'label:',
} as const;

// =============================================================================
// FOLDER ID PARSER - Utility to determine folder type from ID
// =============================================================================

export type FolderIdType = 'smart' | 'aggregate' | 'label' | 'remote';

export interface ParsedFolderId {
  type: FolderIdType;
  value: string;
}

/**
 * Parse a folder ID to determine its type and extract the value
 *
 * @example
 * parseFolderId('smart:unread') // { type: 'smart', value: 'unread' }
 * parseFolderId('all:inbox') // { type: 'aggregate', value: 'inbox' }
 * parseFolderId('label:abc123') // { type: 'label', value: 'abc123' }
 * parseFolderId('cm1234567890') // { type: 'remote', value: 'cm1234567890' }
 */
export function parseFolderId(id: string): ParsedFolderId {
  if (id.startsWith(FOLDER_PREFIXES.SMART)) {
    return { type: 'smart', value: id.slice(FOLDER_PREFIXES.SMART.length) };
  }
  if (id.startsWith(FOLDER_PREFIXES.AGGREGATE)) {
    return { type: 'aggregate', value: id.slice(FOLDER_PREFIXES.AGGREGATE.length) };
  }
  if (id.startsWith(FOLDER_PREFIXES.LABEL)) {
    return { type: 'label', value: id.slice(FOLDER_PREFIXES.LABEL.length) };
  }
  return { type: 'remote', value: id };
}

// =============================================================================
// UNIFIED FOLDERITEM - Single source of truth for folder display items
// =============================================================================

/**
 * FolderItem represents a selectable folder in the UI
 *
 * This is the UNIFIED type - import from here, not from other files.
 * Used by: EmailSidebar, Mailbox, FolderSelector, etc.
 */
export interface FolderItem {
  /** Unique identifier - can be prefixed (smart:, all:, label:) or a database ID */
  id: string;
  /** Display label (localized) */
  label: string;
  /** Icon component to display */
  icon: React.ReactNode;
  /** Unread/total count to display */
  count?: number;
  /** Color for the folder icon/badge */
  color?: string;

  // === Folder classification ===
  /** True if this is an aggregate folder (shows emails from multiple providers) */
  aggregate?: boolean;

  // === Provider info (for remote folders) ===
  /** Provider ID this folder belongs to */
  providerId?: string;
  /** Provider email for display */
  providerEmail?: string;

  // === Folder identifiers (prefer specialUse for canonical, path for custom) ===
  /** RFC 6154 special use type: INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE, STARRED */
  specialUse?: string;
  /** Folder path (may be localized): "INBOX", "Posta in arrivo", "MyFolder/Sub" */
  path?: string;

  // === Full data for CRUD operations ===
  /** Complete folder data from database */
  folderData?: Folder;

  // === Query configuration ===
  /** Query parameters to use when fetching emails for this folder */
  queryOverrides?: Partial<EmailListParams>;
}

/**
 * SmartFilter represents a virtual filter (Unread, Today, This Week, etc.)
 */
export interface SmartFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  color?: string;
}

/**
 * FolderGroup represents folders grouped by provider
 */
export interface FolderGroup {
  providerId: string;
  providerEmail: string;
  folders: FolderItem[];
}

// =============================================================================
// DATABASE FOLDER TYPE
// =============================================================================

export interface Folder {
  id: string;
  tenantId: string;
  providerId: string;
  name: string;
  path: string;
  delimiter: string;
  parentId?: string;
  level: number;
  isSelectable: boolean;
  specialUse?: string;
  isSystem: boolean;  // TRUE = system folder (cannot edit/delete), FALSE = user folder
  attributes: string[];
  totalCount: number;
  unreadCount: number;
  recentCount: number;
  unseenCount: number;
  uidValidity?: string;
  uidNext?: number;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Provider {
  id: string;
  tenantId: string;
  providerType: string;
  email: string;
  displayName?: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface FoldersResponse {
  providers: Provider[];
  foldersByProvider: Record<string, Folder[]>;
}

export interface ProviderFoldersResponse {
  provider: Provider;
  folders: Folder[];
}

/**
 * Get all folders for current user
 */
export async function getFolders(): Promise<FoldersResponse> {
  const response = await apiClient.get('/folders');
  return response.data;
}

/**
 * Get folders for a specific provider
 */
export async function getFoldersByProvider(
  providerId: string,
): Promise<ProviderFoldersResponse> {
  const response = await apiClient.get(`/folders/provider/${providerId}`);
  return response.data;
}

/**
 * Sync folders for a specific provider
 */
export async function syncFolders(
  providerId: string,
): Promise<{ success: boolean; foldersCount: number; folders: Folder[] }> {
  const response = await apiClient.post(`/folders/sync/${providerId}`);
  return response.data;
}

/**
 * Sync folders for all providers
 */
export async function syncAllFolders(): Promise<{
  success: boolean;
  results: Array<{
    providerId: string;
    providerEmail: string;
    success: boolean;
    foldersCount?: number;
    error?: string;
  }>;
}> {
  const response = await apiClient.post('/folders/sync-all');
  return response.data;
}

/**
 * Update folder counts for a provider
 */
export async function updateFolderCounts(
  providerId: string,
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post(`/folders/update-counts/${providerId}`);
  return response.data;
}

// ========== FOLDER CRUD OPERATIONS ==========

export interface CreateFolderRequest {
  name: string;
  providerId: string;
  parentPath?: string;
}

export interface CreateFolderResponse {
  id: string;
  path: string;
  name: string;
}

export interface RenameFolderRequest {
  newName: string;
}

export interface RenameFolderResponse {
  id: string;
  path: string;
  name: string;
}

export interface DeleteFolderResponse {
  success: boolean;
  message: string;
}

// ========== FOLDER METADATA (Canonical Types) ==========

/**
 * Localized folder names by language
 */
export interface LocalizedFolderNames {
  en: Record<string, string>;
  it: Record<string, string>;
  de: Record<string, string>;
  fr: Record<string, string>;
  es: Record<string, string>;
  [key: string]: Record<string, string>;
}

/**
 * Folder metadata response from backend
 * Contains canonical types and localized names for multi-provider support
 */
export interface FolderMetadataResponse {
  /** All canonical folder types (INBOX, SENT, DRAFTS, etc.) */
  canonicalTypes: string[];
  /** Localized folder names by language */
  localizedNames: LocalizedFolderNames;
  /** Core system folders that exist in all providers */
  systemFolders: string[];
  /** Microsoft-specific folders */
  microsoftFolders: string[];
  /** Gmail category labels */
  gmailCategories: string[];
}

/**
 * Create a new folder
 */
export async function createFolder(
  data: CreateFolderRequest,
): Promise<CreateFolderResponse> {
  const response = await apiClient.post('/folders', data);
  return response.data;
}

/**
 * Rename a folder
 */
export async function renameFolder(
  folderId: string,
  data: RenameFolderRequest,
): Promise<RenameFolderResponse> {
  const response = await apiClient.patch(`/folders/${folderId}`, data);
  return response.data;
}

/**
 * Delete a folder
 */
export async function deleteFolder(
  folderId: string,
): Promise<DeleteFolderResponse> {
  const response = await apiClient.delete(`/folders/${folderId}`);
  return response.data;
}

// ========== FOLDER METADATA API ==========

/**
 * Get folder metadata (canonical types, localized names)
 * This provides unified folder type definitions from the backend
 * to avoid duplicating canonical folder logic in the frontend
 */
export async function getFolderMetadata(): Promise<FolderMetadataResponse> {
  const response = await apiClient.get('/folders/metadata');
  return response.data;
}

/**
 * Folders API object for convenient access
 */
export const foldersApi = {
  getFolders,
  getFoldersByProvider,
  syncFolders,
  syncAllFolders,
  updateFolderCounts,
  createFolder,
  renameFolder,
  deleteFolder,
  getFolderMetadata,
};
