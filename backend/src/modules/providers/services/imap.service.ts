import { Injectable, Logger, UnauthorizedException, OnModuleDestroy } from '@nestjs/common';
import { ImapFlow, ImapFlowOptions } from 'imapflow';
import * as nodemailer from 'nodemailer';

/** Pooled IMAP connection with metadata */
interface PooledConnection {
  client: ImapFlow;
  key: string;
  lastUsed: number;
  inUse: boolean;
}

@Injectable()
export class ImapService implements OnModuleDestroy {
  private readonly logger = new Logger(ImapService.name);

  /** Connection pool: key -> PooledConnection */
  private readonly connectionPool = new Map<string, PooledConnection>();

  /** Max connections per provider key */
  private readonly MAX_POOL_SIZE = 5;

  /** Connection idle timeout (5 minutes) */
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  /** Cleanup interval */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup of idle connections
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000); // Every minute
  }

  async onModuleDestroy() {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all pooled connections
    this.logger.log(`Closing ${this.connectionPool.size} pooled IMAP connections...`);

    const closePromises: Promise<void>[] = [];
    for (const [key, pooled] of this.connectionPool) {
      closePromises.push(
        this.safeLogout(pooled.client).then(() => {
          this.connectionPool.delete(key);
        })
      );
    }

    await Promise.allSettled(closePromises);
    this.logger.log('All IMAP connections closed');
  }

  /**
   * Generate a unique key for connection pooling
   */
  private getConnectionKey(config: { host: string; port: number; username: string }): string {
    return `${config.host}:${config.port}:${config.username}`;
  }

  /**
   * Safely logout from IMAP
   */
  private async safeLogout(client: ImapFlow): Promise<void> {
    try {
      await client.logout();
    } catch (error) {
      this.logger.warn('Error during IMAP logout:', error);
    }
  }

  /**
   * Cleanup idle connections
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, pooled] of this.connectionPool) {
      if (!pooled.inUse && now - pooled.lastUsed > this.IDLE_TIMEOUT_MS) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      const pooled = this.connectionPool.get(key);
      if (pooled) {
        this.logger.debug(`Closing idle IMAP connection: ${key}`);
        void this.safeLogout(pooled.client);
        this.connectionPool.delete(key);
      }
    }

    if (keysToRemove.length > 0) {
      this.logger.log(`Cleaned up ${keysToRemove.length} idle IMAP connections`);
    }
  }

  /**
   * Get a pooled connection or create a new one
   * Returns a connection that MUST be released after use
   */
  async getPooledConnection(config: {
    host: string;
    port: number;
    username: string;
    password: string;
    useTls: boolean;
  }): Promise<{ client: ImapFlow; release: () => void }> {
    const key = this.getConnectionKey(config);

    // Try to find an available connection
    const existing = this.connectionPool.get(key);
    if (existing && !existing.inUse) {
      existing.inUse = true;
      existing.lastUsed = Date.now();

      // Verify connection is still alive
      try {
        // Simple noop to check connection
        await existing.client.noop();
        this.logger.debug(`Reusing pooled IMAP connection: ${key}`);
        return {
          client: existing.client,
          release: () => {
            existing.inUse = false;
            existing.lastUsed = Date.now();
          },
        };
      } catch {
        // Connection dead, remove and create new
        this.connectionPool.delete(key);
        this.logger.debug(`Pooled IMAP connection dead, creating new: ${key}`);
      }
    }

    // Create new connection
    const client = this.createClient(config);
    await client.connect();

    // Add to pool if not full
    if (this.connectionPool.size < this.MAX_POOL_SIZE) {
      const pooled: PooledConnection = {
        client,
        key,
        lastUsed: Date.now(),
        inUse: true,
      };
      this.connectionPool.set(key, pooled);

      this.logger.debug(`Created new pooled IMAP connection: ${key} (pool size: ${this.connectionPool.size})`);

      return {
        client,
        release: () => {
          pooled.inUse = false;
          pooled.lastUsed = Date.now();
        },
      };
    }

    // Pool full - return non-pooled connection that closes on release
    this.logger.debug(`Pool full, returning non-pooled IMAP connection: ${key}`);
    return {
      client,
      release: () => {
        void this.safeLogout(client);
      },
    };
  }

  /**
   * Test IMAP connection
   */
  async testConnection(config: {
    host: string;
    port: number;
    username: string;
    password: string;
    useTls: boolean;
  }): Promise<boolean> {
    let client: ImapFlow | null = null;

    try {
      const options: ImapFlowOptions = {
        host: config.host,
        port: config.port,
        secure: config.useTls,
        auth: {
          user: config.username,
          pass: config.password,
        },
        logger: false, // Disable verbose logging
      };

      client = new ImapFlow(options);

      // Connect with timeout to prevent hanging on blocked ports (Railway blocks SMTP/IMAP)
      await Promise.race([
        client.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('IMAP connection timed out after 10s')), 10_000),
        ),
      ]);

      this.logger.log(`IMAP connection test successful for ${config.host}`);
      return true;
    } catch (error) {
      this.logger.error(`IMAP connection test failed for ${config.host}:`, error);
      return false;
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch (logoutError) {
          this.logger.warn('Error during IMAP logout:', logoutError);
        }
      }
    }
  }

  /**
   * Test SMTP connection
   */
  async testSmtpConnection(config: {
    host: string;
    port: number;
    username: string;
    password: string;
    useTls: boolean;
  }): Promise<boolean> {
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.useTls, // true for 465, false for other ports
        auth: {
          user: config.username,
          pass: config.password,
        },
      });

      // Verify connection with timeout to prevent hanging on blocked ports
      await Promise.race([
        transporter.verify(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SMTP connection timed out after 10s')), 10_000),
        ),
      ]);

      this.logger.log(`SMTP connection test successful for ${config.host}`);
      return true;
    } catch (error) {
      this.logger.error(`SMTP connection test failed for ${config.host}:`, error);
      return false;
    }
  }

  /**
   * Get IMAP client instance (for reuse in other services)
   */
  createClient(config: {
    host: string;
    port: number;
    username: string;
    password: string;
    useTls: boolean;
  }): ImapFlow {
    const options: ImapFlowOptions = {
      host: config.host,
      port: config.port,
      secure: config.useTls,
      auth: {
        user: config.username,
        pass: config.password,
      },
      logger: false,
    };

    return new ImapFlow(options);
  }

  /**
   * Fetch email folders (for testing/verification)
   */
  async listFolders(config: {
    host: string;
    port: number;
    username: string;
    password: string;
    useTls: boolean;
  }): Promise<
    Array<{
      path: string;
      name: string;
      delimiter: string;
      attributes: string[];
    }>
  > {
    let client: ImapFlow | null = null;

    try {
      client = this.createClient(config);
      await client.connect();

      const folders = await client.list();

      const folderInfos = folders.map((folder) => ({
        path: folder.path,
        name: folder.name,
        delimiter: folder.delimiter || '/',
        attributes: folder.flags ? Array.from(folder.flags) : [],
      }));

      this.logger.log(`Retrieved ${folderInfos.length} folders from IMAP server`);

      return folderInfos;
    } catch (error) {
      this.logger.error('Failed to list IMAP folders:', error);
      throw new UnauthorizedException('Failed to list IMAP folders');
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch (logoutError) {
          this.logger.warn('Error during IMAP logout:', logoutError);
        }
      }
    }
  }

  /**
   * Fetch recent messages from INBOX
   */
  async fetchMessages(
    config: {
      host: string;
      port: number;
      username: string;
      password: string;
      useTls: boolean;
    },
    limit: number = 10,
  ): Promise<any[]> {
    let client: ImapFlow | null = null;

    try {
      client = this.createClient(config);
      await client.connect();

      // Select INBOX
      const lock = await client.getMailboxLock('INBOX');

      try {
        // Get total message count
        const mailboxStatus = await client.status('INBOX', { messages: true });
        const totalMessages = mailboxStatus.messages || 0;

        if (totalMessages === 0) {
          this.logger.log('No messages found in INBOX');
          return [];
        }

        // Fetch last N messages (newest first)
        const startSeq = Math.max(1, totalMessages - limit + 1);
        const endSeq = totalMessages;

        this.logger.log(`Fetching messages ${startSeq}:${endSeq} from INBOX`);

        const messages: any[] = [];

        // Fetch messages
        for await (const message of client.fetch(`${startSeq}:${endSeq}`, {
          envelope: true,
          bodyStructure: true,
          flags: true,
          uid: true,
        })) {
          const envelope = message.envelope;

          if (!envelope) {
            continue; // Skip if no envelope
          }

          messages.push({
            uid: message.uid,
            seq: message.seq,
            flags: message.flags,
            from: envelope.from?.[0]
              ? `${envelope.from[0].name || ''} <${envelope.from[0].address}>`.trim()
              : 'Unknown',
            to: envelope.to?.[0]
              ? `${envelope.to[0].name || ''} <${envelope.to[0].address}>`.trim()
              : 'Unknown',
            subject: envelope.subject || '(No Subject)',
            date: envelope.date,
            messageId: envelope.messageId,
          });
        }

        // Reverse to show newest first
        messages.reverse();

        this.logger.log(`Retrieved ${messages.length} messages from INBOX`);

        return messages;
      } finally {
        lock.release();
      }
    } catch (error) {
      this.logger.error('Failed to fetch IMAP messages:', error);
      throw new UnauthorizedException('Failed to fetch IMAP messages');
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch (logoutError) {
          this.logger.warn('Error during IMAP logout:', logoutError);
        }
      }
    }
  }
}
