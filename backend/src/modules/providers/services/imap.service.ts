import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ImapFlow, ImapFlowOptions } from 'imapflow';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ImapService {
  private readonly logger = new Logger(ImapService.name);

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

      // Connect to IMAP server
      await client.connect();

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

      // Verify connection
      await transporter.verify();

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
