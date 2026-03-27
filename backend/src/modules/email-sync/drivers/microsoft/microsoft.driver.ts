import { Injectable, Logger, Scope } from '@nestjs/common';
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
  MICROSOFT_WELLKNOWN_TO_CANONICAL,
  CANONICAL_TO_MICROSOFT,
  CanonicalFolderType,
  folderNameToCanonical,
} from '../interfaces/canonical.types';
import { withRetry, RetryOptions } from '../../../../common/utils';
import { classifyFolderError } from '../interfaces/folder-errors';
import { MicrosoftMessageService } from './services/microsoft-message.service';
import { MicrosoftSendService } from './services/microsoft-send.service';
import { MicrosoftSyncService } from './services/microsoft-sync.service';

/**
 * Token refresher callback type.
 * Returns a fresh access token. The caller (sync service) provides this
 * using ProviderTokenService which handles distributed locking internally.
 */
export type MsTokenRefresherFn = () => Promise<string>;

/**
 * Microsoft Outlook Driver (Facade)
 *
 * Thin facade that delegates all operations to extracted services:
 * - MicrosoftMessageService: Message operations
 * - MicrosoftSendService: Send/draft/move/delete operations
 * - MicrosoftSyncService: Sync operations
 *
 * Follows IMAP driver pattern exactly.
 */
/** T-0903: TTL-aware Map — entries expire after a configurable duration */
class TtlMap<K, V> extends Map<K, V> {
  private expiry = new Map<K, number>();
  constructor(private readonly ttlMs: number) {
    super();
  }

  override get(key: K): V | undefined {
    const exp = this.expiry.get(key);
    if (exp !== undefined && Date.now() > exp) {
      super.delete(key);
      this.expiry.delete(key);
      return undefined;
    }
    return super.get(key);
  }

  override set(key: K, value: V): this {
    this.expiry.set(key, Date.now() + this.ttlMs);
    return super.set(key, value);
  }

  override has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  override delete(key: K): boolean {
    this.expiry.delete(key);
    return super.delete(key);
  }

  override clear(): void {
    this.expiry.clear();
    super.clear();
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class MicrosoftDriver extends BaseEmailDriver {
  readonly providerType: ProviderType = 'microsoft';
  private readonly logger = new Logger(MicrosoftDriver.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private client: AxiosInstance | null = null;
  private userEmail: string | null = null;
  // T-0903: 5-min TTL on folder caches — matches IMAP pattern
  // MS-C2 SAFETY: These caches are per-instance (Scope.TRANSIENT) — each sync creates
  // a fresh driver, so caches cannot leak across tenants. The TRANSIENT scope is the
  // primary isolation mechanism. providerIdBound tracks which provider owns this instance.
  private folderIdCache = new TtlMap<string, string>(5 * 60 * 1000); // canonical -> folderId
  private folderPathCache = new TtlMap<string, string>(5 * 60 * 1000); // folderId -> displayName
  /** MS-C2: Tracks which provider this driver instance is bound to (for assertion) */
  private providerIdBound: string | null = null;
  /** MS-C1 FIX: Callback to refresh OAuth token — set by sync services */
  private tokenRefresher: MsTokenRefresherFn | null = null;
  /** MS-C1 FIX: Counter for monitoring token refreshes */
  private tokenRefreshCount = 0;

  constructor(
    private readonly messageService: MicrosoftMessageService,
    private readonly sendService: MicrosoftSendService,
    private readonly syncService: MicrosoftSyncService,
  ) {
    super();
  }

  /**
   * MS-C1 FIX: Set token refresher callback for mid-operation 401 recovery.
   * The callback should return a fresh access token. Called by sync services
   * after driver creation, using ProviderTokenService internally.
   * Propagates to all sub-services so their executeWithRetry also handles 401.
   */
  setTokenRefresher(refresher: MsTokenRefresherFn): void {
    this.tokenRefresher = refresher;
    this.propagateTokenRefreshCallback();
  }

  /** MS-C1 FIX: Get the number of token refreshes performed by this driver instance */
  getTokenRefreshCount(): number {
    return this.tokenRefreshCount;
  }

  /** T-0902: Microsoft supports Outlook categories for sync-back */
  supportsLabels(): boolean {
    return true;
  }

  // === Connection Lifecycle ===
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

    // MS-C2: Bind this instance to a specific provider for cache isolation assertion
    this.providerIdBound = credentials.emailHint ?? 'unknown';

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

    // Initialize sub-services with client and callbacks
    this.messageService.initialize(this.client, this.folderIdCache, this.folderPathCache);
    this.sendService.initialize(this.client, (folder) => this.resolveFolderId(folder));
    this.syncService.initialize(this.client, (folder) => this.resolveFolderId(folder));

    // MS-C1 FIX: Propagate token refresh callback if already set before connect
    if (this.tokenRefresher) {
      this.propagateTokenRefreshCallback();
    }
  }

  async disconnect(): Promise<void> {
    this.messageService.clear();
    this.sendService.clear();
    this.syncService.clear();
    this.client = null;
    this.userEmail = null;
    this.folderIdCache.clear();
    this.folderPathCache.clear();
    this.providerIdBound = null;
    await super.disconnect();
  }

  // === Folder Operations (kept in driver) ===
  async listFolders(): Promise<CanonicalFolder[]> {
    this.ensureConnected();

    // T-0903: Clear caches on folder re-sync so externally renamed/deleted folders are picked up
    this.folderIdCache.clear();
    this.folderPathCache.clear();

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

    // T-0903: Re-populate caches from fresh folder list
    for (const folder of allFolders) {
      if (folder.type) this.folderIdCache.set(folder.type.toUpperCase(), folder.id);
      if (folder.id && folder.path) this.folderPathCache.set(folder.id, folder.path);
    }

    return allFolders;
  }

  async getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null> {
    this.ensureConnected();

    try {
      // Try wellKnownName first (inbox, sentitems, etc.)
      const wellKnownName = CANONICAL_TO_MICROSOFT[folderIdOrPath.toUpperCase()];
      if (wellKnownName) {
        const response = await this.executeWithRetry(
          () => this.client!.get(`/me/mailFolders/${wellKnownName}`),
          'getFolder:wellKnown',
        );
        return this.graphFolderToCanonical(response.data);
      }

      // Try by ID
      const response = await this.executeWithRetry(
        () => this.client!.get(`/me/mailFolders/${folderIdOrPath}`),
        'getFolder:byId',
      );
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

    try {
      const response = await this.executeWithRetry(
        () => this.client!.post(endpoint, { displayName: name }),
        'createFolder',
      );
      const newFolder = this.graphFolderToCanonical(response.data);

      // MED-6 FIX: Update cache
      if (newFolder.id) {
        if (newFolder.type) this.folderIdCache.set(newFolder.type.toUpperCase(), newFolder.id);
        this.folderPathCache.set(newFolder.id, name);
      }

      return newFolder;
    } catch (error) {
      throw classifyFolderError(error, 'microsoft', 'create');
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    this.ensureConnected();
    try {
      await this.executeWithRetry(
        () => this.client!.delete(`/me/mailFolders/${folderId}`),
        'deleteFolder',
      );

      // MED-6 FIX: Invalidate cache
      this.folderPathCache.delete(folderId);
    } catch (error) {
      throw classifyFolderError(error, 'microsoft', 'delete');
    }
  }

  async renameFolder(folderId: string, newName: string): Promise<void> {
    this.ensureConnected();
    try {
      await this.executeWithRetry(
        () => this.client!.patch(`/me/mailFolders/${folderId}`, { displayName: newName }),
        'renameFolder',
      );

      // MED-6 FIX: Update cache
      this.folderPathCache.set(folderId, newName);
    } catch (error) {
      throw classifyFolderError(error, 'microsoft', 'rename');
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

  async batchGetMessages(messageIds: string[]): Promise<CanonicalMessage[]> {
    return this.messageService.batchGetMessages(messageIds);
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
    return this.sendService.batchMoveMessages(messageIds, targetFolder);
  }

  async batchDeleteMessages(messageIds: string[], permanent = false): Promise<void> {
    return this.sendService.batchDeleteMessages(messageIds, permanent);
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

    try {
      const response = await this.client!.get('/me', {
        params: { $select: 'mail,userPrincipalName,displayName' },
      });

      let photo: string | undefined;
      // LOW-2: Fetch user photo
      try {
        const photoResponse = await this.client!.get('/me/photo/$value', {
          responseType: 'arraybuffer',
        });
        if (photoResponse.data) {
          const base64 = Buffer.from(photoResponse.data).toString('base64');
          photo = `data:image/jpeg;base64,${base64}`;
        }
      } catch {
        // Photo not found or no permission, ignore
      }

      return {
        email: response.data.mail || response.data.userPrincipalName || this.userEmail || '',
        name: response.data.displayName || '',
        photo,
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
    } catch (error: any) {
      this.logger.debug(`Could not fetch user info for aliases: ${error.message}`);
      // Fallback
      return [{ email: this.credentials?.emailHint || '', isPrimary: true }];
    }
  }

  // === Private helpers needed by folder operations ===
  private executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    return withRetry(operation, {
      provider: 'microsoft',
      operationName,
      logger: this.logger,
      maxRetries: 3,
      useCircuitBreaker: true,
      onTokenRefresh: this.tokenRefreshCallback,
      ...options,
    });
  }

  /** MS-C1 FIX: Lazy-built token refresh callback for this driver's own executeWithRetry */
  private get tokenRefreshCallback(): (() => Promise<void>) | undefined {
    if (!this.tokenRefresher) return undefined;
    return async () => {
      const newToken = await this.tokenRefresher!();
      // Update the axios client's Authorization header with fresh token
      if (this.client) {
        this.client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      }
      this.tokenRefreshCount++;
      this.logger.log(
        `MS-C1: Token refreshed mid-operation (total: ${this.tokenRefreshCount})`,
      );
    };
  }

  /**
   * MS-C1 FIX: Build and propagate the token refresh callback to sub-services.
   * The callback refreshes the access token AND updates the axios client header,
   * so all sub-services (which share the same axios client instance) benefit.
   */
  private propagateTokenRefreshCallback(): void {
    if (!this.tokenRefresher) return;

    const refreshCallback = async (): Promise<void> => {
      const newToken = await this.tokenRefresher!();
      if (this.client) {
        this.client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      }
      this.tokenRefreshCount++;
      this.logger.log(
        `MS-C1: Token refreshed mid-operation (total: ${this.tokenRefreshCount})`,
      );
    };

    this.messageService.setTokenRefreshCallback(refreshCallback);
    this.sendService.setTokenRefreshCallback(refreshCallback);
    this.syncService.setTokenRefreshCallback(refreshCallback);
  }

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

  private async fetchAllPages<T = any>(
    initialUrl: string,
    params?: Record<string, any>,
  ): Promise<T[]> {
    const items: T[] = [];
    let nextUrl: string | null = initialUrl;
    let nextParams = params;
    const MAX_PAGES = 50;
    const MAX_ITEMS = 5000; // MEMORY FIX: Prevent unbounded array growth

    for (let page = 0; nextUrl && page < MAX_PAGES; page += 1) {
      const isAbsolute = /^https?:/i.test(nextUrl);
      const currentUrl = nextUrl;
      const currentParams = nextParams;

      // FIXED (2025-01-05): Wrap API call with retry
      const response: AxiosResponse<any> = await this.executeWithRetry(
        () => this.client!.get(
          currentUrl,
          isAbsolute ? { baseURL: '' } : { params: currentParams },
        ),
        `fetchAllPages:${initialUrl.split('/').pop() || 'unknown'}`,
      );

      items.push(...(response.data.value || []));

      // MEMORY FIX: Stop if we've accumulated too many items
      if (items.length >= MAX_ITEMS) {
        this.logger.warn(`Item limit reached (${MAX_ITEMS}) for ${initialUrl}. Stopping pagination.`);
        break;
      }

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

  private async lookupFolderIdByDisplayName(displayName: string): Promise<string | null> {
    const escapedName = displayName.replace(/'/g, "''");
    const response = await this.executeWithRetry(
      () => this.client!.get('/me/mailFolders', {
        params: {
          $top: 1,
          $filter: `displayName eq '${escapedName}'`,
        },
      }),
      'resolveFolderId:displayName',
    );

    const folder = response.data?.value?.[0];
    if (!folder?.id) {
      return null;
    }

    this.folderPathCache.set(folder.id, folder.displayName || displayName);
    return folder.id;
  }

  private async resolveFolderId(folderOrCanonical: string, retried = false): Promise<string> {
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

    // Lookup by displayName for custom folders
    try {
      const folderId = await this.lookupFolderIdByDisplayName(folderOrCanonical);
      if (folderId) {
        this.folderIdCache.set(folderOrCanonical.toUpperCase(), folderId);
        return folderId;
      }
    } catch (error: any) {
      this.logger.warn(`resolveFolderId: displayName lookup failed for ${folderOrCanonical}: ${error.message}`);
    }

    // T-0903: If folder not found and we haven't retried, clear cache and re-populate
    // This handles externally renamed/deleted folders whose stale IDs are in cache
    if (!retried) {
      this.logger.debug(`resolveFolderId: cache miss for "${folderOrCanonical}", refreshing folder list`);
      await this.cacheFolderIds();
      return this.resolveFolderId(folderOrCanonical, true);
    }

    // Assume it's already a folder ID
    return folderOrCanonical;
  }

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
}
