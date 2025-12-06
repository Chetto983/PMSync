/**
 * Folder Operations Job Interface
 *
 * Used by BullMQ queue for reliable folder CRUD operations
 * that need to sync with the mail provider (IMAP/Gmail/Microsoft)
 */

export type FolderOperationType = 'create' | 'rename' | 'delete';

export interface FolderJobData {
  // Job identification
  jobId?: string;
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'generic';
  email: string;

  // Operation details
  operation: FolderOperationType;

  // For create operation
  folderName?: string;
  parentPath?: string;

  // For rename operation
  oldPath?: string;
  newName?: string;

  // For delete operation
  folderPath?: string;

  // Auth token for worker authentication
  authToken?: string;

  // Priority (high for user-initiated actions)
  priority: 'high' | 'normal' | 'low';

  // Timestamp for ordering
  createdAt: string;
}

export interface FolderJobResult {
  success: boolean;
  providerId: string;
  email: string;
  operation: FolderOperationType;

  // Result data
  folderId?: string;
  folderPath?: string;
  folderName?: string;

  // Error info
  error?: string;
  errorCode?: string;

  // Timing
  duration: number;

  // Whether to refresh folder list
  shouldRefreshFolders: boolean;
}

export interface FolderQueueStatus {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}
