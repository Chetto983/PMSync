import { Injectable, Logger, Scope } from '@nestjs/common';
import { google, gmail_v1 } from 'googleapis';
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
  GMAIL_TO_CANONICAL,
  CANONICAL_TO_GMAIL,
  CanonicalFolderType,
} from '../interfaces/canonical.types';
import {
  withRetry,
  RetryOptions,
  googleApiRateLimiter,
  getHttpStatus,
  sleep,
} from '../../../../common/utils';
import { classifyFolderError } from '../interfaces/folder-errors';
import { GmailMessageService } from './services/gmail-message.service';
import { GmailSendService } from './services/gmail-send.service';
import { GmailSyncService } from './services/gmail-sync.service';

/**
 * Google Gmail Driver (Facade)
 *
 * Thin facade that delegates all operations to extracted services:
 * - GmailMessageService: Message operations
 * - GmailSendService: Send/draft/move/delete operations
 * - GmailSyncService: Sync operations
 *
 * Follows IMAP driver pattern exactly.
 */
/**
 * Token refresher callback type.
 * Returns a fresh access token. The caller (sync service) provides this
 * using ProviderTokenService which handles distributed locking internally.
 */
export type TokenRefresherFn = () => Promise<string>;

@Injectable({ scope: Scope.TRANSIENT })
export class GoogleDriver extends BaseEmailDriver {
  readonly providerType: ProviderType = 'google';
  private readonly logger = new Logger(GoogleDriver.name);
  private gmail: gmail_v1.Gmail | null = null;
  private userEmail: string | null = null;
  /** G-C1 FIX: Store oauth2Client for credential updates on token refresh */
  private oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;
  /** G-C1 FIX: Callback to refresh OAuth token — set by sync services */
  private tokenRefresher: TokenRefresherFn | null = null;
  /** G-C1 FIX: Counter for monitoring token refreshes */
  private tokenRefreshCount = 0;
  /** G-C3 FIX: Consecutive 429 counter — pauses all ops after threshold */
  private consecutive429Count = 0;
  /** G-C3 FIX: Timestamp until which all operations are paused (account-level cooldown) */
  private rateLimitPausedUntil = 0;
  /** G-C3 FIX: Consecutive 429 threshold before account-level pause */
  private static readonly RATE_LIMIT_PAUSE_THRESHOLD = 3;
  /** G-C3 FIX: Account-level pause duration in ms */
  private static readonly RATE_LIMIT_PAUSE_MS = 60_000;

  constructor(
    private readonly messageService: GmailMessageService,
    private readonly sendService: GmailSendService,
    private readonly syncService: GmailSyncService,
  ) {
    super();
  }

  /** T-0902: Google supports Gmail labels for sync-back */
  supportsLabels(): boolean {
    return true;
  }

  /**
   * G-C1 FIX: Set token refresher callback for mid-operation 401 recovery.
   * The callback should return a fresh access token. Called by sync services
   * after driver creation, using ProviderTokenService internally.
   * Propagates to all sub-services so their executeWithRetry also handles 401.
   */
  setTokenRefresher(refresher: TokenRefresherFn): void {
    this.tokenRefresher = refresher;
    this.propagateTokenRefreshCallback();
  }

  /** G-C1 FIX: Get the number of token refreshes performed by this driver instance */
  getTokenRefreshCount(): number {
    return this.tokenRefreshCount;
  }

  // === Connection Lifecycle ===
  async connect(credentials: DriverCredentials): Promise<void> {
    if (!credentials.accessToken) {
      throw new Error('Access token is required for Google authentication');
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
    });

    this.oauth2Client = oauth2Client;
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    this.credentials = credentials;
    this.connected = true;

    // Initialize sub-services with gmail client
    this.messageService.initialize(this.gmail);
    this.sendService.initialize(this.gmail);
    this.syncService.initialize(this.gmail);

    // G-C1 FIX: Propagate token refresh callback if already set before connect
    if (this.tokenRefresher) {
      this.propagateTokenRefreshCallback();
    }

    // Get user email for later use
    // FIX Phase 1.3: Throw on auth errors (401/403) instead of silently continuing
    try {
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      this.userEmail = profile.data.emailAddress || null;
    } catch (err: unknown) {
      const error = err as any;
      const status = error?.response?.status || error?.code;
      // 401/403 indicates invalid/expired token - driver is unusable
      if (status === 401 || status === 403) {
        this.connected = false;
        throw new Error(`Google authentication failed (${status}): Token is invalid or expired`);
      }
      // Other errors (network, etc) are non-fatal for connect
      this.logger.warn(`Could not fetch user profile during connect: ${error?.message || String(err)}`);
    }
  }

  async disconnect(): Promise<void> {
    this.messageService.clear();
    this.sendService.clear();
    this.syncService.clear();
    this.gmail = null;
    this.oauth2Client = null;
    this.userEmail = null;
    await super.disconnect();
  }

  // === Folder Operations (kept in driver) ===
  async listFolders(): Promise<CanonicalFolder[]> {
    this.ensureConnected();

    const response = await this.executeWithRetry(
      () => this.gmail!.users.labels.list({ userId: 'me' }),
      'listFolders',
    );
    const labels = response.data.labels || [];

    return labels
      .filter((label) => label.id && label.name)
      .map((label) => this.labelToCanonicalFolder(label));
  }

  async getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null> {
    this.ensureConnected();

    try {
      // Try to get by label ID first
      const response = await this.executeWithRetry(
        () => this.gmail!.users.labels.get({
          userId: 'me',
          id: folderIdOrPath,
        }),
        'getFolder',
      );

      if (response.data) {
        return this.labelToCanonicalFolder(response.data);
      }
    } catch (error: any) {
      if (error.code === 404) {
        // Not found by ID, search by name (already uses retry via listFolders)
        this.logger.debug(`Folder not found by ID ${folderIdOrPath}, searching by name`);
        const allLabels = await this.listFolders();
        return allLabels.find(
          (f) => f.name.toLowerCase() === folderIdOrPath.toLowerCase() ||
            f.type.toLowerCase() === folderIdOrPath.toLowerCase()
        ) || null;
      }
      throw error;
    }

    return null;
  }

  async createFolder(name: string, _parentId?: string): Promise<CanonicalFolder> {
    this.ensureConnected();

    // FIX Phase 2.3: Input validation for folder name
    if (!name || typeof name !== 'string') {
      throw new Error('Folder name is required');
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      throw new Error('Folder name cannot be empty');
    }
    if (trimmedName.length > 225) {
      throw new Error('Folder name cannot exceed 225 characters');
    }
    // Gmail labels cannot contain certain special characters
    if (/[\\\/]/.test(trimmedName)) {
      throw new Error('Folder name cannot contain \\ or / characters');
    }

    try {
      const response = await this.executeWithRetry(
        () => this.gmail!.users.labels.create({
          userId: 'me',
          requestBody: {
            name: trimmedName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        }),
        'createFolder',
      );
      return this.labelToCanonicalFolder(response.data);
    } catch (error) {
      throw classifyFolderError(error, 'google', 'create');
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    this.ensureConnected();

    try {
      await this.executeWithRetry(
        () => this.gmail!.users.labels.delete({
          userId: 'me',
          id: folderId,
        }),
        'deleteFolder',
      );
    } catch (error) {
      throw classifyFolderError(error, 'google', 'delete');
    }
  }

  async renameFolder(folderId: string, newName: string): Promise<void> {
    this.ensureConnected();

    // FIX Phase 2.3: Input validation for folder name
    if (!newName || typeof newName !== 'string') {
      throw new Error('New folder name is required');
    }
    const trimmedName = newName.trim();
    if (trimmedName.length === 0) {
      throw new Error('New folder name cannot be empty');
    }
    if (trimmedName.length > 225) {
      throw new Error('Folder name cannot exceed 225 characters');
    }
    if (/[\\\/]/.test(trimmedName)) {
      throw new Error('Folder name cannot contain \\ or / characters');
    }

    try {
      await this.executeWithRetry(
        () => this.gmail!.users.labels.patch({
          userId: 'me',
          id: folderId,
          requestBody: { name: trimmedName },
        }),
        'renameFolder',
      );
    } catch (error) {
      throw classifyFolderError(error, 'google', 'rename');
    }
  }

  // === Message Operations - DELEGATE ===
  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    return this.messageService.listMessages(options);
  }

  async getMessage(messageId: string, options?: GetMessageOptions): Promise<CanonicalMessage | null> {
    return this.messageService.getMessage(messageId, options);
  }

  async getMessageWithBody(messageId: string): Promise<CanonicalMessage | null> {
    return this.messageService.getMessageWithBody(messageId);
  }

  async getMessageRaw(messageId: string): Promise<string> {
    return this.messageService.getMessageRaw(messageId);
  }

  async batchGetMessages(messageIds: string[], includeBody = false): Promise<CanonicalMessage[]> {
    return this.messageService.batchGetMessages(messageIds, includeBody);
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

  async addLabels(messageId: string, labels: string[]): Promise<void> {
    return this.messageService.addLabels(messageId, labels);
  }

  async removeLabels(messageId: string, labels: string[]): Promise<void> {
    return this.messageService.removeLabels(messageId, labels);
  }

  async batchSetReadStatus(updates: Array<{ id: string; isRead: boolean }>): Promise<void> {
    return this.messageService.batchSetReadStatus(updates);
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    return this.messageService.getAttachment(messageId, attachmentId);
  }

  // === Send Operations - DELEGATE ===
  async sendMessage(message: ComposeMessage): Promise<string> {
    return this.sendService.sendMessage(message);
  }

  async saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string> {
    return this.sendService.saveDraft(message, existingDraftId);
  }

  async sendDraft(draftId: string): Promise<void> {
    return this.sendService.sendDraft(draftId);
  }

  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    return this.sendService.moveMessage(messageId, targetFolder);
  }

  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    return this.sendService.copyMessage(messageId, targetFolder);
  }

  async deleteMessage(messageId: string, permanent = false): Promise<void> {
    return this.sendService.deleteMessage(messageId, permanent);
  }

  async batchMoveMessages(messageIds: string[], targetFolder: string): Promise<void> {
    // G-C2: Sub-service returns BatchOperationResult with structured logging
    await this.sendService.batchMoveMessages(messageIds, targetFolder);
  }

  async batchDeleteMessages(messageIds: string[], permanent = false): Promise<void> {
    // G-C2: Sub-service returns BatchOperationResult with structured logging
    await this.sendService.batchDeleteMessages(messageIds, permanent);
  }

  // === Sync Operations - DELEGATE ===
  async getInitialSyncToken(): Promise<string> {
    return this.syncService.getInitialSyncToken();
  }

  async getChangesSince(syncToken: string): Promise<ChangesResult> {
    return this.syncService.getChangesSince(syncToken);
  }

  // === User Info ===
  async getUserInfo(): Promise<{ email: string; name: string; photo?: string }> {
    this.ensureConnected();

    const response = await this.executeWithRetry(
      () => this.gmail!.users.getProfile({ userId: 'me' }),
      'getUserInfo',
    );

    return {
      email: response.data.emailAddress || this.userEmail || '',
      name: response.data.emailAddress?.split('@')[0] || '',
      photo: undefined, // Gmail API doesn't provide photo
    };
  }

  async getEmailAliases(): Promise<Array<{ email: string; name?: string; isPrimary: boolean }>> {
    this.ensureConnected();

    try {
      const response = await this.executeWithRetry(
        () => this.gmail!.users.settings.sendAs.list({ userId: 'me' }),
        'getEmailAliases',
      );
      const sendAs = response.data.sendAs || [];

      return sendAs.map((alias) => ({
        email: alias.sendAsEmail || '',
        name: alias.displayName || undefined,
        isPrimary: alias.isPrimary || false,
      }));
    } catch (error: any) {
      this.logger.debug(`Could not fetch aliases, using primary only: ${error.message}`);
      // Fallback to just primary email
      const profile = await this.getUserInfo();
      return [{ email: profile.email, name: profile.name, isPrimary: true }];
    }
  }

  /**
   * G-C1 FIX: Build and propagate the token refresh callback to sub-services.
   * The callback refreshes the access token AND updates oauth2Client credentials,
   * so all sub-services (which share the same gmail/oauth2Client instance) benefit.
   */
  private propagateTokenRefreshCallback(): void {
    if (!this.tokenRefresher) return;

    const refreshCallback = async (): Promise<void> => {
      const newToken = await this.tokenRefresher!();
      this.oauth2Client?.setCredentials({
        access_token: newToken,
        refresh_token: this.credentials?.refreshToken,
      });
      this.tokenRefreshCount++;
      this.logger.log(
        `G-C1: Token refreshed mid-operation (total: ${this.tokenRefreshCount})`,
      );
    };

    this.messageService.setTokenRefreshCallback(refreshCallback);
    this.sendService.setTokenRefreshCallback(refreshCallback);
    this.syncService.setTokenRefreshCallback(refreshCallback);
  }

  // === Private helpers for folder operations ===

  /**
   * G-C3 FIX: Rate-limited executeWithRetry.
   * 1. Waits for account-level cooldown if active (3+ consecutive 429s)
   * 2. Acquires global rate limiter slot (100 req/100s — Gmail quota)
   * 3. Delegates to withRetry with 429 tracking wrapper
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    // G-C3: Enforce account-level pause after repeated 429s
    const now = Date.now();
    if (now < this.rateLimitPausedUntil) {
      const waitMs = this.rateLimitPausedUntil - now;
      this.logger.warn(
        `G-C3: Account rate-limited — pausing ${operationName} for ${Math.ceil(waitMs / 1000)}s`,
      );
      await sleep(waitMs);
    }

    // G-C3: Acquire global rate limiter slot before making API call
    await googleApiRateLimiter.acquire();

    // Wrap operation to track consecutive 429s
    const trackedOperation = async (): Promise<T> => {
      try {
        const result = await operation();
        // Success resets consecutive 429 counter
        this.consecutive429Count = 0;
        return result;
      } catch (error) {
        if (getHttpStatus(error) === 429) {
          this.consecutive429Count++;
          if (this.consecutive429Count >= GoogleDriver.RATE_LIMIT_PAUSE_THRESHOLD) {
            this.rateLimitPausedUntil = Date.now() + GoogleDriver.RATE_LIMIT_PAUSE_MS;
            this.logger.error(
              `G-C3: ${this.consecutive429Count} consecutive 429s — pausing ALL operations for 60s`,
            );
          }
        }
        throw error;
      }
    };

    return withRetry(trackedOperation, {
      provider: 'google',
      operationName,
      logger: this.logger,
      maxRetries: 3,
      useCircuitBreaker: true,
      onTokenRefresh: this.tokenRefreshCallback,
      ...options,
    });
  }

  /** G-C1 FIX: Lazy-built token refresh callback for this driver's own executeWithRetry */
  private get tokenRefreshCallback(): (() => Promise<void>) | undefined {
    if (!this.tokenRefresher) return undefined;
    return async () => {
      const newToken = await this.tokenRefresher!();
      this.oauth2Client?.setCredentials({
        access_token: newToken,
        refresh_token: this.credentials?.refreshToken,
      });
      this.tokenRefreshCount++;
      this.logger.log(
        `G-C1: Token refreshed mid-operation (total: ${this.tokenRefreshCount})`,
      );
    };
  }

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
}
