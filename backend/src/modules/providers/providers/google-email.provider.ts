import { gmail_v1, google } from 'googleapis';
import MailComposer from 'nodemailer/lib/mail-composer';
import { BaseEmailProvider } from '../base/base-email-provider';
import {
  EmailAttachment,
  Draft,
  DraftData,
  EmailMessage,
  IEmailProvider,
  Label,
  ListEmailsParams,
  ListEmailsResponse,
  ProviderConfig,
  SendEmailData,
  SyncOptions,
  SyncResult,
  ThreadResponse,
  UserInfo,
  ProviderError,
} from '../interfaces/email-provider.interface';

type GmailMessage = gmail_v1.Schema$Message;

export class GoogleEmailProvider extends BaseEmailProvider implements IEmailProvider {
  readonly config: ProviderConfig;
  private gmail: gmail_v1.Gmail;
  private readonly SYSTEM_LABELS = new Set(['UNREAD', 'STARRED']);

  constructor(config: ProviderConfig) {
    super(GoogleEmailProvider.name);
    this.config = config;
    this.gmail = this.createGmailClient(config.accessToken);
    this.logger.log(`GoogleEmailProvider initialized for ${config.email}`);
  }

  /**
   * Create Gmail API client with OAuth2 credentials
   */
  private createGmailClient(accessToken: string): gmail_v1.Gmail {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  // ==================== User & Authentication ====================

  async getUserInfo(): Promise<UserInfo> {
    return this.withErrorHandling('getUserInfo', async () => {
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      return {
        email: profile.data.emailAddress || this.config.email,
        name: profile.data.emailAddress?.split('@')[0] || '',
      };
    });
  }

  async refreshToken(): Promise<{ accessToken: string; expiresAt: Date }> {
    // Token refresh is delegated to the OAuth service layer (GoogleOAuthService).
    throw new ProviderError(
      'Token refresh delegated to OAuth service layer',
      'TOKEN_REFRESH_EXTERNAL',
      'google',
    );
  }

  async revokeToken(): Promise<boolean> {
    return this.withErrorHandling('revokeToken', async () => {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: this.config.accessToken });
      const res = await oauth2Client.revokeToken(this.config.accessToken);
      return res.status === 200;
    });
  }

  // ==================== Thread Operations ====================

  async getThread(threadId: string, includeMessages = true): Promise<ThreadResponse> {
    return this.withErrorHandling('getThread', async () => {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
        metadataHeaders: ['Subject', 'From'],
      });

      const thread = response.data;
      const messages = includeMessages
        ? (thread.messages || []).map((msg) => this.toEmailMessage(msg))
        : [];

      const latest = messages[messages.length - 1];

      return {
        id: thread.id || threadId,
        messages,
        latest,
        hasUnread: messages.some((m) => !m.isRead),
        totalMessages: messages.length,
        labels: thread.messages?.[0]?.labelIds || [],
      };
    });
  }

  async listThreads(params: ListEmailsParams): Promise<ListEmailsResponse> {
    return this.withErrorHandling('listThreads', async () => {
      const response = await this.gmail.users.threads.list({
        userId: 'me',
        labelIds: params.labelIds,
        q: params.query,
        maxResults: params.maxResults ?? 50,
        pageToken: params.pageToken as string | undefined,
      });

      const threads = (response.data.threads || []).map((thread) => ({
        id: thread.id!,
        historyId: thread.historyId,
        snippet: thread.snippet || '',
      }));

      return {
        threads,
        nextPageToken: response.data.nextPageToken ?? undefined,
        total: response.data.resultSizeEstimate ?? undefined,
      };
    });
  }

  async deleteThreads(threadIds: string[]): Promise<void> {
    return this.withErrorHandling('deleteThreads', async () => {
      await Promise.all(
        threadIds.map((id) =>
          this.gmail.users.threads.trash({
            userId: 'me',
            id,
          }),
        ),
      );
    });
  }

  // ==================== Message Operations ====================

  async getMessage(messageId: string): Promise<EmailMessage> {
    return this.withErrorHandling('getMessage', async () => {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      return this.toEmailMessage(response.data);
    });
  }

  async sendEmail(data: SendEmailData): Promise<{ id: string }> {
    return this.withErrorHandling('sendEmail', async () => {
      const raw = await this.buildMimeMessage(data);
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId: data.threadId,
        },
      });

      return { id: response.data.id! };
    });
  }

  // ==================== Draft Operations ====================

  async createDraft(data: DraftData): Promise<{ id: string }> {
    return this.withErrorHandling('createDraft', async () => {
      const raw = await this.buildMimeMessage({
        to: data.to || [],
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject ?? '',
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText ?? '',
      });

      const response = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw,
          },
        },
      });

      return { id: response.data.id! };
    });
  }

  async getDraft(draftId: string): Promise<Draft> {
    return this.withErrorHandling('getDraft', async () => {
      const response = await this.gmail.users.drafts.get({
        userId: 'me',
        id: draftId,
        format: 'full',
      });

      const message = response.data.message as GmailMessage;
      const parsed = this.toEmailMessage(message);

      return {
        id: draftId,
        to: parsed.to,
        cc: parsed.cc,
        bcc: parsed.bcc,
        subject: parsed.subject,
        bodyHtml: parsed.bodyHtml,
        bodyText: parsed.bodyText,
        attachments: parsed.attachments,
      };
    });
  }

  async updateDraft(draftId: string, data: DraftData): Promise<void> {
    return this.withErrorHandling('updateDraft', async () => {
      const raw = await this.buildMimeMessage({
        to: data.to || [],
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject ?? '',
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText ?? '',
      });

      await this.gmail.users.drafts.update({
        userId: 'me',
        id: draftId,
        requestBody: {
          message: {
            raw,
          },
        },
      });
    });
  }

  async deleteDraft(draftId: string): Promise<void> {
    return this.withErrorHandling('deleteDraft', async () => {
      await this.gmail.users.drafts.delete({ userId: 'me', id: draftId });
    });
  }

  async sendDraft(draftId: string): Promise<{ id: string }> {
    return this.withErrorHandling('sendDraft', async () => {
      const response = await this.gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id: draftId },
      });

      return { id: response.data.id! };
    });
  }

  async listDrafts(params?: { maxResults?: number; pageToken?: string }): Promise<{
    drafts: Draft[];
    nextPageToken?: string;
  }> {
    return this.withErrorHandling('listDrafts', async () => {
      const response = await this.gmail.users.drafts.list({
        userId: 'me',
        maxResults: params?.maxResults,
        pageToken: params?.pageToken,
      });

      const drafts =
        (response.data.drafts || []).map((draft) => ({
          id: draft.id!,
        })) || [];

      return {
        drafts,
        nextPageToken: response.data.nextPageToken ?? undefined,
      };
    });
  }

  // ==================== Attachment Operations ====================

  async getAttachment(messageId: string, attachmentId: string): Promise<string> {
    return this.withErrorHandling('getAttachment', async () => {
      const response = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      return response.data.data || '';
    });
  }

  async getMessageAttachments(messageId: string): Promise<EmailAttachment[]> {
    return this.withErrorHandling('getMessageAttachments', async () => {
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const parts = message.data.payload?.parts || [];
      const attachments: EmailAttachment[] = [];

      this.walkParts(parts, (part) => {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            id: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType || 'application/octet-stream',
            size: part.body.size || 0,
          });
        }
      });

      return attachments;
    });
  }

  // ==================== Label/Folder Operations ====================

  async getLabels(): Promise<Label[]> {
    return this.withErrorHandling('getLabels', async () => {
      const response = await this.gmail.users.labels.list({ userId: 'me' });
      return (
        response.data.labels?.map((label) => ({
          id: label.id!,
          name: label.name || '',
          type: label.type as Label['type'],
          color: label.color
            ? {
                backgroundColor: label.color.backgroundColor || undefined,
                textColor: label.color.textColor || undefined,
              }
            : undefined,
        })) || []
      );
    });
  }

  async getLabel(labelId: string): Promise<Label> {
    return this.withErrorHandling('getLabel', async () => {
      const response = await this.gmail.users.labels.get({
        userId: 'me',
        id: labelId,
      });

      const l = response.data;
      return {
        id: l.id!,
        name: l.name || '',
        type: l.type as Label['type'],
        color: l.color
          ? {
              backgroundColor: l.color.backgroundColor || undefined,
              textColor: l.color.textColor || undefined,
            }
          : undefined,
      };
    });
  }

  async createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }): Promise<{ id: string }> {
    return this.withErrorHandling('createLabel', async () => {
      const response = await this.gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: label.name,
          color: label.color,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      return { id: response.data.id! };
    });
  }

  async updateLabel(
    labelId: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ): Promise<void> {
    return this.withErrorHandling('updateLabel', async () => {
      await this.gmail.users.labels.update({
        userId: 'me',
        id: labelId,
        requestBody: {
          name: label.name,
          color: label.color,
        },
      });
    });
  }

  async deleteLabel(labelId: string): Promise<void> {
    return this.withErrorHandling('deleteLabel', async () => {
      await this.gmail.users.labels.delete({ userId: 'me', id: labelId });
    });
  }

  async modifyLabels(
    threadIds: string[],
    addLabels: string[],
    removeLabels: string[],
  ): Promise<void> {
    return this.withErrorHandling('modifyLabels', async () => {
      await Promise.all(
        threadIds.map((id) =>
          this.gmail.users.threads.modify({
            userId: 'me',
            id,
            requestBody: {
              addLabelIds: addLabels,
              removeLabelIds: removeLabels,
            },
          }),
        ),
      );
    });
  }

  // ==================== Read/Unread Operations ====================

  async markAsRead(threadIds: string[]): Promise<void> {
    return this.modifyLabels(threadIds, [], ['UNREAD']);
  }

  async markAsUnread(threadIds: string[]): Promise<void> {
    return this.modifyLabels(threadIds, ['UNREAD'], []);
  }

  async markAsStarred(threadIds: string[]): Promise<void> {
    return this.modifyLabels(threadIds, ['STARRED'], []);
  }

  async markAsUnstarred(threadIds: string[]): Promise<void> {
    return this.modifyLabels(threadIds, [], ['STARRED']);
  }

  // ==================== Sync Operations ====================

  /**
   * @deprecated This method provides only a basic listing and should NOT be used
   * for actual email synchronization. Use GoogleSyncService.syncIncremental() instead,
   * which properly handles history tracking, delta updates, and error aggregation.
   *
   * This implementation exists only for interface compatibility and returns
   * misleading results (e.g., updatedEmails/deletedEmails are always 0).
   */
  async syncEmails(options: SyncOptions): Promise<SyncResult> {
    this.logger.warn(
      'syncEmails() is deprecated. Use GoogleSyncService for proper incremental sync.',
    );

    return this.withErrorHandling('syncEmails', async () => {
      if (options.syncType === 'incremental' && options.historyId) {
        const historyResult = await this.listHistory(options.historyId);
        const messages = historyResult.history.flatMap((h: any) => h.messages || []);

        return {
          success: true,
          emailsSynced: messages.length,
          newEmails: messages.length,
          updatedEmails: 0,
          deletedEmails: 0,
          nextHistoryId: historyResult.historyId,
        };
      }

      // Fall back to lightweight full sync listing messages
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        labelIds: options.folderId ? [options.folderId] : undefined,
        maxResults: options.maxMessages ?? 50,
      });

      const messages = response.data.messages || [];

      return {
        success: true,
        emailsSynced: messages.length,
        newEmails: messages.length,
        updatedEmails: 0,
        deletedEmails: 0,
        nextHistoryId: undefined,
      };
    });
  }

  async getHistoryId(): Promise<string> {
    return this.withErrorHandling('getHistoryId', async () => {
      const response = await this.gmail.users.history.list({
        userId: 'me',
        maxResults: 1,
      });

      const historyId = response.data.historyId || response.data.history?.[0]?.id;
      return historyId?.toString() || '';
    });
  }

  async listHistory(historyId: string): Promise<{ history: any[]; historyId: string }> {
    return this.withErrorHandling('listHistory', async () => {
      const response = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: historyId,
      });

      return {
        history: response.data.history || [],
        historyId: response.data.historyId || historyId,
      };
    });
  }

  // ==================== Utility Methods ====================

  normalizeIds(ids: string[]): { threadIds: string[] } {
    // Gmail threadId e messageId non coincidono: se arrivano ID di messaggio,
    // li rimappiamo usando prefisso "msg_" per distinguerli.
    const threadIds = ids.map((id) => (id.startsWith('msg_') ? id.substring(4) : id));
    return { threadIds };
  }

  async getEmailCount(): Promise<Array<{ label: string; count: number }>> {
    return this.withErrorHandling('getEmailCount', async () => {
      const labels = await this.gmail.users.labels.list({ userId: 'me' });
      return (
        labels.data.labels
          ?.filter((l) => l.messagesTotal !== undefined)
          .map((l) => ({ label: l.name || l.id || '', count: l.messagesTotal! })) || []
      );
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getUserInfo();
      return true;
    } catch (error) {
      this.logger.error('Connection test failed:', error);
      return false;
    }
  }

  // ==================== Helpers ====================

  private toEmailMessage(message: GmailMessage): EmailMessage {
    const headers = this.extractHeaders(message);
    const labels = message.labelIds || [];

    return {
      id: message.id || '',
      threadId: message.threadId || '',
      subject: headers['subject'] || '',
      from: this.parseAddress(headers['from'] || this.config.email),
      to: this.parseAddressList(headers['to']),
      cc: this.parseAddressList(headers['cc']),
      bcc: this.parseAddressList(headers['bcc']),
      date: headers['date'] ? new Date(headers['date']) : new Date(),
      snippet: message.snippet || '',
      bodyHtml: this.extractBody(message.payload, 'text/html'),
      bodyText: this.extractBody(message.payload, 'text/plain'),
      isRead: !labels.includes('UNREAD'),
      isStarred: labels.includes('STARRED'),
      hasAttachments: this.hasAttachments(message.payload),
      attachments: this.extractAttachmentMetadata(message.payload),
      headers,
      labels,
      internalDate: message.internalDate ?? undefined,
      historyId: message.historyId ?? undefined,
      raw: message,
    };
  }

  private extractHeaders(message: GmailMessage): Record<string, string> {
    const headers = message.payload?.headers || [];
    return headers.reduce<Record<string, string>>((acc, h) => {
      if (h.name && h.value) {
        acc[h.name.toLowerCase()] = h.value;
      }
      return acc;
    }, {});
  }

  private extractBody(
    payload: gmail_v1.Schema$MessagePart | undefined,
    mimeType: 'text/html' | 'text/plain',
  ): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (payload.mimeType === mimeType && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        const content = this.extractBody(part, mimeType);
        if (content) return content;
      }
    }

    return undefined;
  }

  private hasAttachments(payload?: gmail_v1.Schema$MessagePart): boolean {
    if (!payload) return false;
    if (payload.filename && payload.body?.attachmentId) return true;
    return (payload.parts || []).some((p) => this.hasAttachments(p));
  }

  private extractAttachmentMetadata(
    payload?: gmail_v1.Schema$MessagePart,
  ): EmailAttachment[] | undefined {
    if (!payload) return undefined;
    const attachments: EmailAttachment[] = [];
    this.walkParts(payload.parts || [], (part) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }
    });
    return attachments.length ? attachments : undefined;
  }

  private walkParts(
    parts: gmail_v1.Schema$MessagePart[],
    visitor: (part: gmail_v1.Schema$MessagePart) => void,
  ) {
    for (const part of parts) {
      visitor(part);
      if (part.parts) {
        this.walkParts(part.parts, visitor);
      }
    }
  }

  private parseAddress(value?: string): { email: string; name?: string } {
    if (!value) return { email: '' };
    const match = /"?([^"]*)"?\s*<([^>]+)>/.exec(value);
    if (match) {
      return { email: match[2], name: match[1] || undefined };
    }
    return { email: value };
  }

  private parseAddressList(value?: string): Array<{ email: string; name?: string }> {
    if (!value) return [];
    return value.split(',').map((addr) => this.parseAddress(addr.trim()));
  }

  private async buildMimeMessage(data: SendEmailData): Promise<string> {
    const composer = new MailComposer({
      from: this.formatAddress(this.config.email),
      to: data.to.map((a) => this.formatAddress(a.email, a.name)).join(', '),
      cc: data.cc?.map((a) => this.formatAddress(a.email, a.name)).join(', '),
      bcc: data.bcc?.map((a) => this.formatAddress(a.email, a.name)).join(', '),
      subject: data.subject,
      text: data.bodyText,
      html: data.bodyHtml,
      attachments: data.attachments?.map((att) => ({
        filename: att.filename,
        content: att.data ? Buffer.from(att.data, 'base64') : undefined,
        contentType: att.mimeType,
      })),
      headers: [
        data.inReplyTo ? { key: 'In-Reply-To', value: data.inReplyTo } : undefined,
        data.references ? { key: 'References', value: data.references } : undefined,
      ].filter(Boolean) as Array<{ key: string; value: string }>,
    });

    const rawBuffer = await composer.compile().build();
    return rawBuffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private formatAddress(email: string, name?: string): string {
    return name ? `"${name}" <${email}>` : `<${email}>`;
  }
}
