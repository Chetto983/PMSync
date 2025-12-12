import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
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

  async connect(credentials: DriverCredentials): Promise<void> {
    if (!credentials.accessToken) {
      throw new Error('Access token is required for Microsoft authentication');
    }

    this.client = axios.create({
      baseURL: this.GRAPH_API_BASE,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
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
  // Folder Operations
  // ============================================

  async listFolders(): Promise<CanonicalFolder[]> {
    this.ensureConnected();

    // Note: Don't use $select with wellKnownName - not available for personal Outlook.com accounts
    const response = await this.client!.get('/me/mailFolders', {
      params: {
        $top: 100,
      },
    });

    const folders = response.data.value || [];
    return folders.map((folder: any) => this.graphFolderToCanonical(folder));
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
      $select: 'id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,flag,importance,isDraft,hasAttachments,parentFolderId,categories,internetMessageId',
      $orderby: 'receivedDateTime desc',
    };

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

    const response = await this.client!.post('/me/sendMail', {
      message: graphMessage,
      saveToSentItems: true,
    });

    // sendMail doesn't return ID, return empty string
    return response.data?.id || '';
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

    const message = await this.getMessage(messageId, { format: 'minimal' });
    const currentCategories = message?.labels || [];
    const newCategories = [...new Set([...currentCategories, ...labels])];

    await this.client!.patch(`/me/messages/${messageId}`, {
      categories: newCategories,
    });
  }

  async removeLabels(messageId: string, labels: string[]): Promise<void> {
    this.ensureConnected();

    const message = await this.getMessage(messageId, { format: 'minimal' });
    const currentCategories = message?.labels || [];
    const newCategories = currentCategories.filter((c) => !labels.includes(c));

    await this.client!.patch(`/me/messages/${messageId}`, {
      categories: newCategories,
    });
  }

  // ============================================
  // Attachments
  // ============================================

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    this.ensureConnected();

    const response = await this.client!.get(
      `/me/messages/${messageId}/attachments/${attachmentId}`,
    );

    const attachment = response.data;

    return {
      id: attachment.id,
      filename: attachment.name,
      mimeType: attachment.contentType,
      size: attachment.size,
      isInline: attachment.isInline || false,
      contentId: attachment.contentId,
      content: attachment.contentBytes || '',
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
    const response = await this.client!.get('/me/mailFolders/inbox/messages/delta', {
      params: { $select: 'id' },
    });

    // Return the deltaLink as sync token
    return response.data['@odata.deltaLink'] || '';
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

      // Get new delta link for next sync
      deltaLink = response.data['@odata.deltaLink'] || deltaLink;

      // Check if there are more pages (@odata.nextLink)
      hasMore = !!response.data['@odata.nextLink'];

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

    return {
      changes,
      newSyncToken: deltaLink,
      hasMore,
    };
  }

  // ============================================
  // Batch Operations
  // ============================================

  async batchGetMessages(messageIds: string[]): Promise<CanonicalMessage[]> {
    this.ensureConnected();

    // Microsoft Graph batch API
    const requests = messageIds.map((id, index) => ({
      id: String(index),
      method: 'GET',
      url: `/me/messages/${id}`,
    }));

    // Batch size limit is 20
    const BATCH_SIZE = 20;
    const messages: CanonicalMessage[] = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);

      try {
        const response = await this.client!.post('/$batch', { requests: batch });

        for (const res of response.data.responses) {
          if (res.status === 200 && res.body) {
            messages.push(this.graphMessageToCanonical(res.body));
          }
        }
      } catch (error) {
        this.logger.warn(`Batch request failed, falling back to sequential: ${error}`);
        // Fallback to sequential
        for (const req of batch) {
          try {
            const msg = await this.getMessage(messageIds[parseInt(req.id)]);
            if (msg) messages.push(msg);
          } catch {
            // Skip failed messages
          }
        }
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
  // Private Helpers
  // ============================================

  private async cacheFolderIds(): Promise<void> {
    try {
      const folders = await this.listFolders();
      for (const folder of folders) {
        if (folder.type) {
          this.folderIdCache.set(folder.type.toUpperCase(), folder.id);
        }
      }
    } catch (_error) {
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

  private graphFolderToCanonical(folder: any): CanonicalFolder {
    const type = this.wellKnownToCanonical(folder.wellKnownName, folder.displayName);

    return {
      id: folder.id,
      externalId: folder.id,
      name: folder.displayName,
      type,
      path: folder.displayName,
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
    const lowerName = displayName.toLowerCase().trim();

    // Inbox variations
    if (lowerName === 'inbox' || lowerName === 'posta in arrivo' || lowerName === 'posteingang') {
      return 'INBOX';
    }

    // Sent variations
    if (['sent items', 'sentitems', 'sent', 'posta inviata', 'inviata', 'elementi inviati'].includes(lowerName)) {
      return 'SENT';
    }

    // Trash variations
    if (['deleted items', 'deleteditems', 'trash', 'posta eliminata', 'cestino', 'eliminata'].includes(lowerName)) {
      return 'TRASH';
    }

    // Drafts variations
    if (['drafts', 'bozze', 'draft'].includes(lowerName)) {
      return 'DRAFTS';
    }

    // Spam/Junk variations
    if (['junk email', 'junk', 'spam', 'posta indesiderata'].includes(lowerName)) {
      return 'SPAM';
    }

    // Archive variations
    if (['archive', 'archivia', 'archivio', 'all mail'].includes(lowerName)) {
      return 'ARCHIVE';
    }

    return displayName.toUpperCase();
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
    const folder = this.parentFolderIdToCanonical(message.parentFolderId);

    return {
      id: message.id,
      externalId: message.id,
      threadId: message.conversationId,
      folder,
      folderDisplayName: folder,
      from: this.graphAddressToCanonical(message.from?.emailAddress),
      to: (message.toRecipients || []).map((r: any) => this.graphAddressToCanonical(r.emailAddress)),
      cc: (message.ccRecipients || []).map((r: any) => this.graphAddressToCanonical(r.emailAddress)),
      bcc: (message.bccRecipients || []).map((r: any) => this.graphAddressToCanonical(r.emailAddress)),
      subject: message.subject || '(No Subject)',
      messageId: message.internetMessageId,
      bodyText: message.body?.contentType === 'text' ? message.body.content : '',
      bodyHtml: message.body?.contentType === 'html' ? message.body.content : message.body?.content || '',
      snippet: message.bodyPreview || '',
      receivedAt: new Date(message.receivedDateTime),
      sentAt: message.sentDateTime ? new Date(message.sentDateTime) : undefined,
      isRead: !!message.isRead,
      isStarred: message.flag?.flagStatus === 'flagged',
      isFlagged: message.importance === 'high',
      isDraft: !!message.isDraft,
      isDeleted: folder === 'TRASH',
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

    // Check cache
    for (const [canonical, folderId] of this.folderIdCache.entries()) {
      if (folderId === parentFolderId) {
        return canonical;
      }
    }

    return 'INBOX';
  }

  private graphAddressToCanonical(address?: { name?: string; address?: string }): EmailAddress {
    return {
      name: address?.name,
      email: address?.address || '',
    };
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
