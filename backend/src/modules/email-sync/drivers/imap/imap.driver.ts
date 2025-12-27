import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow, MailboxObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as nodemailer from 'nodemailer';
import { Semaphore, withTimeout } from 'async-mutex';
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
  AttachmentMeta,
  EmailAddress,
  ProviderType,
  CanonicalFolderType,
  ProviderChange,
  ProviderSubscription,
  IMAP_SPECIAL_USE_TO_CANONICAL,
  folderNameToCanonical,
} from '../interfaces/canonical.types';
import { ChangeCallback } from '../interfaces/email-driver.interface';

/**
 * IMAP Connection Pool Configuration
 * For >1000 users, we need efficient connection management
 */
interface PooledConnection {
  client: ImapFlow;
  lastUsed: number;
  inUse: boolean;
  mailbox?: string;
}

/**
 * IMAP Connection Pool Configuration
 * Phase 6: Made configurable via environment variables
 */
const POOL_CONFIG = {
  maxConnectionsPerUser: parseInt(process.env.IMAP_MAX_CONNECTIONS_PER_USER || '3', 10),
  connectionIdleTimeout: parseInt(process.env.IMAP_CONNECTION_IDLE_TIMEOUT_MS || '60000', 10),
  connectionAcquireTimeout: parseInt(process.env.IMAP_CONNECTION_ACQUIRE_TIMEOUT_MS || '10000', 10),
  maxMessageBodySize: parseInt(process.env.IMAP_MAX_MESSAGE_BODY_SIZE || String(10 * 1024 * 1024), 10),
  bodyDownloadTimeout: parseInt(process.env.IMAP_BODY_DOWNLOAD_TIMEOUT_MS || '15000', 10),
};

/**
 * IMAP Email Driver
 *
 * Implements IEmailDriver interface for IMAP/SMTP email operations.
 * Uses ImapFlow for IMAP and Nodemailer for SMTP.
 *
 * Features:
 * - RFC 6154 special-use folder detection
 * - Heuristic folder name matching for legacy servers
 * - Connection pooling for scalability (>1000 users)
 * - Batch operations for efficiency
 */
@Injectable()
export class IMAPDriver extends BaseEmailDriver {
  readonly providerType: ProviderType = 'imap';
  private readonly logger = new Logger(IMAPDriver.name);

  // Connection pool for efficient resource usage
  private connectionPool: PooledConnection[] = [];

  // BUG-1 FIX: Semaphore for connection pool access (replaces busy-wait)
  // Using async-mutex Semaphore with timeout to prevent deadlock
  private poolSemaphore = withTimeout(
    new Semaphore(POOL_CONFIG.maxConnectionsPerUser),
    POOL_CONFIG.connectionAcquireTimeout,
  );

  // IMAP configuration
  private imapConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };

  // SMTP configuration
  private smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };

  // User email for sending
  private userEmail?: string;

  // Folder cache to avoid repeated LIST commands
  private folderCache?: {
    folders: CanonicalFolder[];
    cachedAt: number;
  };
  private readonly FOLDER_CACHE_TTL = 300000; // 5 minutes

  // IDLE connection for real-time updates (separate from pool)
  private idleConnection?: ImapFlow;
  private idleCallback?: ChangeCallback;
  private idleFolder?: string;
  private idleActive = false;

  // Server capabilities detected at connection time (Phase 5: API Compliance)
  private serverCapabilities: {
    condstore: boolean;
    qresync: boolean;
    idle: boolean;
    specialUse: boolean;
  } = {
    condstore: false,
    qresync: false,
    idle: false,
    specialUse: false,
  };

  async connect(credentials: DriverCredentials): Promise<void> {
    if (credentials.type !== 'basic' && credentials.type !== 'app-password') {
      throw new Error('IMAP driver requires basic or app-password authentication');
    }

    if (!credentials.username || !credentials.password) {
      throw new Error('IMAP driver requires username and password');
    }

    if (!credentials.imapHost) {
      throw new Error('IMAP driver requires imapHost');
    }

    // Store IMAP configuration
    this.imapConfig = {
      host: credentials.imapHost,
      port: credentials.imapPort || 993,
      secure: credentials.imapTls !== false,
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
    };

    // Store SMTP configuration (defaults to IMAP host if not specified)
    this.smtpConfig = {
      host: credentials.smtpHost || credentials.imapHost.replace('imap.', 'smtp.'),
      port: credentials.smtpPort || 465,
      secure: credentials.smtpTls !== false,
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
    };

    this.userEmail = credentials.username;
    this.credentials = credentials;

    // Test connection - skip connection check since we're establishing it
    const client = await this.acquireConnection(true);
    try {
      this.connected = client.usable;
      if (!this.connected) {
        throw new Error('IMAP connection test failed');
      }
    } finally {
      this.releaseConnection(client);
    }
  }

  async disconnect(): Promise<void> {
    // Stop IDLE subscription first
    await this.stopIdleSubscription();

    // Close all pooled connections
    for (const pooled of this.connectionPool) {
      try {
        if (pooled.client.usable) {
          await pooled.client.logout();
        }
      } catch (error) {
        this.logger.warn('Error closing pooled connection', error);
      }
    }
    this.connectionPool = [];
    this.folderCache = undefined;
    await super.disconnect();
  }

  // ============================================
  // IDLE / Real-time Subscriptions
  // ============================================

  /**
   * Subscribe to real-time change notifications using IMAP IDLE
   *
   * IMPORTANT: IMAP IDLE only monitors ONE folder at a time.
   * For multi-folder monitoring, you need multiple connections or
   * use this primarily for INBOX and poll other folders.
   *
   * Production considerations for >1000 users:
   * - Each IDLE subscription uses a dedicated connection
   * - The service layer should use Redis Pub/Sub to distribute
   *   notifications to all app instances
   * - Consider connection limits per server (usually ~10-50 concurrent)
   *
   * @param callback Function called when changes are detected
   * @param folder Folder to monitor (default: INBOX)
   * @returns Subscription handle to stop monitoring
   */
  async subscribeToChanges(
    callback: ChangeCallback,
    folder = 'INBOX',
  ): Promise<ProviderSubscription> {
    this.ensureConnected();

    if (!this.imapConfig) {
      throw new Error('IMAP configuration not set');
    }

    // Stop any existing IDLE subscription
    await this.stopIdleSubscription();

    // Resolve folder path
    const folderPath = await this.resolveFolder(folder);
    this.idleFolder = folderPath;
    this.idleCallback = callback;

    // Create dedicated IDLE connection (separate from pool)
    // IDLE blocks the connection, so it can't be shared
    this.idleConnection = new ImapFlow({
      host: this.imapConfig.host,
      port: this.imapConfig.port,
      secure: this.imapConfig.secure,
      auth: this.imapConfig.auth,
      logger: false,
      // IDLE configuration
      disableAutoIdle: false,  // Enable auto-IDLE
      maxIdleTime: 29 * 60 * 1000, // 29 minutes (RFC recommends < 30 min)
    });

    await this.idleConnection.connect();
    this.idleActive = true;

    // Set up event handlers BEFORE selecting mailbox
    this.setupIdleEventHandlers();

    // Select the folder to start IDLE monitoring
    // ImapFlow automatically enters IDLE when the mailbox is opened
    await this.idleConnection.mailboxOpen(folderPath);

    this.logger.log(`IDLE subscription started for folder: ${folderPath}`);

    // Return subscription handle
    return {
      unsubscribe: async (): Promise<void> => {
        await this.stopIdleSubscription();
      },
      isActive: (): boolean => {
        return this.idleActive && (this.idleConnection?.usable ?? false);
      },
    };
  }

  /**
   * Set up event handlers for IDLE notifications
   */
  private setupIdleEventHandlers(): void {
    if (!this.idleConnection) return;

    // 'exists' - New messages or message count changed
    this.idleConnection.on('exists', async (data: { path: string; count: number; prevCount: number }) => {
      this.logger.debug(`IDLE exists event: ${data.path} count=${data.count} prev=${data.prevCount}`);

      if (!this.idleCallback) return;

      // New messages detected
      if (data.count > data.prevCount) {
        const newCount = data.count - data.prevCount;
        const changes: ProviderChange[] = [];

        // AUDIT FIX #1: Emit folder:uid format for consistency
        // For new messages, we signal a sync trigger with special format
        // The sync service should perform a full sync to get actual UIDs
        for (let i = 0; i < newCount; i++) {
          changes.push({
            type: 'added',
            // Use folder:__NEW__ to signal new messages need sync
            // This is a trigger, not an actual message ID
            messageId: `${data.path}:__NEW__${Date.now()}_${i}`,
            folder: this.pathToCanonicalFolder(data.path),
            timestamp: new Date(),
          });
        }

        try {
          await this.idleCallback(changes);
        } catch (error) {
          this.logger.error('Error in IDLE callback (exists):', error);
        }
      }
    });

    // 'expunge' - Message deleted
    // Note: Using 'as any' because ImapFlow types may not include all event types
    // AUDIT FIX #1: Sequence numbers are unreliable (they change on deletion)
    // Use special __EXPUNGE__ marker to signal that sync service should reconcile
    (this.idleConnection as any).on('expunge', async (data: { path: string; seq: number }) => {
      this.logger.debug(`IDLE expunge event: ${data.path} seq=${data.seq}`);

      if (!this.idleCallback) return;

      // AUDIT FIX #1: Emit folder:__EXPUNGE__ to signal deletion reconciliation needed
      // Cannot reliably map sequence number to UID after expunge
      // The sync service should query the DB for messages in this folder
      // and reconcile with current server state
      const changes: ProviderChange[] = [{
        type: 'deleted',
        // Use folder:__EXPUNGE__seq to signal deletion happened
        // Sync service should reconcile by checking which UIDs no longer exist
        messageId: `${data.path}:__EXPUNGE__${data.seq}`,
        folder: this.pathToCanonicalFolder(data.path),
        timestamp: new Date(),
      }];

      try {
        await this.idleCallback(changes);
      } catch (error) {
        this.logger.error('Error in IDLE callback (expunge):', error);
      }
    });

    // 'flags' - Message flags changed (read/unread, starred, etc.)
    // Note: Using 'as any' because ImapFlow types may not include all event types
    (this.idleConnection as any).on('flags', async (data: { path: string; seq: number; uid?: number; flags: Set<string> }) => {
      this.logger.debug(`IDLE flags event: ${data.path} seq=${data.seq} uid=${data.uid} flags=${Array.from(data.flags).join(',')}`);

      if (!this.idleCallback) return;

      // AUDIT FIX #1: Use consistent folder:uid format
      // If UID is available, use folder:uid (e.g., "INBOX:123")
      // If only seq is available, use folder:__FLAGS__seq to signal reconciliation needed
      const messageId = data.uid
        ? `${data.path}:${data.uid}`
        : `${data.path}:__FLAGS__${data.seq}`;

      const changes: ProviderChange[] = [{
        type: 'modified',
        messageId,
        folder: this.pathToCanonicalFolder(data.path),
        timestamp: new Date(),
      }];

      try {
        await this.idleCallback(changes);
      } catch (error) {
        this.logger.error('Error in IDLE callback (flags):', error);
      }
    });

    // Q-5 FIX: Connection error handling - clean up resources to prevent leak
    this.idleConnection.on('error', (error: Error) => {
      this.logger.error('IDLE connection error:', error);
      this.idleActive = false;
      // Clean up the stale connection reference to prevent resource leak
      this.idleConnection = undefined;
      this.idleCallback = undefined;
      this.idleFolder = undefined;
    });

    // Q-5 FIX: Connection close handling - clean up resources to prevent leak
    this.idleConnection.on('close', () => {
      this.logger.warn('IDLE connection closed');
      this.idleActive = false;
      // Clean up the stale connection reference to prevent resource leak
      this.idleConnection = undefined;
      this.idleCallback = undefined;
      this.idleFolder = undefined;
    });
  }

  /**
   * Stop the IDLE subscription and close the dedicated connection
   */
  private async stopIdleSubscription(): Promise<void> {
    if (this.idleConnection) {
      try {
        if (this.idleConnection.usable) {
          await this.idleConnection.logout();
        }
      } catch (error) {
        this.logger.warn('Error closing IDLE connection:', error);
      }
      this.idleConnection = undefined;
    }

    this.idleCallback = undefined;
    this.idleFolder = undefined;
    this.idleActive = false;
  }

  private normalizeHtmlContent(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    if (Buffer.isBuffer(value)) {
      return value.toString('utf8');
    }
    return undefined;
  }

  /**
   * Convert IMAP folder path to canonical folder type
   */
  private pathToCanonicalFolder(path: string): CanonicalFolderType {
    // Check folder cache for canonical type
    if (this.folderCache) {
      const folder = this.folderCache.folders.find((f) => f.path === path);
      if (folder) {
        return folder.type;
      }
    }

    // Fallback to heuristic mapping
    return folderNameToCanonical(path.split('/').pop() || path);
  }

  // ============================================
  // Connection Pool Management
  // ============================================

  /**
   * Acquire a connection from the pool or create a new one
   * BUG-1 FIX: Uses async-mutex Semaphore instead of busy-wait polling
   * This prevents CPU-wasteful polling and ensures FIFO ordering
   * @param skipConnectionCheck Skip the connected check (used during initial connect)
   */
  private async acquireConnection(skipConnectionCheck = false): Promise<ImapFlow> {
    if (!skipConnectionCheck) {
      this.ensureConnected();
    }

    if (!this.imapConfig) {
      throw new Error('IMAP configuration not set. Call connect() first.');
    }

    // BUG-1 FIX: Acquire semaphore slot with timeout (replaces busy-wait)
    // The semaphore ensures we never exceed maxConnectionsPerUser concurrent operations
    // withTimeout wrapping ensures we don't wait forever (throws E_TIMEOUT on timeout)
    let _semaphoreValue: number;
    let semaphoreRelease: () => void;
    try {
      [_semaphoreValue, semaphoreRelease] = await this.poolSemaphore.acquire();
    } catch {
      // E_TIMEOUT error from async-mutex means timeout waiting for slot
      throw new Error('Timeout waiting for available IMAP connection');
    }

    try {
      // Clean up idle connections first (ML-1 fix: properly await async cleanup)
      await this.cleanupIdleConnections();

      // Try to find an available connection in pool
      const available = this.connectionPool.find((p) => !p.inUse);
      if (available) {
        available.inUse = true;
        available.lastUsed = Date.now();
        // Store semaphore release function for later
        (available as any)._semaphoreRelease = semaphoreRelease;
        return available.client;
      }

      // Pool isn't full, create new connection
      if (this.connectionPool.length < POOL_CONFIG.maxConnectionsPerUser) {
        const client = new ImapFlow({
          host: this.imapConfig.host,
          port: this.imapConfig.port,
          secure: this.imapConfig.secure,
          auth: this.imapConfig.auth,
          logger: false,
        });

        await client.connect();

        // Phase 5: Detect server capabilities after connection (API Compliance)
        this.detectServerCapabilities(client);

        const pooled: PooledConnection = {
          client,
          lastUsed: Date.now(),
          inUse: true,
        };
        // Store semaphore release function for later
        (pooled as any)._semaphoreRelease = semaphoreRelease;
        this.connectionPool.push(pooled);
        return client;
      }

      // Should not reach here if semaphore count matches pool size
      // but handle gracefully just in case
      throw new Error('No IMAP connection available in pool');
    } catch (error) {
      // Release semaphore on error
      semaphoreRelease();
      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   * BUG-1 FIX: Also releases the semaphore slot
   */
  private releaseConnection(client: ImapFlow): void {
    const pooled = this.connectionPool.find((p) => p.client === client);
    if (pooled) {
      pooled.inUse = false;
      pooled.lastUsed = Date.now();
      // BUG-1 FIX: Release semaphore slot
      const release = (pooled as any)._semaphoreRelease;
      if (typeof release === 'function') {
        release();
        delete (pooled as any)._semaphoreRelease;
      }
    }
  }

  /**
   * Clean up idle connections
   * Memory leak fix (ML-1): Properly await logout to ensure connections are closed
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];
    const logoutPromises: Promise<void>[] = [];

    this.connectionPool.forEach((pooled, index) => {
      if (
        !pooled.inUse &&
        now - pooled.lastUsed > POOL_CONFIG.connectionIdleTimeout
      ) {
        // Collect logout promises to await them properly
        if (pooled.client.usable) {
          logoutPromises.push(
            pooled.client.logout().catch((err) => {
              this.logger.debug(`Error during cleanup logout: ${err.message}`);
            }),
          );
        }
        toRemove.push(index);
      }
    });

    // Wait for all logouts to complete before removing from pool
    if (logoutPromises.length > 0) {
      await Promise.all(logoutPromises);
    }

    // Remove in reverse order to maintain indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.connectionPool.splice(toRemove[i], 1);
    }
  }

  /**
   * Execute an operation with automatic connection handling
   */
  private async withConnection<T>(
    operation: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const client = await this.acquireConnection();
    try {
      return await operation(client);
    } finally {
      this.releaseConnection(client);
    }
  }

  // ============================================
  // Capability Detection (Phase 5: API Compliance)
  // ============================================

  /**
   * Detect server capabilities after connection
   * RFC 7162: CONDSTORE/QRESYNC for efficient incremental sync
   * RFC 2177: IDLE for real-time notifications
   * RFC 6154: SPECIAL-USE for folder type detection
   */
  private detectServerCapabilities(client: ImapFlow): void {
    try {
      // ImapFlow exposes capabilities after connection via client.capabilities
      // It's a Set<string> of capability names advertised by the server
      const caps = client.capabilities;

      if (caps && caps.size > 0) {
        this.serverCapabilities = {
          condstore: caps.has('CONDSTORE'),
          qresync: caps.has('QRESYNC'),
          idle: caps.has('IDLE'),
          specialUse: caps.has('SPECIAL-USE'),
        };

        this.logger.log(
          `IMAP capabilities detected: CONDSTORE=${this.serverCapabilities.condstore}, ` +
          `QRESYNC=${this.serverCapabilities.qresync}, IDLE=${this.serverCapabilities.idle}, ` +
          `SPECIAL-USE=${this.serverCapabilities.specialUse}`,
        );
      } else {
        this.logger.warn('Unable to detect IMAP server capabilities');
      }
    } catch (error) {
      this.logger.warn(`Failed to detect server capabilities: ${error}`);
    }
  }

  /**
   * Get server capabilities (for external use by sync services)
   * Allows sync services to choose optimal sync strategy based on server support
   */
  getCapabilities(): {
    condstore: boolean;
    qresync: boolean;
    idle: boolean;
    specialUse: boolean;
  } {
    return { ...this.serverCapabilities };
  }

  /**
   * Check if server supports efficient delta sync (CONDSTORE)
   */
  supportsCondstore(): boolean {
    return this.serverCapabilities.condstore;
  }

  /**
   * Check if server supports QRESYNC (requires CONDSTORE)
   */
  supportsQresync(): boolean {
    return this.serverCapabilities.qresync;
  }

  // ============================================
  // Folder Operations
  // ============================================

  async listFolders(): Promise<CanonicalFolder[]> {
    // Check cache first
    if (
      this.folderCache &&
      Date.now() - this.folderCache.cachedAt < this.FOLDER_CACHE_TTL
    ) {
      return this.folderCache.folders;
    }

    const folders = await this.withConnection(async (client) => {
      const mailboxes = await client.list();
      return mailboxes.map((mb) => this.mailboxToCanonicalFolder(mb));
    });

    // Update cache
    this.folderCache = {
      folders,
      cachedAt: Date.now(),
    };

    return folders;
  }

  async getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null> {
    const folders = await this.listFolders();

    // Try exact path match first
    let folder = folders.find(
      (f) => f.path === folderIdOrPath || f.id === folderIdOrPath,
    );

    // Try canonical type match
    if (!folder) {
      folder = folders.find(
        (f) => f.type.toUpperCase() === folderIdOrPath.toUpperCase(),
      );
    }

    // Try name match (case-insensitive)
    if (!folder) {
      folder = folders.find(
        (f) => f.name.toLowerCase() === folderIdOrPath.toLowerCase(),
      );
    }

    return folder || null;
  }

  async createFolder(name: string, parentId?: string): Promise<CanonicalFolder> {
    return this.withConnection(async (client) => {
      const path = parentId ? `${parentId}/${name}` : name;
      await client.mailboxCreate(path);

      // Refresh folder cache
      this.folderCache = undefined;

      // Get the created folder
      const folder = await this.getFolder(path);
      if (!folder) {
        throw new Error(`Failed to create folder: ${path}`);
      }
      return folder;
    });
  }

  async deleteFolder(folderId: string): Promise<void> {
    return this.withConnection(async (client) => {
      // IMAP folder deletion per RFC 3501 requires careful handling:
      // 1. Cannot delete currently selected mailbox
      // 2. Some servers require empty folder before deletion
      // 3. Some servers don't allow deleting folders with sub-folders
      // 4. Must unsubscribe first on some servers
      //
      // References:
      // - RFC 3501: https://tools.ietf.org/html/rfc3501
      // - ImapFlow docs: https://imapflow.com/module-imapflow-ImapFlow.html

      // Step 1: Close any open mailbox by selecting INBOX
      // Per RFC 3501: DELETE command is forbidden on the currently selected mailbox
      try {
        // Use NOOP or select INBOX to deselect the target folder
        await client.noop();
      } catch {
        // Ignore NOOP errors
      }

      // Step 2: Unsubscribe from folder (required by some servers)
      try {
        await client.mailboxUnsubscribe(folderId);
      } catch {
        // Ignore unsubscribe errors - folder may not be subscribed
      }

      // Step 3: Empty the folder first (some servers require empty folder)
      // Select and expunge all messages
      try {
        const lock = await client.getMailboxLock(folderId);
        try {
          const uids = await client.search({}, { uid: true });
          if (uids && uids.length > 0) {
            await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
            await client.messageDelete(uids, { uid: true });
          }
        } finally {
          lock.release();
        }
      } catch {
        // Ignore errors - folder might be non-selectable or already empty
      }

      // Step 4: IMPORTANT - Deselect the folder by selecting INBOX
      // This is crucial: we need to NOT have the target folder selected
      try {
        const inboxLock = await client.getMailboxLock('INBOX');
        inboxLock.release();
      } catch {
        // Ignore - just ensuring we're not in the target folder
      }

      // Small delay for server to process the deselection
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 5: Delete the folder with retries and alternative approaches
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await client.mailboxDelete(folderId);
          this.folderCache = undefined;
          return; // Success
        } catch (error: any) {
          lastError = error;
          const errorMsg = error.message || '';

          // Check if it's a "mailbox in use" or similar error
          if (errorMsg.includes('in use') || errorMsg.includes('selected')) {
            // Try harder to deselect - send CLOSE command
            this.logger.warn(`Folder still in use, attempting CLOSE: ${errorMsg}`);
            try {
              await client.noop();
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch {
              // Ignore
            }
          }

          // Check if folder has children (some servers block deletion of parent folders)
          if (errorMsg.includes('hierarchi') || errorMsg.includes('inferior')) {
            this.logger.warn(`Folder may have subfolders, cannot delete: ${errorMsg}`);
            throw new Error(`Cannot delete folder with subfolders: ${folderId}`);
          }

          this.logger.warn(`Folder delete attempt ${attempt + 1} failed: ${errorMsg}`);
          // Wait between retries with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }

      // If all retries failed, throw the last error
      if (lastError) {
        // Check if this might be a server-side limitation (common with free email providers)
        const errorMsg = lastError.message || '';
        if (errorMsg.includes('Command failed') || errorMsg.includes('Permission')) {
          throw new Error(
            `Server does not support folder deletion via IMAP: ${folderId}. ` +
            `This is a known limitation of some email providers. ` +
            `Use webmail interface to delete folders.`
          );
        }
        throw new Error(`Failed to delete folder ${folderId} after 3 attempts: ${lastError.message}`);
      }
    });
  }

  async renameFolder(folderId: string, newName: string): Promise<void> {
    return this.withConnection(async (client) => {
      // Get parent path if nested
      const lastSep = folderId.lastIndexOf('/');
      const newPath = lastSep >= 0 ? `${folderId.substring(0, lastSep)}/${newName}` : newName;

      await client.mailboxRename(folderId, newPath);
      this.folderCache = undefined;
    });
  }

  // ============================================
  // Message Listing
  // ============================================

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    return this.withConnection(async (client) => {
      // Resolve folder path from canonical type
      const folderPath = await this.resolveFolder(options.folder);
      const includeBody = options.includeBody === true;

      const lock = await client.getMailboxLock(folderPath);
      try {
        const mailbox = client.mailbox as MailboxObject;
        const pageSize = options.pageSize || 50;

        // Build search criteria
        const searchCriteria = this.buildSearchCriteria(options);

        // Search for messages
        let uids: number[];
        try {
          const searchResult = await client.search(searchCriteria, { uid: true });
          uids = searchResult || [];
        } catch {
          // Fallback to all messages if search fails
          const fallbackResult = await client.search({}, { uid: true });
          uids = fallbackResult || [];
        }

        // Sort by UID descending (newest first) and paginate
        uids.sort((a, b) => b - a);

        // Handle pagination via pageToken (which is the last UID seen)
        let startIndex = 0;
        if (options.pageToken) {
          const lastUid = parseInt(options.pageToken, 10);
          startIndex = uids.findIndex((uid) => uid < lastUid);
          if (startIndex < 0) startIndex = uids.length;
        }

        const pageUids = uids.slice(startIndex, startIndex + pageSize);
        const hasMore = startIndex + pageSize < uids.length;

        if (pageUids.length === 0) {
          return {
            messages: [],
            hasMore: false,
            totalEstimate: uids.length,
          };
        }

        // Fetch message metadata
        const messages: CanonicalMessage[] = [];
        const uidSet = pageUids.join(',');

        const fetchOptions: any = {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          size: true,
        };

        if (includeBody) {
          fetchOptions.source = true;
        }

        for await (const msg of client.fetch(uidSet, fetchOptions, { uid: true })) {
          const canonical = this.fetchMessageToCanonical(msg, folderPath);

          if (includeBody && msg.source) {
            try {
              const parsed = await simpleParser(msg.source);
              canonical.bodyText = parsed.text || undefined;
              canonical.bodyHtml = this.normalizeHtmlContent(parsed.html);
              const attachments = this.extractAttachmentMeta(parsed);
              if (attachments.length > 0) {
                canonical.attachments = attachments;
              }
              canonical.hasAttachments = canonical.hasAttachments || attachments.length > 0;
            } catch (parseError) {
              this.logger.warn(`Failed to parse message ${canonical.id} during list`, parseError);
            }
          }

          messages.push(canonical);
        }

        // Sort messages by receivedAt descending
        messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

        const nextPageToken = hasMore && pageUids.length > 0
          ? pageUids[pageUids.length - 1].toString()
          : undefined;

        return {
          messages,
          nextPageToken,
          hasMore,
          totalEstimate: mailbox.exists,
        };
      } finally {
        lock.release();
      }
    });
  }

  async getMessage(
    messageId: string,
    options?: GetMessageOptions,
  ): Promise<CanonicalMessage | null> {
    return this.withConnection(async (client) => {
      // messageId format: "folder:uid"
      const [folderPath, uidStr] = this.parseMessageId(messageId);
      const uid = parseInt(uidStr, 10);

      const lock = await client.getMailboxLock(folderPath);
      try {
        // Fetch with or without body
        const fetchOptions: any = {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          size: true,
        };

        if (options?.includeBody !== false) {
          fetchOptions.source = true;
        }

        const msg = await client.fetchOne(uid.toString(), fetchOptions, {
          uid: true,
        });

        if (!msg) {
          return null;
        }

        let bodyText: string | undefined;
        let bodyHtml: string | undefined;
        let attachments: AttachmentMeta[] = [];

        // Parse full message if source is available
        if (msg.source) {
          try {
            const parsed = await simpleParser(msg.source);
            bodyText = parsed.text || undefined;
            bodyHtml = this.normalizeHtmlContent(parsed.html);
            attachments = this.extractAttachmentMeta(parsed);
          } catch (parseError) {
            this.logger.warn(`Failed to parse message ${messageId}`, parseError);
          }
        }

        const canonical = this.fetchMessageToCanonical(msg, folderPath);
        canonical.bodyText = bodyText;
        canonical.bodyHtml = bodyHtml;
        canonical.attachments = attachments;
        canonical.hasAttachments = attachments.length > 0;

        return canonical;
      } finally {
        lock.release();
      }
    });
  }

  // ============================================
  // Message Mutations
  // ============================================

  async sendMessage(message: ComposeMessage): Promise<string> {
    if (!this.smtpConfig) {
      throw new Error('SMTP not configured');
    }

    const transporter = nodemailer.createTransport({
      host: this.smtpConfig.host,
      port: this.smtpConfig.port,
      secure: this.smtpConfig.secure,
      auth: this.smtpConfig.auth,
    });

    const result = await transporter.sendMail({
      from: message.fromEmail || this.userEmail,
      to: message.to.map((a) => this.formatEmailAddress(a)).join(', '),
      cc: message.cc?.map((a) => this.formatEmailAddress(a)).join(', '),
      bcc: message.bcc?.map((a) => this.formatEmailAddress(a)).join(', '),
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml,
      attachments: message.attachments?.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.mimeType,
      })),
      inReplyTo: message.inReplyTo,
      references: message.references,
    });

    // Also save to Sent folder via IMAP
    await this.saveSentMessage(message);

    return result.messageId || `sent-${Date.now()}`;
  }

  async saveDraft(
    message: ComposeMessage,
    existingDraftId?: string,
  ): Promise<string> {
    return this.withConnection(async (client) => {
      // Find drafts folder
      const draftsFolder = await this.resolveFolder('DRAFTS');

      // Delete existing draft if updating
      if (existingDraftId) {
        try {
          await this.deleteMessage(existingDraftId, true);
        } catch {
          // Ignore if delete fails
        }
      }

      // Build RFC 822 message
      const rfc822 = this.buildRfc822Message(message);

      // Append to Drafts folder with \Draft flag
      const result = await client.append(draftsFolder, rfc822, ['\\Draft', '\\Seen']);

      // Handle result - append can return false on failure
      if (!result || typeof result === 'boolean') {
        throw new Error('Failed to save draft');
      }

      return `${draftsFolder}:${result.uid}`;
    });
  }

  async sendDraft(draftId: string): Promise<void> {
    // Get the draft message
    const draft = await this.getMessage(draftId, { includeBody: true });
    if (!draft) {
      throw new Error(`Draft not found: ${draftId}`);
    }

    // Convert to ComposeMessage and send
    const message: ComposeMessage = {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml || '',
      bodyText: draft.bodyText,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
    };

    await this.sendMessage(message);

    // Delete the draft
    await this.deleteMessage(draftId, true);
  }

  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    return this.withConnection(async (client) => {
      const [sourceFolder, uidStr] = this.parseMessageId(messageId);
      const uid = parseInt(uidStr, 10);
      const targetPath = await this.resolveFolder(targetFolder);

      const lock = await client.getMailboxLock(sourceFolder);
      try {
        await client.messageMove([uid], targetPath, { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    return this.withConnection(async (client) => {
      const [sourceFolder, uidStr] = this.parseMessageId(messageId);
      const uid = parseInt(uidStr, 10);
      const targetPath = await this.resolveFolder(targetFolder);

      const lock = await client.getMailboxLock(sourceFolder);
      try {
        const result = await client.messageCopy([uid], targetPath, { uid: true });
        // Return the new message ID
        // messageCopy can return false on failure or CopyResponseObject on success
        if (!result || typeof result === 'boolean') {
          return `${targetPath}:${uid}`; // Fallback to original UID
        }
        const newUid = result.uidMap?.get(uid);
        return `${targetPath}:${newUid || uid}`;
      } finally {
        lock.release();
      }
    });
  }

  async deleteMessage(messageId: string, permanent = false): Promise<void> {
    return this.withConnection(async (client) => {
      const [folderPath, uidStr] = this.parseMessageId(messageId);
      const uid = parseInt(uidStr, 10);

      const lock = await client.getMailboxLock(folderPath);
      try {
        if (permanent) {
          // Add \Deleted flag and expunge
          await client.messageFlagsAdd([uid], ['\\Deleted'], { uid: true });
          await client.messageDelete([uid], { uid: true });
        } else {
          // Move to Trash
          const trashPath = await this.resolveFolder('TRASH');
          await client.messageMove([uid], trashPath, { uid: true });
        }
      } finally {
        lock.release();
      }
    });
  }

  // ============================================
  // Flags / Status
  // ============================================

  async setReadStatus(messageId: string, isRead: boolean): Promise<void> {
    return this.withConnection(async (client) => {
      const [folderPath, uidStr] = this.parseMessageId(messageId);
      const uid = parseInt(uidStr, 10);

      const lock = await client.getMailboxLock(folderPath);
      try {
        if (isRead) {
          await client.messageFlagsAdd([uid], ['\\Seen'], { uid: true });
        } else {
          await client.messageFlagsRemove([uid], ['\\Seen'], { uid: true });
        }
      } finally {
        lock.release();
      }
    });
  }

  async setStarredStatus(messageId: string, isStarred: boolean): Promise<void> {
    return this.withConnection(async (client) => {
      const [folderPath, uidStr] = this.parseMessageId(messageId);
      const uid = parseInt(uidStr, 10);

      const lock = await client.getMailboxLock(folderPath);
      try {
        if (isStarred) {
          await client.messageFlagsAdd([uid], ['\\Flagged'], { uid: true });
        } else {
          await client.messageFlagsRemove([uid], ['\\Flagged'], { uid: true });
        }
      } finally {
        lock.release();
      }
    });
  }

  async setFlaggedStatus(messageId: string, isFlagged: boolean): Promise<void> {
    // In IMAP, \Flagged is used for both starred and flagged
    return this.setStarredStatus(messageId, isFlagged);
  }

  // ============================================
  // Batch Operations
  // ============================================

  async batchSetReadStatus(
    updates: Array<{ id: string; isRead: boolean }>,
  ): Promise<void> {
    // Group by folder for efficient batch processing
    const byFolder = new Map<string, Array<{ uid: number; isRead: boolean }>>();

    for (const update of updates) {
      const [folder, uidStr] = this.parseMessageId(update.id);
      const uid = parseInt(uidStr, 10);

      if (!byFolder.has(folder)) {
        byFolder.set(folder, []);
      }
      byFolder.get(folder)!.push({ uid, isRead: update.isRead });
    }

    // Process each folder
    return this.withConnection(async (client) => {
      for (const [folder, folderUpdates] of byFolder) {
        const lock = await client.getMailboxLock(folder);
        try {
          const toRead = folderUpdates.filter((u) => u.isRead).map((u) => u.uid);
          const toUnread = folderUpdates.filter((u) => !u.isRead).map((u) => u.uid);

          if (toRead.length > 0) {
            await client.messageFlagsAdd(toRead, ['\\Seen'], { uid: true });
          }
          if (toUnread.length > 0) {
            await client.messageFlagsRemove(toUnread, ['\\Seen'], { uid: true });
          }
        } finally {
          lock.release();
        }
      }
    });
  }

  async batchMoveMessages(
    messageIds: string[],
    targetFolder: string,
  ): Promise<void> {
    // Group by source folder
    const byFolder = new Map<string, number[]>();

    for (const id of messageIds) {
      const [folder, uidStr] = this.parseMessageId(id);
      const uid = parseInt(uidStr, 10);

      if (!byFolder.has(folder)) {
        byFolder.set(folder, []);
      }
      byFolder.get(folder)!.push(uid);
    }

    const targetPath = await this.resolveFolder(targetFolder);

    return this.withConnection(async (client) => {
      for (const [folder, uids] of byFolder) {
        const lock = await client.getMailboxLock(folder);
        try {
          await client.messageMove(uids, targetPath, { uid: true });
        } finally {
          lock.release();
        }
      }
    });
  }

  async batchDeleteMessages(
    messageIds: string[],
    permanent = false,
  ): Promise<void> {
    if (permanent) {
      // Group by folder for batch delete
      const byFolder = new Map<string, number[]>();

      for (const id of messageIds) {
        const [folder, uidStr] = this.parseMessageId(id);
        const uid = parseInt(uidStr, 10);

        if (!byFolder.has(folder)) {
          byFolder.set(folder, []);
        }
        byFolder.get(folder)!.push(uid);
      }

      return this.withConnection(async (client) => {
        for (const [folder, uids] of byFolder) {
          const lock = await client.getMailboxLock(folder);
          try {
            await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
            await client.messageDelete(uids, { uid: true });
          } finally {
            lock.release();
          }
        }
      });
    } else {
      // Move all to trash
      await this.batchMoveMessages(messageIds, 'TRASH');
    }
  }

  // ============================================
  // Attachments
  // ============================================

  async getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<AttachmentData> {
    const message = await this.getMessage(messageId, { includeBody: true });
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    // Get the raw message to extract attachment
    return this.withConnection(async (client) => {
      const [folderPath, uidStr] = this.parseMessageId(messageId);
      const uid = parseInt(uidStr, 10);

      const lock = await client.getMailboxLock(folderPath);
      try {
        const source = await client.download(uid.toString(), undefined, {
          uid: true,
        });

        const chunks: Buffer[] = [];
        for await (const chunk of source.content) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        const parsed = await simpleParser(buffer);

        // Find the attachment
        const attachments = parsed.attachments || [];
        const attachment = attachments.find(
          (att: any, index: number) =>
            (att.contentId || `att_${index}`) === attachmentId,
        );

        if (!attachment) {
          throw new Error(`Attachment not found: ${attachmentId}`);
        }

        return {
          id: attachmentId,
          filename: attachment.filename || 'attachment',
          mimeType: attachment.contentType || 'application/octet-stream',
          size: attachment.size || 0,
          isInline: !!attachment.contentId,
          contentId: attachment.contentId,
          content: attachment.content.toString('base64'),
        };
      } finally {
        lock.release();
      }
    });
  }

  // ============================================
  // Sync / Real-time (CONDSTORE/QRESYNC)
  // ============================================

  /**
   * AUDIT FIX #6: Folders to sync incrementally
   * These are the main folders that users care about for sync
   */
  private readonly SYNC_FOLDERS = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'ARCHIVE', 'SPAM'];

  /**
   * Get changes since last sync using CONDSTORE/QRESYNC
   * Uses HIGHESTMODSEQ for efficient incremental sync
   *
   * AUDIT FIX #6: Now syncs ALL important folders, not just INBOX
   *
   * IMAP Best Practices 2025:
   * - Use CONDSTORE extension for change tracking
   * - MODSEQ is monotonically increasing per-folder
   * - More efficient than date-based search
   * - Sync all user-relevant folders
   */
  async getChangesSince(syncToken: string): Promise<ChangesResult> {
    this.ensureConnected();

    return this.withConnection(async (client) => {
      const changes: ProviderChange[] = [];

      // AUDIT FIX #6: Parse multi-folder sync token
      // Format: "INBOX:123,SENT:456,DRAFTS:789" or legacy single number
      const folderModSeqs = this.parseSyncToken(syncToken);

      try {
        const newModSeqs: Map<string, bigint> = new Map();
        let hasCondstore = true;

        // AUDIT FIX #6: Sync ALL important folders
        for (const canonicalFolder of this.SYNC_FOLDERS) {
          try {
            const folderPath = await this.resolveFolder(canonicalFolder);
            const lastModSeq = folderModSeqs.get(canonicalFolder) || 0n;

            const lock = await client.getMailboxLock(folderPath);
            try {
              // Check if server supports CONDSTORE
              const mailboxStatus = await client.status(folderPath, {
                highestModseq: true,
              });

              if (!mailboxStatus.highestModseq) {
                // Server doesn't support CONDSTORE
                hasCondstore = false;
                this.logger.warn(`IMAP server does not support CONDSTORE for ${folderPath}`);
                continue;
              }

              const currentModSeq = mailboxStatus.highestModseq;
              newModSeqs.set(canonicalFolder, currentModSeq);

              // If no changes in this folder, skip to next
              if (currentModSeq <= lastModSeq) {
                continue;
              }

              // Fetch messages modified since lastModSeq
              for await (const message of client.fetch(
                { modseq: lastModSeq + 1n },
                {
                  uid: true,
                  flags: true,
                  envelope: true,
                },
                { uid: true },
              )) {
                // AUDIT FIX #1: Use folder:uid format for consistent message IDs
                const messageId = `${folderPath}:${message.uid}`;

                if (message.flags?.has('\\Deleted')) {
                  changes.push({
                    messageId,
                    type: 'deleted',
                    folder: canonicalFolder,
                    timestamp: new Date(),
                  });
                } else {
                  changes.push({
                    messageId,
                    type: 'modified',
                    folder: canonicalFolder,
                    timestamp: new Date(),
                  });
                }
              }
            } finally {
              lock.release();
            }
          } catch (folderError: any) {
            // Skip folders that don't exist or can't be accessed
            this.logger.debug(`Skipping folder ${canonicalFolder}: ${folderError.message}`);
          }
        }

        // Build new sync token
        const newSyncToken = hasCondstore
          ? this.buildSyncToken(newModSeqs)
          : Date.now().toString();

        return {
          changes,
          newSyncToken,
          hasMore: false,
        };
      } catch (error: any) {
        this.logger.error(`IMAP getChangesSince failed: ${error.message}`);

        const fallbackToken = Date.now().toString();
        return {
          changes: [],
          newSyncToken: fallbackToken,
          hasMore: false,
        };
      }
    });
  }

  /**
   * Parse multi-folder sync token
   * AUDIT FIX #6: Support format "INBOX:123,SENT:456" or legacy single number
   */
  private parseSyncToken(syncToken: string): Map<string, bigint> {
    const result = new Map<string, bigint>();

    // Check if it's legacy format (single number)
    if (/^\d+$/.test(syncToken)) {
      // Legacy: apply same modseq to INBOX only
      result.set('INBOX', BigInt(syncToken));
      return result;
    }

    // Parse multi-folder format: "INBOX:123,SENT:456,DRAFTS:789"
    const parts = syncToken.split(',');
    for (const part of parts) {
      const [folder, modseq] = part.split(':');
      if (folder && modseq) {
        try {
          result.set(folder, BigInt(modseq));
        } catch {
          // Skip invalid entries
        }
      }
    }

    return result;
  }

  /**
   * Build multi-folder sync token
   * AUDIT FIX #6: Format "INBOX:123,SENT:456,DRAFTS:789"
   */
  private buildSyncToken(modSeqs: Map<string, bigint>): string {
    const parts: string[] = [];
    for (const [folder, modseq] of modSeqs) {
      parts.push(`${folder}:${modseq.toString()}`);
    }
    return parts.join(',') || Date.now().toString();
  }

  /**
   * Get initial sync token for delta sync
   * AUDIT FIX #6: Returns HIGHESTMODSEQ for ALL important folders
   * Format: "INBOX:123,SENT:456,DRAFTS:789"
   */
  async getInitialSyncToken(): Promise<string> {
    this.ensureConnected();

    return this.withConnection(async (client) => {
      const modSeqs = new Map<string, bigint>();
      let hasCondstore = false;

      // AUDIT FIX #6: Get modseq for all important folders
      for (const canonicalFolder of this.SYNC_FOLDERS) {
        try {
          const folderPath = await this.resolveFolder(canonicalFolder);
          const mailboxStatus = await client.status(folderPath, {
            highestModseq: true,
          });

          if (mailboxStatus.highestModseq) {
            modSeqs.set(canonicalFolder, mailboxStatus.highestModseq);
            hasCondstore = true;
          }
        } catch (error: any) {
          // Skip folders that don't exist
          this.logger.debug(`Skipping folder ${canonicalFolder} for initial token: ${error.message}`);
        }
      }

      if (hasCondstore && modSeqs.size > 0) {
        return this.buildSyncToken(modSeqs);
      }

      // Fallback to current timestamp if CONDSTORE not supported
      return Date.now().toString();
    });
  }

  // ============================================
  // User Info
  // ============================================

  async getUserInfo(): Promise<{ email: string; name: string; photo?: string }> {
    return {
      email: this.userEmail || '',
      name: this.userEmail?.split('@')[0] || '',
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Convert IMAP mailbox to canonical folder
   */
  private mailboxToCanonicalFolder(mailbox: any): CanonicalFolder {
    // Try RFC 6154 special-use first
    let type: CanonicalFolderType = mailbox.path;

    if (mailbox.specialUse) {
      const specialUse = Array.isArray(mailbox.specialUse)
        ? mailbox.specialUse[0]
        : mailbox.specialUse;
      const canonical = IMAP_SPECIAL_USE_TO_CANONICAL[specialUse];
      if (canonical) {
        type = canonical;
      }
    }

    // INBOX is always INBOX regardless of localization
    if (mailbox.path.toUpperCase() === 'INBOX') {
      type = 'INBOX';
    }

    // Try heuristic name matching if no special-use
    if (type === mailbox.path) {
      type = folderNameToCanonical(mailbox.name || mailbox.path);
    }

    return {
      id: mailbox.path,
      externalId: mailbox.path,
      name: mailbox.name || mailbox.path,
      type,
      path: mailbox.path,
      parentId: mailbox.parentPath || undefined,
      unreadCount: 0, // Would need STATUS command to get this
      totalCount: 0,
      attributes: {
        // mailbox.flags is a Set in imapflow, use .has() instead of .includes()
        selectable: !mailbox.flags?.has?.('\\Noselect') && !mailbox.flags?.has?.('\\NonExistent'),
        hasChildren: mailbox.flags?.has?.('\\HasChildren') || false,
        subscribed: mailbox.subscribed ?? true,
      },
    };
  }

  /**
   * Convert IMAP FETCH result to canonical message
   */
  private fetchMessageToCanonical(msg: any, folder: string): CanonicalMessage {
    const envelope = msg.envelope || {};
    const flags = msg.flags || new Set<string>();

    // Convert IMAP folder path to canonical type for consistency with other drivers
    const canonicalFolder = this.pathToCanonicalFolder(folder);

    return {
      id: `${folder}:${msg.uid}`,
      externalId: msg.uid.toString(),
      threadId: envelope.messageId || msg.uid.toString(),
      // Use canonical type for folder field (INBOX, SENT, etc.)
      folder: canonicalFolder,
      // Keep the original path as display name for reference
      folderDisplayName: folder,

      from: this.parseImapAddress(envelope.from?.[0]),
      to: (envelope.to || []).map((a: any) => this.parseImapAddress(a)),
      cc: (envelope.cc || []).map((a: any) => this.parseImapAddress(a)),
      bcc: (envelope.bcc || []).map((a: any) => this.parseImapAddress(a)),
      subject: envelope.subject || '(No Subject)',
      messageId: envelope.messageId,
      inReplyTo: envelope.inReplyTo,
      references: envelope.references?.join(' '),

      snippet: envelope.subject?.substring(0, 200) || '',
      receivedAt: envelope.date ? new Date(envelope.date) : new Date(),
      sentAt: envelope.date ? new Date(envelope.date) : undefined,

      isRead: flags.has('\\Seen'),
      isStarred: flags.has('\\Flagged'),
      isFlagged: flags.has('\\Flagged'),
      isDraft: flags.has('\\Draft'),
      isDeleted: flags.has('\\Deleted'),

      labels: this.flagsToLabels(flags),
      hasAttachments: msg.bodyStructure?.childNodes?.length > 0,
      attachments: [],

      providerMetadata: {
        modSeq: msg.modseq?.toString(),
        uid: msg.uid,
        flags: Array.from(flags),
      },
    };
  }

  /**
   * Parse IMAP address to EmailAddress
   */
  private parseImapAddress(address: any): EmailAddress {
    if (!address) {
      return { email: '' };
    }

    const email = address.address || '';
    const name = address.name || undefined;

    return { email, name };
  }

  /**
   * Convert IMAP flags to labels
   */
  private flagsToLabels(flags: Set<string>): string[] {
    const labels: string[] = [];

    if (flags.has('\\Seen')) labels.push('READ');
    if (flags.has('\\Flagged')) labels.push('STARRED');
    if (flags.has('\\Deleted')) labels.push('DELETED');
    if (flags.has('\\Draft')) labels.push('DRAFT');
    if (flags.has('\\Answered')) labels.push('REPLIED');

    return labels;
  }

  /**
   * Build IMAP search criteria from options
   */
  private buildSearchCriteria(options: ListMessagesOptions): any {
    const criteria: any = {};

    if (options.onlyUnread) {
      criteria.unseen = true;
    }

    if (options.since) {
      criteria.since = options.since;
    }

    if (options.before) {
      criteria.before = options.before;
    }

    if (options.query) {
      // Parse query for common patterns
      const query = options.query.toLowerCase();

      if (query.includes('is:unread')) {
        criteria.unseen = true;
      } else if (query.includes('is:starred')) {
        criteria.flagged = true;
      } else if (query.includes('from:')) {
        const match = query.match(/from:([^\s]+)/);
        if (match) criteria.from = match[1];
      } else if (query.includes('to:')) {
        const match = query.match(/to:([^\s]+)/);
        if (match) criteria.to = match[1];
      } else if (query.includes('subject:')) {
        const match = query.match(/subject:([^\s]+)/);
        if (match) criteria.subject = match[1];
      } else {
        // General text search
        criteria.or = [{ subject: options.query }, { body: options.query }];
      }
    }

    // Return empty object for "all" if no criteria
    return Object.keys(criteria).length > 0 ? criteria : {};
  }

  /**
   * Parse message ID to [folder, uid]
   */
  private parseMessageId(messageId: string): [string, string] {
    const lastColon = messageId.lastIndexOf(':');
    if (lastColon < 0) {
      // Assume INBOX if no folder specified
      return ['INBOX', messageId];
    }
    return [messageId.substring(0, lastColon), messageId.substring(lastColon + 1)];
  }

  /**
   * Resolve canonical folder type to actual IMAP folder path
   */
  private async resolveFolder(canonicalOrPath: string): Promise<string> {
    // If it looks like an IMAP path (contains separator or is not uppercase)
    if (canonicalOrPath.includes('/') || canonicalOrPath !== canonicalOrPath.toUpperCase()) {
      return canonicalOrPath;
    }

    // Try to find by canonical type
    const folders = await this.listFolders();
    const folder = folders.find(
      (f) => f.type.toUpperCase() === canonicalOrPath.toUpperCase(),
    );

    if (folder) {
      return folder.path;
    }

    // Fallback to canonical name as-is (e.g., "INBOX")
    return canonicalOrPath;
  }

  /**
   * Encode a string using RFC 2047 if it contains non-ASCII characters.
   * Used for display names in email headers (To, Cc, Bcc, From, Subject).
   * Source: https://www.rfc-editor.org/rfc/rfc2047
   */
  private encodeRfc2047(text: string): string {
    // Check if text contains non-ASCII characters
    if (!/[^\x00-\x7F]/.test(text)) {
      return text; // ASCII only, no encoding needed
    }
    // Use Base64 encoding for non-ASCII text (more reliable than Q-encoding)
    return `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`;
  }

  /**
   * Format email address for SMTP with RFC 2047 encoding for non-ASCII names.
   */
  private formatEmailAddress(address: EmailAddress): string {
    if (address.name) {
      const encodedName = this.encodeRfc2047(address.name);
      // If encoded, don't quote (RFC 2047 encoded-words replace 'word' in 'phrase')
      if (encodedName.startsWith('=?')) {
        return `${encodedName} <${address.email}>`;
      }
      return `"${address.name}" <${address.email}>`;
    }
    return address.email;
  }

  /**
   * Save sent message to Sent folder
   */
  private async saveSentMessage(message: ComposeMessage): Promise<void> {
    return this.withConnection(async (client) => {
      try {
        const sentFolder = await this.resolveFolder('SENT');
        const rfc822 = this.buildRfc822Message(message);
        await client.append(sentFolder, rfc822, ['\\Seen']);
      } catch (error) {
        this.logger.warn('Failed to save sent message to Sent folder', error);
        // Don't throw - the email was sent successfully
      }
    });
  }

  /**
   * Build RFC 822 message from ComposeMessage
   * Applies RFC 2047 encoding for non-ASCII characters in headers
   */
  private buildRfc822Message(message: ComposeMessage): string {
    const lines: string[] = [];

    // Headers
    lines.push(`From: ${message.fromEmail || this.userEmail}`);
    lines.push(`To: ${message.to.map((a) => this.formatEmailAddress(a)).join(', ')}`);

    if (message.cc && message.cc.length > 0) {
      lines.push(`Cc: ${message.cc.map((a) => this.formatEmailAddress(a)).join(', ')}`);
    }
    if (message.bcc && message.bcc.length > 0) {
      lines.push(`Bcc: ${message.bcc.map((a) => this.formatEmailAddress(a)).join(', ')}`);
    }

    // Subject needs RFC 2047 encoding for non-ASCII characters
    lines.push(`Subject: ${this.encodeRfc2047(message.subject)}`);
    lines.push(`Date: ${new Date().toUTCString()}`);
    lines.push(`Message-ID: <${Date.now()}.${Math.random().toString(36)}@${this.userEmail?.split('@')[1] || 'local'}>`);
    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/html; charset=utf-8');

    if (message.inReplyTo) {
      lines.push(`In-Reply-To: ${message.inReplyTo}`);
    }
    if (message.references) {
      lines.push(`References: ${message.references}`);
    }

    // Empty line separating headers from body
    lines.push('');

    // Body
    lines.push(message.bodyHtml);

    return lines.join('\r\n');
  }

  /**
   * Extract attachment metadata from parsed mail
   */
  private extractAttachmentMeta(parsed: {
    attachments?: Array<{
      contentId?: string;
      filename?: string;
      contentType?: string;
      size?: number;
    }>;
  }): AttachmentMeta[] {
    if (!parsed.attachments || parsed.attachments.length === 0) {
      return [];
    }

    return parsed.attachments.map((att, index) => ({
      id: att.contentId || `att_${index}`,
      filename: att.filename || 'attachment',
      mimeType: att.contentType || 'application/octet-stream',
      size: att.size || 0,
      contentId: att.contentId,
      isInline: !!att.contentId,
    }));
  }
}
