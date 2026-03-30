/**
 * ImapConnectionPoolService
 *
 * Extracted from IMAPDriver - handles connection pooling for IMAP operations.
 * Uses async-mutex Semaphore for concurrency limiting.
 *
 * Features:
 * - Connection pooling with configurable max connections per user
 * - Semaphore-based concurrency limiting (replaces busy-wait)
 * - Idle connection cleanup
 * - Server capability detection (CONDSTORE, QRESYNC, IDLE, SPECIAL-USE)
 */

import { Injectable, Logger, Scope } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { Semaphore, SemaphoreInterface, withTimeout, E_TIMEOUT } from 'async-mutex';
import {
  PooledConnection,
  ImapConfig,
  ServerCapabilities,
  POOL_CONFIG,
} from '../interfaces/imap-internal.interface';
import { classifyImapError, ImapConnectionError, ImapAuthError, ImapProtocolError } from '../imap-errors';

@Injectable({ scope: Scope.TRANSIENT })
export class ImapConnectionPoolService {
  private readonly logger = new Logger(ImapConnectionPoolService.name);

  // Connection pool for efficient resource usage
  private connectionPool: PooledConnection[] = [];

  // Semaphore for connection pool access (replaces busy-wait)
  private poolSemaphore?: SemaphoreInterface;

  // IMAP configuration
  private config?: ImapConfig;

  // Server capabilities detected at connection time
  private serverCapabilities: ServerCapabilities = {
    condstore: false,
    qresync: false,
    idle: false,
    specialUse: false,
  };

  /**
   * Initialize the connection pool with IMAP configuration
   */
  async initialize(config: ImapConfig): Promise<void> {
    this.config = config;
    this.poolSemaphore = withTimeout(
      new Semaphore(POOL_CONFIG.maxConnectionsPerUser),
      POOL_CONFIG.connectionAcquireTimeout,
    );
  }

  /**
   * Get the IMAP configuration
   */
  getConfig(): ImapConfig | undefined {
    return this.config;
  }

  /**
   * Check if the pool is initialized
   */
  isInitialized(): boolean {
    return !!this.config && !!this.poolSemaphore;
  }

  /**
   * Acquire a connection from the pool or create a new one
   * Uses async-mutex Semaphore instead of busy-wait polling
   */
  async acquireConnection(): Promise<ImapFlow> {
    if (!this.config || !this.poolSemaphore) {
      throw new Error('Connection pool not initialized. Call initialize() first.');
    }

    // Acquire semaphore slot with timeout
    let _semaphoreValue: number;
    let semaphoreRelease: () => void;
    try {
      [_semaphoreValue, semaphoreRelease] = await this.poolSemaphore.acquire();
    } catch (error) {
      // E_TIMEOUT error from async-mutex means timeout waiting for slot
      if ((error as Error).message?.includes('E_TIMEOUT') || error === E_TIMEOUT) {
        this.logger.warn(
          `IMAP connection pool timeout after ${POOL_CONFIG.connectionAcquireTimeout}ms ` +
          `(maxConnectionsPerUser=${POOL_CONFIG.maxConnectionsPerUser}). ` +
          `Consider increasing IMAP_MAX_CONNECTIONS_PER_USER if this persists.`,
        );
        throw new Error('Timeout waiting for available IMAP connection');
      }
      throw error;
    }

    try {
      // Clean up idle connections first
      await this.cleanupIdleConnections();

      // Try to find an available connection in pool
      const available = this.connectionPool.find((p) => !p.inUse);
      if (available) {
        // T-1403: Health check before returning pooled connection
        if (!available.client.usable) {
          this.logger.warn('IMAP pooled connection is no longer usable — removing from pool');
          const idx = this.connectionPool.indexOf(available);
          if (idx >= 0) this.connectionPool.splice(idx, 1);
          // Fall through to create a new connection below
        } else {
          // T-1403: NOOP health check — verify server responds
          try {
            await Promise.race([
              available.client.noop(),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('NOOP timeout')), 5000),
              ),
            ]);
          } catch {
            this.logger.warn('IMAP pooled connection failed NOOP health check — removing from pool');
            const idx = this.connectionPool.indexOf(available);
            if (idx >= 0) this.connectionPool.splice(idx, 1);
            try { await available.client.logout(); } catch { /* ignore */ }
            // Fall through to create a new connection below
          }

          // Re-check: if we didn't remove it, return it
          if (this.connectionPool.includes(available)) {
            available.inUse = true;
            available.lastUsed = Date.now();
            available._semaphoreRelease = semaphoreRelease;
            return available.client;
          }
        }
      }

      // Pool isn't full, create new connection
      if (this.connectionPool.length < POOL_CONFIG.maxConnectionsPerUser) {
        const client = new ImapFlow({
          host: this.config.host,
          port: this.config.port,
          secure: this.config.secure,
          auth: this.config.auth,
          logger: false,
        });

        try {
          await client.connect();
        } catch (connectErr) {
          // T-1401: Classify connection errors for callers to handle appropriately
          throw classifyImapError(connectErr);
        }

        // Detect server capabilities after connection
        this.detectServerCapabilities(client);

        const pooled: PooledConnection = {
          client,
          lastUsed: Date.now(),
          inUse: true,
          _semaphoreRelease: semaphoreRelease,
        };
        this.connectionPool.push(pooled);
        return client;
      }

      // Pool state corrupted if we reach here
      this.logger.error(
        `[POOL_CORRUPTION] Semaphore acquired but no connection available. ` +
        `Pool size: ${this.connectionPool.length}, max: ${POOL_CONFIG.maxConnectionsPerUser}, ` +
        `in-use: ${this.connectionPool.filter(p => p.inUse).length}`
      );
      throw new Error('No IMAP connection available in pool - pool state corrupted');
    } catch (error) {
      // Release semaphore on error
      semaphoreRelease();
      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   * Also releases the semaphore slot
   */
  releaseConnection(client: ImapFlow): void {
    const pooled = this.connectionPool.find((p) => p.client === client);
    if (pooled) {
      pooled.inUse = false;
      pooled.lastUsed = Date.now();
      // Release semaphore slot
      const release = pooled._semaphoreRelease;
      if (typeof release === 'function') {
        release();
        delete pooled._semaphoreRelease;
      }
    }
  }

  /**
   * Clean up idle connections
   * Memory leak fix (ML-1): Properly await logout to ensure connections are closed
   */
  async cleanupIdleConnections(): Promise<void> {
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
   * Execute an operation with automatic connection handling.
   * T-1404: Retries on transient errors (network/server) with exponential backoff.
   * Non-retryable errors (auth, protocol) are thrown immediately.
   */
  async withConnection<T>(
    operation: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 1000;
    const MAX_DELAY_MS = 15000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const client = await this.acquireConnection();
      try {
        return await operation(client);
      } catch (error) {
        const classified = classifyImapError(error);

        // T-1404: Remove dead connection from pool on error
        const pooled = this.connectionPool.find((p) => p.client === client);
        if (pooled && !client.usable) {
          const idx = this.connectionPool.indexOf(pooled);
          if (idx >= 0) this.connectionPool.splice(idx, 1);
        }

        // Non-retryable errors: throw immediately
        if (classified instanceof ImapAuthError || classified instanceof ImapProtocolError || !classified.retryable) {
          throw classified;
        }

        // Last attempt: throw
        if (attempt >= MAX_RETRIES) {
          this.logger.warn(
            `IMAP operation failed after ${MAX_RETRIES + 1} attempts: ${classified.message}`,
          );
          throw classified;
        }

        // T-1404: Exponential backoff before retry
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
        this.logger.warn(
          `IMAP transient error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${classified.code}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        this.releaseConnection(client);
      }
    }

    // Unreachable, but TypeScript needs it
    throw new Error('IMAP operation failed');
  }

  /**
   * Detect server capabilities after connection
   * RFC 7162: CONDSTORE/QRESYNC for efficient incremental sync
   * RFC 2177: IDLE for real-time notifications
   * RFC 6154: SPECIAL-USE for folder type detection
   */
  private detectServerCapabilities(client: ImapFlow): void {
    try {
      // ImapFlow exposes capabilities after connection via client.capabilities
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
   */
  getCapabilities(): ServerCapabilities {
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

  /**
   * Close all connections and cleanup
   */
  async closeAll(): Promise<void> {
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
    this.serverCapabilities = {
      condstore: false,
      qresync: false,
      idle: false,
      specialUse: false,
    };
  }

  /**
   * Get pool statistics for monitoring
   */
  getPoolStats(): {
    total: number;
    inUse: number;
    idle: number;
    maxConnections: number;
  } {
    const inUse = this.connectionPool.filter(p => p.inUse).length;
    return {
      total: this.connectionPool.length,
      inUse,
      idle: this.connectionPool.length - inUse,
      maxConnections: POOL_CONFIG.maxConnectionsPerUser,
    };
  }
}
