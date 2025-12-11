import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1, google } from 'googleapis';
import {
  IEmailDriver,
  BaseEmailDriver,
  DriverCredentials,
  ListMessagesOptions,
  ListMessagesResult,
  GetMessageOptions,
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
} from '../interfaces/canonical.types';

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
    try {
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      this.userEmail = profile.data.emailAddress || null;
    } catch (error) {
      this.logger.warn('Could not fetch user profile during connect');
    }
  }

  async disconnect(): Promise<void> {
    this.gmail = null;
    this.userEmail = null;
    await super.disconnect();
  }

  // ============================================
  // Folder Operations
  // ============================================

  async listFolders(): Promise<CanonicalFolder[]> {
    this.ensureConnected();

    const response = await this.gmail!.users.labels.list({ userId: 'me' });
    const labels = response.data.labels || [];

    return labels
      .filter((label) => label.id && label.name)
      .map((label) => this.labelToCanonicalFolder(label));
  }

  async getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null> {
    this.ensureConnected();

    try {
      // Try to get by label ID first
      const response = await this.gmail!.users.labels.get({
        userId: 'me',
        id: folderIdOrPath,
      });

      if (response.data) {
        return this.labelToCanonicalFolder(response.data);
      }
    } catch {
      // If not found by ID, search by name
      const allLabels = await this.listFolders();
      return allLabels.find(
        (f) => f.name.toLowerCase() === folderIdOrPath.toLowerCase() ||
               f.type.toLowerCase() === folderIdOrPath.toLowerCase()
      ) || null;
    }

    return null;
  }

  async createFolder(name: string, _parentId?: string): Promise<CanonicalFolder> {
    this.ensureConnected();

    const response = await this.gmail!.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });

    return this.labelToCanonicalFolder(response.data);
  }

  async deleteFolder(folderId: string): Promise<void> {
    this.ensureConnected();

    await this.gmail!.users.labels.delete({
      userId: 'me',
      id: folderId,
    });
  }

  async renameFolder(folderId: string, newName: string): Promise<void> {
    this.ensureConnected();

    await this.gmail!.users.labels.patch({
      userId: 'me',
      id: folderId,
      requestBody: { name: newName },
    });
  }

  // ============================================
  // Message Listing
  // ============================================

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    this.ensureConnected();

    const labelId = this.canonicalToGmailLabel(options.folder);
    const query = this.buildSearchQuery(options);

    const response = await this.gmail!.users.messages.list({
      userId: 'me',
      labelIds: labelId ? [labelId] : undefined,
      maxResults: options.pageSize || 50,
      pageToken: options.pageToken,
      q: query || undefined,
    });

    const messageRefs = response.data.messages || [];
    const messages: CanonicalMessage[] = [];

    // Fetch full message details for each
    for (const ref of messageRefs) {
      if (ref.id) {
        const msg = await this.getMessage(ref.id, { includeBody: true });
        if (msg) {
          messages.push(msg);
        }
      }
    }

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
      const response = await this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format,
      });

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

    const response = await this.gmail!.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'raw',
    });

    return response.data.raw || '';
  }

  // ============================================
  // Message Mutations
  // ============================================

  async sendMessage(message: ComposeMessage): Promise<string> {
    this.ensureConnected();

    const raw = this.composeToRaw(message);

    const response = await this.gmail!.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId: message.threadId,
      },
    });

    return response.data.id || '';
  }

  async saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string> {
    this.ensureConnected();

    const raw = this.composeToRaw(message);

    if (existingDraftId) {
      const response = await this.gmail!.users.drafts.update({
        userId: 'me',
        id: existingDraftId,
        requestBody: {
          message: { raw, threadId: message.threadId },
        },
      });
      return response.data.id || existingDraftId;
    }

    const response = await this.gmail!.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw, threadId: message.threadId },
      },
    });

    return response.data.id || '';
  }

  async sendDraft(draftId: string): Promise<void> {
    this.ensureConnected();

    await this.gmail!.users.drafts.send({
      userId: 'me',
      requestBody: { id: draftId },
    });
  }

  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    this.ensureConnected();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    // Get current labels
    const message = await this.gmail!.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'minimal',
    });

    const currentLabels = message.data.labelIds || [];

    // Remove all folder labels except UNREAD, STARRED, IMPORTANT
    const systemLabels = ['UNREAD', 'STARRED', 'IMPORTANT'];
    const labelsToRemove = currentLabels.filter(
      (l) => !systemLabels.includes(l) && l !== targetLabelId
    );

    await this.gmail!.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: targetLabelId ? [targetLabelId] : [],
        removeLabelIds: labelsToRemove,
      },
    });
  }

  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    this.ensureConnected();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    // Gmail doesn't have copy - we add the label instead
    await this.gmail!.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: targetLabelId ? [targetLabelId] : [],
      },
    });

    return messageId; // Same message, just with additional label
  }

  async deleteMessage(messageId: string, permanent = false): Promise<void> {
    this.ensureConnected();

    if (permanent) {
      await this.gmail!.users.messages.delete({
        userId: 'me',
        id: messageId,
      });
    } else {
      await this.gmail!.users.messages.trash({
        userId: 'me',
        id: messageId,
      });
    }
  }

  // ============================================
  // Flags / Status
  // ============================================

  async setReadStatus(messageId: string, isRead: boolean): Promise<void> {
    this.ensureConnected();

    await this.gmail!.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: isRead ? [] : ['UNREAD'],
        removeLabelIds: isRead ? ['UNREAD'] : [],
      },
    });
  }

  async setStarredStatus(messageId: string, isStarred: boolean): Promise<void> {
    this.ensureConnected();

    await this.gmail!.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: isStarred ? ['STARRED'] : [],
        removeLabelIds: isStarred ? [] : ['STARRED'],
      },
    });
  }

  async setFlaggedStatus(messageId: string, isFlagged: boolean): Promise<void> {
    this.ensureConnected();

    await this.gmail!.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: isFlagged ? ['IMPORTANT'] : [],
        removeLabelIds: isFlagged ? [] : ['IMPORTANT'],
      },
    });
  }

  // ============================================
  // Labels
  // ============================================

  async addLabels(messageId: string, labels: string[]): Promise<void> {
    this.ensureConnected();

    await this.gmail!.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: labels,
      },
    });
  }

  async removeLabels(messageId: string, labels: string[]): Promise<void> {
    this.ensureConnected();

    await this.gmail!.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: labels,
      },
    });
  }

  // ============================================
  // Attachments
  // ============================================

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    this.ensureConnected();

    const response = await this.gmail!.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    // Get message to find attachment metadata
    const message = await this.gmail!.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const attachmentMeta = this.findAttachmentMeta(message.data, attachmentId);

    return {
      id: attachmentId,
      filename: attachmentMeta?.filename || 'attachment',
      mimeType: attachmentMeta?.mimeType || 'application/octet-stream',
      size: response.data.size || 0,
      isInline: attachmentMeta?.isInline || false,
      contentId: attachmentMeta?.contentId,
      content: response.data.data || '',
    };
  }

  // ============================================
  // User Info
  // ============================================

  async getUserInfo(): Promise<{ email: string; name: string; photo?: string }> {
    this.ensureConnected();

    const response = await this.gmail!.users.getProfile({ userId: 'me' });

    return {
      email: response.data.emailAddress || this.userEmail || '',
      name: response.data.emailAddress?.split('@')[0] || '',
      photo: undefined, // Gmail API doesn't provide photo
    };
  }

  async getEmailAliases(): Promise<Array<{ email: string; name?: string; isPrimary: boolean }>> {
    this.ensureConnected();

    try {
      const response = await this.gmail!.users.settings.sendAs.list({ userId: 'me' });
      const sendAs = response.data.sendAs || [];

      return sendAs.map((alias) => ({
        email: alias.sendAsEmail || '',
        name: alias.displayName || undefined,
        isPrimary: alias.isPrimary || false,
      }));
    } catch {
      // Fallback to just primary email
      const profile = await this.getUserInfo();
      return [{ email: profile.email, name: profile.name, isPrimary: true }];
    }
  }

  // ============================================
  // Batch Operations
  // ============================================

  async batchGetMessages(messageIds: string[]): Promise<CanonicalMessage[]> {
    const messages: CanonicalMessage[] = [];

    // Gmail batch API requires special handling
    // For now, fetch in parallel with concurrency limit
    const BATCH_SIZE = 10;
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((id) => this.getMessage(id, { includeBody: true }))
      );
      messages.push(...results.filter((m): m is CanonicalMessage => m !== null));
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
        this.gmail!.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids: toRead,
            removeLabelIds: ['UNREAD'],
          },
        }).then(() => {})
      );
    }

    if (toUnread.length > 0) {
      promises.push(
        this.gmail!.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids: toUnread,
            addLabelIds: ['UNREAD'],
          },
        }).then(() => {})
      );
    }

    await Promise.all(promises);
  }

  async batchMoveMessages(messageIds: string[], targetFolder: string): Promise<void> {
    this.ensureConnected();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    await this.gmail!.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: messageIds,
        addLabelIds: targetLabelId ? [targetLabelId] : [],
        // Note: This doesn't remove from source folder - Gmail uses labels
      },
    });
  }

  async batchDeleteMessages(messageIds: string[], permanent = false): Promise<void> {
    this.ensureConnected();

    if (permanent) {
      await this.gmail!.users.messages.batchDelete({
        userId: 'me',
        requestBody: { ids: messageIds },
      });
    } else {
      // Move to trash
      await this.gmail!.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: messageIds,
          addLabelIds: ['TRASH'],
        },
      });
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
        bodyText = Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf8');
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
    const match = address.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
    if (match) {
      return {
        name: match[1]?.trim() || undefined,
        email: match[2]?.trim() || address,
      };
    }
    return { email: address };
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
      parts.push(`after:${Math.floor(options.since.getTime() / 1000)}`);
    }

    if (options.before) {
      parts.push(`before:${Math.floor(options.before.getTime() / 1000)}`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  private composeToRaw(message: ComposeMessage): string {
    const lines: string[] = [];

    // From header
    if (message.fromEmail) {
      lines.push(`From: ${message.fromEmail}`);
    }

    // To header
    const toAddrs = message.to.map((addr) =>
      addr.name ? `"${addr.name}" <${addr.email}>` : addr.email
    );
    lines.push(`To: ${toAddrs.join(', ')}`);

    // CC header
    if (message.cc?.length) {
      const ccAddrs = message.cc.map((addr) =>
        addr.name ? `"${addr.name}" <${addr.email}>` : addr.email
      );
      lines.push(`Cc: ${ccAddrs.join(', ')}`);
    }

    // BCC header
    if (message.bcc?.length) {
      const bccAddrs = message.bcc.map((addr) =>
        addr.name ? `"${addr.name}" <${addr.email}>` : addr.email
      );
      lines.push(`Bcc: ${bccAddrs.join(', ')}`);
    }

    // Subject
    lines.push(`Subject: ${message.subject}`);

    // Threading headers
    if (message.inReplyTo) {
      lines.push(`In-Reply-To: ${message.inReplyTo}`);
    }
    if (message.references) {
      lines.push(`References: ${message.references}`);
    }

    // Content type
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('');

    // Body
    lines.push(message.bodyHtml);

    const rawMessage = lines.join('\r\n');
    return Buffer.from(rawMessage).toString('base64url');
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

