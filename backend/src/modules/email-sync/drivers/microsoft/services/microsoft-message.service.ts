import { Injectable, Logger, Scope } from '@nestjs/common';
import { AxiosInstance } from 'axios';
import {
  ListMessagesOptions,
  ListMessagesResult,
  GetMessageOptions,
} from '../../interfaces/email-driver.interface';
import {
  CanonicalMessage,
  AttachmentData,
  CanonicalFolderType,
  EmailAddress,
  folderNameToCanonical,
} from '../../interfaces/canonical.types';
import { withRetry, RetryOptions, microsoftGraphRateLimiter, sleep } from '../../../../../common/utils';

/**
 * MicrosoftMessageService
 *
 * Extracted from MicrosoftDriver - handles message operations for Microsoft Graph API.
 * Covers listing, fetching, batch operations, flags, categories, and attachments.
 *
 * Wave 1 extraction - establishes pattern for subsequent service splits.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class MicrosoftMessageService {
  private readonly logger = new Logger(MicrosoftMessageService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  // State will be set by facade during connect()
  private client: AxiosInstance | null = null;
  private folderIdCache: Map<string, string> = new Map();
  private folderPathCache: Map<string, string> = new Map();
  /** MS-C1 FIX: Token refresh callback for 401 recovery */
  private onTokenRefresh?: () => Promise<void>;

  /**
   * Initialize service with Graph API client and caches
   * Called by facade after authentication
   */
  initialize(
    client: AxiosInstance,
    folderIdCache: Map<string, string>,
    folderPathCache: Map<string, string>,
  ): void {
    this.client = client;
    this.folderIdCache = folderIdCache;
    this.folderPathCache = folderPathCache;
  }

  /** MS-C1 FIX: Set token refresh callback from driver facade */
  setTokenRefreshCallback(callback: () => Promise<void>): void {
    this.onTokenRefresh = callback;
  }

  /**
   * Clear service state on disconnect
   */
  clear(): void {
    this.client = null;
    this.folderIdCache.clear();
    this.folderPathCache.clear();
    this.onTokenRefresh = undefined;
  }

  /**
   * Execute Microsoft Graph API operation with retry logic
   * Uses consolidated common/utils/withRetry
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    // MS-H1 FIX: Acquire rate limiter slot before making Graph API call
    await microsoftGraphRateLimiter.acquire();

    return withRetry(operation, {
      provider: 'microsoft',
      operationName,
      logger: this.logger,
      maxRetries: 3,
      useCircuitBreaker: true,
      onTokenRefresh: this.onTokenRefresh,
      ...options,
    });
  }

  /**
   * MS-H1 FIX: Execute batch POST with rate limiting and 429/Retry-After handling.
   * Batch operations bypass executeWithRetry (they have their own per-request retry logic),
   * but still need rate limiting and 429 protection on the wrapper POST.
   */
  private async postBatch(requests: any[], operationName: string): Promise<any> {
    await microsoftGraphRateLimiter.acquire();
    try {
      return await this.client!.post('/$batch', { requests });
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 429) {
        const retryAfterHeader = error?.response?.headers?.['retry-after'];
        const waitMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 10000;
        this.logger.warn(
          `MS-H1: ${operationName} batch POST 429 — waiting ${waitMs}ms (Retry-After: ${retryAfterHeader || 'unset'})`,
        );
        await sleep(waitMs);
        await microsoftGraphRateLimiter.acquire();
        return this.client!.post('/$batch', { requests });
      }
      throw error;
    }
  }

  /**
   * Ensure client is initialized
   */
  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error('MicrosoftMessageService not initialized. Call initialize() first.');
    }
  }

  // ============================================
  // Message Listing
  // ============================================

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    this.ensureInitialized();

    const folderId = await this.resolveFolderId(options.folder);
    const endpoint = `/me/mailFolders/${folderId}/messages`;

    // FIX Phase 2.3: Cap pageSize to prevent excessive queries
    const MAX_PAGE_SIZE = 500;
    const requestedPageSize = options.pageSize || 50;
    const effectivePageSize = Math.min(Math.max(1, requestedPageSize), MAX_PAGE_SIZE);

    const params: any = {
      $top: effectivePageSize,
      // AI REQUIREMENT: Include 'body' to get full content for embeddings
      // Uses Prefer: outlook.body-content-type="html" header for HTML content
      $select: 'id,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,flag,importance,isDraft,hasAttachments,parentFolderId,categories,internetMessageId',
    };

    if (!options.query) {
      params.$orderby = 'receivedDateTime desc';
    }

    // Build filter
    const filters: string[] = [];
    if (options.onlyUnread) {
      filters.push('isRead eq false');
    }
    if (options.since) {
      filters.push(`receivedDateTime ge ${options.since.toISOString()}`);
    }
    if (options.before) {
      filters.push(`receivedDateTime lt ${options.before.toISOString()}`);
    }
    if (filters.length > 0) {
      params.$filter = filters.join(' and ');
    }

    if (options.query) {
      params.$search = `"${options.query}"`;
    }

    if (options.pageToken) {
      // Microsoft uses @odata.nextLink for pagination
      const response = await this.executeWithRetry(
        () => this.client!.get(options.pageToken!),
        'listMessages:pagination',
      );
      return this.parseMessagesResponse(response.data);
    }

    const response = await this.executeWithRetry(
      () => this.client!.get(endpoint, { params }),
      'listMessages',
    );
    return this.parseMessagesResponse(response.data);
  }

  async getMessage(
    messageId: string,
    options?: GetMessageOptions,
  ): Promise<CanonicalMessage | null> {
    this.ensureInitialized();

    try {
      const select = options?.format === 'minimal'
        ? 'id,subject,from,receivedDateTime,isRead'
        : 'id,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,flag,importance,isDraft,hasAttachments,parentFolderId,categories,internetMessageId,attachments';

      const expand = options?.includeAttachments ? 'attachments' : undefined;

      const response = await this.executeWithRetry(
        () => this.client!.get(`/me/messages/${messageId}`, {
          params: { $select: select, $expand: expand },
        }),
        'getMessage',
      );

      return this.graphMessageToCanonical(response.data);
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * HYBRID SYNC: Explicit full message fetch with body content
   * Use this for on-demand body loading (user views email)
   * Always fetches body regardless of options
   */
  async getMessageWithBody(messageId: string): Promise<CanonicalMessage | null> {
    return this.getMessage(messageId, { format: 'full', includeAttachments: true });
  }

  async getMessageRaw(messageId: string): Promise<string> {
    this.ensureInitialized();

    const response = await this.executeWithRetry(
      () => this.client!.get(`/me/messages/${messageId}/$value`, {
        headers: { Accept: 'message/rfc822' },
        responseType: 'text',
      }),
      'getMessageRaw',
    );

    return response.data;
  }

  // ============================================
  // Batch Operations
  // ============================================

  /**
   * Batch get messages with aggressive memory management for >1000 users
   *
   * MEMORY OPTIMIZATION (2025-01-05):
   * - Smaller batch size (10) to limit peak memory
   * - Explicit null assignment for GC hints
   * - setImmediate to yield to event loop
   */
  async batchGetMessages(messageIds: string[], _includeBody = true): Promise<CanonicalMessage[]> {
    this.ensureInitialized();

    if (messageIds.length === 0) return [];

    // Microsoft Graph batch API - max 20 per request
    // Use 10 for aggressive memory management
    const BATCH_SIZE = 10;
    const messages: CanonicalMessage[] = [];
    const failedIds: Array<{ id: string; error: string; code?: number }> = [];

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batchIds = messageIds.slice(i, i + BATCH_SIZE);

      const requests = batchIds.map((id, index) => ({
        id: String(index),
        method: 'GET',
        url: `/me/messages/${id}`,
      }));

      try {
        let response = await this.postBatch(requests, 'batchGetMessages');

        const batchMessages: Array<CanonicalMessage | null> = new Array(batchIds.length).fill(null);
        // MS-C3 FIX: Collect per-request 401s for targeted retry
        const auth401Indices: number[] = [];
        for (const res of response.data.responses) {
          const index = Number(res.id);
          if (!Number.isInteger(index) || index < 0 || index >= batchIds.length) {
            continue;
          }
          if (res.status === 200 && res.body) {
            batchMessages[index] = this.graphMessageToCanonical(res.body);
          } else if (res.status === 401) {
            auth401Indices.push(index);
          }
        }

        // MS-C3 FIX: Retry 401 requests after token refresh (max 1 retry per batch)
        if (auth401Indices.length > 0 && this.onTokenRefresh) {
          this.logger.warn(
            `batchGetMessages: ${auth401Indices.length}/${batchIds.length} returned 401 — refreshing token and retrying`,
          );
          await this.onTokenRefresh();
          const retryRequests = auth401Indices.map((idx) => ({
            id: String(idx),
            method: 'GET',
            url: `/me/messages/${batchIds[idx]}`,
          }));
          try {
            const retryResponse = await this.postBatch(retryRequests, 'batchGetMessages:401retry');
            for (const res of retryResponse.data.responses) {
              const idx = Number(res.id);
              if (res.status === 200 && res.body) {
                batchMessages[idx] = this.graphMessageToCanonical(res.body);
              }
            }
          } catch (retryErr: any) {
            this.logger.warn(`batchGetMessages: 401 retry batch failed: ${retryErr.message}`);
          }
        }

        for (const msg of batchMessages) {
          if (msg) {
            messages.push(msg);
          }
        }

        // AGGRESSIVE CLEANUP: Clear response reference
        response = null as any;

      } catch (error: any) {
        // FIX CRIT-2 (2025-01-05): Distinguish systemic errors from individual failures
        const statusCode = error?.response?.status || error?.status;

        // Auth errors = don't fallback, throw immediately
        if (statusCode === 401 || statusCode === 403) {
          throw new Error(`Authentication failed during batch fetch. Token may need refresh.`);
        }

        // Rate limit = don't fallback, throw with backoff hint
        if (statusCode === 429) {
          throw new Error(`Rate limited during batch fetch. Retry with backoff.`);
        }

        this.logger.warn(`Batch request failed, falling back to sequential: ${error}`);
        // Fallback to sequential with error tracking
        for (const id of batchIds) {
          try {
            const msg = await this.getMessage(id);
            if (msg) messages.push(msg);
          } catch (seqError: any) {
            // FIX CRIT-2: Track failures instead of swallowing
            const seqStatusCode = seqError?.response?.status || seqError?.status;
            failedIds.push({
              id,
              error: seqError.message || 'Unknown error',
              code: typeof seqStatusCode === 'number' ? seqStatusCode : undefined,
            });
          }
        }
      }

      // Yield to event loop for GC opportunity
      if (i + BATCH_SIZE < messageIds.length) {
        await new Promise<void>(r => setImmediate(r));
      }
    }

    // FIX CRIT-2 (2025-01-05): Report failures instead of silent swallowing
    if (failedIds.length > 0) {
      const failureRate = failedIds.length / messageIds.length;

      // High failure rate (>20%) = something wrong, throw
      if (failureRate > 0.2) {
        throw new Error(
          `Batch fetch failed: ${failedIds.length}/${messageIds.length} messages (${Math.round(failureRate * 100)}% failure rate). IDs: ${failedIds.slice(0, 5).map((f) => f.id).join(', ')}${failedIds.length > 5 ? '...' : ''}`,
        );
      }

      // Low failure rate = log warning but continue
      this.logger.warn(
        `batchGetMessages: ${failedIds.length}/${messageIds.length} messages failed to fetch. ` +
          `Continuing with ${messages.length} successful. Failed IDs: ${failedIds.map((f) => f.id).join(', ')}`,
      );
    }

    return messages;
  }

  async batchSetReadStatus(updates: Array<{ id: string; isRead: boolean }>): Promise<void> {
    this.ensureInitialized();

    const requests = updates.map((update, index) => ({
      id: String(index),
      method: 'PATCH',
      url: `/me/messages/${update.id}`,
      body: { isRead: update.isRead },
      headers: { 'Content-Type': 'application/json' },
    }));

    const BATCH_SIZE = 20;
    const failedIds: Array<{ id: string; status: number; error: string }> = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      const response = await this.postBatch(batch, 'batchSetReadStatus');

      // FIX Phase 2.1: Validate batch responses and track failures
      // MS-C3 FIX: Collect 401s for targeted retry
      const responses = (response).data?.responses || [];
      const auth401Batch: typeof batch = [];
      for (const resp of responses) {
        if (resp.status === 401) {
          auth401Batch.push(batch[parseInt(resp.id, 10)]);
        } else if (resp.status >= 400) {
          const originalIdx = i + parseInt(resp.id, 10);
          failedIds.push({
            id: updates[originalIdx]?.id || resp.id,
            status: resp.status,
            error: resp.body?.error?.message || `HTTP ${resp.status}`,
          });
        }
      }

      // MS-C3 FIX: Retry 401 requests after token refresh
      if (auth401Batch.length > 0 && this.onTokenRefresh) {
        this.logger.warn(
          `batchSetReadStatus: ${auth401Batch.length}/${batch.length} returned 401 — refreshing token and retrying`,
        );
        await this.onTokenRefresh();
        try {
          const retryResponse = await this.postBatch(auth401Batch, 'batchSetReadStatus:401retry');
          for (const resp of (retryResponse).data?.responses || []) {
            if (resp.status >= 400) {
              const originalIdx = i + parseInt(resp.id, 10);
              failedIds.push({
                id: updates[originalIdx]?.id || resp.id,
                status: resp.status,
                error: resp.body?.error?.message || `HTTP ${resp.status} (after 401 retry)`,
              });
            }
          }
        } catch (retryErr: any) {
          this.logger.warn(`batchSetReadStatus: 401 retry failed: ${retryErr.message}`);
          for (const req of auth401Batch) {
            failedIds.push({ id: req.id, status: 401, error: 'Token refresh retry failed' });
          }
        }
      }
    }

    // Log failures and throw if >20% failed
    if (failedIds.length > 0) {
      const failRate = failedIds.length / updates.length;
      this.logger.warn(`batchSetReadStatus: ${failedIds.length}/${updates.length} failed (${(failRate * 100).toFixed(1)}%)`);
      if (failRate > 0.2) {
        throw new Error(`batchSetReadStatus failed: ${failedIds.length}/${updates.length} operations failed (>${20}% threshold)`);
      }
    }
  }

  // ============================================
  // Flags / Status
  // ============================================

  async setReadStatus(messageId: string, isRead: boolean): Promise<void> {
    this.ensureInitialized();

    await this.executeWithRetry(
      () => this.client!.patch(`/me/messages/${messageId}`, { isRead }),
      'setReadStatus',
    );
  }

  async setStarredStatus(messageId: string, isStarred: boolean): Promise<void> {
    this.ensureInitialized();

    await this.executeWithRetry(
      () => this.client!.patch(`/me/messages/${messageId}`, {
        flag: {
          flagStatus: isStarred ? 'flagged' : 'notFlagged',
        },
      }),
      'setStarredStatus',
    );
  }

  async setFlaggedStatus(messageId: string, isFlagged: boolean): Promise<void> {
    this.ensureInitialized();

    await this.executeWithRetry(
      () => this.client!.patch(`/me/messages/${messageId}`, {
        importance: isFlagged ? 'high' : 'normal',
      }),
      'setFlaggedStatus',
    );
  }

  // ============================================
  // Categories (Microsoft's labels)
  // ============================================

  async addLabels(messageId: string, labels: string[]): Promise<void> {
    this.ensureInitialized();

    // Fetch only categories to minimize API response size
    const response = await this.executeWithRetry(
      () => this.client!.get(`/me/messages/${messageId}`, {
        params: { $select: 'categories' },
      }),
      'addLabels:get',
    );
    const currentCategories: string[] = response.data.categories || [];
    const newCategories = [...new Set([...currentCategories, ...labels])];

    await this.executeWithRetry(
      () => this.client!.patch(`/me/messages/${messageId}`, {
        categories: newCategories,
      }),
      'addLabels:patch',
    );
  }

  async removeLabels(messageId: string, labels: string[]): Promise<void> {
    this.ensureInitialized();

    // Fetch only categories to minimize API response size
    const response = await this.executeWithRetry(
      () => this.client!.get(`/me/messages/${messageId}`, {
        params: { $select: 'categories' },
      }),
      'removeLabels:get',
    );
    const currentCategories: string[] = response.data.categories || [];
    const newCategories = currentCategories.filter((c) => !labels.includes(c));

    await this.executeWithRetry(
      () => this.client!.patch(`/me/messages/${messageId}`, {
        categories: newCategories,
      }),
      'removeLabels:patch',
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
   * - Added size validation before binary download
   */
  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    this.ensureInitialized();

    // MEMORY FIX: Add size limit constant
    const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB limit

    const response = await this.executeWithRetry(
      () => this.client!.get(
        `/me/messages/${messageId}/attachments/${attachmentId}`,
        {
          params: { $select: 'id,name,contentType,size,isInline,contentId' },
        },
      ),
      'getAttachment',
    );

    const attachment = response.data;

    // MEMORY FIX: Check attachment size before processing
    const attachmentSize = attachment.size || 0;
    if (attachmentSize > MAX_ATTACHMENT_SIZE) {
      throw new Error(`Attachment exceeds maximum size limit (${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB)`);
    }

    let content = attachment.contentBytes || '';
    const attachmentType = attachment['@odata.type'] || '';
    const canFetchValue = !attachmentType
      || attachmentType.includes('fileAttachment')
      || attachmentType.includes('itemAttachment');

    if (!content && canFetchValue) {
      try {
        const rawResponse = await this.executeWithRetry(
          () => this.client!.get(
            `/me/messages/${messageId}/attachments/${attachmentId}/$value`,
            { responseType: 'arraybuffer' },
          ),
          'getAttachment:value',
        );
        content = Buffer.from(rawResponse.data).toString('base64');
      } catch (error: any) {
        this.logger.warn(`Failed to fetch attachment content for ${attachmentId}: ${error.message}`);
      }
    }

    return {
      id: attachment.id,
      filename: attachment.name,
      mimeType: attachment.contentType,
      size: attachmentSize,
      isInline: attachment.isInline || false,
      contentId: attachment.contentId,
      content,
    };
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async resolveFolderId(folderOrCanonical: string): Promise<string> {
    // Check cache first
    const cached = this.folderIdCache.get(folderOrCanonical.toUpperCase());
    if (cached) return cached;

    // Assume it's already a folder ID if not in cache
    // The actual folder resolution logic is in the driver's folder service
    // This is called from driver context where caches are populated
    return folderOrCanonical;
  }

  private parseMessagesResponse(data: any): ListMessagesResult {
    const messages = (data.value || []).map((msg: any) => this.graphMessageToCanonical(msg));

    return {
      messages,
      nextPageToken: data['@odata.nextLink'],
      hasMore: !!data['@odata.nextLink'],
      totalEstimate: data['@odata.count'],
    };
  }

  private graphMessageToCanonical(message: any): CanonicalMessage {
    // Get canonical folder type (INBOX, SENT, DRAFTS, etc.) for consistent folder field
    const canonicalType = this.parentFolderIdToCanonical(message.parentFolderId);
    // Get actual folder display name for reference
    const folderPath = this.parentFolderIdToPath(message.parentFolderId);

    return {
      id: message.id,
      externalId: message.id,
      threadId: message.conversationId,
      folder: canonicalType,
      folderDisplayName: folderPath || canonicalType,
      from: this.graphAddressToCanonical(message.from?.emailAddress),
      to: (message.toRecipients || []).map((r: any) => this.graphAddressToCanonical(r.emailAddress)),
      cc: (message.ccRecipients || []).map((r: any) => this.graphAddressToCanonical(r.emailAddress)),
      bcc: (message.bccRecipients || []).map((r: any) => this.graphAddressToCanonical(r.emailAddress)),
      subject: message.subject || '(No Subject)',
      messageId: message.internetMessageId,
      // With Prefer: outlook.body-content-type="html" header, body is returned as HTML when available
      bodyText: message.body?.contentType === 'text' ? message.body.content : '',
      bodyHtml: message.body?.contentType === 'html' ? message.body.content : '',
      snippet: message.bodyPreview || '',
      receivedAt: new Date(message.receivedDateTime),
      sentAt: message.sentDateTime ? new Date(message.sentDateTime) : undefined,
      isRead: !!message.isRead,
      isStarred: message.flag?.flagStatus === 'flagged',
      isFlagged: message.importance === 'high',
      isDraft: !!message.isDraft,
      isDeleted: canonicalType === 'TRASH',
      labels: message.categories || [],
      hasAttachments: !!message.hasAttachments,
      attachments: (message.attachments || []).map((att: any) => ({
        id: att.id,
        filename: att.name,
        mimeType: att.contentType,
        size: att.size,
        contentId: att.contentId,
        isInline: att.isInline || false,
      })),
      providerMetadata: {
        changeKey: message['@odata.etag'],
      },
    };
  }

  private parentFolderIdToCanonical(parentFolderId?: string): CanonicalFolderType {
    if (!parentFolderId) return 'INBOX';

    // Check canonical type cache first
    for (const [canonical, folderId] of this.folderIdCache.entries()) {
      if (folderId === parentFolderId) {
        return canonical;
      }
    }

    // Check if we have the path in folderPathCache
    const folderPath = this.folderPathCache.get(parentFolderId);
    if (folderPath) {
      const derivedType = this.displayNameToCanonical(folderPath.split('/').pop() || folderPath);
      if (derivedType !== 'INBOX') {
        return derivedType;
      }
    }

    return 'INBOX';
  }

  private parentFolderIdToPath(parentFolderId?: string): string | undefined {
    if (!parentFolderId) return undefined;
    return this.folderPathCache.get(parentFolderId);
  }

  private displayNameToCanonical(displayName: string): CanonicalFolderType {
    return folderNameToCanonical(displayName);
  }

  private graphAddressToCanonical(address?: { name?: string; address?: string }): EmailAddress {
    const email = address?.address || '';
    const name = address?.name;

    // Validate that email contains @ symbol
    if (email && email.includes('@')) {
      return { name, email };
    }

    // If address field is invalid but name looks like an email, use that
    if (name && name.includes('@')) {
      return { email: name };
    }

    // Return what we have, but this may be a malformed address
    return { name, email: email || name || '' };
  }
}
