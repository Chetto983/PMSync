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
      let metadataUpdates: Record<string, any> | undefined;

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

      if ((provider.metadata as any)?.backfillRequired) {
        metadataUpdates = {
          ...(provider.metadata as Record<string, any>),
          backfillRequired: false,
          imapLastFullScanAt: new Date().toISOString(),
        };
      }

      return {
        success: true,
        providerId,
        email,
        messagesProcessed,
        newMessages,
        syncDuration: 0, // Will be set by worker
        lastSyncToken: maxUid.toString(),
        metadata: metadataUpdates,
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
   * Incremental sync - fetch messages with UID > lastUid (BULK OPTIMIZED)
   * Uses batch operations to reduce database queries from O(n) to O(1)
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

      // STEP 1: Collect all message metadata from IMAP (must be sequential due to protocol)
      const allMessages: Array<{
        uid: number;
        envelope: any;
        flags: Set<string>;
        size?: number;
      }> = [];

      for await (const message of client.fetch(range, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        flags: true,
      }, { uid: true })) {
        allMessages.push({
          uid: message.uid,
          envelope: message.envelope,
          flags: message.flags || new Set(),
          size: message.size,
        });
      }

      if (allMessages.length === 0) {
        return { messagesProcessed: 0, newMessages: 0, maxUid: lastUid };
      }

      // STEP 2: Bulk process messages
      const result = await this.bulkProcessMessages(
        allMessages,
        client,
        providerId,
        tenantId,
      );

      const reconciled = await this.reconcileDeletedMessages(client, providerId, tenantId);
      if (reconciled > 0) {
        this.logger.debug(`Marked ${reconciled} IMAP messages as deleted or moved.`);
      }

      return {
        messagesProcessed: result.messagesProcessed + reconciled,
        newMessages: result.newMessages,
        maxUid: result.maxUid,
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
    const WINDOW = this.config.get<number>('IMAP_RECONCILE_WINDOW', 2000);
    const fullScanDays = this.config.get<number>('IMAP_RECONCILE_FULLSCAN_DAYS', 30);
    const fullScanThreshold = Date.now() - fullScanDays * 24 * 60 * 60 * 1000;
    let totalMessages = 0;

    try {
      const mailboxStatus = await client.status('INBOX', { messages: true });
      totalMessages = mailboxStatus.messages || 0;

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
    } finally {
      // Periodic full-scan/backfill flagging if window may miss older deletions
      try {
        if (WINDOW < totalMessages) {
          const provider = await this.prisma.providerConfig.findUnique({
            where: { id: providerId },
            select: { metadata: true },
          });

          const metadata = (provider?.metadata as Record<string, any>) || {};
          const lastFullScanAt = metadata.imapLastFullScanAt
            ? new Date(metadata.imapLastFullScanAt).getTime()
            : 0;

          if (!lastFullScanAt || lastFullScanAt < fullScanThreshold) {
            const updatedMetadata = {
              ...metadata,
              imapLastFullScanAt: new Date().toISOString(),
              backfillRequired: true,
            };

            await this.prisma.providerConfig.update({
              where: { id: providerId },
              data: { metadata: updatedMetadata },
            });

            this.logger.warn(
              `IMAP provider ${providerId} marked for backfill (window ${WINDOW} < total ${totalMessages}); last full scan outdated.`,
            );
          }
        }
      } catch (metaError) {
        const msg = this.extractErrorMessage(metaError);
        this.logger.debug(`Could not update IMAP backfill metadata for ${providerId}: ${msg}`);
      }
    }
  }

  /**
   * Full sync - fetch messages from last 60 days (max 1000) (BULK OPTIMIZED)
   * Uses batch operations to reduce database queries from O(n) to O(1)
   */
  private async syncFull(
    client: ImapFlow,
    _email: string,
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

      const maxMessages = 1000;

      // STEP 1: Collect all message metadata from IMAP
      const allMessages: Array<{
        uid: number;
        envelope: any;
        flags: Set<string>;
        size?: number;
      }> = [];

      // Use IMAP SEARCH to find messages since the date
      try {
        const searchResults = await client.search({ since: sixtyDaysAgo }, { uid: true });

        if (!searchResults || searchResults.length === 0) {
          this.logger.debug('No messages found in the last 60 days');
          return { messagesProcessed: 0, newMessages: 0, maxUid: 0 };
        }

        // Sort UIDs in ascending order and limit to max 1000
        const uidsToFetch = searchResults.sort((a, b) => a - b).slice(-maxMessages);

        this.logger.debug(`Found ${searchResults.length} messages in last 60 days, fetching last ${uidsToFetch.length}`);

        // Fetch messages in batches to avoid timeout
        const batchSize = 100;
        for (let i = 0; i < uidsToFetch.length; i += batchSize) {
          const batch = uidsToFetch.slice(i, Math.min(i + batchSize, uidsToFetch.length));
          const range = batch.join(',');

          for await (const message of client.fetch(range, {
            uid: true,
            envelope: true,
            bodyStructure: true,
            flags: true,
          }, { uid: true })) {
            allMessages.push({
              uid: message.uid,
              envelope: message.envelope,
              flags: message.flags || new Set(),
              size: message.size,
            });
          }
        }
      } catch (searchError) {
        // Fallback to fetching last 1000 messages if SEARCH fails
        this.logger.warn(`IMAP SEARCH failed, falling back to sequence-based fetch: ${searchError instanceof Error ? searchError.message : String(searchError)}`);

        const mailboxStatus = await client.status('INBOX', { messages: true });
        const totalMessages = mailboxStatus.messages || 0;

        if (totalMessages === 0) {
          return { messagesProcessed: 0, newMessages: 0, maxUid: 0 };
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
          allMessages.push({
            uid: message.uid,
            envelope: message.envelope,
            flags: message.flags || new Set(),
            size: message.size,
          });
        }
      }

      if (allMessages.length === 0) {
        return { messagesProcessed: 0, newMessages: 0, maxUid: 0 };
      }

      // STEP 2: Bulk process all collected messages
      const result = await this.bulkProcessMessages(
        allMessages,
        client,
        providerId,
        tenantId,
      );

      this.logger.debug(`Processed ${result.messagesProcessed} messages from last 60 days`);

      return result;
    } finally {
      lock.release();
    }
  }

  /**
   * Bulk process IMAP messages (OPTIMIZED)
   * Reduces database queries from O(n) to O(1) by using batch operations
   */
  private async bulkProcessMessages(
    messages: Array<{
      uid: number;
      envelope: any;
      flags: Set<string>;
      size?: number;
    }>,
    client: ImapFlow,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    maxUid: number;
  }> {
    if (messages.length === 0) {
      return { messagesProcessed: 0, newMessages: 0, maxUid: 0 };
    }

    // STEP 1: Extract all external IDs (UIDs as strings)
    const externalIds = messages.map((m) => m.uid.toString());

    // STEP 2: Batch check existing emails in ONE query
    const existingEmails = await this.prisma.email.findMany({
      where: { providerId, externalId: { in: externalIds } },
      select: { id: true, externalId: true },
    });
    const existingByExternalId = new Map(existingEmails.map((e) => [e.externalId, e.id]));

    // STEP 3: Separate new vs existing messages
    const newMessageData: Array<{
      uid: number;
      envelope: any;
      flags: Set<string>;
      size?: number;
    }> = [];
    const updateMessageData: Array<{
      uid: number;
      flags: Set<string>;
      emailId: string;
    }> = [];

    for (const msg of messages) {
      const externalId = msg.uid.toString();
      const existingId = existingByExternalId.get(externalId);
      if (existingId) {
        updateMessageData.push({ uid: msg.uid, flags: msg.flags, emailId: existingId });
      } else {
        newMessageData.push(msg);
      }
    }

    let maxUid = 0;
    for (const msg of messages) {
      maxUid = Math.max(maxUid, msg.uid);
    }

    // STEP 4: Bulk resolve thread IDs for new messages
    const threadIdMap = await this.bulkResolveThreadIds(
      newMessageData,
      tenantId,
      providerId,
    );

    // STEP 5: Download bodies for new messages and prepare bulk insert data
    const newEmailRecords: any[] = [];

    for (const msg of newMessageData) {
      const envelope = msg.envelope;
      if (!envelope) continue;

      // Extract email data
      const from = envelope.from?.[0]?.address || '';
      const to = (envelope.to || []).map((addr: any) => addr.address).filter(Boolean);
      const cc = (envelope.cc || []).map((addr: any) => addr.address).filter(Boolean);
      const bcc = (envelope.bcc || []).map((addr: any) => addr.address).filter(Boolean);
      const subject = envelope.subject || '(No Subject)';
      const messageId = envelope.messageId;
      const inReplyTo = envelope.inReplyTo;
      const sentAt = envelope.date ? new Date(envelope.date) : new Date();
      const receivedAt = new Date();

      // Download and parse body
      let bodyText = '';
      let bodyHtml = '';
      const bodyBuffer = await this.downloadMessageBody(client, msg.uid);
      if (bodyBuffer) {
        try {
          const parsed = await simpleParser(bodyBuffer);
          bodyText = parsed.text ?? '';
          bodyHtml = typeof parsed.html === 'string' ? parsed.html : '';
        } catch (parseError) {
          const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
          this.logger.warn(`Failed to parse IMAP message UID ${msg.uid}: ${parseMessage}`);
        }
      }

      if (bodyText.length > 10000) bodyText = bodyText.slice(0, 10000);
      if (bodyHtml.length > 20000) bodyHtml = bodyHtml.slice(0, 20000);

      const snippetSource = bodyText || this.extractPlainText(bodyHtml) || subject;
      const snippet = this.truncateText(snippetSource, 200);

      const flags = msg.flags;
      const isRead = flags.has('\\Seen');
      const isStarred = flags.has('\\Flagged');
      const isDeleted = flags.has('\\Deleted');
      const folder = isDeleted ? 'TRASH' : 'INBOX';

      const threadId = threadIdMap.get(msg.uid.toString()) || normalizeMessageId(messageId);

      newEmailRecords.push({
        tenantId,
        providerId,
        externalId: msg.uid.toString(),
        threadId,
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
        size: msg.size || null,
        headers: { uid: msg.uid, flags: Array.from(flags) } as Record<string, any>,
        metadata: mergeEmailStatusMetadata(null, isDeleted ? 'deleted' : 'active'),
      });
    }

    // STEP 6: Execute bulk operations in transaction
    let createdCount = 0;
    let updatedCount = 0;

    await this.prisma.$transaction(
      async (tx) => {
        // 6a. Bulk create new emails
        if (newEmailRecords.length > 0) {
          await tx.email.createMany({
            data: newEmailRecords,
            skipDuplicates: true,
          });
          createdCount = newEmailRecords.length;
        }

        // 6b. Bulk update existing emails using raw SQL
        if (updateMessageData.length > 0) {
          const updateExternalIds = updateMessageData.map((u) => u.uid.toString());

          // Separate by flag status for bulk updates
          const readIds = updateMessageData
            .filter((u) => u.flags.has('\\Seen'))
            .map((u) => u.uid.toString());
          const unreadIds = updateMessageData
            .filter((u) => !u.flags.has('\\Seen'))
            .map((u) => u.uid.toString());
          const starredIds = updateMessageData
            .filter((u) => u.flags.has('\\Flagged'))
            .map((u) => u.uid.toString());
          const unstarredIds = updateMessageData
            .filter((u) => !u.flags.has('\\Flagged'))
            .map((u) => u.uid.toString());
          const deletedIds = updateMessageData
            .filter((u) => u.flags.has('\\Deleted'))
            .map((u) => u.uid.toString());
          const activeIds = updateMessageData
            .filter((u) => !u.flags.has('\\Deleted'))
            .map((u) => u.uid.toString());

          // Bulk update isRead
          if (readIds.length > 0) {
            await tx.email.updateMany({
              where: { providerId, externalId: { in: readIds } },
              data: { isRead: true },
            });
          }
          if (unreadIds.length > 0) {
            await tx.email.updateMany({
              where: { providerId, externalId: { in: unreadIds } },
              data: { isRead: false },
            });
          }

          // Bulk update isStarred
          if (starredIds.length > 0) {
            await tx.email.updateMany({
              where: { providerId, externalId: { in: starredIds } },
              data: { isStarred: true },
            });
          }
          if (unstarredIds.length > 0) {
            await tx.email.updateMany({
              where: { providerId, externalId: { in: unstarredIds } },
              data: { isStarred: false },
            });
          }

          // Bulk update isDeleted and folder
          if (deletedIds.length > 0) {
            await tx.email.updateMany({
              where: { providerId, externalId: { in: deletedIds } },
              data: { isDeleted: true, folder: 'TRASH' },
            });
          }
          if (activeIds.length > 0) {
            await tx.email.updateMany({
              where: { providerId, externalId: { in: activeIds } },
              data: { isDeleted: false, folder: 'INBOX' },
            });
          }

          updatedCount = updateExternalIds.length;
        }
      },
      { timeout: 60000 },
    );

    // STEP 7: Queue embedding jobs for new emails (fire-and-forget, non-blocking)
    if (newEmailRecords.length > 0) {
      // Get created email IDs for embedding
      const createdEmails = await this.prisma.email.findMany({
        where: {
          providerId,
          externalId: { in: newEmailRecords.map((e) => e.externalId) },
        },
        select: { id: true, externalId: true, subject: true, snippet: true, bodyText: true, bodyHtml: true, from: true, receivedAt: true },
      });

      // Fire-and-forget embedding queue (don't await)
      this.queueEmbeddingsInBackground(tenantId, providerId, createdEmails);
    }

    // STEP 8: Emit realtime events for new messages
    for (const record of newEmailRecords) {
      this.realtimeEvents.notifyMailboxChange(tenantId, providerId, 'message-processed', {
        externalId: record.externalId,
        folder: record.folder,
      });
    }

    this.logger.debug(
      `Bulk IMAP sync: ${createdCount} new, ${updatedCount} updated out of ${messages.length} messages`,
    );

    return {
      messagesProcessed: createdCount + updatedCount,
      newMessages: createdCount,
      maxUid,
    };
  }

  /**
   * Bulk resolve thread IDs for messages (OPTIMIZED)
   * Reduces O(n) queries to O(1) by batch lookup
   */
  private async bulkResolveThreadIds(
    messages: Array<{ uid: number; envelope: any }>,
    tenantId: string,
    providerId: string,
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();

    // Collect all messageIds, inReplyTo, and references
    const allReferenceIds = new Set<string>();
    const messageReferences = new Map<string, { messageId: string | null; inReplyTo: string | null; references: string[] }>();

    for (const msg of messages) {
      const envelope = msg.envelope;
      if (!envelope) continue;

      const messageId = normalizeMessageId(envelope.messageId);
      const inReplyTo = normalizeMessageId(envelope.inReplyTo);
      const references = envelope.references
        ? envelope.references.split(/\s+/).filter(Boolean).map(normalizeMessageId).filter(Boolean) as string[]
        : [];

      messageReferences.set(msg.uid.toString(), { messageId, inReplyTo, references });

      if (inReplyTo) {
        allReferenceIds.add(inReplyTo);
        allReferenceIds.add(`<${inReplyTo}>`);
      }
      for (const ref of references) {
        if (ref) {
          allReferenceIds.add(ref);
          allReferenceIds.add(`<${ref}>`);
        }
      }
    }

    // Batch lookup all referenced emails in ONE query
    const referencedEmails = allReferenceIds.size > 0
      ? await this.prisma.email.findMany({
          where: {
            tenantId,
            providerId,
            messageId: { in: Array.from(allReferenceIds) },
          },
          select: { messageId: true, threadId: true },
        })
      : [];

    // Build lookup map
    const threadLookup = new Map<string, string | null>();
    for (const email of referencedEmails) {
      if (email.messageId) {
        const normalized = normalizeMessageId(email.messageId);
        if (normalized) {
          threadLookup.set(normalized, email.threadId);
        }
      }
    }

    // Resolve thread IDs for each message
    for (const [uidStr, refs] of messageReferences) {
      let threadId: string | null = null;

      // Try inReplyTo first
      if (refs.inReplyTo) {
        threadId = threadLookup.get(refs.inReplyTo) || null;
      }

      // Try references (oldest first)
      if (!threadId && refs.references.length > 0) {
        for (const ref of refs.references) {
          const found = threadLookup.get(ref);
          if (found) {
            threadId = found;
            break;
          }
        }
        // If no match found, use first reference as thread root
        if (!threadId) {
          threadId = refs.references[0] || null;
        }
      }

      // Fallback to messageId
      if (!threadId && refs.messageId) {
        threadId = refs.messageId;
      }

      result.set(uidStr, threadId);
    }

    return result;
  }

  /**
   * Queue embedding jobs in background (fire-and-forget)
   */
  private queueEmbeddingsInBackground(
    tenantId: string,
    providerId: string,
    emails: Array<{
      id: string;
      subject: string | null;
      snippet: string | null;
      bodyText: string | null;
      bodyHtml: string | null;
      from: string;
      receivedAt: Date;
    }>,
  ): void {
    // Process in background without blocking
    setImmediate(async () => {
      for (const email of emails) {
        try {
          const alreadyEmbedded = await this.embeddingsService.hasEmbeddingForEmail(tenantId, email.id);
          if (!alreadyEmbedded) {
            await this.emailEmbeddingQueue.enqueue({
              tenantId,
              providerId,
              emailId: email.id,
              subject: email.subject || '',
              snippet: email.snippet || '',
              bodyText: email.bodyText || '',
              bodyHtml: email.bodyHtml || '',
              from: email.from,
              receivedAt: email.receivedAt,
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to queue embedding for email ${email.id}: ${this.extractErrorMessage(error)}`);
        }
      }
    });
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

}
