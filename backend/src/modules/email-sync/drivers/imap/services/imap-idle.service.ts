/**
 * ImapIdleService
 *
 * Extracted from IMAPDriver - handles IMAP IDLE real-time notifications.
 * Uses a DEDICATED connection (NOT from pool) because IDLE blocks.
 *
 * Features:
 * - Real-time change notifications via IMAP IDLE (RFC 2177)
 * - Dedicated connection for IDLE (cannot share with pool)
 * - Exponential backoff reconnection
 * - Event-based change notifications (exists, expunge, flags)
 * - Memory leak prevention with explicit listener cleanup
 */

import { Injectable, Logger, Scope } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { ImapFolderService } from './imap-folder.service';
import { RedisLockService } from '../../../../../common/services/redis-lock.service';
import {
  ImapConfig,
} from '../interfaces/imap-internal.interface';
import {
  CanonicalFolderType,
  ProviderChange,
  ProviderSubscription,
} from '../../interfaces/canonical.types';
import { ChangeCallback } from '../../interfaces/email-driver.interface';

/** IDLE reconnection constants */
const IDLE_RECONNECT_MAX_ATTEMPTS = 5;
const IDLE_RECONNECT_BASE_DELAY_MS = 1000;
const IDLE_RECONNECT_MAX_DELAY_MS = 30000;
/** T-1406: Polling interval when IDLE is unavailable or failed */
const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * IDLE connection state
 */
interface IdleState {
  connection?: ImapFlow;
  callback?: ChangeCallback;
  folder?: string;
  active: boolean;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  shouldReconnect: boolean;
  /** T-1406: Polling timer when IDLE is unavailable */
  pollingTimer?: NodeJS.Timeout;
  /** T-1406: Whether we're in polling fallback mode */
  pollingMode: boolean;
  /** IF-H6: Redis lock ID for per-account IDLE concurrency control */
  idleLockId?: string;
  /** IF-H6: Redis lock key for per-account IDLE concurrency control */
  idleLockKey?: string;
}

@Injectable({ scope: Scope.TRANSIENT })
export class ImapIdleService {
  private readonly logger = new Logger(ImapIdleService.name);

  private config?: ImapConfig;
  /** T-1406: Whether server supports IDLE (detected at connect time) */
  private serverSupportsIdle = true;
  /** IF-H6: Account identifier for per-account IDLE lock */
  private accountId?: string;

  private state: IdleState = {
    active: false,
    reconnectAttempts: 0,
    shouldReconnect: false,
    pollingMode: false,
  };

  constructor(
    private readonly folderService: ImapFolderService,
    private readonly redisLock: RedisLockService,
  ) {}

  /**
   * Initialize the IDLE service with IMAP configuration.
   * T-1406: Accepts supportsIdle flag to detect capability early.
   */
  initialize(config: ImapConfig, supportsIdle = true, accountId?: string): void {
    this.config = config;
    this.serverSupportsIdle = supportsIdle;
    this.accountId = accountId || `${config.host}:${config.auth?.user || 'unknown'}`;
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return !!this.config;
  }

  /**
   * Check if IDLE subscription is currently active
   */
  isActive(): boolean {
    return this.state.active && (this.state.connection?.usable ?? false);
  }

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
    if (!this.config) {
      throw new Error('IDLE service not initialized. Call initialize() first.');
    }

    // IF-H6: Per-account IDLE lock — RFC 2177 allows only one IDLE per connection
    // This prevents multiple workers from opening concurrent IDLE sessions
    const lockKey = `idle:${this.accountId}`;
    const lockId = await this.redisLock.acquireLock(lockKey, 30 * 60 * 1000, { maxRetries: 1 });
    if (!lockId) {
      this.logger.warn(`IF-H6: IDLE already active for account ${this.accountId} — skipping`);
      return {
        unsubscribe: async () => { /* no-op — we never started */ },
        isActive: () => false,
      };
    }
    // Store lockId so we can release on stop
    this.state.idleLockId = lockId;
    this.state.idleLockKey = lockKey;

    // Stop any existing IDLE subscription
    await this.stopIdleSubscription();

    // Resolve folder path
    const folderPath = await this.folderService.resolveFolder(folder);
    this.state.folder = folderPath;
    this.state.callback = callback;
    this.state.shouldReconnect = true;
    this.state.reconnectAttempts = 0;

    // T-1406: If server doesn't support IDLE, go straight to polling
    if (!this.serverSupportsIdle) {
      this.logger.warn('Server does not support IDLE — using polling mode (every 5 min)');
      this.startPollingMode();
    } else {
      await this.startIdleConnection();
    }

    // Return subscription handle
    return {
      unsubscribe: async (): Promise<void> => {
        await this.stopIdleSubscription();
      },
      isActive: (): boolean => {
        return this.isActive();
      },
    };
  }

  /**
   * Start a dedicated IDLE connection
   * IDLE blocks the connection, so it cannot be shared with the pool
   */
  private async startIdleConnection(): Promise<void> {
    if (!this.config || !this.state.folder || !this.state.callback) {
      throw new Error('IDLE subscription not initialized');
    }

    if (this.state.reconnectTimer) {
      clearTimeout(this.state.reconnectTimer);
      this.state.reconnectTimer = undefined;
    }

    // Create dedicated IDLE connection (separate from pool)
    // IDLE blocks the connection, so it can't be shared
    this.state.connection = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
      logger: false,
      // IDLE configuration
      disableAutoIdle: false, // Enable auto-IDLE
      maxIdleTime: 29 * 60 * 1000, // 29 minutes (RFC recommends < 30 min)
    });

    await this.state.connection.connect();
    this.state.active = true;

    // Set up event handlers BEFORE selecting mailbox
    this.setupIdleEventHandlers();

    // Select the folder to start IDLE monitoring
    // ImapFlow automatically enters IDLE when the mailbox is opened
    await this.state.connection.mailboxOpen(this.state.folder);

    this.state.reconnectAttempts = 0;
    this.logger.log(`IDLE subscription started for folder: ${this.state.folder}`);
  }

  /**
   * Clean up IDLE connection resources
   * HIGH-3 FIX (2025-01-05): Explicitly remove event listeners to prevent memory accumulation
   */
  private cleanupIdleConnection(): void {
    if (!this.state.connection) return;

    this.state.connection.removeAllListeners('exists');
    this.state.connection.removeAllListeners('expunge');
    this.state.connection.removeAllListeners('flags');
    this.state.connection.removeAllListeners('error');
    this.state.connection.removeAllListeners('close');
    this.state.connection.logout().catch(() => undefined);
    this.state.connection = undefined;
  }

  /**
   * Schedule IDLE reconnection with exponential backoff
   */
  private scheduleIdleReconnect(reason: string, error?: Error): void {
    if (!this.state.shouldReconnect || !this.state.callback || !this.state.folder) {
      return;
    }

    if (this.state.reconnectAttempts >= IDLE_RECONNECT_MAX_ATTEMPTS) {
      this.logger.warn(
        `IDLE reconnect stopped after ${IDLE_RECONNECT_MAX_ATTEMPTS} attempts (last reason: ${reason}). Switching to polling mode.`,
      );
      // T-1406: Fall back to polling instead of giving up entirely
      this.startPollingMode();
      return;
    }

    this.state.reconnectAttempts += 1;
    const delayMs = Math.min(
      IDLE_RECONNECT_BASE_DELAY_MS * Math.pow(2, this.state.reconnectAttempts - 1),
      IDLE_RECONNECT_MAX_DELAY_MS,
    );

    const errorSuffix = error ? `: ${error.message}` : '';
    this.logger.warn(
      `IDLE connection lost (${reason})${errorSuffix}. Reconnecting in ${delayMs}ms ` +
        `(attempt ${this.state.reconnectAttempts}/${IDLE_RECONNECT_MAX_ATTEMPTS}).`,
    );

    if (this.state.reconnectTimer) {
      clearTimeout(this.state.reconnectTimer);
    }

    this.state.reconnectTimer = setTimeout(() => {
      if (!this.state.shouldReconnect) return;
      this.startIdleConnection().catch((reconnectError) => {
        this.scheduleIdleReconnect('reconnect_failed', reconnectError as Error);
      });
    }, delayMs);
  }

  /**
   * Set up event handlers for IDLE notifications
   */
  private setupIdleEventHandlers(): void {
    if (!this.state.connection) return;

    // 'exists' - New messages or message count changed
    this.state.connection.on('exists', async (data: { path: string; count: number; prevCount: number }) => {
      this.logger.debug(`IDLE exists event: ${data.path} count=${data.count} prev=${data.prevCount}`);

      if (!this.state.callback) return;

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
          await this.state.callback(changes);
        } catch (error) {
          this.logger.error('Error in IDLE callback (exists):', error);
        }
      }
    });

    // 'expunge' - Message deleted
    // Note: Using 'as any' because ImapFlow types may not include all event types
    // AUDIT FIX #1: Sequence numbers are unreliable (they change on deletion)
    // Use special __EXPUNGE__ marker to signal that sync service should reconcile
    (this.state.connection as any).on('expunge', async (data: { path: string; seq: number }) => {
      this.logger.debug(`IDLE expunge event: ${data.path} seq=${data.seq}`);

      if (!this.state.callback) return;

      // AUDIT FIX #1: Emit folder:__EXPUNGE__ to signal deletion reconciliation needed
      // Cannot reliably map sequence number to UID after expunge
      // The sync service should query the DB for messages in this folder
      // and reconcile with current server state
      const changes: ProviderChange[] = [
        {
          type: 'deleted',
          // Use folder:__EXPUNGE__seq to signal deletion happened
          // Sync service should reconcile by checking which UIDs no longer exist
          messageId: `${data.path}:__EXPUNGE__${data.seq}`,
          folder: this.pathToCanonicalFolder(data.path),
          timestamp: new Date(),
        },
      ];

      try {
        await this.state.callback(changes);
      } catch (error) {
        this.logger.error('Error in IDLE callback (expunge):', error);
      }
    });

    // 'flags' - Message flags changed (read/unread, starred, etc.)
    // Note: Using 'as any' because ImapFlow types may not include all event types
    (this.state.connection as any).on(
      'flags',
      async (data: { path: string; seq: number; uid?: number; flags: Set<string> }) => {
        this.logger.debug(
          `IDLE flags event: ${data.path} seq=${data.seq} uid=${data.uid} flags=${Array.from(data.flags).join(',')}`,
        );

        if (!this.state.callback) return;

        // AUDIT FIX #1: Use consistent folder:uid format
        // If UID is available, use folder:uid (e.g., "INBOX:123")
        // If only seq is available, use folder:__FLAGS__seq to signal reconciliation needed
        const messageId = data.uid
          ? `${data.path}:${data.uid}`
          : `${data.path}:__FLAGS__${data.seq}`;

        const changes: ProviderChange[] = [
          {
            type: 'modified',
            messageId,
            folder: this.pathToCanonicalFolder(data.path),
            timestamp: new Date(),
          },
        ];

        try {
          await this.state.callback(changes);
        } catch (error) {
          this.logger.error('Error in IDLE callback (flags):', error);
        }
      },
    );

    // Q-5 FIX: Connection error handling - clean up resources to prevent leak
    this.state.connection.on('error', (error: Error) => {
      this.logger.error('IDLE connection error:', error);
      this.state.active = false;
      this.cleanupIdleConnection();
      this.scheduleIdleReconnect('error', error);
    });

    // Q-5 FIX: Connection close handling - clean up resources to prevent leak
    this.state.connection.on('close', () => {
      this.logger.warn('IDLE connection closed');
      this.state.active = false;
      this.cleanupIdleConnection();
      this.scheduleIdleReconnect('close');
    });
  }

  /**
   * T-1406: Start polling mode as fallback when IDLE is unavailable or exhausted.
   * Emits synthetic change events every 5 minutes to trigger sync.
   */
  private startPollingMode(): void {
    if (this.state.pollingMode) return; // Already polling

    this.state.pollingMode = true;
    this.state.active = true;
    this.state.shouldReconnect = false;

    this.logger.log(`IDLE polling mode started for folder: ${this.state.folder} (interval: ${POLLING_INTERVAL_MS / 1000}s)`);

    this.state.pollingTimer = setInterval(() => {
      if (!this.state.callback || !this.state.folder) return;

      // Emit a synthetic "modified" event to trigger sync reconciliation
      try {
        const result = this.state.callback([{
          type: 'modified',
          messageId: `${this.state.folder}:__POLL__${Date.now()}`,
          folder: this.pathToCanonicalFolder(this.state.folder),
          timestamp: new Date(),
        }]);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((err: Error) => {
            this.logger.error('Error in polling callback:', err);
          });
        }
      } catch (err) {
        this.logger.error('Error in polling callback:', err);
      }
    }, POLLING_INTERVAL_MS);
  }

  /**
   * Stop the IDLE subscription and close the dedicated connection
   * HIGH-3 FIX (2025-01-05): Explicitly remove event listeners to prevent memory accumulation
   */
  async stopIdleSubscription(): Promise<void> {
    this.state.shouldReconnect = false;
    this.state.reconnectAttempts = 0;
    this.state.pollingMode = false;
    if (this.state.reconnectTimer) {
      clearTimeout(this.state.reconnectTimer);
      this.state.reconnectTimer = undefined;
    }
    // T-1406: Clear polling timer
    if (this.state.pollingTimer) {
      clearInterval(this.state.pollingTimer);
      this.state.pollingTimer = undefined;
    }

    if (this.state.connection) {
      try {
        // HIGH-3 FIX: Remove all event listeners before closing to prevent memory leaks
        // These listeners hold references to callback functions and 'this' context
        this.state.connection.removeAllListeners('exists');
        this.state.connection.removeAllListeners('expunge');
        this.state.connection.removeAllListeners('flags');
        this.state.connection.removeAllListeners('error');
        this.state.connection.removeAllListeners('close');

        if (this.state.connection.usable) {
          await this.state.connection.logout();
        }
      } catch (error) {
        this.logger.warn('Error closing IDLE connection:', error);
      }
      this.state.connection = undefined;
    }

    this.state.callback = undefined;
    this.state.folder = undefined;
    this.state.active = false;

    // IF-H6: Release per-account IDLE lock
    if (this.state.idleLockId && this.state.idleLockKey) {
      await this.redisLock.releaseLock(this.state.idleLockKey, this.state.idleLockId).catch(() => undefined);
      this.state.idleLockId = undefined;
      this.state.idleLockKey = undefined;
    }
  }

  /**
   * Convert IMAP folder path to canonical folder type
   */
  private pathToCanonicalFolder(path: string): CanonicalFolderType {
    return this.folderService.pathToCanonicalFolder(path);
  }

  /**
   * Get current IDLE state for monitoring/debugging
   */
  getIdleState(): {
    active: boolean;
    folder?: string;
    reconnectAttempts: number;
    shouldReconnect: boolean;
    connectionUsable: boolean;
    pollingMode: boolean;
  } {
    return {
      active: this.state.active,
      folder: this.state.folder,
      reconnectAttempts: this.state.reconnectAttempts,
      shouldReconnect: this.state.shouldReconnect,
      connectionUsable: this.state.connection?.usable ?? false,
      pollingMode: this.state.pollingMode,
    };
  }
}
