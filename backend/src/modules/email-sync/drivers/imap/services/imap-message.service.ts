/**
 * ImapMessageService
 *
 * Extracted from IMAPDriver - handles message CRUD, batch operations,
 * attachments, and CONDSTORE sync.
 *
 * Features:
 * - Message listing with pagination
 * - Single and batch message operations
 * - Attachment streaming with cleanup timeout
 * - CONDSTORE/QRESYNC incremental sync
 * - Multi-folder sync token format
 */

import { Injectable, Logger, Scope } from '@nestjs/common';
import { MailboxObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ImapConnectionPoolService } from './imap-connection-pool.service';
import { ImapFolderService } from './imap-folder.service';
import {
  CanonicalMessage,
  AttachmentData,
  AttachmentMeta,
  EmailAddress,
  CanonicalFolderType,
  ProviderChange,
} from '../../interfaces/canonical.types';
import {
  ListMessagesOptions,
  ListMessagesResult,
  GetMessageOptions,
  ChangesResult,
} from '../../interfaces/email-driver.interface';

@Injectable({ scope: Scope.TRANSIENT })
export class ImapMessageService {
  private readonly logger = new Logger(ImapMessageService.name);
  private readonly SYNC_FOLDERS = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'ARCHIVE', 'SPAM'];

  constructor(
    private readonly connectionPool: ImapConnectionPoolService,
    private readonly folderService: ImapFolderService,
  ) {}

  /**
   * List messages in a folder
   */
  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    return this.connectionPool.withConnection(async (client) => {
      const folderPath = await this.folderService.resolveFolder(options.folder);
      const includeBody = options.includeBody === true;

      const lock = await client.getMailboxLock(folderPath);
      try {
        const mailbox = client.mailbox as MailboxObject;
        const pageSize = options.pageSize || 50;

        const searchCriteria = this.buildSearchCriteria(options);

        let uids: number[] = [];
        try {
          const searchResult = await client.search(searchCriteria, { uid: true });
          uids = searchResult || [];
        } catch (searchError: unknown) {
          const errMsg = searchError instanceof Error ? searchError.message : String(searchError);
          this.logger.warn(`[listMessages] Search failed for ${folderPath}: ${errMsg}`);
          return { messages: [], hasMore: false, totalEstimate: 0 };
        }

        uids.sort((a, b) => b - a);

        let startIndex = 0;
        if (options.pageToken) {
          const lastUid = parseInt(options.pageToken, 10);
          startIndex = uids.findIndex((uid) => uid < lastUid);
          if (startIndex < 0) startIndex = uids.length;
        }

        const pageUids = uids.slice(startIndex, startIndex + pageSize);
        const hasMore = startIndex + pageSize < uids.length;

        if (pageUids.length === 0) {
          return { messages: [], hasMore: false, totalEstimate: uids.length };
        }

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
              this.logger.warn(`Failed to parse message ${canonical.id}`, parseError);
            }
          }

          messages.push(canonical);
        }

        messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

        const nextPageToken = hasMore && pageUids.length > 0
          ? pageUids[pageUids.length - 1].toString()
          : undefined;

        return { messages, nextPageToken, hasMore, totalEstimate: mailbox.exists };
      } finally {
        lock.release();
      }
    });
  }

  /**
   * Get a single message by ID
   */
  async getMessage(messageId: string, options?: GetMessageOptions): Promise<CanonicalMessage | null> {
    return this.connectionPool.withConnection(async (client) => {
      const [folderPath, uid] = this.parseMessageId(messageId);

      const lock = await client.getMailboxLock(folderPath);
      try {
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

        const msg = await client.fetchOne(uid.toString(), fetchOptions, { uid: true });

        if (!msg) {
          return null;
        }

        let bodyText: string | undefined;
        let bodyHtml: string | undefined;
        let attachments: AttachmentMeta[] = [];

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

  /**
   * Get raw RFC822 message source
   */
  async getMessageRaw(messageId: string): Promise<string> {
    return this.connectionPool.withConnection(async (client) => {
      const [folderPath, uid] = this.parseMessageId(messageId);

      const lock = await client.getMailboxLock(folderPath);
      try {
        const source = await client.download(uid.toString(), undefined, { uid: true });

        const chunks: Buffer[] = [];
        for await (const chunk of source.content) {
          chunks.push(chunk);
        }

        return Buffer.concat(chunks).toString('utf-8');
      } finally {
        lock.release();
      }
    });
  }

  /**
   * Batch get multiple messages
   */
  async batchGetMessages(messageIds: string[], _includeBody = true): Promise<CanonicalMessage[]> {
    if (messageIds.length === 0) return [];

    const messages: CanonicalMessage[] = [];
    const CONCURRENT_LIMIT = 5;

    for (let i = 0; i < messageIds.length; i += CONCURRENT_LIMIT) {
      const batch = messageIds.slice(i, i + CONCURRENT_LIMIT);

      let results: (CanonicalMessage | null)[] = await Promise.all(
        batch.map(async (id) => {
          try {
            return await this.getMessage(id, { includeBody: true });
          } catch {
            return null;
          }
        })
      );

      for (const msg of results) {
        if (msg) messages.push(msg);
      }

      results = null as any;
      await new Promise<void>(r => setImmediate(r));
    }

    return messages;
  }

  /**
   * Move a message to a different folder
   */
  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    return this.connectionPool.withConnection(async (client) => {
      const [sourceFolder, uid] = this.parseMessageId(messageId);
      const targetPath = await this.folderService.resolveFolder(targetFolder);

      const lock = await client.getMailboxLock(sourceFolder);
      try {
        await client.messageMove([uid], targetPath, { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  /**
   * Copy a message to a different folder
   */
  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    return this.connectionPool.withConnection(async (client) => {
      const [sourceFolder, uid] = this.parseMessageId(messageId);
      const targetPath = await this.folderService.resolveFolder(targetFolder);

      const lock = await client.getMailboxLock(sourceFolder);
      try {
        const result = await client.messageCopy([uid], targetPath, { uid: true });
        if (!result || typeof result === 'boolean') {
          return `${targetPath}:${uid}`;
        }
        const newUid = result.uidMap?.get(uid);
        return `${targetPath}:${newUid || uid}`;
      } finally {
        lock.release();
      }
    });
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string, permanent = false): Promise<void> {
    return this.connectionPool.withConnection(async (client) => {
      const [folderPath, uid] = this.parseMessageId(messageId);

      const lock = await client.getMailboxLock(folderPath);
      try {
        if (permanent) {
          await client.messageFlagsAdd([uid], ['\\Deleted'], { uid: true });
          await client.messageDelete([uid], { uid: true });
        } else {
          const trashPath = await this.folderService.resolveFolder('TRASH');
          await client.messageMove([uid], trashPath, { uid: true });
        }
      } finally {
        lock.release();
      }
    });
  }

  /**
   * Set read/unread status
   */
  async setReadStatus(messageId: string, isRead: boolean): Promise<void> {
    return this.connectionPool.withConnection(async (client) => {
      const [folderPath, uid] = this.parseMessageId(messageId);

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

  /**
   * Set starred status
   */
  async setStarredStatus(messageId: string, isStarred: boolean): Promise<void> {
    return this.connectionPool.withConnection(async (client) => {
      const [folderPath, uid] = this.parseMessageId(messageId);

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

  /**
   * Set flagged status (alias for starred in IMAP)
   */
  async setFlaggedStatus(messageId: string, isFlagged: boolean): Promise<void> {
    return this.setStarredStatus(messageId, isFlagged);
  }

  /**
   * Batch set read status
   */
  async batchSetReadStatus(updates: Array<{ id: string; isRead: boolean }>): Promise<void> {
    const byFolder = new Map<string, Array<{ uid: number; isRead: boolean }>>();

    for (const update of updates) {
      const [folder, uid] = this.parseMessageId(update.id);
      if (!byFolder.has(folder)) {
        byFolder.set(folder, []);
      }
      byFolder.get(folder)!.push({ uid, isRead: update.isRead });
    }

    return this.connectionPool.withConnection(async (client) => {
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

  /**
   * Batch move messages
   */
  async batchMoveMessages(messageIds: string[], targetFolder: string): Promise<void> {
    const byFolder = new Map<string, number[]>();

    for (const id of messageIds) {
      const [folder, uid] = this.parseMessageId(id);
      if (!byFolder.has(folder)) {
        byFolder.set(folder, []);
      }
      byFolder.get(folder)!.push(uid);
    }

    const targetPath = await this.folderService.resolveFolder(targetFolder);

    return this.connectionPool.withConnection(async (client) => {
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

  /**
   * Batch delete messages
   */
  async batchDeleteMessages(messageIds: string[], permanent = false): Promise<void> {
    if (permanent) {
      const byFolder = new Map<string, number[]>();

      for (const id of messageIds) {
        const [folder, uid] = this.parseMessageId(id);
        if (!byFolder.has(folder)) {
          byFolder.set(folder, []);
        }
        byFolder.get(folder)!.push(uid);
      }

      return this.connectionPool.withConnection(async (client) => {
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
      await this.batchMoveMessages(messageIds, 'TRASH');
    }
  }

  /**
   * Get attachment content
   * Note: This method acquires connection directly because stream needs connection open
   */
  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    const client = await this.connectionPool.acquireConnection();
    let lock: any;

    try {
      const [folderPath, uid] = this.parseMessageId(messageId);

      lock = await client.getMailboxLock(folderPath);
      const source = await client.download(uid.toString(), undefined, { uid: true });
      const stream = source.content;

      let cleanedUp = false;
      const cleanup = (reason?: string) => {
        if (cleanedUp) return;
        cleanedUp = true;

        if (reason) {
          this.logger.debug(`[getAttachment] Cleanup triggered: ${reason}`);
        }

        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
        }

        if (lock) {
          lock.release();
          lock = null;
        }
        this.connectionPool.releaseConnection(client);
      };

      const STREAM_TIMEOUT_MS = 60000;
      const cleanupTimeout = setTimeout(() => {
        if (!cleanedUp) {
          this.logger.warn(`[getAttachment] Stream for ${attachmentId} not consumed within ${STREAM_TIMEOUT_MS}ms`);
          stream.destroy(new Error('Stream consumption timeout'));
          cleanup('timeout');
        }
      }, STREAM_TIMEOUT_MS);

      stream.on('end', () => cleanup('end'));
      stream.on('error', (err) => {
        this.logger.debug(`[getAttachment] Stream error: ${err.message}`);
        cleanup('error');
      });
      stream.on('close', () => cleanup('close'));

      return {
        id: attachmentId,
        filename: 'attachment',
        mimeType: source.meta?.contentType || 'application/octet-stream',
        size: source.meta?.expectedSize || 0,
        isInline: false,
        contentStream: stream,
        content: undefined,
      };
    } catch (err) {
      if (lock) lock.release();
      this.connectionPool.releaseConnection(client);
      throw err;
    }
  }

  /**
   * Get changes since last sync using CONDSTORE
   */
  async getChangesSince(syncToken: string): Promise<ChangesResult> {
    return this.connectionPool.withConnection(async (client) => {
      const changes: ProviderChange[] = [];
      const folderModSeqs = this.parseSyncToken(syncToken);

      try {
        const newModSeqs: Map<string, bigint> = new Map();
        let hasCondstore = true;

        for (const canonicalFolder of this.SYNC_FOLDERS) {
          try {
            const folderPath = await this.folderService.resolveFolder(canonicalFolder);
            const lastModSeq = folderModSeqs.get(canonicalFolder) || 0n;

            const lock = await client.getMailboxLock(folderPath);
            try {
              const mailboxStatus = await client.status(folderPath, { highestModseq: true });

              if (!mailboxStatus.highestModseq) {
                hasCondstore = false;
                this.logger.warn(`Server does not support CONDSTORE for ${folderPath}`);

                let lastSyncDate: Date;
                if (/^\d+$/.test(syncToken)) {
                  const ts = parseInt(syncToken, 10);
                  lastSyncDate = !isNaN(ts) && ts > 0 ? new Date(ts) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                } else {
                  lastSyncDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                }

                const searchResult = await client.search({ since: lastSyncDate }, { uid: true });
                if (searchResult && searchResult.length > 0) {
                  for await (const message of client.fetch(searchResult, { uid: true, flags: true, envelope: true }, { uid: true })) {
                    const messageId = `${folderPath}:${message.uid}`;
                    changes.push({
                      messageId,
                      type: message.flags?.has('\\Deleted') ? 'deleted' : 'modified',
                      folder: canonicalFolder,
                      timestamp: new Date(),
                    });
                  }
                }
                continue;
              }

              const currentModSeq = mailboxStatus.highestModseq;
              newModSeqs.set(canonicalFolder, currentModSeq);

              if (currentModSeq <= lastModSeq) {
                continue;
              }

              for await (const message of client.fetch(
                { modseq: lastModSeq + 1n },
                { uid: true, flags: true, envelope: true },
                { uid: true },
              )) {
                const messageId = `${folderPath}:${message.uid}`;
                changes.push({
                  messageId,
                  type: message.flags?.has('\\Deleted') ? 'deleted' : 'modified',
                  folder: canonicalFolder,
                  timestamp: new Date(),
                });
              }
            } finally {
              lock.release();
            }
          } catch (folderError: any) {
            this.logger.debug(`Skipping folder ${canonicalFolder}: ${folderError.message}`);
          }
        }

        const newSyncToken = hasCondstore ? this.buildSyncToken(newModSeqs) : Date.now().toString();
        return { changes, newSyncToken, hasMore: false };
      } catch (error: any) {
        this.logger.error(`IMAP getChangesSince failed: ${error.message}`);
        return { changes: [], newSyncToken: Date.now().toString(), hasMore: false };
      }
    });
  }

  /**
   * Parse multi-folder sync token
   */
  parseSyncToken(syncToken: string): Map<string, bigint> {
    const result = new Map<string, bigint>();

    if (/^\d+$/.test(syncToken)) {
      result.set('INBOX', BigInt(syncToken));
      return result;
    }

    const parts = syncToken.split(',');
    for (const part of parts) {
      const [folder, modseq] = part.split(':');
      if (folder && modseq) {
        try {
          result.set(folder, BigInt(modseq));
        } catch { /* skip invalid */ }
      }
    }

    return result;
  }

  /**
   * Build multi-folder sync token
   */
  buildSyncToken(modSeqs: Map<string, bigint>): string {
    const parts: string[] = [];
    for (const [folder, modseq] of modSeqs) {
      parts.push(`${folder}:${modseq.toString()}`);
    }
    return parts.join(',') || Date.now().toString();
  }

  /**
   * Get initial sync token
   */
  async getInitialSyncToken(): Promise<string> {
    return this.connectionPool.withConnection(async (client) => {
      const modSeqs = new Map<string, bigint>();
      let hasCondstore = false;

      for (const canonicalFolder of this.SYNC_FOLDERS) {
        try {
          const folderPath = await this.folderService.resolveFolder(canonicalFolder);
          const mailboxStatus = await client.status(folderPath, { highestModseq: true });

          if (mailboxStatus.highestModseq) {
            modSeqs.set(canonicalFolder, mailboxStatus.highestModseq);
            hasCondstore = true;
          }
        } catch (error: any) {
          this.logger.debug(`Skipping folder ${canonicalFolder} for initial token: ${error.message}`);
        }
      }

      if (hasCondstore && modSeqs.size > 0) {
        return this.buildSyncToken(modSeqs);
      }

      return Date.now().toString();
    });
  }

  /**
   * Parse message ID to [folder, uid]
   */
  parseMessageId(messageId: string): [string, number] {
    const lastColon = messageId.lastIndexOf(':');
    let folderPath: string;
    let uidStr: string;

    if (lastColon < 0) {
      folderPath = 'INBOX';
      uidStr = messageId;
    } else {
      folderPath = messageId.substring(0, lastColon);
      uidStr = messageId.substring(lastColon + 1);
    }

    const uid = parseInt(uidStr, 10);
    if (!Number.isFinite(uid) || uid <= 0) {
      throw new Error(`Invalid IMAP message ID "${messageId}": UID "${uidStr}" is not a valid positive integer`);
    }

    return [folderPath, uid];
  }

  private normalizeHtmlContent(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    return undefined;
  }

  private fetchMessageToCanonical(msg: any, folder: string): CanonicalMessage {
    const envelope = msg.envelope || {};
    const flags = msg.flags || new Set<string>();
    const canonicalFolder = this.folderService.pathToCanonicalFolder(folder);

    return {
      id: `${folder}:${msg.uid}`,
      externalId: msg.uid.toString(),
      threadId: envelope.messageId || msg.uid.toString(),
      folder: canonicalFolder,
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

  private parseImapAddress(address: any): EmailAddress {
    if (!address) return { email: '' };

    const email = address.address || '';
    const name = address.name || undefined;

    if (email && email.includes('@')) {
      return { email, name };
    }

    if (name && name.includes('@')) {
      return { email: name };
    }

    return { email: email || name || '', name };
  }

  private flagsToLabels(flags: Set<string>): string[] {
    const labels: string[] = [];
    if (flags.has('\\Seen')) labels.push('READ');
    if (flags.has('\\Flagged')) labels.push('STARRED');
    if (flags.has('\\Deleted')) labels.push('DELETED');
    if (flags.has('\\Draft')) labels.push('DRAFT');
    if (flags.has('\\Answered')) labels.push('REPLIED');
    return labels;
  }

  private buildSearchCriteria(options: ListMessagesOptions): any {
    const criteria: any = {};

    if (options.onlyUnread) criteria.unseen = true;
    if (options.since) criteria.since = options.since;
    if (options.before) criteria.before = options.before;

    if (options.query) {
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
        criteria.or = [{ subject: options.query }, { body: options.query }];
      }
    }

    return Object.keys(criteria).length > 0 ? criteria : {};
  }

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
