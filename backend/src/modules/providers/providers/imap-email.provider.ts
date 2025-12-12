/**
 * IMAP Email Provider
 *
 * Full implementation using ImapFlow for IMAP operations and Nodemailer for SMTP
 * Supports standard IMAP mailboxes with folder-based organization
 */

import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as nodemailer from 'nodemailer';
import { BaseEmailProvider } from '../base/base-email-provider';
import {
  Draft,
  DraftData,
  EmailAttachment,
  EmailMessage,
  IEmailProvider,
  Label,
  ListEmailsParams,
  ListEmailsResponse,
  ProviderConfig,
  ProviderError,
  SendEmailData,
  SyncOptions,
  SyncResult,
  ThreadResponse,
  UserInfo,
} from '../interfaces/email-provider.interface';

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export class ImapEmailProvider extends BaseEmailProvider implements IEmailProvider {
  readonly config: ProviderConfig;
  private imapConfig: ImapConfig;
  private smtpConfig: SmtpConfig;

  constructor(config: ProviderConfig) {
    super(ImapEmailProvider.name);
    this.config = config;

    // Parse IMAP/SMTP config from metadata or use defaults
    const metadata = (config as any).metadata || {};

    this.imapConfig = {
      host: metadata.imapHost || 'imap.gmail.com',
      port: metadata.imapPort || 993,
      secure: metadata.imapSecure !== false,
      auth: {
        user: config.email,
        pass: config.accessToken, // For IMAP, accessToken stores the password
      },
    };

    this.smtpConfig = {
      host: metadata.smtpHost || 'smtp.gmail.com',
      port: metadata.smtpPort || 465,
      secure: metadata.smtpSecure !== false,
      auth: {
        user: config.email,
        pass: config.accessToken,
      },
    };

    this.logger.log(`ImapEmailProvider initialized for ${config.email}`);
  }

  // ==================== IMAP Connection ====================

  private async getImapConnection(): Promise<ImapFlow> {
    const client = new ImapFlow({
      host: this.imapConfig.host,
      port: this.imapConfig.port,
      secure: this.imapConfig.secure,
      auth: this.imapConfig.auth,
      logger: false, // Disable ImapFlow logging, we use our own
    });

    await client.connect();
    return client;
  }

  // ==================== User & Authentication ====================

  async getUserInfo(): Promise<UserInfo> {
    return {
      email: this.config.email,
      name: this.config.email.split('@')[0],
    };
  }

  async refreshToken(): Promise<{ accessToken: string; expiresAt: Date }> {
    throw new ProviderError('IMAP provider does not support token refresh', 'NOT_SUPPORTED', 'imap');
  }

  async revokeToken(): Promise<boolean> {
    return false;
  }

  async testConnection(): Promise<boolean> {
    return this.withErrorHandling('testConnection', async () => {
      const client = await this.getImapConnection();
      const success = client.usable;
      await client.logout();
      return success;
    });
  }

  // ==================== Thread Operations ====================

  async getThread(threadId: string, includeMessages = true): Promise<ThreadResponse> {
    return this.withErrorHandling('getThread', async () => {
      // IMAP doesn't have native threading, so we treat each message as a single-message thread
      const message = await this.getMessage(threadId);

      return {
        id: threadId,
        messages: includeMessages ? [message] : [],
        latest: message,
        hasUnread: !message.isRead,
        totalMessages: 1,
        labels: message.labels || [],
      };
    });
  }

  async listThreads(params: ListEmailsParams): Promise<ListEmailsResponse> {
    return this.withErrorHandling('listThreads', async () => {
      const client = await this.getImapConnection();

      try {
        // Select mailbox (use INBOX if no labelId specified)
        const mailbox = params.labelIds?.[0] || 'INBOX';
        await client.mailboxOpen(mailbox);

        // Build search criteria from query
        const searchCriteria = this.buildSearchCriteria(params.query);

        // Search for messages
        const messages: any[] = [];
        for await (const msg of client.fetch(searchCriteria, {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
        })) {
          messages.push({
            id: msg.uid.toString(),
            snippet: msg.envelope?.subject || '',
          });

          if (messages.length >= (params.maxResults || 50)) {
            break;
          }
        }

        return {
          threads: messages,
          nextPageToken: undefined, // IMAP doesn't have built-in pagination tokens
          total: messages.length,
        };
      } finally {
        await client.logout();
      }
    });
  }

  async deleteThreads(threadIds: string[]): Promise<void> {
    return this.withErrorHandling('deleteThreads', async () => {
      const client = await this.getImapConnection();

      try {
        await client.mailboxOpen('INBOX');

        // Move to Trash folder (or add \Deleted flag)
        const uids = threadIds.map((id) => parseInt(id, 10));

        // Try to move to Trash, fallback to adding \Deleted flag
        try {
          await client.messageMove(uids, 'Trash');
        } catch {
          await client.messageFlagsAdd(uids, ['\\Deleted']);
        }
      } finally {
        await client.logout();
      }
    });
  }

  // ==================== Message Operations ====================

  async getMessage(messageId: string): Promise<EmailMessage> {
    return this.withErrorHandling('getMessage', async () => {
      const client = await this.getImapConnection();

      try {
        await client.mailboxOpen('INBOX');

        const uid = parseInt(messageId, 10);
        const message = await client.fetchOne(uid.toString(), {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          source: true,
        });

        if (!message) {
          throw new ProviderError(`Message ${messageId} not found`, 'NOT_FOUND', 'imap');
        }

        return await this.parseImapMessage(message);
      } finally {
        await client.logout();
      }
    });
  }

  async sendEmail(data: SendEmailData): Promise<{ id: string }> {
    return this.withErrorHandling('sendEmail', async () => {
      const transporter = nodemailer.createTransport(this.smtpConfig);

      const result = await transporter.sendMail({
        from: this.config.email,
        to: data.to.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(', '),
        cc: data.cc?.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(', '),
        bcc: data.bcc?.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(', '),
        subject: data.subject,
        text: data.bodyText,
        html: data.bodyHtml,
        attachments: data.attachments?.map((att) => ({
          filename: att.filename,
          content: att.data ? Buffer.from(att.data, 'base64') : undefined,
          contentType: att.mimeType,
        })),
        inReplyTo: data.inReplyTo,
        references: data.references,
      });

      return { id: result.messageId || 'sent' };
    });
  }

  // ==================== Draft Operations ====================

  async createDraft(_data: DraftData): Promise<{ id: string }> {
    throw new ProviderError('IMAP drafts not supported', 'NOT_SUPPORTED', 'imap');
  }

  async getDraft(_draftId: string): Promise<Draft> {
    throw new ProviderError('IMAP drafts not supported', 'NOT_SUPPORTED', 'imap');
  }

  async updateDraft(_draftId: string, _data: DraftData): Promise<void> {
    throw new ProviderError('IMAP drafts not supported', 'NOT_SUPPORTED', 'imap');
  }

  async deleteDraft(_draftId: string): Promise<void> {
    throw new ProviderError('IMAP drafts not supported', 'NOT_SUPPORTED', 'imap');
  }

  async sendDraft(_draftId: string): Promise<{ id: string }> {
    throw new ProviderError('IMAP drafts not supported', 'NOT_SUPPORTED', 'imap');
  }

  async listDrafts(): Promise<{ drafts: Draft[]; nextPageToken?: string }> {
    throw new ProviderError('IMAP drafts not supported', 'NOT_SUPPORTED', 'imap');
  }

  // ==================== Attachment Operations ====================

  async getAttachment(messageId: string, attachmentId: string): Promise<string> {
    return this.withErrorHandling('getAttachment', async () => {
      const message = await this.getMessage(messageId);
      const attachment = message.attachments?.find((a) => a.id === attachmentId);

      if (!attachment) {
        throw new ProviderError(`Attachment ${attachmentId} not found`, 'NOT_FOUND', 'imap');
      }

      // Attachment data is already base64 encoded in our parsing
      return (attachment as any).data || '';
    });
  }

  async getMessageAttachments(messageId: string): Promise<EmailAttachment[]> {
    return this.withErrorHandling('getMessageAttachments', async () => {
      const message = await this.getMessage(messageId);
      return message.attachments || [];
    });
  }

  // ==================== Label/Folder Operations ====================

  async getLabels(): Promise<Label[]> {
    return this.withErrorHandling('getLabels', async () => {
      const client = await this.getImapConnection();

      try {
        const mailboxes = await client.list();

        return mailboxes.map((mb) => ({
          id: mb.path,
          name: mb.name,
          type: 'user' as const,
        }));
      } finally {
        await client.logout();
      }
    });
  }

  async getLabel(labelId: string): Promise<Label> {
    return this.withErrorHandling('getLabel', async () => {
      const labels = await this.getLabels();
      const label = labels.find((l) => l.id === labelId);

      if (!label) {
        throw new ProviderError(`Label ${labelId} not found`, 'NOT_FOUND', 'imap');
      }

      return label;
    });
  }

  async createLabel(): Promise<{ id: string }> {
    throw new ProviderError('IMAP does not support creating labels', 'NOT_SUPPORTED', 'imap');
  }

  async updateLabel(): Promise<void> {
    throw new ProviderError('IMAP does not support updating labels', 'NOT_SUPPORTED', 'imap');
  }

  async deleteLabel(): Promise<void> {
    throw new ProviderError('IMAP does not support deleting labels', 'NOT_SUPPORTED', 'imap');
  }

  async modifyLabels(threadIds: string[], addLabels: string[], removeLabels: string[]): Promise<void> {
    return this.withErrorHandling('modifyLabels', async () => {
      const client = await this.getImapConnection();

      try {
        await client.mailboxOpen('INBOX');

        const uids = threadIds.map((id) => parseInt(id, 10));

        // IMAP uses folders, not labels - move messages to folders
        if (addLabels.length > 0) {
          for (const folder of addLabels) {
            await client.messageCopy(uids, folder);
          }
        }

        if (removeLabels.length > 0) {
          // Can't remove from folders without deleting, so we add \Deleted flag instead
          await client.messageFlagsAdd(uids, ['\\Deleted']);
        }
      } finally {
        await client.logout();
      }
    });
  }

  // ==================== Read/Unread Operations ====================

  async markAsRead(threadIds: string[]): Promise<void> {
    return this.withErrorHandling('markAsRead', async () => {
      const client = await this.getImapConnection();

      try {
        await client.mailboxOpen('INBOX');
        const uids = threadIds.map((id) => parseInt(id, 10));
        await client.messageFlagsAdd(uids, ['\\Seen']);
      } finally {
        await client.logout();
      }
    });
  }

  async markAsUnread(threadIds: string[]): Promise<void> {
    return this.withErrorHandling('markAsUnread', async () => {
      const client = await this.getImapConnection();

      try {
        await client.mailboxOpen('INBOX');
        const uids = threadIds.map((id) => parseInt(id, 10));
        await client.messageFlagsRemove(uids, ['\\Seen']);
      } finally {
        await client.logout();
      }
    });
  }

  async markAsStarred(threadIds: string[]): Promise<void> {
    return this.withErrorHandling('markAsStarred', async () => {
      const client = await this.getImapConnection();

      try {
        await client.mailboxOpen('INBOX');
        const uids = threadIds.map((id) => parseInt(id, 10));
        await client.messageFlagsAdd(uids, ['\\Flagged']);
      } finally {
        await client.logout();
      }
    });
  }

  async markAsUnstarred(threadIds: string[]): Promise<void> {
    return this.withErrorHandling('markAsUnstarred', async () => {
      const client = await this.getImapConnection();

      try {
        await client.mailboxOpen('INBOX');
        const uids = threadIds.map((id) => parseInt(id, 10));
        await client.messageFlagsRemove(uids, ['\\Flagged']);
      } finally {
        await client.logout();
      }
    });
  }

  // ==================== Sync Operations ====================

  async syncEmails(options: SyncOptions): Promise<SyncResult> {
    return this.withErrorHandling('syncEmails', async () => {
      const client = await this.getImapConnection();

      try {
        const mailbox = options.folderId || 'INBOX';
        await client.mailboxOpen(mailbox);

        const maxMessages = options.maxMessages || 50;
        const messages: FetchMessageObject[] = [];

        // Fetch recent messages
        for await (const msg of client.fetch('1:*', {
          uid: true,
          flags: true,
          envelope: true,
        })) {
          messages.push(msg);

          if (messages.length >= maxMessages) {
            break;
          }
        }

        return {
          success: true,
          emailsSynced: messages.length,
          newEmails: messages.length,
          updatedEmails: 0,
          deletedEmails: 0,
        };
      } finally {
        await client.logout();
      }
    });
  }

  // ==================== Utility Methods ====================

  normalizeIds(ids: string[]): { threadIds: string[] } {
    return { threadIds: ids };
  }

  async getEmailCount(): Promise<Array<{ label: string; count: number }>> {
    return this.withErrorHandling('getEmailCount', async () => {
      const client = await this.getImapConnection();

      try {
        const mailboxes = await client.list();
        const counts: Array<{ label: string; count: number }> = [];

        for (const mb of mailboxes) {
          const status = await client.status(mb.path, { messages: true });
          counts.push({
            label: mb.name,
            count: status.messages || 0,
          });
        }

        return counts;
      } finally {
        await client.logout();
      }
    });
  }

  // ==================== Helpers ====================

  private async parseImapMessage(message: FetchMessageObject): Promise<EmailMessage> {
    const source = message.source;
    if (!source) {
      throw new Error('Message source is undefined');
    }

    const parsed = await simpleParser(source);

    return {
      id: message.uid.toString(),
      threadId: message.uid.toString(),
      subject: parsed.subject || '',
      from: this.parseAddress(parsed.from),
      to: this.parseAddressList(parsed.to),
      cc: this.parseAddressList(parsed.cc),
      bcc: this.parseAddressList(parsed.bcc),
      date: parsed.date || new Date(),
      snippet: parsed.text?.substring(0, 200) || '',
      bodyHtml: parsed.html || undefined,
      bodyText: parsed.text || undefined,
      isRead: message.flags?.has('\\Seen') || false,
      isStarred: message.flags?.has('\\Flagged') || false,
      hasAttachments: (parsed.attachments?.length || 0) > 0,
      attachments: this.extractAttachments(parsed.attachments || []),
      headers: this.extractHeaders(parsed.headers),
      labels: this.extractLabelsFromFlags(message.flags || new Set()),
    };
  }

  private parseAddress(address: any): { email: string; name?: string } {
    if (!address) return { email: '' };

    if (address.value && address.value.length > 0) {
      const first = address.value[0];
      return {
        email: first.address || '',
        name: first.name || undefined,
      };
    }

    return { email: '' };
  }

  private parseAddressList(addresses: any): Array<{ email: string; name?: string }> {
    if (!addresses || !addresses.value) return [];

    return addresses.value.map((addr: any) => ({
      email: addr.address || '',
      name: addr.name || undefined,
    }));
  }

  private extractAttachments(attachments?: any[]): EmailAttachment[] | undefined {
    if (!attachments || attachments.length === 0) return undefined;

    return attachments.map((att: any, index: number) => ({
      id: att.contentId || `att_${index}`,
      filename: att.filename || 'attachment',
      mimeType: att.contentType || 'application/octet-stream',
      size: att.size || 0,
      data: att.content ? att.content.toString('base64') : undefined,
    }));
  }

  private extractHeaders(headers: Map<string, any>): Record<string, string> {
    const result: Record<string, string> = {};

    headers.forEach((value, key) => {
      result[key.toLowerCase()] = String(value);
    });

    return result;
  }

  private extractLabelsFromFlags(flags: Set<string>): string[] {
    const labels: string[] = [];

    if (flags.has('\\Seen')) labels.push('READ');
    if (flags.has('\\Flagged')) labels.push('STARRED');
    if (flags.has('\\Deleted')) labels.push('TRASH');
    if (flags.has('\\Draft')) labels.push('DRAFT');

    return labels;
  }

  private buildSearchCriteria(query?: string): any {
    if (!query) {
      return '1:*'; // All messages
    }

    // Simple search implementation - can be enhanced
    if (query.includes('is:unread')) {
      return { unseen: true };
    }

    if (query.includes('is:starred')) {
      return { flagged: true };
    }

    // Text search in subject/body
    return { or: [{ subject: query }, { body: query }] };
  }
}
