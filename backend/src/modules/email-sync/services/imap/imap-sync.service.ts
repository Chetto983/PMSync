import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CryptoService } from '../../../../common/services/crypto.service';
import { SyncJobData, SyncJobResult } from '../../interfaces/sync-job.interface';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { EmbeddingsService } from '../../../ai/services/embeddings.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { EmailEventReason } from '../../../realtime/types/realtime.types';
import { mergeEmailStatusMetadata } from '../../utils/email-metadata.util';
import { BaseEmailSyncService } from '../base-email-sync.service';

const IMAP_BODY_DOWNLOAD_TIMEOUT_MS = 10000;
const IMAP_BODY_MAX_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Extract Message-ID from various formats (with or without angle brackets)
 */
function normalizeMessageId(messageId: string | null | undefined): string | null {
  if (!messageId) return null;
  // Remove angle brackets and whitespace
  return messageId.replace(/^</, '').replace(/>$/, '').trim();
}

@Injectable()
export class ImapSyncService extends BaseEmailSyncService {
  protected readonly logger = new Logger(ImapSyncService.name);

  /**
   * Find or generate a threadId for an IMAP email based on inReplyTo and references
   * This creates thread relationships similar to Gmail's native threading
   */
  private async findOrCreateThreadId(
    tenantId: string,
    providerId: string,
    messageId: string | null,
    inReplyTo: string | null,
    references: string | null,
  ): Promise<string | null> {
    // Try to find an existing thread by inReplyTo
    if (inReplyTo) {
      const normalizedInReplyTo = normalizeMessageId(inReplyTo);
      if (normalizedInReplyTo) {
        const parent = await this.prisma.email.findFirst({
          where: {
            tenantId,
            providerId,
            OR: [
              { messageId: normalizedInReplyTo },
              { messageId: `<${normalizedInReplyTo}>` },
            ],
          },
          select: { threadId: true, messageId: true },
        });
        if (parent?.threadId) {
          return parent.threadId;
        }
        // If parent exists but has no threadId, use its messageId as threadId
        if (parent?.messageId) {
          return normalizeMessageId(parent.messageId);
        }
      }
    }

    // Try to find an existing thread by references (oldest first)
    if (references) {
      const refList = references.split(/\s+/).filter(Boolean);
      for (const ref of refList) {
        const normalizedRef = normalizeMessageId(ref);
        if (!normalizedRef) continue;

        const refEmail = await this.prisma.email.findFirst({
          where: {
            tenantId,
            providerId,
            OR: [
              { messageId: normalizedRef },
              { messageId: `<${normalizedRef}>` },
            ],
          },
          select: { threadId: true, messageId: true },
        });
        if (refEmail?.threadId) {
          return refEmail.threadId;
        }
        // Use the first reference's messageId as threadId (this is the root)
        if (refEmail?.messageId) {
          return normalizeMessageId(refEmail.messageId);
        }
      }
      // If no matching emails found, use the first reference as the threadId
      const firstRef = normalizeMessageId(refList[0]);
      if (firstRef) {
        return firstRef;
      }
    }

    // No thread found - this is a new thread, use this email's messageId
    if (messageId) {
      return normalizeMessageId(messageId);
    }

    // No messageId available - can't create a meaningful threadId
    return null;
  }

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
    private crypto: CryptoService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private embeddingsService: EmbeddingsService,
  ) {
    super(prisma, realtimeEvents, config);
  }

  onModuleInit() {
    super.onModuleInit(); // Load base configuration (IMAP-specific overrides can be added here if needed)
  }

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    const { providerId, email, syncType } = jobData;

    this.logger.log(`Starting ${syncType} IMAP sync for ${email}`);

    let client: ImapFlow | null = null;

    try {
      // Get provider config
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || !provider.imapPassword) {
        throw new Error('Provider not found or missing IMAP credentials');
      }

      // Decrypt IMAP password
      const imapPassword = this.crypto.decrypt(
        provider.imapPassword,
        provider.imapEncryptionIv!,
      );

      // Create IMAP client
      client = new ImapFlow({
        host: provider.imapHost!,
        port: provider.imapPort || 993,
        secure: provider.imapUseTls ?? true,
        auth: {
          user: provider.imapUsername!,
          pass: imapPassword,
        },
        logger: false,
      });

      await client.connect();
      this.logger.debug(`Connected to IMAP server for ${email}`);

      // Get last synced UID from metadata
      const metadata = (provider.metadata as any) || {};
      const lastUid = metadata.lastSyncToken ? parseInt(metadata.lastSyncToken) : 0;

      let messagesProcessed = 0;
      let newMessages = 0;
      let maxUid = lastUid;

      if (syncType === 'incremental' && lastUid > 0) {
        // Incremental sync - only fetch messages after last UID
        const incrementalResult = await this.syncIncremental(
          client,
          lastUid,
          providerId,
          provider.tenantId,
        );
        messagesProcessed = incrementalResult.messagesProcessed;
        newMessages = incrementalResult.newMessages;
        maxUid = incrementalResult.maxUid;
      } else {
        // Full sync - fetch recent messages
        const fullResult = await this.syncFull(
          client,
          email,
          providerId,
          provider.tenantId,
        );
        messagesProcessed = fullResult.messagesProcessed;
        newMessages = fullResult.newMessages;
        maxUid = fullResult.maxUid;
      }

      await client.logout();

      return {
        success: true,
        providerId,
        email,
        messagesProcessed,
        newMessages,
        syncDuration: 0, // Will be set by worker
        lastSyncToken: maxUid.toString(),
      };
    } catch (error) {
      this.logger.error(`IMAP sync failed for ${email}:`, error);

      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore logout errors
        }
      }

      throw error;
    }
  }

  /**
   * Incremental sync - fetch messages with UID > lastUid
   */
  private async syncIncremental(
    client: ImapFlow,
    lastUid: number,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    maxUid: number;
  }> {
    this.logger.debug(`Incremental sync from UID: ${lastUid}`);

    const lock = await client.getMailboxLock('INBOX');

    try {
      // Get mailbox status
      const status = await client.status('INBOX', { uidNext: true });
      const uidNext = status.uidNext || lastUid + 1;

      // If no new messages
      if (uidNext <= lastUid + 1) {
        return {
          messagesProcessed: 0,
          newMessages: 0,
          maxUid: lastUid,
        };
      }

      // Fetch new messages
      const range = `${lastUid + 1}:*`;

      let messagesProcessed = 0;
      let newMessages = 0;
      let maxUid = lastUid;

      for await (const message of client.fetch(range, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        flags: true,
      }, { uid: true })) {
        const processed = await this.processMessage(
          message,
          client,
          providerId,
          tenantId,
        );
        if (processed) {
          messagesProcessed++;
          newMessages++;
        }
        maxUid = Math.max(maxUid, message.uid);
      }

      const reconciled = await this.reconcileDeletedMessages(client, providerId, tenantId);
      if (reconciled > 0) {
        messagesProcessed += reconciled;
        this.logger.debug(`Marked ${reconciled} IMAP messages as deleted or moved.`);
      }

      return {
        messagesProcessed,
        newMessages,
        maxUid,
      };
    } finally {
      lock.release();
    }
  }

  private async reconcileDeletedMessages(
    client: ImapFlow,
    providerId: string,
    tenantId: string,
  ): Promise<number> {
    const WINDOW = 500;

    try {
      const mailboxStatus = await client.status('INBOX', { messages: true });
      const totalMessages = mailboxStatus.messages || 0;

      if (totalMessages === 0) {
        const result = await this.prisma.email.updateMany({
          where: { providerId, isDeleted: false },
          data: {
            isDeleted: true,
            folder: 'TRASH',
          },
        });
        return result.count;
      }

      const startSeq = Math.max(1, totalMessages - WINDOW + 1);
      const range = `${startSeq}:*`;

      const remoteState = new Map<number, Set<string>>();
      for await (const remote of client.fetch(
        range,
        { uid: true, flags: true },
        { uid: true },
      )) {
        remoteState.set(remote.uid, remote.flags ?? new Set());
      }

      const remoteUidSet = new Set(remoteState.keys());
      const flaggedForDeletion: string[] = [];

      for (const [uid, flags] of remoteState.entries()) {
        if (flags && flags.has('\\Deleted')) {
          flaggedForDeletion.push(uid.toString());
        }
      }

      let updates = 0;

      if (flaggedForDeletion.length > 0) {
        const flaggedEmails = await this.prisma.email.findMany({
          where: {
            providerId,
            externalId: { in: flaggedForDeletion },
          },
          select: {
            id: true,
            metadata: true,
          },
        });

        for (const email of flaggedEmails) {
          try {
            await this.prisma.email.update({
              where: { id: email.id },
              data: {
                isDeleted: true,
                folder: 'TRASH',
                metadata: mergeEmailStatusMetadata(
                  email.metadata as Record<string, any> | null,
                  'deleted',
                ),
              },
            });
            updates += 1;
          } catch (error) {
            const message = this.extractErrorMessage(error);
            this.logger.warn(
              `Failed to update flagged IMAP email ${email.id} as deleted: ${message}`,
            );
          }
        }
      }

      if (remoteUidSet.size === 0) {
        return updates;
      }

      const trackedEmails = await this.prisma.email.findMany({
        where: { providerId, isDeleted: false },
        select: { id: true, externalId: true, metadata: true },
        orderBy: { receivedAt: 'desc' },
        take: WINDOW,
      });

      for (const email of trackedEmails) {
        const uid = parseInt(email.externalId, 10);
        if (!Number.isFinite(uid) || remoteUidSet.has(uid)) {
          continue;
        }

        try {
          await this.prisma.email.update({
            where: { id: email.id },
            data: {
              isDeleted: true,
              folder: 'TRASH',
              metadata: mergeEmailStatusMetadata(
                email.metadata as Record<string, any> | null,
                'deleted',
              ),
            },
          });
          updates += 1;
        } catch (error) {
          const message = this.extractErrorMessage(error);
          this.logger.warn(`Failed to mark IMAP email ${email.id} as deleted: ${message}`);
        }
      }

      return updates;
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.warn(
        `Failed to reconcile IMAP deletions for provider ${providerId} (tenant ${tenantId}): ${message}`,
      );
      return 0;
    }
  }

  /**
   * Full sync - fetch messages from last 60 days (max 1000)
   */
  private async syncFull(
    client: ImapFlow,
    email: string,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    maxUid: number;
  }> {
    this.logger.debug('Full sync - fetching messages from last 60 days');

    const lock = await client.getMailboxLock('INBOX');

    try {
      // Calculate date 60 days ago
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const sinceDate = sixtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '-');

      this.logger.debug(`Fetching IMAP messages since ${sinceDate}`);

      let messagesProcessed = 0;
      let newMessages = 0;
      let maxUid = 0;
      const maxMessages = 1000;

      // Use IMAP SEARCH to find messages since the date
      try {
        const searchResults = await client.search({ since: sixtyDaysAgo }, { uid: true });

        if (!searchResults || searchResults.length === 0) {
          this.logger.debug('No messages found in the last 60 days');
          return {
            messagesProcessed: 0,
            newMessages: 0,
            maxUid: 0,
          };
        }

        // Sort UIDs in ascending order and limit to max 1000
        const uidsToFetch = searchResults.sort((a, b) => a - b).slice(-maxMessages);

        this.logger.debug(`Found ${searchResults.length} messages in last 60 days, fetching last ${uidsToFetch.length}`);

        // Fetch messages in batches to avoid timeout
        const batchSize = 50;
        for (let i = 0; i < uidsToFetch.length; i += batchSize) {
          const batch = uidsToFetch.slice(i, Math.min(i + batchSize, uidsToFetch.length));
          const range = batch.join(',');

          for await (const message of client.fetch(range, {
            uid: true,
            envelope: true,
            bodyStructure: true,
            flags: true,
          }, { uid: true })) {
            const processed = await this.processMessage(
              message,
              client,
              providerId,
              tenantId,
            );
            if (processed) {
              messagesProcessed++;
              newMessages++;
            }
            maxUid = Math.max(maxUid, message.uid);
          }
        }

        this.logger.debug(`Processed ${messagesProcessed} messages from last 60 days`);
      } catch (searchError) {
        // Fallback to fetching last 1000 messages if SEARCH fails
        this.logger.warn(`IMAP SEARCH failed, falling back to sequence-based fetch: ${searchError instanceof Error ? searchError.message : String(searchError)}`);

        const mailboxStatus = await client.status('INBOX', { messages: true });
        const totalMessages = mailboxStatus.messages || 0;

        if (totalMessages === 0) {
          return {
            messagesProcessed: 0,
            newMessages: 0,
            maxUid: 0,
          };
        }

        const limit = Math.min(maxMessages, totalMessages);
        const startSeq = Math.max(1, totalMessages - limit + 1);
        const endSeq = totalMessages;

        for await (const message of client.fetch(`${startSeq}:${endSeq}`, {
          uid: true,
          envelope: true,
          bodyStructure: true,
          flags: true,
        })) {
          const processed = await this.processMessage(
            message,
            client,
            providerId,
            tenantId,
          );
          if (processed) {
            messagesProcessed++;
            newMessages++;
          }
          maxUid = Math.max(maxUid, message.uid);
        }
      }

      return {
        messagesProcessed,
        newMessages,
        maxUid,
      };
    } finally {
      lock.release();
    }
  }

  /**
   * Process a single IMAP message
   */
  private async processMessage(
    message: any,
    client: ImapFlow,
    providerId: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      const envelope = message.envelope;

      if (!envelope) {
        return false;
      }

      // Extract email addresses from envelope
      const from = envelope.from?.[0]?.address || '';
      const to = (envelope.to || []).map((addr: any) => addr.address).filter(Boolean);
      const cc = (envelope.cc || []).map((addr: any) => addr.address).filter(Boolean);
      const bcc = (envelope.bcc || []).map((addr: any) => addr.address).filter(Boolean);

      const subject = envelope.subject || '(No Subject)';
      const messageId = envelope.messageId;
      const inReplyTo = envelope.inReplyTo;

      // Extract dates
      const sentAt = envelope.date ? new Date(envelope.date) : new Date();
      const receivedAt = new Date();

      let bodyText = '';
      let bodyHtml = '';

      const bodyBuffer = await this.downloadMessageBody(client, message.uid);
      if (bodyBuffer) {
        try {
          const parsed = await simpleParser(bodyBuffer);
          bodyText = parsed.text ?? '';
          bodyHtml = typeof parsed.html === 'string' ? parsed.html : '';
        } catch (parseError) {
          const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
          this.logger.warn(`Failed to parse IMAP message UID ${message.uid}: ${parseMessage}`);
        }
      }

      if (bodyText.length > 10000) {
        bodyText = bodyText.slice(0, 10000);
      }
      if (bodyHtml.length > 20000) {
        bodyHtml = bodyHtml.slice(0, 20000);
      }

      // Create snippet from body or subject
      const snippetSource = bodyText || this.extractPlainText(bodyHtml) || subject;
      const snippet = this.truncateText(snippetSource, 200);

      // Extract flags
      const flags = message.flags || new Set();
      const isRead = flags.has('\\Seen');
      const isStarred = flags.has('\\Flagged');
      const isDeleted = flags.has('\\Deleted');
      const folder = isDeleted ? 'TRASH' : 'INBOX';

      // Generate threadId from inReplyTo and references headers
      const threadId = await this.findOrCreateThreadId(
        tenantId,
        providerId,
        messageId,
        inReplyTo,
        envelope.references,
      );

      // Save to database with upsert to prevent duplicates
      const emailRecord = await this.prisma.email.upsert({
        where: {
          providerId_externalId: {
            providerId,
            externalId: message.uid.toString(),
          },
        },
        create: {
          tenantId,
          providerId,
          externalId: message.uid.toString(),
          threadId, // Generated from inReplyTo/references headers
          messageId,
          inReplyTo,
          references: envelope.references,
          from,
          to,
          cc,
          bcc,
          subject,
          bodyText,
          bodyHtml,
          snippet,
          folder,
          labels: [],
          isRead,
          isStarred,
          isDeleted,
          sentAt,
          receivedAt,
          size: message.size || null,
          headers: {
            uid: message.uid,
            flags: Array.from(flags),
          } as Record<string, any>,
          metadata: mergeEmailStatusMetadata(null, isDeleted ? 'deleted' : 'active'),
        },
        update: {
          // Update flags in case they changed
          isRead,
          isStarred,
          isDeleted,
          folder,
          headers: {
            uid: message.uid,
            flags: Array.from(flags),
          } as Record<string, any>,
        },
      });

      this.logger.debug(`Saved email UID ${message.uid}: ${subject} from ${from}`);

      this.notifyImapMailboxChange(
        tenantId,
        providerId,
        isDeleted ? 'message-deleted' : 'message-processed',
        {
          emailId: emailRecord.id,
          externalId: message.uid.toString(),
          folder,
        },
      );

      const alreadyEmbedded = await this.embeddingsService.hasEmbeddingForEmail(tenantId, emailRecord.id);

      if (alreadyEmbedded) {
        this.logger.verbose(
          `Skipping embedding enqueue for IMAP message UID ${message.uid} - embedding already exists.`,
        );
      } else {
        try {
          await this.emailEmbeddingQueue.enqueue({
            tenantId,
            providerId,
            emailId: emailRecord.id,
            subject,
            snippet,
            bodyText,
            bodyHtml,
            from,
            receivedAt,
          });
          this.logger.verbose(`Queued embedding job for IMAP message UID ${message.uid}`);
        } catch (queueError) {
          const queueMessage = queueError instanceof Error ? queueError.message : String(queueError);
          this.logger.warn(
            `Failed to enqueue embedding job for IMAP message UID ${message.uid}: ${queueMessage}`,
          );
        }
      }

      await this.applyStatusMetadata(
        emailRecord.id,
        emailRecord.metadata as Record<string, any> | null,
        isDeleted ? 'deleted' : 'active',
      );

      return true;
    } catch (error) {
      this.logger.error(`Failed to process message UID ${message.uid}:`, error);
      return false;
    }
  }

  private async downloadMessageBody(client: ImapFlow, uid: number): Promise<Buffer | null> {
    const downloadTask = (async () => {
      const source = await client.download(`${uid}`, undefined, { uid: true });
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of source.content) {
        totalBytes += chunk.length;
        if (totalBytes > IMAP_BODY_MAX_BYTES) {
          throw new Error(`Message body exceeds ${IMAP_BODY_MAX_BYTES} bytes limit`);
        }
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    })();

    try {
      return await Promise.race([
        downloadTask,
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('IMAP body download timed out')), IMAP_BODY_DOWNLOAD_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      const msg = this.extractErrorMessage(error);
      this.logger.warn(`Could not download body for UID ${uid}: ${msg}`);
      return null;
    }
  }

  private async applyStatusMetadata(
    emailId: string,
    existing: Record<string, any> | null | undefined,
    status: 'deleted' | 'active',
  ): Promise<void> {
    const next = mergeEmailStatusMetadata(existing, status);
    const shouldUpdate =
      !existing ||
      existing.status !== next.status ||
      existing.deletedAt !== next.deletedAt;

    if (!shouldUpdate) {
      return;
    }

    try {
      await this.prisma.email.update({
        where: { id: emailId },
        data: {
          metadata: next,
        },
      });
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.warn(`Failed to update metadata for IMAP email ${emailId}: ${message}`);
    }
  }

  private notifyImapMailboxChange(
    tenantId: string,
    providerId: string,
    reason: EmailEventReason,
    payload?: { emailId?: string; externalId?: string; folder?: string },
  ): void {
    // IMAP-specific wrapper (doesn't use suppressMessageEvents like Google/Microsoft)
    this.realtimeEvents.notifyMailboxChange(tenantId, providerId, reason, payload);
  }
}
