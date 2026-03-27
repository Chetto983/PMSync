import { Injectable, Logger, Scope } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import {
  ListMessagesOptions,
  ListMessagesResult,
  GetMessageOptions,
} from '../../interfaces/email-driver.interface';
import {
  CanonicalMessage,
  AttachmentData,
  CanonicalFolderType,
  CANONICAL_TO_GMAIL,
} from '../../interfaces/canonical.types';
import { withRetry, RetryOptions } from '../../../../../common/utils';

/**
 * GmailMessageService
 *
 * Extracted from GoogleDriver - handles message operations for Gmail API.
 * Covers listing, fetching, batch operations, flags, labels, and attachments.
 *
 * Wave 1 extraction - establishes pattern for subsequent service splits.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class GmailMessageService {
  private readonly logger = new Logger(GmailMessageService.name);

  // State will be set by facade during connect()
  private gmail: gmail_v1.Gmail | null = null;
  /** G-C1 FIX: Token refresh callback — propagated from GoogleDriver */
  private onTokenRefresh?: () => Promise<void>;

  /**
   * Initialize service with Gmail API client
   * Called by facade after authentication
   */
  initialize(gmail: gmail_v1.Gmail): void {
    this.gmail = gmail;
  }

  /** G-C1 FIX: Set token refresh callback for mid-operation 401 recovery */
  setTokenRefreshCallback(callback: () => Promise<void>): void {
    this.onTokenRefresh = callback;
  }

  /**
   * Clear service state on disconnect
   */
  clear(): void {
    this.gmail = null;
    this.onTokenRefresh = undefined;
  }

  /**
   * Execute Gmail API operation with retry logic
   * Uses consolidated common/utils/withRetry
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
      onTokenRefresh: this.onTokenRefresh,
      ...options,
    });
  }

  /**
   * Ensure Gmail client is initialized
   */
  private ensureInitialized(): void {
    if (!this.gmail) {
      throw new Error('GmailMessageService not initialized. Call initialize() first.');
    }
  }

  // ============================================
  // Message Listing
  // ============================================

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    this.ensureInitialized();

    // G-C4: Validate pagination token before passing to API
    this.validatePageToken(options.pageToken);

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

    // AI REQUIREMENT: Fetch full body for embeddings to work
    // Without body, AI queries will fail to find email content
    // Memory optimization is sacrificed for AI functionality
    const messages = await this.batchGetMessages(messageIds, true);

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
    this.ensureInitialized();
    this.validateMessageId(messageId);

    try {
      // AI REQUIREMENT: Default to full format for embeddings
      // Metadata-only breaks AI queries - always fetch body
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

  /**
   * HYBRID SYNC: Explicit full message fetch with body content
   * Use this for on-demand body loading (user views email)
   * Always uses format: 'full' regardless of options
   */
  async getMessageWithBody(messageId: string): Promise<CanonicalMessage | null> {
    return this.getMessage(messageId, { format: 'full', includeBody: true });
  }

  async getMessageRaw(messageId: string): Promise<string> {
    this.ensureInitialized();
    this.validateMessageId(messageId);

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

  /**
   * G-C2 FIX: Batch read status with chunking and partial failure handling.
   * Gmail batchModify has ~1000 ID limit per request. Large batches are
   * chunked, and per-chunk failures are logged with structured details.
   */
  async batchSetReadStatus(updates: Array<{ id: string; isRead: boolean }>): Promise<void> {
    const toRead = updates.filter((u) => u.isRead).map((u) => u.id);
    const toUnread = updates.filter((u) => !u.isRead).map((u) => u.id);

    const promises: Promise<void>[] = [];

    if (toRead.length > 0) {
      promises.push(
        this.executeBatchModify(
          toRead,
          { removeLabelIds: ['UNREAD'] },
          'batchSetReadStatus:read',
        ),
      );
    }

    if (toUnread.length > 0) {
      promises.push(
        this.executeBatchModify(
          toUnread,
          { addLabelIds: ['UNREAD'] },
          'batchSetReadStatus:unread',
        ),
      );
    }

    await Promise.all(promises);
  }

  /** Gmail batchModify max IDs per request */
  private static readonly BATCH_MODIFY_CHUNK_SIZE = 1000;

  /**
   * G-C2 FIX: Execute batchModify in chunks with structured failure logging.
   */
  private async executeBatchModify(
    messageIds: string[],
    modifications: { addLabelIds?: string[]; removeLabelIds?: string[] },
    operationName: string,
  ): Promise<void> {
    const chunkSize = GmailMessageService.BATCH_MODIFY_CHUNK_SIZE;
    let succeeded = 0;
    const failed: Array<{ count: number; error: string; code?: number }> = [];

    for (let i = 0; i < messageIds.length; i += chunkSize) {
      const chunk = messageIds.slice(i, i + chunkSize);
      try {
        await this.executeWithRetry(
          () => this.gmail!.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids: chunk,
              ...modifications,
            },
          }),
          operationName,
        );
        succeeded += chunk.length;
      } catch (error: any) {
        const statusCode = error?.response?.status || error?.code;
        failed.push({
          count: chunk.length,
          error: error.message || 'Unknown error',
          code: typeof statusCode === 'number' ? statusCode : undefined,
        });
      }
    }

    if (failed.length > 0) {
      this.logger.warn(
        `${operationName}: partial failure — ${succeeded}/${messageIds.length} succeeded, ` +
        `${failed.length} chunk(s) failed: ${failed.map(f => `[${f.count} IDs, ${f.code ?? '?'}: ${f.error}]`).join(', ')}`,
      );
    }
  }

  // ============================================
  // Flags / Status
  // ============================================

  async setReadStatus(messageId: string, isRead: boolean): Promise<void> {
    this.ensureInitialized();
    this.validateMessageId(messageId);

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
    this.ensureInitialized();
    this.validateMessageId(messageId);

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
    this.ensureInitialized();
    this.validateMessageId(messageId);

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
    this.ensureInitialized();
    this.validateMessageId(messageId);
    labels.forEach((l) => this.validateLabelId(l));

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
    this.ensureInitialized();
    this.validateMessageId(messageId);
    labels.forEach((l) => this.validateLabelId(l));

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
    this.ensureInitialized();
    this.validateMessageId(messageId);

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
  // Private Helpers
  // ============================================

  private canonicalToGmailLabel(canonical: string): string | null {
    const upper = canonical.toUpperCase();
    return CANONICAL_TO_GMAIL[upper] || canonical;
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

    // FIX C2: Emails with only custom labels (Label_xyz, STARRED, IMPORTANT)
    // and no system folder label were incorrectly defaulting to INBOX.
    // In Gmail, absence of INBOX = archived.
    return 'ARCHIVE';
  }

  private parseEmailAddress(address: string): { name?: string; email: string } {
    if (!address || !address.trim()) {
      return { email: '' };
    }

    // FIX (2025-01-07): parsing regex to prevent truncation of email addresses
    const match = address.match(/^(.*?)\s*<?([^>]+)>?$/);

    if (match) {
      let name = match[1]?.trim() || undefined;
      const email = match[2]?.trim() || '';

      // Clean quotes from name if present
      if (name && name.startsWith('"') && name.endsWith('"')) {
        name = name.slice(1, -1).trim();
      }

      // Validate that email contains @ symbol
      if (email && email.includes('@')) {
        return { name, email };
      }

      if (name && name.includes('@')) {
        return { email: name };
      }

      if (address.includes('@')) {
        return { email: address.trim() };
      }

      return { name, email: email || address.trim() };
    }

    return { email: address.trim() };
  }

  private parseEmailAddresses(addresses: string): Array<{ name?: string; email: string }> {
    if (!addresses) return [];
    return addresses.split(',').map((addr) => this.parseEmailAddress(addr.trim()));
  }

  // ============================================
  // G-C4 FIX: Input validation helpers
  // ============================================

  /** G-C4: Validate pageToken — base64-encoded, max 500 chars */
  private validatePageToken(token: string | undefined): void {
    if (!token) return;
    if (token.length > 500) {
      throw new Error(`Invalid pageToken: exceeds 500 character limit (got ${token.length})`);
    }
    // Gmail page tokens are base64url-encoded strings
    if (!/^[A-Za-z0-9_\-=:]+$/.test(token)) {
      throw new Error('Invalid pageToken: contains disallowed characters');
    }
  }

  /** G-C4: Validate Gmail messageId — hex string */
  private validateMessageId(messageId: string): void {
    if (!messageId || typeof messageId !== 'string') {
      throw new Error('messageId is required');
    }
    // Gmail message IDs are hex strings (typically 16 chars)
    if (!/^[a-f0-9]+$/i.test(messageId)) {
      throw new Error(`Invalid messageId format: "${messageId}" — expected hex string`);
    }
  }

  /** G-C4: Validate Gmail labelId — system labels are uppercase, custom are Label_* */
  private validateLabelId(labelId: string): void {
    if (!labelId || typeof labelId !== 'string') {
      throw new Error('labelId is required');
    }
    // System labels: INBOX, SENT, DRAFT, TRASH, SPAM, STARRED, IMPORTANT, UNREAD, CATEGORY_*
    // Custom labels: Label_[a-zA-Z0-9]+
    const isSystemLabel = /^[A-Z][A-Z_]*$/.test(labelId);
    const isCustomLabel = /^Label_[a-zA-Z0-9]+$/.test(labelId);
    if (!isSystemLabel && !isCustomLabel) {
      throw new Error(`Invalid labelId format: "${labelId}"`);
    }
  }

  /**
   * G-C4/G-H6: Sanitize user search query to prevent Gmail operator injection.
   * Wraps user input in quotes to prevent operators like `in:`, `from:`, `label:` from
   * being interpreted as Gmail search commands.
   */
  private sanitizeUserQuery(query: string): string {
    // If query already contains Gmail operators, wrap entire query in quotes
    // to treat it as literal text search
    const GMAIL_OPERATORS = /\b(from|to|subject|in|is|has|label|filename|after|before|older|newer|deliveredto|list|cc|bcc|size|larger|smaller|category|rfc822msgid):/i;
    if (GMAIL_OPERATORS.test(query)) {
      // Escape existing quotes and wrap
      return `"${query.replace(/"/g, '')}"`;
    }
    return query;
  }

  private buildSearchQuery(options: ListMessagesOptions): string | null {
    const parts: string[] = [];

    if (options.query) {
      // G-C4/G-H6: Sanitize user-provided search queries
      parts.push(this.sanitizeUserQuery(options.query));
    }

    if (options.onlyUnread) {
      parts.push('is:unread');
    }

    if (options.since) {
      const sinceStr = this.formatSearchDate(options.since);
      parts.push(`after:${sinceStr}`);
    }

    if (options.before) {
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
