import { Logger } from '@nestjs/common';
import {
  IEmailDriver,
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
} from '../interfaces/canonical.types';
import { ResilienceService } from './resilience.service';
import { ResilienceConfig } from './resilience.types';

/**
 * Resilient Driver Wrapper
 *
 * Wraps any IEmailDriver with retry, rate limiting, and circuit breaker functionality.
 * Uses the decorator pattern to add resilience without modifying the underlying driver.
 *
 * Features:
 * - Automatic retry with exponential backoff for transient failures
 * - Per-account rate limiting to respect API quotas
 * - Circuit breaker to prevent cascading failures
 * - Request timeouts
 *
 * Usage:
 * ```typescript
 * const baseDriver = factory.createDriver('google');
 * const resilientDriver = new ResilientDriverWrapper(
 *   baseDriver,
 *   'account-123',
 *   resilienceService,
 * );
 * await resilientDriver.connect(credentials);
 * ```
 */
export class ResilientDriverWrapper implements IEmailDriver {
  private readonly logger = new Logger(ResilientDriverWrapper.name);

  readonly providerType: ProviderType;

  constructor(
    private readonly driver: IEmailDriver,
    private readonly accountId: string,
    private readonly resilience: ResilienceService,
    private readonly config?: Partial<ResilienceConfig>,
  ) {
    this.providerType = driver.providerType;
  }

  /**
   * Get the underlying driver (for advanced use cases)
   */
  getUnderlyingDriver(): IEmailDriver {
    return this.driver;
  }

  // ============================================
  // Connection (not wrapped with resilience)
  // ============================================

  async connect(credentials: DriverCredentials): Promise<void> {
    // Connection is handled separately - we want immediate feedback on auth errors
    await this.driver.connect(credentials);
  }

  async disconnect(): Promise<void> {
    await this.driver.disconnect();
  }

  isConnected(): boolean {
    return this.driver.isConnected();
  }

  // ============================================
  // Folder Operations (wrapped with resilience)
  // ============================================

  async listFolders(): Promise<CanonicalFolder[]> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.listFolders(),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to list folders');
    }

    return result.data!;
  }

  async getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.getFolder(folderIdOrPath),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to get folder');
    }

    return result.data!;
  }

  async createFolder(name: string, parentId?: string): Promise<CanonicalFolder> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.createFolder(name, parentId),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to create folder');
    }

    return result.data!;
  }

  async deleteFolder(folderId: string): Promise<void> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.deleteFolder(folderId),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to delete folder');
    }
  }

  async renameFolder(folderId: string, newName: string): Promise<void> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.renameFolder(folderId, newName),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to rename folder');
    }
  }

  // ============================================
  // Message Operations (wrapped with resilience)
  // ============================================

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.listMessages(options),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to list messages');
    }

    return result.data!;
  }

  async getMessage(
    messageId: string,
    options?: GetMessageOptions,
  ): Promise<CanonicalMessage | null> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.getMessage(messageId, options),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to get message');
    }

    return result.data!;
  }

  // Optional method - only available if underlying driver supports it
  async getMessageRaw(messageId: string): Promise<string> {
    if (!this.driver.getMessageRaw) {
      throw new Error('getMessageRaw is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.getMessageRaw!(messageId),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to get raw message');
    }

    return result.data!;
  }

  // ============================================
  // Send / Draft (wrapped with resilience)
  // ============================================

  async sendMessage(message: ComposeMessage): Promise<string> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.sendMessage(message),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to send message');
    }

    return result.data!;
  }

  async saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.saveDraft(message, existingDraftId),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to save draft');
    }

    return result.data!;
  }

  async sendDraft(draftId: string): Promise<void> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.sendDraft(draftId),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to send draft');
    }
  }

  // ============================================
  // Message Mutations (wrapped with resilience)
  // ============================================

  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.moveMessage(messageId, targetFolder),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to move message');
    }
  }

  // Optional method
  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    if (!this.driver.copyMessage) {
      throw new Error('copyMessage is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.copyMessage!(messageId, targetFolder),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to copy message');
    }

    return result.data!;
  }

  async deleteMessage(messageId: string, permanent?: boolean): Promise<void> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.deleteMessage(messageId, permanent),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to delete message');
    }
  }

  // ============================================
  // Flags / Status (wrapped with resilience)
  // ============================================

  async setReadStatus(messageId: string, isRead: boolean): Promise<void> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.setReadStatus(messageId, isRead),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to set read status');
    }
  }

  async setStarredStatus(messageId: string, isStarred: boolean): Promise<void> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.setStarredStatus(messageId, isStarred),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to set starred status');
    }
  }

  // Optional method
  async setFlaggedStatus(messageId: string, isFlagged: boolean): Promise<void> {
    if (!this.driver.setFlaggedStatus) {
      throw new Error('setFlaggedStatus is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.setFlaggedStatus!(messageId, isFlagged),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to set flagged status');
    }
  }

  // ============================================
  // Labels (wrapped with resilience) - Optional
  // ============================================

  async addLabels(messageId: string, labels: string[]): Promise<void> {
    if (!this.driver.addLabels) {
      throw new Error('addLabels is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.addLabels!(messageId, labels),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to add labels');
    }
  }

  async removeLabels(messageId: string, labels: string[]): Promise<void> {
    if (!this.driver.removeLabels) {
      throw new Error('removeLabels is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.removeLabels!(messageId, labels),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to remove labels');
    }
  }

  // ============================================
  // Attachments (wrapped with resilience)
  // ============================================

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.getAttachment(messageId, attachmentId),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to get attachment');
    }

    return result.data!;
  }

  // ============================================
  // User Info (wrapped with resilience)
  // ============================================

  async getUserInfo(): Promise<{ email: string; name: string; photo?: string }> {
    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.getUserInfo(),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to get user info');
    }

    return result.data!;
  }

  // Optional method
  async getEmailAliases(): Promise<Array<{ email: string; name?: string; isPrimary: boolean }>> {
    if (!this.driver.getEmailAliases) {
      throw new Error('getEmailAliases is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.getEmailAliases!(),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to get email aliases');
    }

    return result.data!;
  }

  // ============================================
  // Batch Operations (Optional, wrapped with resilience + extended timeout)
  // ============================================

  async batchGetMessages(messageIds: string[]): Promise<CanonicalMessage[]> {
    if (!this.driver.batchGetMessages) {
      throw new Error('batchGetMessages is not supported by this driver');
    }

    // Use longer timeout for batch operations
    const batchConfig: Partial<ResilienceConfig> = {
      ...this.config,
      timeout: {
        connectTimeoutMs: this.config?.timeout?.connectTimeoutMs ?? 10000,
        requestTimeoutMs: 120000, // 2 minutes for batch
        batchTimeoutMs: 300000, // 5 minutes max
        idleTimeoutMs: this.config?.timeout?.idleTimeoutMs ?? 60000,
      },
    };

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.batchGetMessages!(messageIds),
      batchConfig,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to batch get messages');
    }

    return result.data!;
  }

  async batchSetReadStatus(
    updates: Array<{ id: string; isRead: boolean }>,
  ): Promise<void> {
    if (!this.driver.batchSetReadStatus) {
      throw new Error('batchSetReadStatus is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.batchSetReadStatus!(updates),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to batch set read status');
    }
  }

  async batchMoveMessages(messageIds: string[], targetFolder: string): Promise<void> {
    if (!this.driver.batchMoveMessages) {
      throw new Error('batchMoveMessages is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.batchMoveMessages!(messageIds, targetFolder),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to batch move messages');
    }
  }

  async batchDeleteMessages(messageIds: string[], permanent?: boolean): Promise<void> {
    if (!this.driver.batchDeleteMessages) {
      throw new Error('batchDeleteMessages is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.batchDeleteMessages!(messageIds, permanent),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to batch delete messages');
    }
  }

  // ============================================
  // Sync (Optional, wrapped with resilience)
  // ============================================

  async getInitialSyncToken(): Promise<string> {
    if (!this.driver.getInitialSyncToken) {
      throw new Error('getInitialSyncToken is not supported by this driver');
    }

    const result = await this.resilience.executeWithResilience(
      this.accountId,
      this.providerType,
      () => this.driver.getInitialSyncToken!(),
      this.config,
    );

    if (!result.success) {
      throw result.error || new Error('Failed to get sync token');
    }

    return result.data!;
  }
}
