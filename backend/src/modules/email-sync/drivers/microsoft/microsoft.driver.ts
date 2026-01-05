import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
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
  ProviderChange,
  MICROSOFT_WELLKNOWN_TO_CANONICAL,
  CANONICAL_TO_MICROSOFT,
  CanonicalFolderType,
  EmailAddress,
  folderNameToCanonical,
} from '../interfaces/canonical.types';

/**
 * Microsoft Outlook Driver
 *
 * Implements IEmailDriver interface for Microsoft Graph API operations.
 * Provides unified email operations using the driver pattern.
 *
 * This driver can be used standalone or alongside existing sync services
 * during the migration period.
 */
@Injectable()
export class MicrosoftDriver extends BaseEmailDriver {
  readonly providerType: ProviderType = 'microsoft';
  private readonly logger = new Logger(MicrosoftDriver.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private client: AxiosInstance | null = null;
  private userEmail: string | null = null;
  private folderIdCache: Map<string, string> = new Map(); // canonical -> folderId
  private folderPathCache: Map<string, string> = new Map(); // folderId -> displayName (path)

  async connect(credentials: DriverCredentials): Promise<void> {
    if (!credentials.accessToken) {
      throw new Error('Access token is required for Microsoft authentication');
    }

    // Q-10 FIX: Add timeout to prevent hanging requests
    this.client = axios.create({
      baseURL: this.GRAPH_API_BASE,
      timeout: 30000, // 30 second timeout for Microsoft Graph API calls
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        // CRITICAL: IdType="ImmutableId" ensures message IDs remain stable when moved between folders
        // Without this, Microsoft Graph returns mutable IDs that change on move operations!
        // Request HTML body content instead of text (Microsoft Graph API default is text)
        'Prefer': 'IdType="ImmutableId", outlook.body-content-type="html"',
      },
    });

    this.credentials = credentials;
    this.connected = true;

    // Use email hint as fallback if provided (for when User.Read scope unavailable)
    if (credentials.emailHint) {
      this.userEmail = credentials.emailHint;
    }

    // Get user email - only try if we don't have an email hint (reduces API calls)
    // The /me endpoint requires User.Read scope which may not always be granted
    // for personal Outlook.com accounts with limited scopes
    if (!this.userEmail) {
      try {
        const profile = await this.client.get('/me', {
          params: { $select: 'mail,userPrincipalName' },
        });
        this.userEmail = profile.data.mail || profile.data.userPrincipalName || null;
      } catch (error: any) {
        // 403 Forbidden is expected when User.Read scope is not available
        if (error.response?.status !== 403) {
          this.logger.warn(`Could not fetch user profile: ${error.response?.status || error.message}`);
        }
        // Continue without user profile - we can still operate on mail folders
      }
    }

    // Cache folder IDs for canonical lookups (Mail.Read/Mail.ReadWrite is sufficient)
    try {
      await this.cacheFolderIds();
    } catch (error: any) {
      // Log but don't fail - folder cache will be populated on first use
      this.logger.debug(`Could not cache folder IDs during connect: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.userEmail = null;
    this.folderIdCache.clear();
    await super.disconnect();
  }

  // ============================================
  // Retry Logic for Rate Limits & Auth Errors
  // ============================================

  /**
   * Execute operation with retry logic for 429 (rate limit) and 401 (auth) errors
   * 
   * HIGH-2 FIX (2025-01-05):
   * - Handles 429 Too Many Requests with exponential backoff
   * - Handles 401 Unauthorized by marking token as expired
   * - Respects Retry-After header when present
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = 3,
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const statusCode = error?.response?.status;

        // 429 Too Many Requests - rate limited, retry with backoff
        if (statusCode === 429 && attempt < maxRetries - 1) {
          const retryAfter = parseInt(error?.response?.headers?.['retry-after'] || '30', 10);
          const backoffMs = Math.min(retryAfter * 1000, 60000); // Max 60s
          this.logger.warn(`[${context}] Rate limited (429), retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }

        // 401 Unauthorized - token expired, mark for refresh
        if (statusCode === 401) {
          this.logger.warn(`[${context}] Token expired (401), refresh required`);
          (error as any).requiresTokenRefresh = true;
          throw error;
        }

        // 5xx Server Errors - retry with exponential backoff
        if (statusCode >= 500 && statusCode < 600 && attempt < maxRetries - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          this.logger.warn(`[${context}] Server error (${statusCode}), retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }

        throw error;
      }
    }
    throw new Error(`[${context}] Max retries (${maxRetries}) exceeded`);
  }

  // ============================================
  // Folder Operations
  // ============================================

  /**
   * List all folders including nested child folders
   * AUDIT FIX #5: Now recursively fetches child folders
   */
  async listFolders(): Promise<CanonicalFolder[]> {
    this.ensureConnected();

    // Fetch top-level folders (handle pagination)
    const topLevelFolders = await this.fetchAllPages('/me/mailFolders', { $top: 100 });
    const allFolders: CanonicalFolder[] = [];

    // Process each folder and fetch children recursively
    for (const folder of topLevelFolders) {
      const canonicalFolder = this.graphFolderToCanonical(folder);
      allFolders.push(canonicalFolder);

      // AUDIT FIX #5: Recursively fetch child folders if they exist
      if (folder.childFolderCount > 0) {
        const children = await this.listChildFolders(folder.id, folder.displayName);
        allFolders.push(...children);
      }
    }

    return allFolders;
  }

  /**
   * Recursively list child folders
   * AUDIT FIX #5: Handles nested folder structure
   */
  private async listChildFolders(parentFolderId: string, parentPath: string): Promise<CanonicalFolder[]> {
    const allChildren: CanonicalFolder[] = [];

    try {
      const childFolders = await this.fetchAllPages(
        `/me/mailFolders/${parentFolderId}/childFolders`,
        { $top: 100 },
      );

      for (const folder of childFolders) {
        // Build full path for nested folders
        const fullPath = `${parentPath}/${folder.displayName}`;
        const canonicalFolder = this.graphFolderToCanonical(folder, fullPath);
        allChildren.push(canonicalFolder);

        // Recursively fetch nested children
        if (folder.childFolderCount > 0) {
          const grandchildren = await this.listChildFolders(folder.id, fullPath);
          allChildren.push(...grandchildren);
        }
      }
    } catch (error: any) {
      this.logger.warn(`Failed to fetch child folders for ${parentFolderId}: ${error.message}`);
    }

    return allChildren;
  }

  async getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null> {
    this.ensureConnected();

    try {
      // Try wellKnownName first (inbox, sentitems, etc.)
      const wellKnownName = CANONICAL_TO_MICROSOFT[folderIdOrPath.toUpperCase()];
      if (wellKnownName) {
        const response = await this.client!.get(`/me/mailFolders/${wellKnownName}`);
        return this.graphFolderToCanonical(response.data);
      }

      // Try by ID
      const response = await this.client!.get(`/me/mailFolders/${folderIdOrPath}`);
      return this.graphFolderToCanonical(response.data);
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async createFolder(name: string, parentId?: string): Promise<CanonicalFolder> {
    this.ensureConnected();

    const endpoint = parentId
      ? `/me/mailFolders/${parentId}/childFolders`
      : '/me/mailFolders';

    const response = await this.client!.post(endpoint, { displayName: name });
    return this.graphFolderToCanonical(response.data);
  }

  async deleteFolder(folderId: string): Promise<void> {
    this.ensureConnected();
    await this.client!.delete(`/me/mailFolders/${folderId}`);
  }

  async renameFolder(folderId: string, newName: string): Promise<void> {
    this.ensureConnected();
    await this.client!.patch(`/me/mailFolders/${folderId}`, { displayName: newName });
  }

  // ============================================
  // Message Listing
  // ============================================

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    this.ensureConnected();

    const folderId = await this.resolveFolderId(options.folder);
    const endpoint = `/me/mailFolders/${folderId}/messages`;

    const params: any = {
      $top: options.pageSize || 50,
      // Include 'body' to get full HTML/text content (uses Prefer: outlook.body-content-type="html" header)
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
      const response = await this.client!.get(options.pageToken);
      return this.parseMessagesResponse(response.data);
    }

    const response = await this.client!.get(endpoint, { params });
    return this.parseMessagesResponse(response.data);
  }

  async getMessage(
    messageId: string,
    options?: GetMessageOptions,
  ): Promise<CanonicalMessage | null> {
    this.ensureConnected();

    try {
      const select = options?.format === 'minimal'
        ? 'id,subject,from,receivedDateTime,isRead'
        : 'id,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,flag,importance,isDraft,hasAttachments,parentFolderId,categories,internetMessageId,attachments';

      const expand = options?.includeAttachments ? 'attachments' : undefined;

      const response = await this.client!.get(`/me/messages/${messageId}`, {
        params: { $select: select, $expand: expand },
      });

      return this.graphMessageToCanonical(response.data);
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getMessageRaw(messageId: string): Promise<string> {
    this.ensureConnected();

    const response = await this.client!.get(`/me/messages/${messageId}/$value`, {
      headers: { Accept: 'message/rfc822' },
      responseType: 'text',
    });

    return response.data;
  }

  // ============================================
  // Message Mutations
  // ============================================

  async sendMessage(message: ComposeMessage): Promise<string> {
    this.ensureConnected();

    const graphMessage = this.composeToGraphMessage(message);

    // BUG-3 FIX: Microsoft Graph's /me/sendMail returns 202 Accepted with no body
    // Use save-then-send pattern to get the message ID:
    // 1. Create draft in Drafts folder (returns message ID)
    // 2. Send the draft (moves to Sent Items)
    const draftResponse = await this.client!.post('/me/messages', graphMessage);
    const messageId = draftResponse.data.id;

    // Send the draft
    await this.client!.post(`/me/messages/${messageId}/send`);

    return messageId;
  }

  async saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string> {
    this.ensureConnected();

    const graphMessage = this.composeToGraphMessage(message);

    if (existingDraftId) {
      await this.client!.patch(`/me/messages/${existingDraftId}`, graphMessage);
      return existingDraftId;
    }

    const response = await this.client!.post('/me/messages', graphMessage);
    return response.data.id;
  }

  async sendDraft(draftId: string): Promise<void> {
    this.ensureConnected();
    await this.client!.post(`/me/messages/${draftId}/send`);
  }

  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    this.ensureConnected();

    const destinationId = await this.resolveFolderId(targetFolder);

    await this.client!.post(`/me/messages/${messageId}/move`, {
      destinationId,
    });
  }

  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    this.ensureConnected();

    const destinationId = await this.resolveFolderId(targetFolder);

    const response = await this.client!.post(`/me/messages/${messageId}/copy`, {
      destinationId,
    });

    return response.data.id;
  }

  async deleteMessage(messageId: string, permanent = false): Promise<void> {
    this.ensureConnected();

    if (permanent) {
      await this.client!.delete(`/me/messages/${messageId}`);
    } else {
      // Move to deleted items
      const trashId = await this.resolveFolderId('TRASH');
      await this.client!.post(`/me/messages/${messageId}/move`, {
        destinationId: trashId,
      });
    }
  }

  // ============================================
  // Flags / Status
  // ============================================

  async setReadStatus(messageId: string, isRead: boolean): Promise<void> {
    this.ensureConnected();

    await this.client!.patch(`/me/messages/${messageId}`, { isRead });
  }

  async setStarredStatus(messageId: string, isStarred: boolean): Promise<void> {
    this.ensureConnected();

    await this.client!.patch(`/me/messages/${messageId}`, {
      flag: {
        flagStatus: isStarred ? 'flagged' : 'notFlagged',
      },
    });
  }

  async setFlaggedStatus(messageId: string, isFlagged: boolean): Promise<void> {
    this.ensureConnected();

    await this.client!.patch(`/me/messages/${messageId}`, {
      importance: isFlagged ? 'high' : 'normal',
    });
  }

  // ============================================
  // Categories (Microsoft's labels)
  // ============================================

  async addLabels(messageId: string, labels: string[]): Promise<void> {
    this.ensureConnected();

    // Fetch only categories to minimize API response size
    // Note: format: 'minimal' doesn't include categories, so we use a direct call
    const response = await this.client!.get(`/me/messages/${messageId}`, {
      params: { $select: 'categories' },
    });
    const currentCategories: string[] = response.data.categories || [];
    const newCategories = [...new Set([...currentCategories, ...labels])];

    await this.client!.patch(`/me/messages/${messageId}`, {
      categories: newCategories,
    });
  }

  async removeLabels(messageId: string, labels: string[]): Promise<void> {
    this.ensureConnected();

    // Fetch only categories to minimize API response size
    // Note: format: 'minimal' doesn't include categories, so we use a direct call
    const response = await this.client!.get(`/me/messages/${messageId}`, {
      params: { $select: 'categories' },
    });
    const currentCategories: string[] = response.data.categories || [];
    const newCategories = currentCategories.filter((c) => !labels.includes(c));

    await this.client!.patch(`/me/messages/${messageId}`, {
      categories: newCategories,
    });
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
    this.ensureConnected();

    // MEMORY FIX: Add size limit constant
    const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB limit

    const response = await this.client!.get(
      `/me/messages/${messageId}/attachments/${attachmentId}`,
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
        const rawResponse = await this.client!.get(
          `/me/messages/${messageId}/attachments/${attachmentId}/$value`,
          { responseType: 'arraybuffer' },
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
  // User Info
  // ============================================

  async getUserInfo(): Promise<{ email: string; name: string; photo?: string }> {
    this.ensureConnected();

    try {
      const response = await this.client!.get('/me', {
        params: { $select: 'mail,userPrincipalName,displayName' },
      });

      return {
        email: response.data.mail || response.data.userPrincipalName || this.userEmail || '',
        name: response.data.displayName || '',
        photo: undefined, // Would need separate call to /me/photo
      };
    } catch (error: any) {
      // 403 can happen if User.Read scope is not consented
      // Fall back to cached email from connect
      if (error.response?.status === 403 && this.userEmail) {
        this.logger.warn('getUserInfo: User.Read scope not available, using cached email');
        return {
          email: this.userEmail,
          name: this.userEmail.split('@')[0],
          photo: undefined,
        };
      }
      throw error;
    }
  }

  // ============================================
  // Delta Sync
  // ============================================

  async getInitialSyncToken(): Promise<string> {
    this.ensureConnected();

    // Microsoft uses delta links for incremental sync
    let nextUrl: string | null = '/me/mailFolders/inbox/messages/delta';
    let params: Record<string, any> | undefined = { $select: 'id' };
    const MAX_PAGES = 50;

    for (let page = 0; nextUrl && page < MAX_PAGES; page += 1) {
      const isAbsolute = /^https?:/i.test(nextUrl);
      const response: AxiosResponse<any> = await this.client!.get(
        nextUrl,
        isAbsolute ? { baseURL: '' } : { params },
      );
      const deltaLink = response.data['@odata.deltaLink'];
      if (deltaLink) {
        return deltaLink;
      }
      nextUrl = response.data['@odata.nextLink'] || null;
      params = undefined;
    }

    this.logger.warn('Could not resolve deltaLink for initial sync');
    return '';
  }

  async getChangesSince(syncToken: string): Promise<ChangesResult> {
    this.ensureConnected();

    const changes: ProviderChange[] = [];
    let deltaLink = syncToken;
    let hasMore = false;

    // Validate syncToken format - must be a full delta URL
    // Legacy format was timestamp (e.g., "2025-12-11T17:17:57Z") - these are invalid
    if (!deltaLink.includes('graph.microsoft.com') || !deltaLink.includes('delta')) {
      this.logger.warn(
        `Invalid syncToken format (expected deltaLink URL): ${deltaLink.substring(0, 50)}...`,
      );
      this.logger.warn('Treating as expired token, returning empty changes');
      deltaLink = await this.getInitialSyncToken();
      return {
        changes: [],
        newSyncToken: deltaLink,
        hasMore: false,
      };
    }

    try {
      // Delta sync using the deltaLink URL
      // Must use absolute URL, not relative path
      const response = await this.client!.get(deltaLink, {
        baseURL: '', // Override baseURL to use absolute deltaLink
      });

      const items = response.data.value || [];

      for (const item of items) {
        if (item['@removed']) {
          // Deleted message
          changes.push({
            messageId: item.id,
            type: 'deleted',
            timestamp: new Date(),
          });
        } else if (item.id) {
          // Added or modified message
          // Microsoft doesn't distinguish between added/modified in delta
          // We treat all as "modified" - the sync service will check if it's new
          changes.push({
            messageId: item.id,
            type: 'modified',
            timestamp: new Date(item.receivedDateTime || new Date()),
          });
        }
      }

      const nextLink = response.data['@odata.nextLink'];
      const deltaLinkResponse = response.data['@odata.deltaLink'];
      const newSyncToken = nextLink || deltaLinkResponse || deltaLink;

      // Check if there are more pages (@odata.nextLink)
      hasMore = !!nextLink;

      return {
        changes,
        newSyncToken,
        hasMore,
      };

    } catch (error: any) {
      // Handle 410 Gone or 400 Bad Request - delta token expired or invalid
      if (error.response?.status === 410 || error.response?.status === 400) {
        this.logger.warn(
          `Delta token expired or invalid (${error.response.status}), returning empty changes`,
        );
        // Get new delta token
        deltaLink = await this.getInitialSyncToken();
        return {
          changes: [],
          newSyncToken: deltaLink,
          hasMore: false,
        };
      }
      throw error;
    }
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
  async batchGetMessages(messageIds: string[]): Promise<CanonicalMessage[]> {
    this.ensureConnected();

    if (messageIds.length === 0) return [];

    // Microsoft Graph batch API - max 20 per request
    // Use 10 for aggressive memory management
    const BATCH_SIZE = 10;
    const messages: CanonicalMessage[] = [];

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batchIds = messageIds.slice(i, i + BATCH_SIZE);

      const requests = batchIds.map((id, index) => ({
        id: String(index),
        method: 'GET',
        url: `/me/messages/${id}`,
      }));

      try {
        let response = await this.client!.post('/$batch', { requests });

        for (const res of response.data.responses) {
          if (res.status === 200 && res.body) {
            messages.push(this.graphMessageToCanonical(res.body));
          }
        }

        // AGGRESSIVE CLEANUP: Clear response reference
        response = null as any;

      } catch (error) {
        this.logger.warn(`Batch request failed, falling back to sequential: ${error}`);
        // Fallback to sequential with cleanup
        for (const id of batchIds) {
          try {
            const msg = await this.getMessage(id);
            if (msg) messages.push(msg);
          } catch {
            // Skip failed messages
          }
        }
      }

      // Yield to event loop for GC opportunity
      if (i + BATCH_SIZE < messageIds.length) {
        await new Promise<void>(r => setImmediate(r));
      }
    }

    return messages;
  }

  async batchSetReadStatus(updates: Array<{ id: string; isRead: boolean }>): Promise<void> {
    this.ensureConnected();

    const requests = updates.map((update, index) => ({
      id: String(index),
      method: 'PATCH',
      url: `/me/messages/${update.id}`,
      body: { isRead: update.isRead },
      headers: { 'Content-Type': 'application/json' },
    }));

    const BATCH_SIZE = 20;
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      await this.client!.post('/$batch', { requests: batch });
    }
  }

  async batchMoveMessages(messageIds: string[], targetFolder: string): Promise<void> {
    this.ensureConnected();

    const destinationId = await this.resolveFolderId(targetFolder);

    const requests = messageIds.map((id, index) => ({
      id: String(index),
      method: 'POST',
      url: `/me/messages/${id}/move`,
      body: { destinationId },
      headers: { 'Content-Type': 'application/json' },
    }));

    const BATCH_SIZE = 20;
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      await this.client!.post('/$batch', { requests: batch });
    }
  }

  async batchDeleteMessages(messageIds: string[], permanent = false): Promise<void> {
    this.ensureConnected();

    if (permanent) {
      const requests = messageIds.map((id, index) => ({
        id: String(index),
        method: 'DELETE',
        url: `/me/messages/${id}`,
      }));

      const BATCH_SIZE = 20;
      for (let i = 0; i < requests.length; i += BATCH_SIZE) {
        const batch = requests.slice(i, i + BATCH_SIZE);
        await this.client!.post('/$batch', { requests: batch });
      }
    } else {
      await this.batchMoveMessages(messageIds, 'TRASH');
    }
  }

  // ============================================
  // User Info / Aliases
  // ============================================

  /**
   * Get email aliases for Microsoft account
   * 
   * CRIT-3 FIX (2025-01-05):
   * - Implements getEmailAliases() for API parity with Gmail/IMAP drivers
   * - Uses Microsoft Graph mailboxSettings or /me endpoint
   */
  async getEmailAliases(): Promise<Array<{ email: string; name?: string; isPrimary: boolean }>> {
    this.ensureConnected();

    try {
      const userInfo = await this.getUserInfo();

      // Microsoft Graph doesn't easily expose aliases like Gmail
      // Return primary email from user info
      return [{
        email: userInfo.email,
        name: userInfo.name,
        isPrimary: true,
      }];
    } catch {
      // Fallback
      return [{ email: this.credentials?.emailHint || '', isPrimary: true }];
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async fetchAllPages<T = any>(
    initialUrl: string,
    params?: Record<string, any>,
  ): Promise<T[]> {
    const items: T[] = [];
    let nextUrl: string | null = initialUrl;
    let nextParams = params;
    const MAX_PAGES = 50;

    for (let page = 0; nextUrl && page < MAX_PAGES; page += 1) {
      const isAbsolute = /^https?:/i.test(nextUrl);
      const response: AxiosResponse<any> = await this.client!.get(
        nextUrl,
        isAbsolute ? { baseURL: '' } : { params: nextParams },
      );
      items.push(...(response.data.value || []));
      nextUrl = response.data['@odata.nextLink'] || null;
      nextParams = undefined;
    }

    if (nextUrl) {
      this.logger.warn(`Pagination exceeded ${MAX_PAGES} pages for ${initialUrl}`);
    }

    return items;
  }

  private async cacheFolderIds(): Promise<void> {
    try {
      const folders = await this.listFolders();
      for (const folder of folders) {
        if (folder.type) {
          this.folderIdCache.set(folder.type.toUpperCase(), folder.id);
        }
        // Cache folderId -> path (displayName) for email folder mapping
        if (folder.id && folder.path) {
          this.folderPathCache.set(folder.id, folder.path);
        }
      }
    } catch {
      this.logger.warn('Could not cache folder IDs');
    }
  }

  private async resolveFolderId(folderOrCanonical: string): Promise<string> {
    // Check cache first
    const cached = this.folderIdCache.get(folderOrCanonical.toUpperCase());
    if (cached) return cached;

    // Try wellKnownName
    const wellKnown = CANONICAL_TO_MICROSOFT[folderOrCanonical.toUpperCase()];
    if (wellKnown) {
      try {
        const folder = await this.getFolder(wellKnown);
        if (folder) {
          this.folderIdCache.set(folderOrCanonical.toUpperCase(), folder.id);
          return folder.id;
        }
      } catch {
        // Folder doesn't exist
      }
    }

    // Assume it's already a folder ID
    return folderOrCanonical;
  }

  /**
   * Convert Graph API folder to canonical format
   * AUDIT FIX #5: Accept optional fullPath for nested folders
   */
  private graphFolderToCanonical(folder: any, fullPath?: string): CanonicalFolder {
    const type = this.wellKnownToCanonical(folder.wellKnownName, folder.displayName);
    // Use provided fullPath for nested folders, otherwise use displayName
    const path = fullPath || folder.displayName;

    return {
      id: folder.id,
      externalId: folder.id,
      name: folder.displayName,
      type,
      path,
      parentId: folder.parentFolderId,
      unreadCount: folder.unreadItemCount || 0,
      totalCount: folder.totalItemCount || 0,
      attributes: {
        selectable: true,
        hasChildren: folder.childFolderCount > 0,
        subscribed: true,
      },
    };
  }

  private wellKnownToCanonical(wellKnownName?: string, displayName?: string): CanonicalFolderType {
    if (wellKnownName) {
      const canonical = MICROSOFT_WELLKNOWN_TO_CANONICAL[wellKnownName.toLowerCase()];
      if (canonical) return canonical;
    }

    // Fallback to display name heuristics
    if (displayName) {
      return this.displayNameToCanonical(displayName);
    }

    return displayName || 'INBOX';
  }

  private displayNameToCanonical(displayName: string): CanonicalFolderType {
    return folderNameToCanonical(displayName);
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
    // Get actual folder display name for reference (e.g., "Inbox", "Sent Items")
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
      // Don't use text content as fallback for bodyHtml - keep them separate
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

  /**
   * Convert parentFolderId to canonical folder type
   * AUDIT FIX #5: Check path cache and attempt fallback fetch on cache miss
   */
  private parentFolderIdToCanonical(parentFolderId?: string): CanonicalFolderType {
    if (!parentFolderId) return 'INBOX';

    // Check canonical type cache first
    for (const [canonical, folderId] of this.folderIdCache.entries()) {
      if (folderId === parentFolderId) {
        return canonical;
      }
    }

    // AUDIT FIX #5: Check if we have the path in folderPathCache
    // This helps with nested folders that may not have a canonical type
    const folderPath = this.folderPathCache.get(parentFolderId);
    if (folderPath) {
      // Try to derive canonical type from the folder path
      const derivedType = this.displayNameToCanonical(folderPath.split('/').pop() || folderPath);
      if (derivedType !== 'INBOX') {
        return derivedType;
      }
    }

    // Default to INBOX for unknown folders
    // Note: In async context, could fetch folder details here,
    // but this is called synchronously from message conversion
    return 'INBOX';
  }

  /**
   * Convert Graph API parentFolderId to the actual folder path (displayName).
   * This is used to store emails with the correct folder path that matches
   * the folders table in the database.
   */
  private parentFolderIdToPath(parentFolderId?: string): string | undefined {
    if (!parentFolderId) return undefined;
    return this.folderPathCache.get(parentFolderId);
  }

  private graphAddressToCanonical(address?: { name?: string; address?: string }): EmailAddress {
    const email = address?.address || '';
    const name = address?.name;

    // Validate that email contains @ symbol - otherwise it's likely malformed
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

  private composeToGraphMessage(message: ComposeMessage): any {
    const graphMessage: any = {
      subject: message.subject,
      body: {
        contentType: 'html',
        content: message.bodyHtml,
      },
      toRecipients: message.to.map((addr) => ({
        emailAddress: { name: addr.name, address: addr.email },
      })),
      ccRecipients: message.cc?.map((addr) => ({
        emailAddress: { name: addr.name, address: addr.email },
      })),
      bccRecipients: message.bcc?.map((addr) => ({
        emailAddress: { name: addr.name, address: addr.email },
      })),
    };

    // Add attachments if present (per Microsoft Graph API spec)
    if (message.attachments?.length) {
      graphMessage.attachments = message.attachments.map((att) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.mimeType,
        contentBytes: att.content, // Already base64 encoded
      }));
    }

    // Threading
    if (message.inReplyTo) {
      graphMessage.internetMessageHeaders = [
        { name: 'In-Reply-To', value: message.inReplyTo },
        ...(message.references ? [{ name: 'References', value: message.references }] : []),
      ];
    }

    return graphMessage;
  }
}
