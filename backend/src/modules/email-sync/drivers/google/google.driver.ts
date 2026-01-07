import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1, google } from 'googleapis';
import {
  BaseEmailDriver,
  DriverCredentials,
  ListMessagesOptions,
  ListMessagesResult,
  GetMessageOptions,
  ChangesResult,
} from '../interfaces/email-driver.interface';
import {
  CanonicalFolder,
  CanonicalMessage,
  ComposeMessage,
  AttachmentData,
  ProviderType,
  GMAIL_TO_CANONICAL,
  CANONICAL_TO_GMAIL,
  CanonicalFolderType,
  ProviderChange,
} from '../interfaces/canonical.types';
import { MimeBuilder, withRetry, RetryOptions } from '../../../../common/utils';

/**
 * Google Gmail Driver
 *
 * Implements IEmailDriver interface for Gmail API operations.
 * Provides unified email operations using the driver pattern.
 *
 * This driver can be used standalone or alongside existing sync services
 * during the migration period.
 */
@Injectable()
export class GoogleDriver extends BaseEmailDriver {
  readonly providerType: ProviderType = 'google';
  private readonly logger = new Logger(GoogleDriver.name);
  private gmail: gmail_v1.Gmail | null = null;
  private userEmail: string | null = null;

  async connect(credentials: DriverCredentials): Promise<void> {
    if (!credentials.accessToken) {
      throw new Error('Access token is required for Google authentication');
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
    });

    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    this.credentials = credentials;
    this.connected = true;

    // Get user email for later use
    // FIX Phase 1.3: Throw on auth errors (401/403) instead of silently continuing
    try {
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      this.userEmail = profile.data.emailAddress || null;
    } catch (err: unknown) {
      const error = err as any;
      const status = error?.response?.status || error?.code;
      // 401/403 indicates invalid/expired token - driver is unusable
      if (status === 401 || status === 403) {
        this.connected = false;
        throw new Error(`Google authentication failed (${status}): Token is invalid or expired`);
      }
      // Other errors (network, etc) are non-fatal for connect
      this.logger.warn(`Could not fetch user profile during connect: ${error?.message || String(err)}`);
    }
  }

  async disconnect(): Promise<void> {
    this.gmail = null;
    this.userEmail = null;
    await super.disconnect();
  }

  // ============================================
  // Retry Logic for Rate Limits & Auth Errors
  // ============================================

  /**
   * Execute Gmail API operation with retry logic
   * Uses consolidated common/utils/retry.utils.ts
   *
   * FIXED (2025-01-05): Dead code replaced with actual wiring
   * - Handles 429 Too Many Requests with exponential backoff
   * - Handles 401 Unauthorized by marking token as expired
   * - Uses circuit breaker to prevent cascade failures
   */
  private executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    return withRetry(operation, {
      provider: 'google',
      operationName,
      logger: this.logger,
      maxRetries: 3,
      useCircuitBreaker: true,
      ...options,
    });
  }

  // ============================================
  // Folder Operations
  // ============================================

  async listFolders(): Promise<CanonicalFolder[]> {
    this.ensureConnected();

    const response = await this.executeWithRetry(
      () => this.gmail!.users.labels.list({ userId: 'me' }),
      'listFolders',
    );
    const labels = response.data.labels || [];

    return labels
      .filter((label) => label.id && label.name)
      .map((label) => this.labelToCanonicalFolder(label));
  }

  async getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null> {
    this.ensureConnected();

    try {
      // Try to get by label ID first
      const response = await this.executeWithRetry(
        () => this.gmail!.users.labels.get({
          userId: 'me',
          id: folderIdOrPath,
        }),
        'getFolder',
      );

      if (response.data) {
        return this.labelToCanonicalFolder(response.data);
      }
    } catch (error: any) {
      if (error.code === 404) {
        // Not found by ID, search by name (already uses retry via listFolders)
        this.logger.debug(`Folder not found by ID ${folderIdOrPath}, searching by name`);
        const allLabels = await this.listFolders();
        return allLabels.find(
          (f) => f.name.toLowerCase() === folderIdOrPath.toLowerCase() ||
            f.type.toLowerCase() === folderIdOrPath.toLowerCase()
        ) || null;
      }
      throw error;
    }

    return null;
  }

  async createFolder(name: string, _parentId?: string): Promise<CanonicalFolder> {
    this.ensureConnected();

    // FIX Phase 2.3: Input validation for folder name
    if (!name || typeof name !== 'string') {
      throw new Error('Folder name is required');
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      throw new Error('Folder name cannot be empty');
    }
    if (trimmedName.length > 225) {
      throw new Error('Folder name cannot exceed 225 characters');
    }
    // Gmail labels cannot contain certain special characters
    if (/[\\\/]/.test(trimmedName)) {
      throw new Error('Folder name cannot contain \\ or / characters');
    }

    const response = await this.executeWithRetry(
      () => this.gmail!.users.labels.create({
        userId: 'me',
        requestBody: {
          name: trimmedName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      }),
      'createFolder',
    );

    return this.labelToCanonicalFolder(response.data);
  }

  async deleteFolder(folderId: string): Promise<void> {
    this.ensureConnected();

    await this.executeWithRetry(
      () => this.gmail!.users.labels.delete({
        userId: 'me',
        id: folderId,
      }),
      'deleteFolder',
    );
  }

  async renameFolder(folderId: string, newName: string): Promise<void> {
    this.ensureConnected();

    // FIX Phase 2.3: Input validation for folder name
    if (!newName || typeof newName !== 'string') {
      throw new Error('New folder name is required');
    }
    const trimmedName = newName.trim();
    if (trimmedName.length === 0) {
      throw new Error('New folder name cannot be empty');
    }
    if (trimmedName.length > 225) {
      throw new Error('Folder name cannot exceed 225 characters');
    }
    if (/[\\\/]/.test(trimmedName)) {
      throw new Error('Folder name cannot contain \\ or / characters');
    }

    await this.executeWithRetry(
      () => this.gmail!.users.labels.patch({
        userId: 'me',
        id: folderId,
        requestBody: { name: trimmedName },
      }),
      'renameFolder',
    );
  }

  // ============================================
  // Message Listing
  // ============================================

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    this.ensureConnected();

    const labelId = this.canonicalToGmailLabel(options.folder);
    let query = this.buildSearchQuery(options);

    // FIX: ARCHIVE folder requires special handling - Gmail doesn't have an 'all' label
    // Archive = emails not in INBOX, TRASH, or SPAM
    const isArchiveFolder = options.folder.toUpperCase() === 'ARCHIVE' || options.folder.toUpperCase() === 'ALL';
    if (isArchiveFolder) {
      const archiveQuery = '-in:inbox -in:trash -in:spam';
      query = query ? `${query} ${archiveQuery}` : archiveQuery;
    }

    // FIX Phase 2.3: Cap pageSize to prevent excessive queries (Gmail max is 500)
    const MAX_PAGE_SIZE = 500;
    const requestedPageSize = options.pageSize || 50;
    const effectivePageSize = Math.min(Math.max(1, requestedPageSize), MAX_PAGE_SIZE);

    const response = await this.executeWithRetry(
      () => this.gmail!.users.messages.list({
        userId: 'me',
        // Don't use labelIds for ARCHIVE - use query instead
        labelIds: (labelId && !isArchiveFolder) ? [labelId] : undefined,
        maxResults: effectivePageSize,
        pageToken: options.pageToken,
        q: query || undefined,
      }),
      'listMessages',
    );

    const messageRefs = response.data.messages || [];
    const messageIds = messageRefs
      .filter((ref) => ref.id)
      .map((ref) => ref.id!);

    // MEMORY OPTIMIZATION for >1000 users:
    // Only fetch full body when explicitly requested
    // Default to metadata-only for massive memory savings
    const messages = await this.batchGetMessages(messageIds, options.includeBody === true);

    return {
      messages,
      nextPageToken: response.data.nextPageToken || undefined,
      hasMore: !!response.data.nextPageToken,
      totalEstimate: response.data.resultSizeEstimate || undefined,
    };
  }

  async getMessage(
    messageId: string,
    options?: GetMessageOptions,
  ): Promise<CanonicalMessage | null> {
    this.ensureConnected();

    try {
      const format = options?.format || 'full';
      const response = await this.executeWithRetry(
        () => this.gmail!.users.messages.get({
          userId: 'me',
          id: messageId,
          format,
        }),
        'getMessage',
      );

      return this.gmailMessageToCanonical(response.data);
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  async getMessageRaw(messageId: string): Promise<string> {
    this.ensureConnected();

    const response = await this.executeWithRetry(
      () => this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'raw',
      }),
      'getMessageRaw',
    );

    return response.data.raw || '';
  }

  // ============================================
  // Message Mutations
  // ============================================

  async sendMessage(message: ComposeMessage): Promise<string> {
    this.ensureConnected();

    const raw = await this.composeToRaw(message);

    const response = await this.executeWithRetry(
      () => this.gmail!.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId: message.threadId,
        },
      }),
      'sendMessage',
    );

    return response.data.id || '';
  }

  async saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string> {
    this.ensureConnected();

    const raw = await this.composeToRaw(message);

    if (existingDraftId) {
      const response = await this.executeWithRetry(
        () => this.gmail!.users.drafts.update({
          userId: 'me',
          id: existingDraftId,
          requestBody: {
            message: { raw, threadId: message.threadId },
          },
        }),
        'updateDraft',
      );
      return response.data.id || existingDraftId;
    }

    const response = await this.executeWithRetry(
      () => this.gmail!.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: { raw, threadId: message.threadId },
        },
      }),
      'createDraft',
    );

    return response.data.id || '';
  }

  async sendDraft(draftId: string): Promise<void> {
    this.ensureConnected();

    await this.executeWithRetry(
      () => this.gmail!.users.drafts.send({
        userId: 'me',
        requestBody: { id: draftId },
      }),
      'sendDraft',
    );
  }

  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    this.ensureConnected();

    const upperTarget = targetFolder.toUpperCase();

    // FIX: SENT cannot be a move target - Gmail applies SENT label automatically when sending
    if (upperTarget === 'SENT') {
      this.logger.warn(`Cannot move message to SENT folder - Gmail applies this label automatically`);
      return; // Skip silently - this is expected behavior
    }

    // FIX: ARCHIVE in Gmail = remove INBOX label (not add a label)
    const isArchiveTarget = upperTarget === 'ARCHIVE' || upperTarget === 'ALL';

    const targetLabelId = isArchiveTarget ? null : this.canonicalToGmailLabel(targetFolder);

    // FIX HIGH-4 (2025-01-05): Add retry wrapper - was missing
    // Get current labels
    const message = await this.executeWithRetry(
      () => this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'minimal',
      }),
      'moveMessage:get',
    );

    const currentLabels = message.data.labelIds || [];

    // Labels that cannot be removed (Gmail system labels that are immutable)
    // SENT, DRAFT labels are assigned by Gmail and cannot be removed
    const immutableLabels = ['UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT'];
    let labelsToRemove: string[];
    let labelsToAdd: string[];

    if (isArchiveTarget) {
      // Archive = remove INBOX label, keep other labels
      labelsToRemove = currentLabels.includes('INBOX') ? ['INBOX'] : [];
      labelsToAdd = [];
    } else {
      // Normal move = remove folder labels, add target label
      labelsToRemove = currentLabels.filter(
        (l) => !immutableLabels.includes(l) && l !== targetLabelId
      );
      labelsToAdd = targetLabelId ? [targetLabelId] : [];
    }

    // Only modify if there are changes to make
    if (labelsToRemove.length > 0 || labelsToAdd.length > 0) {
      await this.executeWithRetry(
        () => this.gmail!.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            addLabelIds: labelsToAdd,
            removeLabelIds: labelsToRemove,
          },
        }),
        'moveMessage:modify',
      );
    }
  }

  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    this.ensureConnected();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    // Gmail doesn't have copy - we add the label instead
    // FIX HIGH-4 (2025-01-05): Add retry wrapper - was missing
    await this.executeWithRetry(
      () => this.gmail!.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: targetLabelId ? [targetLabelId] : [],
        },
      }),
      'copyMessage:modify',
    );

    return messageId; // Same message, just with additional label
  }

  async deleteMessage(messageId: string, permanent = false): Promise<void> {
    this.ensureConnected();

    if (permanent) {
      await this.executeWithRetry(
        () => this.gmail!.users.messages.delete({
          userId: 'me',
          id: messageId,
        }),
        'deleteMessage:permanent',
      );
    } else {
      await this.executeWithRetry(
        () => this.gmail!.users.messages.trash({
          userId: 'me',
          id: messageId,
        }),
        'deleteMessage:trash',
      );
    }
  }

  // ============================================
  // Flags / Status
  // ============================================

  async setReadStatus(messageId: string, isRead: boolean): Promise<void> {
    this.ensureConnected();

    await this.executeWithRetry(
      () => this.gmail!.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: isRead ? [] : ['UNREAD'],
          removeLabelIds: isRead ? ['UNREAD'] : [],
        },
      }),
      'setReadStatus',
    );
  }

  async setStarredStatus(messageId: string, isStarred: boolean): Promise<void> {
    this.ensureConnected();

    await this.executeWithRetry(
      () => this.gmail!.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: isStarred ? ['STARRED'] : [],
          removeLabelIds: isStarred ? [] : ['STARRED'],
        },
      }),
      'setStarredStatus',
    );
  }

  async setFlaggedStatus(messageId: string, isFlagged: boolean): Promise<void> {
    this.ensureConnected();

    await this.executeWithRetry(
      () => this.gmail!.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: isFlagged ? ['IMPORTANT'] : [],
          removeLabelIds: isFlagged ? [] : ['IMPORTANT'],
        },
      }),
      'setFlaggedStatus',
    );
  }

  // ============================================
  // Labels
  // ============================================

  async addLabels(messageId: string, labels: string[]): Promise<void> {
    this.ensureConnected();

    await this.executeWithRetry(
      () => this.gmail!.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: labels,
        },
      }),
      'addLabels',
    );
  }

  async removeLabels(messageId: string, labels: string[]): Promise<void> {
    this.ensureConnected();

    await this.executeWithRetry(
      () => this.gmail!.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: labels,
        },
      }),
      'removeLabels',
    );
  }

  // ============================================
  // Attachments
  // ============================================

  /**
   * Get attachment content by ID
   *
   * MEMORY AUDIT FIX (2025-01-05):
   * - Added MAX_ATTACHMENT_SIZE limit (50MB) to prevent OOM
   * - Added size validation before processing
   */
  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    this.ensureConnected();

    // MEMORY FIX: Add size limit constant
    const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB limit

    const response = await this.executeWithRetry(
      () => this.gmail!.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      }),
      'getAttachment',
    );

    // MEMORY FIX: Check attachment size before processing
    const attachmentSize = response.data.size || 0;
    if (attachmentSize > MAX_ATTACHMENT_SIZE) {
      throw new Error(`Attachment exceeds maximum size limit (${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB)`);
    }

    // Get message to find attachment metadata
    const message = await this.executeWithRetry(
      () => this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      }),
      'getAttachment:meta',
    );

    const attachmentMeta = this.findAttachmentMeta(message.data, attachmentId);

    return {
      id: attachmentId,
      filename: attachmentMeta?.filename || 'attachment',
      mimeType: attachmentMeta?.mimeType || 'application/octet-stream',
      size: attachmentSize,
      isInline: attachmentMeta?.isInline || false,
      contentId: attachmentMeta?.contentId,
      content: response.data.data ? this.normalizeBase64Url(response.data.data) : '',
    };
  }

  // ============================================
  // User Info
  // ============================================

  async getUserInfo(): Promise<{ email: string; name: string; photo?: string }> {
    this.ensureConnected();

    const response = await this.executeWithRetry(
      () => this.gmail!.users.getProfile({ userId: 'me' }),
      'getUserInfo',
    );

    return {
      email: response.data.emailAddress || this.userEmail || '',
      name: response.data.emailAddress?.split('@')[0] || '',
      photo: undefined, // Gmail API doesn't provide photo
    };
  }

  async getEmailAliases(): Promise<Array<{ email: string; name?: string; isPrimary: boolean }>> {
    this.ensureConnected();

    try {
      const response = await this.executeWithRetry(
        () => this.gmail!.users.settings.sendAs.list({ userId: 'me' }),
        'getEmailAliases',
      );
      const sendAs = response.data.sendAs || [];

      return sendAs.map((alias) => ({
        email: alias.sendAsEmail || '',
        name: alias.displayName || undefined,
        isPrimary: alias.isPrimary || false,
      }));
    } catch (error: any) {
      this.logger.debug(`Could not fetch aliases, using primary only: ${error.message}`);
      // Fallback to just primary email
      const profile = await this.getUserInfo();
      return [{ email: profile.email, name: profile.name, isPrimary: true }];
    }
  }

  // ============================================
  // Batch Operations
  // ============================================

  /**
   * Batch get messages with senior-level memory optimization for >1000 concurrent users
   * 
   * Best practices applied (2025-01-05):
   * 1. Use metadata format by default (10x smaller responses)
   * 2. Controlled concurrency (5 concurrent, not 50) - prevents memory spike
   * 3. Process in small chunks with explicit cleanup
   * 4. setImmediate between chunks for GC opportunity
   * 5. BullMQ jobs are isolated - memory freed when job completes
   * 
   * @param messageIds Message IDs to fetch
   * @param includeBody Fetch full body (expensive) - default false for memory
   */
  async batchGetMessages(messageIds: string[], includeBody = false): Promise<CanonicalMessage[]> {
    if (messageIds.length === 0) return [];

    const messages: CanonicalMessage[] = [];
    const failedIds: Array<{ id: string; error: string; code?: number }> = [];

    // SENIOR-LEVEL OPTIMIZATION for >1000 concurrent users:
    // - Controlled concurrency (5 at a time, not 50)
    // - Metadata format by default = 10x smaller responses
    // - Explicit cleanup after each batch
    const CONCURRENT_LIMIT = 5;
    const format = includeBody ? 'full' : 'metadata';

    for (let i = 0; i < messageIds.length; i += CONCURRENT_LIMIT) {
      const batch = messageIds.slice(i, i + CONCURRENT_LIMIT);

      // Controlled concurrency - never more than CONCURRENT_LIMIT in flight
      let results: (CanonicalMessage | null)[] = await Promise.all(
        batch.map(async (id) => {
          try {
            return await this.getMessage(id, { format, includeBody });
          } catch (error: any) {
            // FIX CRIT-1 (2025-01-05): Accumulate failures instead of swallowing
            const statusCode = error?.response?.status || error?.code;
            failedIds.push({
              id,
              error: error.message || 'Unknown error',
              code: typeof statusCode === 'number' ? statusCode : undefined,
            });
            return null;
          }
        })
      );

      // Extract valid messages
      for (const msg of results) {
        if (msg) messages.push(msg);
      }

      // CRITICAL: Clear references immediately for GC
      results = null as any;

      // Yield to event loop for GC opportunity between batches
      await new Promise<void>(r => setImmediate(r));
    }

    // FIX CRIT-1 (2025-01-05): Report failures instead of silent swallowing
    if (failedIds.length > 0) {
      const failureRate = failedIds.length / messageIds.length;
      const authErrors = failedIds.filter((f) => f.code === 401 || f.code === 403);
      const rateLimitErrors = failedIds.filter((f) => f.code === 429);

      // Auth errors = systemic issue, throw immediately
      if (authErrors.length > 0) {
        throw new Error(
          `Authentication failed during batch fetch: ${authErrors.length} auth errors. Token may need refresh.`,
        );
      }

      // Rate limit = back off needed
      if (rateLimitErrors.length > 0) {
        throw new Error(
          `Rate limited during batch fetch: ${rateLimitErrors.length} messages hit 429. Retry with backoff.`,
        );
      }

      // High failure rate (>20%) = something wrong, throw
      if (failureRate > 0.2) {
        throw new Error(
          `Batch fetch failed: ${failedIds.length}/${messageIds.length} messages (${Math.round(failureRate * 100)}% failure rate). IDs: ${failedIds.slice(0, 5).map((f) => f.id).join(', ')}${failedIds.length > 5 ? '...' : ''}`,
        );
      }

      // Low failure rate = log warning but continue (messages may have been deleted)
      this.logger.warn(
        `batchGetMessages: ${failedIds.length}/${messageIds.length} messages failed to fetch. ` +
        `Continuing with ${messages.length} successful. Failed IDs: ${failedIds.map((f) => f.id).join(', ')}`,
      );
    }

    return messages;
  }

  async batchSetReadStatus(updates: Array<{ id: string; isRead: boolean }>): Promise<void> {
    // Group by read status for efficiency
    const toRead = updates.filter((u) => u.isRead).map((u) => u.id);
    const toUnread = updates.filter((u) => !u.isRead).map((u) => u.id);

    const promises: Promise<void>[] = [];

    if (toRead.length > 0) {
      promises.push(
        this.executeWithRetry(
          () => this.gmail!.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids: toRead,
              removeLabelIds: ['UNREAD'],
            },
          }),
          'batchSetReadStatus:read',
        ).then(() => { })
      );
    }

    if (toUnread.length > 0) {
      promises.push(
        this.executeWithRetry(
          () => this.gmail!.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids: toUnread,
              addLabelIds: ['UNREAD'],
            },
          }),
          'batchSetReadStatus:unread',
        ).then(() => { })
      );
    }

    await Promise.all(promises);
  }

  async batchMoveMessages(messageIds: string[], targetFolder: string): Promise<void> {
    this.ensureConnected();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    await this.executeWithRetry(
      () => this.gmail!.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: messageIds,
          addLabelIds: targetLabelId ? [targetLabelId] : [],
          // Note: This doesn't remove from source folder - Gmail uses labels
        },
      }),
      'batchMoveMessages',
    );
  }

  async batchDeleteMessages(messageIds: string[], permanent = false): Promise<void> {
    this.ensureConnected();

    if (permanent) {
      await this.executeWithRetry(
        () => this.gmail!.users.messages.batchDelete({
          userId: 'me',
          requestBody: { ids: messageIds },
        }),
        'batchDeleteMessages:permanent',
      );
    } else {
      // Move to trash
      await this.executeWithRetry(
        () => this.gmail!.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids: messageIds,
            addLabelIds: ['TRASH'],
          },
        }),
        'batchDeleteMessages:trash',
      );
    }
  }

  // ============================================
  // Delta Sync
  // ============================================

  async getInitialSyncToken(): Promise<string> {
    this.ensureConnected();

    const response = await this.gmail!.users.getProfile({ userId: 'me' });
    return response.data.historyId || '';
  }

  async getChangesSince(syncToken: string): Promise<ChangesResult> {
    this.ensureConnected();

    const startHistoryId = syncToken;

    // Get current historyId to check if there are changes
    const profile = await this.executeWithRetry(
      () => this.gmail!.users.getProfile({ userId: 'me' }),
      'getProfile',
    );
    const currentHistoryId = profile.data.historyId!;

    if (currentHistoryId === startHistoryId) {
      // No changes
      return {
        changes: [],
        newSyncToken: currentHistoryId,
        hasMore: false,
      };
    }

    const changes: ProviderChange[] = [];
    let pageToken: string | undefined;
    let pagesFetched = 0;
    const MAX_PAGES = 25; // Prevent runaway pagination
    const MAX_CHANGES = 10000; // MEMORY FIX: Prevent unbounded array growth
    let hasMore = false;

    try {
      do {
        const historyResponse = await this.executeWithRetry(
          () => this.gmail!.users.history.list({
            userId: 'me',
            startHistoryId,
            pageToken,
            historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
            maxResults: 500,
          }),
          'getHistory',
        );

        const history = historyResponse.data.history || [];

        for (const record of history) {
          const timestamp = new Date();

          // Process messagesAdded
          if (record.messagesAdded) {
            for (const added of record.messagesAdded) {
              const messageId = added.message?.id;
              if (!messageId) continue;

              changes.push({
                type: 'added',
                messageId,
                threadId: added.message?.threadId || undefined,
                timestamp,
              });
            }
          }

          // Process labelsAdded or labelsRemoved (indicates modification)
          if (record.labelsAdded || record.labelsRemoved) {
            const labelChanges = [
              ...(record.labelsAdded || []),
              ...(record.labelsRemoved || []),
            ];

            for (const labelChange of labelChanges) {
              const messageId = labelChange.message?.id;
              if (!messageId) continue;

              // Avoid duplicates (same message may have multiple label changes)
              if (!changes.find(c => c.messageId === messageId && c.type === 'modified')) {
                changes.push({
                  type: 'modified',
                  messageId,
                  threadId: labelChange.message?.threadId || undefined,
                  timestamp,
                });
              }
            }
          }

          // Process messagesDeleted
          if (record.messagesDeleted) {
            for (const deleted of record.messagesDeleted) {
              const messageId = deleted.message?.id;
              if (!messageId) continue;

              changes.push({
                type: 'deleted',
                messageId,
                threadId: deleted.message?.threadId || undefined,
                timestamp,
              });
            }
          }
        }

        pageToken = historyResponse.data.nextPageToken ?? undefined;
        pagesFetched += 1;

        // MEMORY FIX: Stop if we've accumulated too many changes
        if (changes.length >= MAX_CHANGES) {
          this.logger.warn(`Gmail changes limit reached (${MAX_CHANGES}). Stopping pagination.`);
          hasMore = true;
          break;
        }
      } while (pageToken && pagesFetched < MAX_PAGES);

      if (pageToken) {
        this.logger.warn(
          `Gmail history pagination truncated after ${pagesFetched} pages. Consider full sync.`,
        );
        hasMore = true;
      }

      return {
        changes,
        newSyncToken: currentHistoryId,
        hasMore,
      };
    } catch (error: any) {
      const errorCode = error?.code || error?.status;
      const errorMessage = error?.message || String(error);

      // LB-14 Fix: Comprehensive Gmail API error handling
      // Handle 404 errors (historyId expired) per Gmail API best practices
      if (errorCode === 404) {
        this.logger.warn(
          `Gmail history ID ${startHistoryId} is invalid or expired. Full sync required.`,
        );
        // Return clear signal for full sync
        return {
          changes: [],
          newSyncToken: currentHistoryId,
          hasMore: false,
          fullSyncRequired: true,
        };
      }

      // Handle 403 (permission denied / quota exceeded)
      if (errorCode === 403) {
        const isQuotaExceeded = errorMessage.includes('quotaExceeded') ||
          errorMessage.includes('userRateLimitExceeded') ||
          errorMessage.includes('dailyLimitExceeded');

        if (isQuotaExceeded) {
          this.logger.error(
            `Gmail API quota exceeded for history sync. Will retry later.`,
          );
          // Throw a retriable error for quota issues
          const quotaError = new Error(`Gmail quota exceeded: ${errorMessage}`);
          (quotaError as any).retriable = true;
          (quotaError as any).retryAfter = 60000; // Suggest 1 minute retry
          throw quotaError;
        }

        this.logger.error(
          `Gmail API permission denied for history sync: ${errorMessage}`,
        );
        throw new Error(`Gmail permission denied: ${errorMessage}`);
      }

      // Handle 429 (rate limit exceeded)
      if (errorCode === 429) {
        const retryAfter = error?.response?.headers?.['retry-after'];
        const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 30000;

        this.logger.warn(
          `Gmail API rate limited. Retry after ${retryMs}ms.`,
        );
        const rateLimitError = new Error(`Gmail rate limited: ${errorMessage}`);
        (rateLimitError as any).retriable = true;
        (rateLimitError as any).retryAfter = retryMs;
        throw rateLimitError;
      }

      // Handle 500/502/503/504 (server errors - retriable)
      if (errorCode >= 500 && errorCode < 600) {
        this.logger.warn(
          `Gmail API server error (${errorCode}): ${errorMessage}. Will retry.`,
        );
        const serverError = new Error(`Gmail server error: ${errorMessage}`);
        (serverError as any).retriable = true;
        (serverError as any).retryAfter = 5000; // 5 second retry for server errors
        throw serverError;
      }

      // Re-throw unhandled errors
      throw error;
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  private labelToCanonicalFolder(label: gmail_v1.Schema$Label): CanonicalFolder {
    const type = this.gmailLabelToCanonical(label.id || label.name || '');

    return {
      id: label.id || '',
      externalId: label.id || '',
      name: label.name || '',
      type,
      path: label.name || '',
      unreadCount: label.messagesUnread || 0,
      totalCount: label.messagesTotal || 0,
      attributes: {
        selectable: label.type !== 'system' || this.isSelectableSystemLabel(label.id || ''),
        hasChildren: false, // Gmail labels are flat
        subscribed: true,
      },
    };
  }

  private gmailLabelToCanonical(labelId: string): CanonicalFolderType {
    return GMAIL_TO_CANONICAL[labelId] || labelId;
  }

  private canonicalToGmailLabel(canonical: string): string | null {
    const upper = canonical.toUpperCase();
    return CANONICAL_TO_GMAIL[upper] || canonical;
  }

  private isSelectableSystemLabel(labelId: string): boolean {
    return ['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'STARRED', 'IMPORTANT'].includes(labelId);
  }

  private gmailMessageToCanonical(message: gmail_v1.Schema$Message): CanonicalMessage {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;

    const labelIds = message.labelIds || [];
    const folder = this.determineFolderFromLabels(labelIds);

    // Extract body
    let bodyText = '';
    let bodyHtml = '';
    const attachments: CanonicalMessage['attachments'] = [];

    const extractParts = (part: gmail_v1.Schema$MessagePart) => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText += this.decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        bodyHtml += this.decodeBase64Url(part.body.data);
      }

      // Extract attachment metadata
      if (part.filename && part.body?.attachmentId) {
        const contentId = part.headers?.find(
          (h) => h.name?.toLowerCase() === 'content-id'
        )?.value;
        const isInline = part.headers?.some(
          (h) =>
            h.name?.toLowerCase() === 'content-disposition' &&
            h.value?.startsWith('inline')
        ) || false;

        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
          contentId: contentId?.replace(/[<>]/g, ''),
          isInline,
        });
      }

      if (part.parts) {
        part.parts.forEach(extractParts);
      }
    };

    if (message.payload) {
      extractParts(message.payload);
    }

    const dateStr = getHeader('Date');
    const sentAt = dateStr ? new Date(dateStr) : new Date(parseInt(message.internalDate || '0'));

    return {
      id: message.id || '',
      externalId: message.id || '',
      threadId: message.threadId || undefined,
      folder,
      folderDisplayName: folder,
      from: this.parseEmailAddress(getHeader('From') || ''),
      to: this.parseEmailAddresses(getHeader('To') || ''),
      cc: this.parseEmailAddresses(getHeader('Cc') || ''),
      bcc: this.parseEmailAddresses(getHeader('Bcc') || ''),
      replyTo: getHeader('Reply-To') ? this.parseEmailAddress(getHeader('Reply-To')!) : undefined,
      subject: getHeader('Subject') || '(No Subject)',
      messageId: getHeader('Message-ID') || undefined,
      inReplyTo: getHeader('In-Reply-To') || undefined,
      references: getHeader('References') || undefined,
      bodyText,
      bodyHtml,
      snippet: message.snippet || '',
      receivedAt: new Date(parseInt(message.internalDate || '0')),
      sentAt,
      isRead: !labelIds.includes('UNREAD'),
      isStarred: labelIds.includes('STARRED'),
      isFlagged: labelIds.includes('IMPORTANT'),
      isDraft: labelIds.includes('DRAFT'),
      isDeleted: labelIds.includes('TRASH'),
      labels: labelIds,
      hasAttachments: attachments.length > 0,
      attachments,
      providerMetadata: {
        historyId: message.historyId || undefined,
      },
    };
  }

  private determineFolderFromLabels(labelIds: string[]): CanonicalFolderType {
    if (labelIds.includes('TRASH')) return 'TRASH';
    if (labelIds.includes('SPAM')) return 'SPAM';
    if (labelIds.includes('SENT')) return 'SENT';
    if (labelIds.includes('DRAFT')) return 'DRAFTS';

    // Check categories
    const categoryLabel = labelIds.find((l) => l.startsWith('CATEGORY_'));
    if (categoryLabel) {
      const categoryMap: Record<string, CanonicalFolderType> = {
        CATEGORY_PERSONAL: 'INBOX',
        CATEGORY_SOCIAL: 'SOCIAL',
        CATEGORY_PROMOTIONS: 'PROMOTIONS',
        CATEGORY_UPDATES: 'UPDATES',
        CATEGORY_FORUMS: 'FORUMS',
      };
      if (categoryMap[categoryLabel]) return categoryMap[categoryLabel];
    }

    if (labelIds.includes('INBOX')) return 'INBOX';

    return 'INBOX';
  }

  private parseEmailAddress(address: string): { name?: string; email: string } {
    if (!address || !address.trim()) {
      return { email: '' };
    }

    // FIX (2025-01-07): parsing regex to prevent truncation of email addresses
    // Previous regex /^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/ was too greedy for name part
    // and caused "email@domain.com" to be parsed as Name="email@domain.co", Email="m"
    const match = address.match(/^(.*?)\s*<?([^>]+)>?$/);

    if (match) {
      let name = match[1]?.trim() || undefined;
      const email = match[2]?.trim() || '';

      // Clean quotes from name if present
      if (name && name.startsWith('"') && name.endsWith('"')) {
        name = name.slice(1, -1).trim();
      }

      // Validate that email contains @ symbol - otherwise it's likely a malformed header
      if (email && email.includes('@')) {
        return { name, email };
      }

      // If no valid email found but we have a name-like value, check if IT contains an @
      if (name && name.includes('@')) {
        return { email: name };
      }

      // Fallback: if the original address has @, use it
      if (address.includes('@')) {
        return { email: address.trim() };
      }

      // No valid email found - return the display name as email for debugging
      // This preserves the original value for troubleshooting malformed headers
      return { name, email: email || address.trim() };
    }

    return { email: address.trim() };
  }

  private parseEmailAddresses(addresses: string): Array<{ name?: string; email: string }> {
    if (!addresses) return [];
    return addresses.split(',').map((addr) => this.parseEmailAddress(addr.trim()));
  }

  private buildSearchQuery(options: ListMessagesOptions): string | null {
    const parts: string[] = [];

    if (options.query) {
      parts.push(options.query);
    }

    if (options.onlyUnread) {
      parts.push('is:unread');
    }

    if (options.since) {
      // Use local date to avoid UTC day shifts in Gmail search
      const sinceStr = this.formatSearchDate(options.since);
      parts.push(`after:${sinceStr}`);
    }

    if (options.before) {
      // Use local date to avoid UTC day shifts in Gmail search
      const beforeStr = this.formatSearchDate(options.before);
      parts.push(`before:${beforeStr}`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  private formatSearchDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  private normalizeBase64Url(data: string): string {
    let normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = normalized.length % 4;
    if (padLength !== 0) {
      normalized += '='.repeat(4 - padLength);
    }
    return normalized;
  }

  private decodeBase64Url(data: string): string {
    if (!data) return '';
    return Buffer.from(this.normalizeBase64Url(data), 'base64').toString('utf8');
  }

  private async composeToRaw(message: ComposeMessage): Promise<string> {
    const rawMessage = await MimeBuilder.build(message);
    return rawMessage.toString('base64url');
  }

  private findAttachmentMeta(
    message: gmail_v1.Schema$Message,
    attachmentId: string,
  ): { filename: string; mimeType: string; contentId?: string; isInline: boolean } | null {
    const search = (part: gmail_v1.Schema$MessagePart): any => {
      if (part.body?.attachmentId === attachmentId) {
        const contentId = part.headers?.find(
          (h) => h.name?.toLowerCase() === 'content-id'
        )?.value;
        const isInline = part.headers?.some(
          (h) =>
            h.name?.toLowerCase() === 'content-disposition' &&
            h.value?.startsWith('inline')
        ) || false;

        return {
          filename: part.filename || 'attachment',
          mimeType: part.mimeType || 'application/octet-stream',
          contentId: contentId?.replace(/[<>]/g, ''),
          isInline,
        };
      }

      if (part.parts) {
        for (const p of part.parts) {
          const result = search(p);
          if (result) return result;
        }
      }

      return null;
    };

    return message.payload ? search(message.payload) : null;
  }
}

