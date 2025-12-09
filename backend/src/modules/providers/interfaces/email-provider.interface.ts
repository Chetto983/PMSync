/**
 * Email Provider Interface
 *
 * Common interface for all email providers (Google, Microsoft, IMAP, etc.)
 * Inspired by Zero's MailManager interface
 *
 * @see Repo_Esempio/Zero-main/Zero-main/apps/server/src/lib/driver/types.ts
 */

export interface ProviderConfig {
  userId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'imap';
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: Date;
}

export interface ThreadResponse {
  id: string;
  messages: EmailMessage[];
  latest?: EmailMessage;
  hasUnread: boolean;
  totalMessages: number;
  labels?: string[];
  folder?: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: Date;
  snippet: string;
  bodyHtml?: string;
  bodyText?: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  labels?: string[];
  internalDate?: string;
  historyId?: string;
  raw?: any;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  data?: string; // base64
}

export interface SendEmailData {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyHtml?: string;
  bodyText: string;
  attachments?: EmailAttachment[];
  threadId?: string; // for reply/forward
  inReplyTo?: string; // message-id header
  references?: string; // references header
}

export interface ListEmailsParams {
  folder?: string;
  labelIds?: string[];
  query?: string;
  maxResults?: number;
  pageToken?: string | number;
  onlyUnread?: boolean;
}

export interface ListEmailsResponse {
  threads: Array<{
    id: string;
    historyId?: string | null;
    snippet?: string;
    lastMessageDate?: Date;
    raw?: any;
  }>;
  nextPageToken?: string | null;
  total?: number;
}

export interface UserInfo {
  email: string;
  name?: string;
  photo?: string;
  emailAliases?: Array<{
    email: string;
    name?: string;
    primary?: boolean;
  }>;
}

export interface Label {
  id: string;
  name: string;
  type?: 'system' | 'user';
  color?: {
    backgroundColor?: string;
    textColor?: string;
  };
  messageListVisibility?: string;
  labelListVisibility?: string;
}

export interface SyncOptions {
  syncType: 'full' | 'incremental';
  folderId?: string;
  maxMessages?: number;
  historyId?: string; // Gmail
  deltaLink?: string; // Microsoft
  lastSyncUid?: number; // IMAP
}

export interface SyncResult {
  success: boolean;
  emailsSynced: number;
  newEmails: number;
  updatedEmails: number;
  deletedEmails: number;
  nextHistoryId?: string;
  nextDeltaLink?: string;
  lastSyncUid?: number;
  errors?: Array<{
    type: string;
    message: string;
    context?: any;
  }>;
}

export interface DraftData {
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: EmailAttachment[];
}

export interface Draft {
  id: string;
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: EmailAttachment[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * IEmailProvider - Common interface for all email providers
 *
 * This interface defines the contract that all email providers must implement.
 * It provides a unified API for email operations regardless of the underlying provider.
 */
export interface IEmailProvider {
  readonly config: ProviderConfig;

  // ==================== User & Authentication ====================

  /**
   * Get user information from the provider
   */
  getUserInfo(): Promise<UserInfo>;

  /**
   * Refresh the access token
   * @returns New access token and expiry
   */
  refreshToken(): Promise<{ accessToken: string; expiresAt: Date }>;

  /**
   * Revoke the access token
   */
  revokeToken(): Promise<boolean>;

  // ==================== Thread Operations ====================

  /**
   * Get a thread with all messages
   * @param threadId - Thread ID
   * @param includeMessages - Include full message content
   */
  getThread(threadId: string, includeMessages?: boolean): Promise<ThreadResponse>;

  /**
   * List threads/emails with filters
   * @param params - Filter parameters
   */
  listThreads(params: ListEmailsParams): Promise<ListEmailsResponse>;

  /**
   * Delete thread(s)
   * @param threadIds - Array of thread IDs to delete
   */
  deleteThreads(threadIds: string[]): Promise<void>;

  // ==================== Message Operations ====================

  /**
   * Get a single message by ID
   * @param messageId - Message ID
   */
  getMessage(messageId: string): Promise<EmailMessage>;

  /**
   * Send a new email
   * @param data - Email data
   * @returns Sent message ID
   */
  sendEmail(data: SendEmailData): Promise<{ id: string }>;

  // ==================== Draft Operations ====================

  /**
   * Create a draft
   * @param data - Draft data
   * @returns Draft ID
   */
  createDraft(data: DraftData): Promise<{ id: string }>;

  /**
   * Get a draft by ID
   * @param draftId - Draft ID
   */
  getDraft(draftId: string): Promise<Draft>;

  /**
   * Update a draft
   * @param draftId - Draft ID
   * @param data - Updated draft data
   */
  updateDraft(draftId: string, data: DraftData): Promise<void>;

  /**
   * Delete a draft
   * @param draftId - Draft ID
   */
  deleteDraft(draftId: string): Promise<void>;

  /**
   * Send a draft
   * @param draftId - Draft ID
   */
  sendDraft(draftId: string): Promise<{ id: string }>;

  /**
   * List all drafts
   */
  listDrafts(params?: { maxResults?: number; pageToken?: string }): Promise<{
    drafts: Draft[];
    nextPageToken?: string;
  }>;

  // ==================== Attachment Operations ====================

  /**
   * Get attachment data
   * @param messageId - Message ID
   * @param attachmentId - Attachment ID
   * @returns Base64 encoded attachment data
   */
  getAttachment(messageId: string, attachmentId: string): Promise<string>;

  /**
   * Get all attachments for a message
   * @param messageId - Message ID
   */
  getMessageAttachments(messageId: string): Promise<EmailAttachment[]>;

  // ==================== Label/Folder Operations ====================

  /**
   * Get all user labels/folders
   */
  getLabels(): Promise<Label[]>;

  /**
   * Get a specific label by ID
   * @param labelId - Label ID
   */
  getLabel(labelId: string): Promise<Label>;

  /**
   * Create a new label
   * @param label - Label data
   */
  createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }): Promise<{ id: string }>;

  /**
   * Update a label
   * @param labelId - Label ID
   * @param label - Updated label data
   */
  updateLabel(
    labelId: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ): Promise<void>;

  /**
   * Delete a label
   * @param labelId - Label ID
   */
  deleteLabel(labelId: string): Promise<void>;

  /**
   * Modify labels on threads
   * @param threadIds - Array of thread IDs
   * @param addLabels - Labels to add
   * @param removeLabels - Labels to remove
   */
  modifyLabels(
    threadIds: string[],
    addLabels: string[],
    removeLabels: string[],
  ): Promise<void>;

  // ==================== Read/Unread Operations ====================

  /**
   * Mark threads as read
   * @param threadIds - Array of thread IDs
   */
  markAsRead(threadIds: string[]): Promise<void>;

  /**
   * Mark threads as unread
   * @param threadIds - Array of thread IDs
   */
  markAsUnread(threadIds: string[]): Promise<void>;

  /**
   * Mark threads as starred
   * @param threadIds - Array of thread IDs
   */
  markAsStarred?(threadIds: string[]): Promise<void>;

  /**
   * Mark threads as unstarred
   * @param threadIds - Array of thread IDs
   */
  markAsUnstarred?(threadIds: string[]): Promise<void>;

  // ==================== Sync Operations ====================

  /**
   * @deprecated Sync operations should be handled by dedicated sync services
   * (e.g., GoogleSyncService, MicrosoftSyncService) which have proper
   * incremental sync logic, history tracking, and error aggregation.
   * This method exists only for interface compatibility.
   *
   * @param options - Sync options
   */
  syncEmails?(options: SyncOptions): Promise<SyncResult>;

  /**
   * Get history ID for incremental sync (Gmail specific)
   */
  getHistoryId?(): Promise<string>;

  /**
   * List history changes since historyId (Gmail specific)
   * @param historyId - Starting history ID
   */
  listHistory?(historyId: string): Promise<{
    history: any[];
    historyId: string;
  }>;

  /**
   * Get delta link for incremental sync (Microsoft specific)
   */
  getDeltaLink?(): Promise<string>;

  // ==================== Utility Methods ====================

  /**
   * Normalize thread IDs (handle both thread and message IDs)
   * @param ids - Array of IDs
   * @returns Normalized thread IDs
   */
  normalizeIds(ids: string[]): { threadIds: string[] };

  /**
   * Get email count by folder/label
   */
  getEmailCount?(): Promise<Array<{ label: string; count: number }>>;

  /**
   * Test connection to provider
   */
  testConnection(): Promise<boolean>;
}

/**
 * Base error class for provider errors
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public originalError?: any,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Token expired error
 */
export class TokenExpiredError extends ProviderError {
  constructor(provider: string, originalError?: any) {
    super('Access token expired', 'TOKEN_EXPIRED', provider, originalError);
    this.name = 'TokenExpiredError';
  }
}

/**
 * Insufficient permissions error
 */
export class InsufficientPermissionsError extends ProviderError {
  constructor(provider: string, requiredScopes: string[], originalError?: any) {
    super(
      `Insufficient permissions. Required scopes: ${requiredScopes.join(', ')}`,
      'INSUFFICIENT_PERMISSIONS',
      provider,
      originalError,
    );
    this.name = 'InsufficientPermissionsError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends ProviderError {
  constructor(
    provider: string,
    public retryAfter?: number,
    originalError?: any,
  ) {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', provider, originalError);
    this.name = 'RateLimitError';
  }
}

/**
 * Not found error
 */
export class NotFoundError extends ProviderError {
  constructor(provider: string, resourceType: string, resourceId: string, originalError?: any) {
    super(
      `${resourceType} not found: ${resourceId}`,
      'NOT_FOUND',
      provider,
      originalError,
    );
    this.name = 'NotFoundError';
  }
}
