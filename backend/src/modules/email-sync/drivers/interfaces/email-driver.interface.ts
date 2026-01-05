/**
 * Email Driver Interface
 *
 * Defines the contract for email provider drivers.
 * Each provider (Google, Microsoft, IMAP) implements this interface
 * to provide unified email operations.
 */

import {
  CanonicalFolder,
  CanonicalMessage,
  ComposeMessage,
  ProviderChange,
  ProviderSubscription,
  ProviderType,
  AttachmentData,
} from './canonical.types';

/**
 * Credentials for driver authentication
 */
export interface DriverCredentials {
  type: 'oauth2' | 'basic' | 'app-password';

  // OAuth2 credentials (Google, Microsoft)
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;

  // Basic auth / App password (IMAP)
  username?: string;
  password?: string;

  // IMAP-specific connection settings
  imapHost?: string;
  imapPort?: number;
  imapTls?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpTls?: boolean;

  // Optional email hint when User.Read scope may not be available
  // Used as fallback for getUserInfo() when /me endpoint returns 403
  emailHint?: string;
}

/**
 * Options for listing messages
 */
export interface ListMessagesOptions {
  folder: string;                     // Canonical folder type or custom name
  pageSize?: number;                  // Number of messages per page (default: 50)
  pageToken?: string;                 // Pagination token
  query?: string;                     // Search query
  includeDeleted?: boolean;           // Include soft-deleted messages
  includeBody?: boolean;              // Include full body content when supported
  onlyUnread?: boolean;               // Filter to unread only
  since?: Date;                       // Messages received after this date
  before?: Date;                      // Messages received before this date
}

/**
 * Options for getting a single message
 */
export interface GetMessageOptions {
  includeBody?: boolean;              // Include full body content
  includeAttachments?: boolean;       // Include attachment metadata
  format?: 'full' | 'metadata' | 'minimal';
}

/**
 * Result of listing messages
 */
export interface ListMessagesResult {
  messages: CanonicalMessage[];
  nextPageToken?: string;
  hasMore: boolean;
  totalEstimate?: number;             // Estimated total count (if available)
}

/**
 * Result of getting changes since last sync
 */
export interface ChangesResult {
  changes: ProviderChange[];
  newSyncToken: string;
  hasMore: boolean;
  fullSyncRequired?: boolean;
}

/**
 * Callback for real-time change notifications
 */
export type ChangeCallback = (changes: ProviderChange[]) => void | Promise<void>;

/**
 * Email Driver Interface
 *
 * All email providers must implement this interface to provide
 * unified email operations across Google, Microsoft, and IMAP.
 */
export interface IEmailDriver {
  /**
   * Provider type identifier
   */
  readonly providerType: ProviderType;

  /**
   * Check if the driver is currently connected
   */
  isConnected(): boolean;

  // ============================================
  // Connection Lifecycle
  // ============================================

  /**
   * Connect to the email provider
   * @param credentials Authentication credentials
   */
  connect(credentials: DriverCredentials): Promise<void>;

  /**
   * Disconnect from the email provider
   */
  disconnect(): Promise<void>;

  /**
   * Refresh OAuth tokens if needed
   * @returns New credentials with refreshed tokens
   */
  refreshTokens?(): Promise<DriverCredentials>;

  // ============================================
  // Folder Operations
  // ============================================

  /**
   * List all folders/mailboxes
   * @returns Array of canonical folders
   */
  listFolders(): Promise<CanonicalFolder[]>;

  /**
   * Get a specific folder by ID or path
   * @param folderIdOrPath Folder ID or path
   */
  getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null>;

  /**
   * Create a new folder
   * @param name Folder display name
   * @param parentId Optional parent folder ID for nested folders
   */
  createFolder(name: string, parentId?: string): Promise<CanonicalFolder>;

  /**
   * Delete a folder
   * @param folderId Folder ID
   */
  deleteFolder(folderId: string): Promise<void>;

  /**
   * Rename a folder
   * @param folderId Folder ID
   * @param newName New display name
   */
  renameFolder(folderId: string, newName: string): Promise<void>;

  // ============================================
  // Message Listing
  // ============================================

  /**
   * List messages in a folder
   * @param options Listing options (folder, pagination, filters)
   */
  listMessages(options: ListMessagesOptions): Promise<ListMessagesResult>;

  /**
   * Get a single message by ID
   * @param messageId Message ID
   * @param options Get options (what to include)
   */
  getMessage(messageId: string, options?: GetMessageOptions): Promise<CanonicalMessage | null>;

  /**
   * Get the raw RFC 822 message
   * @param messageId Message ID
   * @returns Raw message content
   */
  getMessageRaw?(messageId: string): Promise<string>;

  // ============================================
  // Message Mutations
  // ============================================

  /**
   * Send a new message
   * @param message Message to send
   * @returns ID of the sent message
   */
  sendMessage(message: ComposeMessage): Promise<string>;

  /**
   * Save a draft message
   * @param message Draft content
   * @param existingDraftId Optional ID of existing draft to update
   * @returns ID of the saved draft
   */
  saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string>;

  /**
   * Send an existing draft
   * @param draftId Draft ID
   */
  sendDraft(draftId: string): Promise<void>;

  /**
   * Move a message to a different folder
   * @param messageId Message ID
   * @param targetFolder Target folder (canonical type or folder ID)
   */
  moveMessage(messageId: string, targetFolder: string): Promise<void>;

  /**
   * Copy a message to a different folder
   * @param messageId Message ID
   * @param targetFolder Target folder
   * @returns ID of the copied message
   */
  copyMessage?(messageId: string, targetFolder: string): Promise<string>;

  /**
   * Delete a message
   * @param messageId Message ID
   * @param permanent If true, permanently delete; otherwise move to trash
   */
  deleteMessage(messageId: string, permanent?: boolean): Promise<void>;

  // ============================================
  // Flags / Status
  // ============================================

  /**
   * Set read/unread status
   * @param messageId Message ID
   * @param isRead Read status
   */
  setReadStatus(messageId: string, isRead: boolean): Promise<void>;

  /**
   * Set starred status
   * @param messageId Message ID
   * @param isStarred Starred status
   */
  setStarredStatus(messageId: string, isStarred: boolean): Promise<void>;

  /**
   * Set flagged status
   * @param messageId Message ID
   * @param isFlagged Flagged status
   */
  setFlaggedStatus?(messageId: string, isFlagged: boolean): Promise<void>;

  // ============================================
  // Labels / Categories
  // ============================================

  /**
   * Add labels to a message
   * @param messageId Message ID
   * @param labels Labels to add
   */
  addLabels?(messageId: string, labels: string[]): Promise<void>;

  /**
   * Remove labels from a message
   * @param messageId Message ID
   * @param labels Labels to remove
   */
  removeLabels?(messageId: string, labels: string[]): Promise<void>;

  // ============================================
  // Attachments
  // ============================================

  /**
   * Get attachment content
   * @param messageId Message ID
   * @param attachmentId Attachment ID
   * @returns Attachment with content
   */
  getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData>;

  // ============================================
  // Sync / Real-time
  // ============================================

  /**
   * Subscribe to real-time change notifications
   * @param callback Function to call when changes occur
   * @returns Subscription handle
   */
  subscribeToChanges?(callback: ChangeCallback): Promise<ProviderSubscription>;

  /**
   * Get changes since last sync (delta sync)
   * @param syncToken Last sync token
   * @returns Changes and new sync token
   */
  getChangesSince?(syncToken: string): Promise<ChangesResult>;

  /**
   * Get initial sync token for delta sync
   * @returns Initial sync token
   */
  getInitialSyncToken?(): Promise<string>;

  // ============================================
  // Batch Operations (optional optimization)
  // ============================================

  /**
   * Batch get multiple messages
   * @param messageIds Array of message IDs
   */
  batchGetMessages?(messageIds: string[]): Promise<CanonicalMessage[]>;

  /**
   * Batch set read status for multiple messages
   * @param updates Array of {id, isRead} updates
   */
  batchSetReadStatus?(updates: Array<{ id: string; isRead: boolean }>): Promise<void>;

  /**
   * Batch move messages to a folder
   * @param messageIds Array of message IDs
   * @param targetFolder Target folder
   */
  batchMoveMessages?(messageIds: string[], targetFolder: string): Promise<void>;

  /**
   * Batch delete messages
   * @param messageIds Array of message IDs
   * @param permanent If true, permanently delete
   */
  batchDeleteMessages?(messageIds: string[], permanent?: boolean): Promise<void>;

  // ============================================
  // User Info
  // ============================================

  /**
   * Get user profile information
   * @returns User email, name, and photo URL
   */
  getUserInfo(): Promise<{
    email: string;
    name: string;
    photo?: string;
  }>;

  /**
   * Get email aliases (send-as addresses)
   * @returns Array of email aliases
   */
  getEmailAliases?(): Promise<Array<{
    email: string;
    name?: string;
    isPrimary: boolean;
  }>>;
}

/**
 * Abstract base class for email drivers
 * Provides common functionality and default implementations
 */
export abstract class BaseEmailDriver implements IEmailDriver {
  abstract readonly providerType: ProviderType;

  protected connected = false;
  protected credentials?: DriverCredentials;

  isConnected(): boolean {
    return this.connected;
  }

  abstract connect(credentials: DriverCredentials): Promise<void>;

  async disconnect(): Promise<void> {
    this.connected = false;
    this.credentials = undefined;
  }

  abstract listFolders(): Promise<CanonicalFolder[]>;
  abstract getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null>;
  abstract createFolder(name: string, parentId?: string): Promise<CanonicalFolder>;
  abstract deleteFolder(folderId: string): Promise<void>;
  abstract renameFolder(folderId: string, newName: string): Promise<void>;

  abstract listMessages(options: ListMessagesOptions): Promise<ListMessagesResult>;
  abstract getMessage(messageId: string, options?: GetMessageOptions): Promise<CanonicalMessage | null>;

  abstract sendMessage(message: ComposeMessage): Promise<string>;
  abstract saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string>;
  abstract sendDraft(draftId: string): Promise<void>;
  abstract moveMessage(messageId: string, targetFolder: string): Promise<void>;
  abstract deleteMessage(messageId: string, permanent?: boolean): Promise<void>;

  abstract setReadStatus(messageId: string, isRead: boolean): Promise<void>;
  abstract setStarredStatus(messageId: string, isStarred: boolean): Promise<void>;

  abstract getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData>;

  abstract getUserInfo(): Promise<{ email: string; name: string; photo?: string }>;

  /**
   * Helper to ensure driver is connected before operations
   */
  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`${this.providerType} driver is not connected`);
    }
  }
}
