import { Client } from '@microsoft/microsoft-graph-client';
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
  SendEmailData,
  SyncOptions,
  SyncResult,
  ThreadResponse,
  UserInfo,
  ProviderError,
} from '../interfaces/email-provider.interface';

type GraphPagination<T> = {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
};

export class MicrosoftEmailProvider extends BaseEmailProvider implements IEmailProvider {
  readonly config: ProviderConfig;
  private graph: Client;

  constructor(config: ProviderConfig) {
    super(MicrosoftEmailProvider.name);
    this.config = config;
    this.graph = Client.init({
      authProvider: (done) => done(null, config.accessToken),
    });
    this.logger.log(`MicrosoftEmailProvider initialized for user ${config.userId}`);
  }

  // ==================== User & Authentication ====================

  async getUserInfo(): Promise<UserInfo> {
    return this.withErrorHandling('getUserInfo', async () => {
      const me = await this.graph.api('/me').get();
      return {
        email: me.mail || me.userPrincipalName || this.config.email,
        name: me.displayName,
      };
    });
  }

  async refreshToken(): Promise<{ accessToken: string; expiresAt: Date }> {
    // Delegated to the OAuth service layer (handled separately from provider)
    throw new ProviderError(
      'Token refresh delegated to OAuth service layer',
      'TOKEN_REFRESH_EXTERNAL',
      'microsoft',
    );
  }

  async revokeToken(): Promise<boolean> {
    // Graph non espone revoke esplicito lato client; delega al token service.
    return false;
  }

  // ==================== Thread Operations ====================

  async getThread(threadId: string, includeMessages = true): Promise<ThreadResponse> {
    return this.withErrorHandling('getThread', async () => {
      const message = await this.graph.api(`/me/messages/${threadId}`).get();
      const messages = includeMessages ? [this.toEmailMessage(message)] : [];
      return {
        id: message.id,
        messages,
        latest: messages[0],
        hasUnread: message.isRead === false,
        totalMessages: messages.length,
        labels: message.categories,
        folder: message.parentFolderId,
      };
    });
  }

  async listThreads(params: ListEmailsParams): Promise<ListEmailsResponse> {
    return this.withErrorHandling('listThreads', async () => {
      const top = params.maxResults ?? 50;
      const filterParts: string[] = [];
      if (params.onlyUnread) filterParts.push('isRead eq false');

      const queryParams: Record<string, string> = {};
      if (filterParts.length > 0) {
        queryParams.$filter = filterParts.join(' and ');
      }

      const response: GraphPagination<any> = await this.graph
        .api('/me/messages')
        .top(top)
        .query(queryParams as any)
        .get();

      return {
        threads: (response.value || []).map((msg) => ({
          id: msg.id,
          historyId: null,
          snippet: msg.bodyPreview,
          lastMessageDate: msg.sentDateTime ? new Date(msg.sentDateTime) : undefined,
        })),
        nextPageToken: response['@odata.nextLink'] || null,
      };
    });
  }

  async deleteThreads(threadIds: string[]): Promise<void> {
    return this.withErrorHandling('deleteThreads', async () => {
      await Promise.all(threadIds.map((id) => this.graph.api(`/me/messages/${id}`).delete()));
    });
  }

  // ==================== Message Operations ====================

  async getMessage(messageId: string): Promise<EmailMessage> {
    return this.withErrorHandling('getMessage', async () => {
      const msg = await this.graph.api(`/me/messages/${messageId}`).get();
      return this.toEmailMessage(msg);
    });
  }

  async sendEmail(data: SendEmailData): Promise<{ id: string }> {
    return this.withErrorHandling('sendEmail', async () => {
      const message = this.buildGraphMessage(data);
      await this.graph.api('/me/sendMail').post({ message });
      return { id: message.id || 'sendMail' };
    });
  }

  // ==================== Draft Operations ====================

  async createDraft(data: DraftData): Promise<{ id: string }> {
    return this.withErrorHandling('createDraft', async () => {
      const draft = await this.graph.api('/me/messages').post(this.buildGraphMessage(data));
      return { id: draft.id };
    });
  }

  async getDraft(draftId: string): Promise<Draft> {
    return this.withErrorHandling('getDraft', async () => {
      const draft = await this.graph.api(`/me/messages/${draftId}`).get();
      const parsed = this.toEmailMessage(draft);
      return {
        id: draftId,
        to: parsed.to,
        cc: parsed.cc,
        bcc: parsed.bcc,
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
        bodyText: draft.bodyText,
        attachments: parsed.attachments,
      };
    });
  }

  async updateDraft(draftId: string, data: DraftData): Promise<void> {
    return this.withErrorHandling('updateDraft', async () => {
      await this.graph.api(`/me/messages/${draftId}`).patch(this.buildGraphMessage(data));
    });
  }

  async deleteDraft(draftId: string): Promise<void> {
    return this.withErrorHandling('deleteDraft', async () => {
      await this.graph.api(`/me/messages/${draftId}`).delete();
    });
  }

  async sendDraft(draftId: string): Promise<{ id: string }> {
    return this.withErrorHandling('sendDraft', async () => {
      await this.graph
        .api(`/me/messages/${draftId}/send`)
        .post({}) // Graph requires empty body
        .catch((err) => {
          // Graph ritorna 202 con empty body
          if (err?.statusCode === 202) return;
          throw err;
        });
      return { id: draftId };
    });
  }

  async listDrafts(params?: { maxResults?: number; pageToken?: string }): Promise<{
    drafts: Draft[];
    nextPageToken?: string;
  }> {
    return this.withErrorHandling('listDrafts', async () => {
      let request = this.graph
        .api('/me/mailFolders/Drafts/messages')
        .top(params?.maxResults ?? 50);

      if (params?.pageToken) {
        request = request.skipToken(params.pageToken);
      }

      const response: GraphPagination<any> = await request.get();

      return {
        drafts: (response.value || []).map((draft) => ({ id: draft.id })),
        nextPageToken: response['@odata.nextLink'],
      };
    });
  }

  // ==================== Attachment Operations ====================

  async getAttachment(messageId: string, attachmentId: string): Promise<string> {
    return this.withErrorHandling('getAttachment', async () => {
      const attachment = await this.graph
        .api(`/me/messages/${messageId}/attachments/${attachmentId}`)
        .get();
      return attachment?.contentBytes || '';
    });
  }

  async getMessageAttachments(messageId: string): Promise<EmailAttachment[]> {
    return this.withErrorHandling('getMessageAttachments', async () => {
      const res = await this.graph.api(`/me/messages/${messageId}/attachments`).get();
      return (res.value || []).map((att: any) => ({
        id: att.id,
        filename: att.name,
        mimeType: att.contentType,
        size: att.size,
      }));
    });
  }

  // ==================== Label/Folder Operations ====================

  async getLabels(): Promise<Label[]> {
    return this.withErrorHandling('getLabels', async () => {
      const res = await this.graph.api('/me/mailFolders').get();
      return (res.value || []).map((f: any) => ({
        id: f.id,
        name: f.displayName,
        type: 'user',
      }));
    });
  }

  async getLabel(labelId: string): Promise<Label> {
    return this.withErrorHandling('getLabel', async () => {
      const folder = await this.graph.api(`/me/mailFolders/${labelId}`).get();
      return { id: folder.id, name: folder.displayName, type: 'user' };
    });
  }

  async createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }): Promise<{ id: string }> {
    return this.withErrorHandling('createLabel', async () => {
      const folder = await this.graph.api('/me/mailFolders').post({
        displayName: label.name,
      });
      return { id: folder.id };
    });
  }

  async updateLabel(
    labelId: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ): Promise<void> {
    return this.withErrorHandling('updateLabel', async () => {
      await this.graph.api(`/me/mailFolders/${labelId}`).patch({
        displayName: label.name,
      });
    });
  }

  async deleteLabel(labelId: string): Promise<void> {
    return this.withErrorHandling('deleteLabel', async () => {
      await this.graph.api(`/me/mailFolders/${labelId}`).delete();
    });
  }

  async modifyLabels(
    threadIds: string[],
    addLabels: string[],
    removeLabels: string[],
  ): Promise<void> {
    // Microsoft Graph usa categorie, le applichiamo come "categories" sul messaggio.
    return this.withErrorHandling('modifyLabels', async () => {
      await Promise.all(
        threadIds.map((id) =>
          this.graph.api(`/me/messages/${id}`).patch({
            categories: [...addLabels, ...(removeLabels ? [] : [])],
          }),
        ),
      );
    });
  }

  // ==================== Read/Unread Operations ====================

  async markAsRead(threadIds: string[]): Promise<void> {
    return this.setReadFlag(threadIds, true);
  }

  async markAsUnread(threadIds: string[]): Promise<void> {
    return this.setReadFlag(threadIds, false);
  }

  // ==================== Sync Operations ====================

  /**
   * @deprecated This method provides only a basic delta listing and should NOT be used
   * for actual email synchronization. Use MicrosoftSyncService for proper incremental sync,
   * which handles delta tracking, error aggregation, and proper state management.
   *
   * This implementation exists only for interface compatibility and returns
   * misleading results (e.g., updatedEmails/deletedEmails are always 0).
   */
  async syncEmails(options: SyncOptions): Promise<SyncResult> {
    this.logger.warn(
      'syncEmails() is deprecated. Use MicrosoftSyncService for proper incremental sync.',
    );

    return this.withErrorHandling('syncEmails', async () => {
      const query: any = {};
      if (options.maxMessages) query.$top = options.maxMessages;
      if (options.deltaLink) {
        const deltaPage: GraphPagination<any> = await this.graph.api(options.deltaLink).get();
        return {
          success: true,
          emailsSynced: deltaPage.value.length,
          newEmails: deltaPage.value.length,
          updatedEmails: 0,
          deletedEmails: 0,
          nextDeltaLink: deltaPage['@odata.deltaLink'] || deltaPage['@odata.nextLink'],
        };
      }

      const page: GraphPagination<any> = await this.graph.api('/me/mailFolders/Inbox/messages').query(query).get();

      return {
        success: true,
        emailsSynced: page.value.length,
        newEmails: page.value.length,
        updatedEmails: 0,
        deletedEmails: 0,
        nextDeltaLink: page['@odata.deltaLink'] || page['@odata.nextLink'],
      };
    });
  }

  async getDeltaLink(): Promise<string> {
    return this.withErrorHandling('getDeltaLink', async () => {
      const page: GraphPagination<any> = await this.graph
        .api('/me/mailFolders/Inbox/messages/delta')
        .top(1)
        .get();
      return page['@odata.deltaLink'] || page['@odata.nextLink'] || '';
    });
  }

  // ==================== Utility Methods ====================

  normalizeIds(ids: string[]): { threadIds: string[] } {
    return { threadIds: ids };
  }

  async getEmailCount(): Promise<Array<{ label: string; count: number }>> {
    return this.withErrorHandling('getEmailCount', async () => {
      const folders = await this.graph.api('/me/mailFolders').get();
      return (folders.value || []).map((f: any) => ({
        label: f.displayName,
        count: f.totalItemCount,
      }));
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

  private toEmailMessage(msg: any): EmailMessage {
    return {
      id: msg.id,
      threadId: msg.conversationId || msg.id,
      subject: msg.subject || '',
      from: { email: msg.from?.emailAddress?.address, name: msg.from?.emailAddress?.name },
      to: (msg.toRecipients || []).map((r: any) => ({
        email: r.emailAddress.address,
        name: r.emailAddress.name,
      })),
      cc: (msg.ccRecipients || []).map((r: any) => ({
        email: r.emailAddress.address,
        name: r.emailAddress.name,
      })),
      bcc: (msg.bccRecipients || []).map((r: any) => ({
        email: r.emailAddress.address,
        name: r.emailAddress.name,
      })),
      date: msg.sentDateTime ? new Date(msg.sentDateTime) : new Date(),
      snippet: msg.bodyPreview || '',
      bodyHtml: msg.body?.contentType === 'html' ? msg.body?.content : undefined,
      bodyText: msg.body?.contentType === 'text' ? msg.body?.content : undefined,
      isRead: msg.isRead ?? true,
      isStarred: (msg.flag?.flagStatus || '').toLowerCase() === 'flagged',
      hasAttachments: msg.hasAttachments || false,
      attachments: msg.attachments,
      labels: msg.categories,
      historyId: msg.changeKey,
      raw: msg,
    };
  }

  private buildGraphMessage(data: SendEmailData | DraftData): any {
    return {
      subject: data.subject,
      body: {
        contentType: data.bodyHtml ? 'html' : 'text',
        content: data.bodyHtml || data.bodyText || '',
      },
      toRecipients: (data.to || []).map((r) => ({ emailAddress: { address: r.email, name: r.name } })),
      ccRecipients: (data.cc || []).map((r) => ({ emailAddress: { address: r.email, name: r.name } })),
      bccRecipients: (data.bcc || []).map((r) => ({ emailAddress: { address: r.email, name: r.name } })),
    };
  }

  private async setReadFlag(threadIds: string[], isRead: boolean) {
    await this.withErrorHandling('setReadFlag', async () => {
      await Promise.all(
        threadIds.map((id) =>
          this.graph.api(`/me/messages/${id}`).patch({
            isRead,
          }),
        ),
      );
    });
  }
}
