/**
 * IMAP Email Driver (Facade)
 * Delegates all operations to: ImapConnectionPoolService, ImapFolderService,
 * ImapMessageService, ImapIdleService, ImapSendService
 */
import { Injectable, Logger, Scope } from '@nestjs/common';
import {
  BaseEmailDriver,
  DriverCredentials,
  ListMessagesOptions,
  ListMessagesResult,
  GetMessageOptions,
  ChangesResult,
  ChangeCallback,
} from '../interfaces/email-driver.interface';
import {
  CanonicalFolder,
  CanonicalMessage,
  ComposeMessage,
  AttachmentData,
  ProviderType,
  ProviderSubscription,
} from '../interfaces/canonical.types';
import { ImapConnectionPoolService } from './services/imap-connection-pool.service';
import { ImapFolderService } from './services/imap-folder.service';
import { ImapMessageService } from './services/imap-message.service';
import { ImapIdleService } from './services/imap-idle.service';
import { ImapSendService } from './services/imap-send.service';
import { ImapConfig, SmtpConfig, ImapDriverContext } from './interfaces/imap-internal.interface';

@Injectable({ scope: Scope.TRANSIENT })
export class IMAPDriver extends BaseEmailDriver {
  readonly providerType: ProviderType = 'imap';
  private readonly logger = new Logger(IMAPDriver.name);

  private context?: ImapDriverContext;

  constructor(
    private readonly connectionPool: ImapConnectionPoolService,
    private readonly folderService: ImapFolderService,
    private readonly messageService: ImapMessageService,
    private readonly idleService: ImapIdleService,
    private readonly sendService: ImapSendService,
  ) { super(); }

  // === Connection Lifecycle ===
  async connect(credentials: DriverCredentials): Promise<void> {
    if (credentials.type !== 'basic' && credentials.type !== 'app-password') {
      throw new Error('IMAP driver requires basic or app-password authentication');
    }

    if (!credentials.username || !credentials.password || !credentials.imapHost) {
      throw new Error('IMAP driver requires username, password, and imapHost');
    }

    const imapConfig: ImapConfig = {
      host: credentials.imapHost,
      port: credentials.imapPort || 993,
      secure: credentials.imapTls !== false,
      auth: { user: credentials.username, pass: credentials.password },
    };

    const smtpConfig: SmtpConfig = {
      host: credentials.smtpHost || credentials.imapHost.replace('imap.', 'smtp.'),
      port: credentials.smtpPort || 465,
      secure: credentials.smtpTls !== false,
      auth: { user: credentials.username, pass: credentials.password },
    };

    // Initialize connection pool
    await this.connectionPool.initialize(imapConfig);

    // Test connection and detect capabilities
    const capabilities = await this.connectionPool.withConnection(async () => {
      return this.connectionPool.getCapabilities();
    });

    // Build shared context
    this.context = {
      imapConfig,
      smtpConfig,
      userEmail: credentials.username,
      serverCapabilities: capabilities,
    };

    // Initialize sub-services with context
    this.idleService.initialize(imapConfig);
    this.sendService.initialize(smtpConfig, credentials.username);

    this.credentials = credentials;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.idleService.stopIdleSubscription();
    await this.connectionPool.closeAll();

    this.sendService.clearConfig();
    this.folderService.clearCache();
    this.context = undefined;

    await super.disconnect();
  }

  // === Folder Operations ===
  async listFolders(): Promise<CanonicalFolder[]> {
    return this.folderService.listFolders();
  }

  async getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null> {
    return this.folderService.getFolder(folderIdOrPath);
  }

  async createFolder(name: string, parentId?: string): Promise<CanonicalFolder> {
    return this.folderService.createFolder(name, parentId);
  }

  async deleteFolder(folderId: string): Promise<void> {
    return this.folderService.deleteFolder(folderId);
  }

  async renameFolder(folderId: string, newName: string): Promise<void> {
    return this.folderService.renameFolder(folderId, newName);
  }

  // === Message Operations ===
  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    return this.messageService.listMessages(options);
  }

  async getMessage(messageId: string, options?: GetMessageOptions): Promise<CanonicalMessage | null> {
    return this.messageService.getMessage(messageId, options);
  }

  async getMessageRaw(messageId: string): Promise<string> {
    return this.messageService.getMessageRaw(messageId);
  }

  async batchGetMessages(messageIds: string[], includeBody = true): Promise<CanonicalMessage[]> {
    return this.messageService.batchGetMessages(messageIds, includeBody);
  }

  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    return this.messageService.moveMessage(messageId, targetFolder);
  }

  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    return this.messageService.copyMessage(messageId, targetFolder);
  }

  async deleteMessage(messageId: string, permanent = false): Promise<void> {
    return this.messageService.deleteMessage(messageId, permanent);
  }

  async setReadStatus(messageId: string, isRead: boolean): Promise<void> {
    return this.messageService.setReadStatus(messageId, isRead);
  }

  async setStarredStatus(messageId: string, isStarred: boolean): Promise<void> {
    return this.messageService.setStarredStatus(messageId, isStarred);
  }

  async setFlaggedStatus(messageId: string, isFlagged: boolean): Promise<void> {
    return this.messageService.setFlaggedStatus(messageId, isFlagged);
  }

  async batchSetReadStatus(updates: Array<{ id: string; isRead: boolean }>): Promise<void> {
    return this.messageService.batchSetReadStatus(updates);
  }

  async batchMoveMessages(messageIds: string[], targetFolder: string): Promise<void> {
    return this.messageService.batchMoveMessages(messageIds, targetFolder);
  }

  async batchDeleteMessages(messageIds: string[], permanent = false): Promise<void> {
    return this.messageService.batchDeleteMessages(messageIds, permanent);
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    return this.messageService.getAttachment(messageId, attachmentId);
  }

  // === Sync Operations ===
  async getChangesSince(syncToken: string): Promise<ChangesResult> {
    return this.messageService.getChangesSince(syncToken);
  }

  async getInitialSyncToken(): Promise<string> {
    return this.messageService.getInitialSyncToken();
  }

  // === Send Operations ===
  async sendMessage(message: ComposeMessage): Promise<string> {
    return this.sendService.sendMessage(message);
  }

  async saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string> {
    return this.sendService.saveDraft(
      message,
      existingDraftId,
      (id: string, permanent: boolean) => this.messageService.deleteMessage(id, permanent),
    );
  }

  async sendDraft(draftId: string): Promise<void> {
    return this.sendService.sendDraft(
      draftId,
      (id: string, options: { includeBody: boolean }) => this.messageService.getMessage(id, options),
      (id: string, permanent: boolean) => this.messageService.deleteMessage(id, permanent),
    );
  }

  // === IDLE / Real-time ===
  async subscribeToChanges(callback: ChangeCallback, folder = 'INBOX'): Promise<ProviderSubscription> {
    this.ensureConnected();
    return this.idleService.subscribeToChanges(callback, folder);
  }

  // === Capabilities ===
  getCapabilities() {
    return this.connectionPool.getCapabilities();
  }

  supportsCondstore(): boolean {
    return this.connectionPool.getCapabilities().condstore;
  }

  supportsQresync(): boolean {
    return this.connectionPool.getCapabilities().qresync;
  }

  // === User Info ===
  async getUserInfo(): Promise<{ email: string; name: string; photo?: string }> {
    return {
      email: this.context?.userEmail || '',
      name: this.context?.userEmail?.split('@')[0] || '',
    };
  }

  async getEmailAliases(): Promise<Array<{ email: string; name?: string; isPrimary: boolean }>> {
    const userInfo = await this.getUserInfo();
    return [{ email: userInfo.email, name: userInfo.name, isPrimary: true }];
  }
}
